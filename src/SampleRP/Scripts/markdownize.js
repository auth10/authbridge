var Markdown;

if (typeof exports === "object" && typeof require === "function") // we're in a CommonJS (e.g. Node.js) module
    Markdown = exports;
else
    Markdown = {};

// The following text is included for historical reasons, but should
// be taken with a pinch of salt; it's not all true anymore.

//
// Wherever possible, Showdown is a straight, line-by-line port
// of the Perl version of Markdown.
//
// This is not a normal parser design; it's basically just a
// series of string substitutions.  It's hard to read and
// maintain this way,  but keeping Showdown close to the original
// design makes it easier to port new features.
//
// More importantly, Showdown behaves like markdown.pl in most
// edge cases.  So web applications can do client-side preview
// in Javascript, and then build identical HTML on the server.
//
// This port needs the new RegExp functionality of ECMA 262,
// 3rd Edition (i.e. Javascript 1.5).  Most modern web browsers
// should do fine.  Even with the new regular expression features,
// We do a lot of work to emulate Perl's regex functionality.
// The tricky changes in this file mostly have the "attacklab:"
// label.  Major or self-explanatory changes don't.
//
// Smart diff tools like Araxis Merge will be able to match up
// this file with markdown.pl in a useful way.  A little tweaking
// helps: in a copy of markdown.pl, replace "#" with "//" and
// replace "$text" with "text".  Be sure to ignore whitespace
// and line endings.
//


//
// Usage:
//
//   var text = "Markdown *rocks*.";
//
//   var converter = new Markdown.Converter();
//   var html = converter.makeHtml(text);
//
//   alert(html);
//
// Note: move the sample code to the bottom of this
// file before uncommenting it.
//

(function () {

    function identity(x) { return x; }
    function returnFalse(x) { return false; }

    function HookCollection() { }

    HookCollection.prototype = {

        chain: function (hookname, func) {
            var original = this[hookname];
            if (!original)
                throw new Error("unknown hook " + hookname);

            if (original === identity)
                this[hookname] = func;
            else
                this[hookname] = function (x) { return func(original(x)); }
        },
        set: function (hookname, func) {
            if (!this[hookname])
                throw new Error("unknown hook " + hookname);
            this[hookname] = func;
        },
        addNoop: function (hookname) {
            this[hookname] = identity;
        },
        addFalse: function (hookname) {
            this[hookname] = returnFalse;
        }
    };

    Markdown.HookCollection = HookCollection;

    // g_urls and g_titles allow arbitrary user-entered strings as keys. This
    // caused an exception (and hence stopped the rendering) when the user entered
    // e.g. [push] or [__proto__]. Adding a prefix to the actual key prevents this
    // (since no builtin property starts with "s_"). See
    // http://meta.stackoverflow.com/questions/64655/strange-wmd-bug
    // (granted, switching from Array() to Object() alone would have left only __proto__
    // to be a problem)
    function SaveHash() { }
    SaveHash.prototype = {
        set: function (key, value) {
            this["s_" + key] = value;
        },
        get: function (key) {
            return this["s_" + key];
        }
    };

    Markdown.Converter = function () {
        var pluginHooks = this.hooks = new HookCollection();
        pluginHooks.addNoop("plainLinkText");  // given a URL that was encountered by itself (without markup), should return the link text that's to be given to this link
        pluginHooks.addNoop("preConversion");  // called with the orignal text as given to makeHtml. The result of this plugin hook is the actual markdown source that will be cooked
        pluginHooks.addNoop("postConversion"); // called with the final cooked HTML code. The result of this plugin hook is the actual output of makeHtml

        //
        // Private state of the converter instance:
        //

        // Global hashes, used by various utility routines
        var g_urls;
        var g_titles;
        var g_html_blocks;

        // Used to track when we're inside an ordered or unordered list
        // (see _ProcessListItems() for details):
        var g_list_level;

        this.makeHtml = function (text) {

            //
            // Main function. The order in which other subs are called here is
            // essential. Link and image substitutions need to happen before
            // _EscapeSpecialCharsWithinTagAttributes(), so that any *'s or _'s in the <a>
            // and <img> tags get encoded.
            //

            // This will only happen if makeHtml on the same converter instance is called from a plugin hook.
            // Don't do that.
            if (g_urls)
                throw new Error("Recursive call to converter.makeHtml");

            // Create the private state objects.
            g_urls = new SaveHash();
            g_titles = new SaveHash();
            g_html_blocks = [];
            g_list_level = 0;

            text = pluginHooks.preConversion(text);

            // attacklab: Replace ~ with ~T
            // This lets us use tilde as an escape char to avoid md5 hashes
            // The choice of character is arbitray; anything that isn't
            // magic in Markdown will work.
            text = text.replace(/~/g, "~T");

            // attacklab: Replace $ with ~D
            // RegExp interprets $ as a special character
            // when it's in a replacement string
            text = text.replace(/\$/g, "~D");

            // Standardize line endings
            text = text.replace(/\r\n/g, "\n"); // DOS to Unix
            text = text.replace(/\r/g, "\n"); // Mac to Unix

            // Make sure text begins and ends with a couple of newlines:
            text = "\n\n" + text + "\n\n";

            // Convert all tabs to spaces.
            text = _Detab(text);

            // Strip any lines consisting only of spaces and tabs.
            // This makes subsequent regexen easier to write, because we can
            // match consecutive blank lines with /\n+/ instead of something
            // contorted like /[ \t]*\n+/ .
            text = text.replace(/^[ \t]+$/mg, "");

            // Turn block-level HTML blocks into hash entries
            text = _HashHTMLBlocks(text);

            // Strip link definitions, store in hashes.
            text = _StripLinkDefinitions(text);

            text = _RunBlockGamut(text);

            text = _UnescapeSpecialChars(text);

            // attacklab: Restore dollar signs
            text = text.replace(/~D/g, "$$");

            // attacklab: Restore tildes
            text = text.replace(/~T/g, "~");

            text = pluginHooks.postConversion(text);

            g_html_blocks = g_titles = g_urls = null;

            return text;
        };

        function _StripLinkDefinitions(text) {
            //
            // Strips link definitions from text, stores the URLs and titles in
            // hash references.
            //

            // Link defs are in the form: ^[id]: url "optional title"

            /*
            text = text.replace(/
            ^[ ]{0,3}\[(.+)\]:  // id = $1  attacklab: g_tab_width - 1
            [ \t]*
            \n?                 // maybe *one* newline
            [ \t]*
            <?(\S+?)>?          // url = $2
            (?=\s|$)            // lookahead for whitespace instead of the lookbehind removed below
            [ \t]*
            \n?                 // maybe one newline
            [ \t]*
            (                   // (potential) title = $3
            (\n*)           // any lines skipped = $4 attacklab: lookbehind removed
            [ \t]+
            ["(]
            (.+?)           // title = $5
            [")]
            [ \t]*
            )?                  // title is optional
            (?:\n+|$)
            /gm, function(){...});
            */

            text = text.replace(/^[ ]{0,3}\[(.+)\]:[ \t]*\n?[ \t]*<?(\S+?)>?(?=\s|$)[ \t]*\n?[ \t]*((\n*)["(](.+?)[")][ \t]*)?(?:\n+)/gm,
                function (wholeMatch, m1, m2, m3, m4, m5) {
                    m1 = m1.toLowerCase();
                    g_urls.set(m1, _EncodeAmpsAndAngles(m2));  // Link IDs are case-insensitive
                    if (m4) {
                        // Oops, found blank lines, so it's not a title.
                        // Put back the parenthetical statement we stole.
                        return m3;
                    } else if (m5) {
                        g_titles.set(m1, m5.replace(/"/g, "&quot;"));
                    }

                    // Completely remove the definition from the text
                    return "";
                }
            );

            return text;
        }

        function _HashHTMLBlocks(text) {

            // Hashify HTML blocks:
            // We only want to do this for block-level HTML tags, such as headers,
            // lists, and tables. That's because we still want to wrap <p>s around
            // "paragraphs" that are wrapped in non-block-level tags, such as anchors,
            // phrase emphasis, and spans. The list of tags we're looking for is
            // hard-coded:
            var block_tags_a = "p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math|ins|del"
            var block_tags_b = "p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math"

            // First, look for nested blocks, e.g.:
            //   <div>
            //     <div>
            //     tags for inner block must be indented.
            //     </div>
            //   </div>
            //
            // The outermost tags must start at the left margin for this to match, and
            // the inner nested divs must be indented.
            // We need to do this before the next, more liberal match, because the next
            // match will start at the first `<div>` and stop at the first `</div>`.

            // attacklab: This regex can be expensive when it fails.

            /*
            text = text.replace(/
            (                       // save in $1
            ^                   // start of line  (with /m)
            <($block_tags_a)    // start tag = $2
            \b                  // word break
            // attacklab: hack around khtml/pcre bug...
            [^\r]*?\n           // any number of lines, minimally matching
            </\2>               // the matching end tag
            [ \t]*              // trailing spaces/tabs
            (?=\n+)             // followed by a newline
            )                       // attacklab: there are sentinel newlines at end of document
            /gm,function(){...}};
            */
            text = text.replace(/^(<(p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math|ins|del)\b[^\r]*?\n<\/\2>[ \t]*(?=\n+))/gm, hashElement);

            //
            // Now match more liberally, simply from `\n<tag>` to `</tag>\n`
            //

            /*
            text = text.replace(/
            (                       // save in $1
            ^                   // start of line  (with /m)
            <($block_tags_b)    // start tag = $2
            \b                  // word break
            // attacklab: hack around khtml/pcre bug...
            [^\r]*?             // any number of lines, minimally matching
            .*</\2>             // the matching end tag
            [ \t]*              // trailing spaces/tabs
            (?=\n+)             // followed by a newline
            )                       // attacklab: there are sentinel newlines at end of document
            /gm,function(){...}};
            */
            text = text.replace(/^(<(p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math)\b[^\r]*?.*<\/\2>[ \t]*(?=\n+)\n)/gm, hashElement);

            // Special case just for <hr />. It was easier to make a special case than
            // to make the other regex more complicated.  

            /*
            text = text.replace(/
            \n                  // Starting after a blank line
            [ ]{0,3}
            (                   // save in $1
            (<(hr)          // start tag = $2
            \b          // word break
            ([^<>])*?
            \/?>)           // the matching end tag
            [ \t]*
            (?=\n{2,})      // followed by a blank line
            )
            /g,hashElement);
            */
            text = text.replace(/\n[ ]{0,3}((<(hr)\b([^<>])*?\/?>)[ \t]*(?=\n{2,}))/g, hashElement);

            // Special case for standalone HTML comments:

            /*
            text = text.replace(/
            \n\n                                            // Starting after a blank line
            [ ]{0,3}                                        // attacklab: g_tab_width - 1
            (                                               // save in $1
            <!
            (--(?:|(?:[^>-]|-[^>])(?:[^-]|-[^-])*)--)   // see http://www.w3.org/TR/html-markup/syntax.html#comments and http://meta.stackoverflow.com/q/95256
            >
            [ \t]*
            (?=\n{2,})                                  // followed by a blank line
            )
            /g,hashElement);
            */
            text = text.replace(/\n\n[ ]{0,3}(<!(--(?:|(?:[^>-]|-[^>])(?:[^-]|-[^-])*)--)>[ \t]*(?=\n{2,}))/g, hashElement);

            // PHP and ASP-style processor instructions (<?...?> and <%...%>)

            /*
            text = text.replace(/
            (?:
            \n\n            // Starting after a blank line
            )
            (                   // save in $1
            [ ]{0,3}        // attacklab: g_tab_width - 1
            (?:
            <([?%])     // $2
            [^\r]*?
            \2>
            )
            [ \t]*
            (?=\n{2,})      // followed by a blank line
            )
            /g,hashElement);
            */
            text = text.replace(/(?:\n\n)([ ]{0,3}(?:<([?%])[^\r]*?\2>)[ \t]*(?=\n{2,}))/g, hashElement);

            return text;
        }

        function hashElement(wholeMatch, m1) {
            var blockText = m1;

            // Undo double lines
            blockText = blockText.replace(/^\n+/, "");

            // strip trailing blank lines
            blockText = blockText.replace(/\n+$/g, "");

            // Replace the element text with a marker ("~KxK" where x is its key)
            blockText = "\n\n~K" + (g_html_blocks.push(blockText) - 1) + "K\n\n";

            return blockText;
        }

        function _RunBlockGamut(text, doNotUnhash) {
            //
            // These are all the transformations that form block-level
            // tags like paragraphs, headers, and list items.
            //
            text = _DoHeaders(text);

            // Do Horizontal Rules:
            var replacement = "<hr />\n";
            text = text.replace(/^[ ]{0,2}([ ]?\*[ ]?){3,}[ \t]*$/gm, replacement);
            text = text.replace(/^[ ]{0,2}([ ]?-[ ]?){3,}[ \t]*$/gm, replacement);
            text = text.replace(/^[ ]{0,2}([ ]?_[ ]?){3,}[ \t]*$/gm, replacement);

            text = _DoLists(text);
            text = _DoCodeBlocks(text);
            text = _DoBlockQuotes(text);

            // We already ran _HashHTMLBlocks() before, in Markdown(), but that
            // was to escape raw HTML in the original Markdown source. This time,
            // we're escaping the markup we've just created, so that we don't wrap
            // <p> tags around block-level tags.
            text = _HashHTMLBlocks(text);
            text = _FormParagraphs(text, doNotUnhash);

            return text;
        }

        function _RunSpanGamut(text) {
            //
            // These are all the transformations that occur *within* block-level
            // tags like paragraphs, headers, and list items.
            //

            text = _DoCodeSpans(text);
            text = _EscapeSpecialCharsWithinTagAttributes(text);
            text = _EncodeBackslashEscapes(text);

            // Process anchor and image tags. Images must come first,
            // because ![foo][f] looks like an anchor.
            text = _DoImages(text);
            text = _DoAnchors(text);

            // Make links out of things like `<http://example.com/>`
            // Must come after _DoAnchors(), because you can use < and >
            // delimiters in inline links like [this](<url>).
            text = _DoAutoLinks(text);

            text = text.replace(/~P/g, "://"); // put in place to prevent autolinking; reset now

            text = _EncodeAmpsAndAngles(text);
            text = _DoItalicsAndBold(text);

            // Do hard breaks:
            text = text.replace(/  +\n/g, " <br>\n");

            return text;
        }

        function _EscapeSpecialCharsWithinTagAttributes(text) {
            //
            // Within tags -- meaning between < and > -- encode [\ ` * _] so they
            // don't conflict with their use in Markdown for code, italics and strong.
            //

            // Build a regex to find HTML tags and comments.  See Friedl's 
            // "Mastering Regular Expressions", 2nd Ed., pp. 200-201.

            // SE: changed the comment part of the regex

            var regex = /(<[a-z\/!$]("[^"]*"|'[^']*'|[^'">])*>|<!(--(?:|(?:[^>-]|-[^>])(?:[^-]|-[^-])*)--)>)/gi;

            text = text.replace(regex, function (wholeMatch) {
                var tag = wholeMatch.replace(/(.)<\/?code>(?=.)/g, "$1`");
                tag = escapeCharacters(tag, wholeMatch.charAt(1) == "!" ? "\\`*_/" : "\\`*_"); // also escape slashes in comments to prevent autolinking there -- http://meta.stackoverflow.com/questions/95987
                return tag;
            });

            return text;
        }

        function _DoAnchors(text) {
            //
            // Turn Markdown link shortcuts into XHTML <a> tags.
            //
            //
            // First, handle reference-style links: [link text] [id]
            //

            /*
            text = text.replace(/
            (                           // wrap whole match in $1
            \[
            (
            (?:
            \[[^\]]*\]      // allow brackets nested one level
            |
            [^\[]           // or anything else
            )*
            )
            \]

            [ ]?                    // one optional space
            (?:\n[ ]*)?             // one optional newline followed by spaces

            \[
            (.*?)                   // id = $3
            \]
            )
            ()()()()                    // pad remaining backreferences
            /g, writeAnchorTag);
            */
            text = text.replace(/(\[((?:\[[^\]]*\]|[^\[\]])*)\][ ]?(?:\n[ ]*)?\[(.*?)\])()()()()/g, writeAnchorTag);

            //
            // Next, inline-style links: [link text](url "optional title")
            //

            /*
            text = text.replace(/
            (                           // wrap whole match in $1
            \[
            (
            (?:
            \[[^\]]*\]      // allow brackets nested one level
            |
            [^\[\]]         // or anything else
            )*
            )
            \]
            \(                      // literal paren
            [ \t]*
            ()                      // no id, so leave $3 empty
            <?(                     // href = $4
            (?:
            \([^)]*\)       // allow one level of (correctly nested) parens (think MSDN)
            |
            [^()]
            )*?
            )>?                
            [ \t]*
            (                       // $5
            (['"])              // quote char = $6
            (.*?)               // Title = $7
            \6                  // matching quote
            [ \t]*              // ignore any spaces/tabs between closing quote and )
            )?                      // title is optional
            \)
            )
            /g, writeAnchorTag);
            */

            text = text.replace(/(\[((?:\[[^\]]*\]|[^\[\]])*)\]\([ \t]*()<?((?:\([^)]*\)|[^()])*?)>?[ \t]*((['"])(.*?)\6[ \t]*)?\))/g, writeAnchorTag);

            //
            // Last, handle reference-style shortcuts: [link text]
            // These must come last in case you've also got [link test][1]
            // or [link test](/foo)
            //

            /*
            text = text.replace(/
            (                   // wrap whole match in $1
            \[
            ([^\[\]]+)      // link text = $2; can't contain '[' or ']'
            \]
            )
            ()()()()()          // pad rest of backreferences
            /g, writeAnchorTag);
            */
            text = text.replace(/(\[([^\[\]]+)\])()()()()()/g, writeAnchorTag);

            return text;
        }

        function writeAnchorTag(wholeMatch, m1, m2, m3, m4, m5, m6, m7) {
            if (m7 == undefined) m7 = "";
            var whole_match = m1;
            var link_text = m2.replace(/:\/\//g, "~P"); // to prevent auto-linking withing the link. will be converted back after the auto-linker runs
            var link_id = m3.toLowerCase();
            var url = m4;
            var title = m7;

            if (url == "") {
                if (link_id == "") {
                    // lower-case and turn embedded newlines into spaces
                    link_id = link_text.toLowerCase().replace(/ ?\n/g, " ");
                }
                url = "#" + link_id;

                if (g_urls.get(link_id) != undefined) {
                    url = g_urls.get(link_id);
                    if (g_titles.get(link_id) != undefined) {
                        title = g_titles.get(link_id);
                    }
                }
                else {
                    if (whole_match.search(/\(\s*\)$/m) > -1) {
                        // Special case for explicit empty url
                        url = "";
                    } else {
                        return whole_match;
                    }
                }
            }
            url = encodeProblemUrlChars(url);
            url = escapeCharacters(url, "*_");
            var result = "<a href=\"" + url + "\"";

            if (title != "") {
                title = attributeEncode(title);
                title = escapeCharacters(title, "*_");
                result += " title=\"" + title + "\"";
            }

            result += ">" + link_text + "</a>";

            return result;
        }

        function _DoImages(text) {
            //
            // Turn Markdown image shortcuts into <img> tags.
            //

            //
            // First, handle reference-style labeled images: ![alt text][id]
            //

            /*
            text = text.replace(/
            (                   // wrap whole match in $1
            !\[
            (.*?)           // alt text = $2
            \]

            [ ]?            // one optional space
            (?:\n[ ]*)?     // one optional newline followed by spaces

            \[
            (.*?)           // id = $3
            \]
            )
            ()()()()            // pad rest of backreferences
            /g, writeImageTag);
            */
            text = text.replace(/(!\[(.*?)\][ ]?(?:\n[ ]*)?\[(.*?)\])()()()()/g, writeImageTag);

            //
            // Next, handle inline images:  ![alt text](url "optional title")
            // Don't forget: encode * and _

            /*
            text = text.replace(/
            (                   // wrap whole match in $1
            !\[
            (.*?)           // alt text = $2
            \]
            \s?             // One optional whitespace character
            \(              // literal paren
            [ \t]*
            ()              // no id, so leave $3 empty
            <?(\S+?)>?      // src url = $4
            [ \t]*
            (               // $5
            (['"])      // quote char = $6
            (.*?)       // title = $7
            \6          // matching quote
            [ \t]*
            )?              // title is optional
            \)
            )
            /g, writeImageTag);
            */
            text = text.replace(/(!\[(.*?)\]\s?\([ \t]*()<?(\S+?)>?[ \t]*((['"])(.*?)\6[ \t]*)?\))/g, writeImageTag);

            return text;
        }

        function attributeEncode(text) {
            // unconditionally replace angle brackets here -- what ends up in an attribute (e.g. alt or title)
            // never makes sense to have verbatim HTML in it (and the sanitizer would totally break it)
            return text.replace(/>/g, "&gt;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
        }

        function writeImageTag(wholeMatch, m1, m2, m3, m4, m5, m6, m7) {
            var whole_match = m1;
            var alt_text = m2;
            var link_id = m3.toLowerCase();
            var url = m4;
            var title = m7;

            if (!title) title = "";

            if (url == "") {
                if (link_id == "") {
                    // lower-case and turn embedded newlines into spaces
                    link_id = alt_text.toLowerCase().replace(/ ?\n/g, " ");
                }
                url = "#" + link_id;

                if (g_urls.get(link_id) != undefined) {
                    url = g_urls.get(link_id);
                    if (g_titles.get(link_id) != undefined) {
                        title = g_titles.get(link_id);
                    }
                }
                else {
                    return whole_match;
                }
            }

            alt_text = escapeCharacters(attributeEncode(alt_text), "*_[]()");
            url = escapeCharacters(url, "*_");
            var result = "<img src=\"" + url + "\" alt=\"" + alt_text + "\"";

            // attacklab: Markdown.pl adds empty title attributes to images.
            // Replicate this bug.

            //if (title != "") {
            title = attributeEncode(title);
            title = escapeCharacters(title, "*_");
            result += " title=\"" + title + "\"";
            //}

            result += " />";

            return result;
        }

        function _DoHeaders(text) {

            // Setext-style headers:
            //  Header 1
            //  ========
            //  
            //  Header 2
            //  --------
            //
            text = text.replace(/^(.+)[ \t]*\n=+[ \t]*\n+/gm,
                function (wholeMatch, m1) { return "<h1>" + _RunSpanGamut(m1) + "</h1>\n\n"; }
            );

            text = text.replace(/^(.+)[ \t]*\n-+[ \t]*\n+/gm,
                function (matchFound, m1) { return "<h2>" + _RunSpanGamut(m1) + "</h2>\n\n"; }
            );

            // atx-style headers:
            //  # Header 1
            //  ## Header 2
            //  ## Header 2 with closing hashes ##
            //  ...
            //  ###### Header 6
            //

            /*
            text = text.replace(/
            ^(\#{1,6})      // $1 = string of #'s
            [ \t]*
            (.+?)           // $2 = Header text
            [ \t]*
            \#*             // optional closing #'s (not counted)
            \n+
            /gm, function() {...});
            */

            text = text.replace(/^(\#{1,6})[ \t]*(.+?)[ \t]*\#*\n+/gm,
                function (wholeMatch, m1, m2) {
                    var h_level = m1.length;
                    return "<h" + h_level + ">" + _RunSpanGamut(m2) + "</h" + h_level + ">\n\n";
                }
            );

            return text;
        }

        function _DoLists(text) {
            //
            // Form HTML ordered (numbered) and unordered (bulleted) lists.
            //

            // attacklab: add sentinel to hack around khtml/safari bug:
            // http://bugs.webkit.org/show_bug.cgi?id=11231
            text += "~0";

            // Re-usable pattern to match any entirel ul or ol list:

            /*
            var whole_list = /
            (                                   // $1 = whole list
            (                               // $2
            [ ]{0,3}                    // attacklab: g_tab_width - 1
            ([*+-]|\d+[.])              // $3 = first list item marker
            [ \t]+
            )
            [^\r]+?
            (                               // $4
            ~0                          // sentinel for workaround; should be $
            |
            \n{2,}
            (?=\S)
            (?!                         // Negative lookahead for another list item marker
            [ \t]*
            (?:[*+-]|\d+[.])[ \t]+
            )
            )
            )
            /g
            */
            var whole_list = /^(([ ]{0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(~0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/gm;

            if (g_list_level) {
                text = text.replace(whole_list, function (wholeMatch, m1, m2) {
                    var list = m1;
                    var list_type = (m2.search(/[*+-]/g) > -1) ? "ul" : "ol";

                    var result = _ProcessListItems(list, list_type);

                    // Trim any trailing whitespace, to put the closing `</$list_type>`
                    // up on the preceding line, to get it past the current stupid
                    // HTML block parser. This is a hack to work around the terrible
                    // hack that is the HTML block parser.
                    result = result.replace(/\s+$/, "");
                    result = "<" + list_type + ">" + result + "</" + list_type + ">\n";
                    return result;
                });
            } else {
                whole_list = /(\n\n|^\n?)(([ ]{0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(~0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/g;
                text = text.replace(whole_list, function (wholeMatch, m1, m2, m3) {
                    var runup = m1;
                    var list = m2;

                    var list_type = (m3.search(/[*+-]/g) > -1) ? "ul" : "ol";
                    var result = _ProcessListItems(list, list_type);
                    result = runup + "<" + list_type + ">\n" + result + "</" + list_type + ">\n";
                    return result;
                });
            }

            // attacklab: strip sentinel
            text = text.replace(/~0/, "");

            return text;
        }

        var _listItemMarkers = { ol: "\\d+[.]", ul: "[*+-]" };

        function _ProcessListItems(list_str, list_type) {
            //
            //  Process the contents of a single ordered or unordered list, splitting it
            //  into individual list items.
            //
            //  list_type is either "ul" or "ol".

            // The $g_list_level global keeps track of when we're inside a list.
            // Each time we enter a list, we increment it; when we leave a list,
            // we decrement. If it's zero, we're not in a list anymore.
            //
            // We do this because when we're not inside a list, we want to treat
            // something like this:
            //
            //    I recommend upgrading to version
            //    8. Oops, now this line is treated
            //    as a sub-list.
            //
            // As a single paragraph, despite the fact that the second line starts
            // with a digit-period-space sequence.
            //
            // Whereas when we're inside a list (or sub-list), that line will be
            // treated as the start of a sub-list. What a kludge, huh? This is
            // an aspect of Markdown's syntax that's hard to parse perfectly
            // without resorting to mind-reading. Perhaps the solution is to
            // change the syntax rules such that sub-lists must start with a
            // starting cardinal number; e.g. "1." or "a.".

            g_list_level++;

            // trim trailing blank lines:
            list_str = list_str.replace(/\n{2,}$/, "\n");

            // attacklab: add sentinel to emulate \z
            list_str += "~0";

            // In the original attacklab showdown, list_type was not given to this function, and anything
            // that matched /[*+-]|\d+[.]/ would just create the next <li>, causing this mismatch:
            //
            //  Markdown          rendered by WMD        rendered by MarkdownSharp
            //  ------------------------------------------------------------------
            //  1. first          1. first               1. first
            //  2. second         2. second              2. second
            //  - third           3. third                   * third
            //
            // We changed this to behave identical to MarkdownSharp. This is the constructed RegEx,
            // with {MARKER} being one of \d+[.] or [*+-], depending on list_type:

            /*
            list_str = list_str.replace(/
            (^[ \t]*)                       // leading whitespace = $1
            ({MARKER}) [ \t]+               // list marker = $2
            ([^\r]+?                        // list item text   = $3
            (\n+)
            )
            (?=
            (~0 | \2 ({MARKER}) [ \t]+)
            )
            /gm, function(){...});
            */

            var marker = _listItemMarkers[list_type];
            var re = new RegExp("(^[ \\t]*)(" + marker + ")[ \\t]+([^\\r]+?(\\n+))(?=(~0|\\1(" + marker + ")[ \\t]+))", "gm");
            var last_item_had_a_double_newline = false;
            list_str = list_str.replace(re,
                function (wholeMatch, m1, m2, m3) {
                    var item = m3;
                    var leading_space = m1;
                    var ends_with_double_newline = /\n\n$/.test(item);
                    var contains_double_newline = ends_with_double_newline || item.search(/\n{2,}/) > -1;

                    if (contains_double_newline || last_item_had_a_double_newline) {
                        item = _RunBlockGamut(_Outdent(item), /* doNotUnhash = */true);
                    }
                    else {
                        // Recursion for sub-lists:
                        item = _DoLists(_Outdent(item));
                        item = item.replace(/\n$/, ""); // chomp(item)
                        item = _RunSpanGamut(item);
                    }
                    last_item_had_a_double_newline = ends_with_double_newline;
                    return "<li>" + item + "</li>\n";
                }
            );

            // attacklab: strip sentinel
            list_str = list_str.replace(/~0/g, "");

            g_list_level--;
            return list_str;
        }

        function _DoCodeBlocks(text) {
            //
            //  Process Markdown `<pre><code>` blocks.
            //  

            /*
            text = text.replace(/
            (?:\n\n|^)
            (                               // $1 = the code block -- one or more lines, starting with a space/tab
            (?:
            (?:[ ]{4}|\t)           // Lines must start with a tab or a tab-width of spaces - attacklab: g_tab_width
            .*\n+
            )+
            )
            (\n*[ ]{0,3}[^ \t\n]|(?=~0))    // attacklab: g_tab_width
            /g ,function(){...});
            */

            // attacklab: sentinel workarounds for lack of \A and \Z, safari\khtml bug
            text += "~0";

            text = text.replace(/(?:\n\n|^)((?:(?:[ ]{4}|\t).*\n+)+)(\n*[ ]{0,3}[^ \t\n]|(?=~0))/g,
                function (wholeMatch, m1, m2) {
                    var codeblock = m1;
                    var nextChar = m2;

                    codeblock = _EncodeCode(_Outdent(codeblock));
                    codeblock = _Detab(codeblock);
                    codeblock = codeblock.replace(/^\n+/g, ""); // trim leading newlines
                    codeblock = codeblock.replace(/\n+$/g, ""); // trim trailing whitespace

                    codeblock = "<pre><code>" + codeblock + "\n</code></pre>";

                    return "\n\n" + codeblock + "\n\n" + nextChar;
                }
            );

            // attacklab: strip sentinel
            text = text.replace(/~0/, "");

            return text;
        }

        function hashBlock(text) {
            text = text.replace(/(^\n+|\n+$)/g, "");
            return "\n\n~K" + (g_html_blocks.push(text) - 1) + "K\n\n";
        }

        function _DoCodeSpans(text) {
            //
            // * Backtick quotes are used for <code></code> spans.
            // 
            // * You can use multiple backticks as the delimiters if you want to
            //   include literal backticks in the code span. So, this input:
            //     
            //      Just type ``foo `bar` baz`` at the prompt.
            //     
            //   Will translate to:
            //     
            //      <p>Just type <code>foo `bar` baz</code> at the prompt.</p>
            //     
            //   There's no arbitrary limit to the number of backticks you
            //   can use as delimters. If you need three consecutive backticks
            //   in your code, use four for delimiters, etc.
            //
            // * You can use spaces to get literal backticks at the edges:
            //     
            //      ... type `` `bar` `` ...
            //     
            //   Turns to:
            //     
            //      ... type <code>`bar`</code> ...
            //

            /*
            text = text.replace(/
            (^|[^\\])       // Character before opening ` can't be a backslash
            (`+)            // $2 = Opening run of `
            (               // $3 = The code block
            [^\r]*?
            [^`]        // attacklab: work around lack of lookbehind
            )
            \2              // Matching closer
            (?!`)
            /gm, function(){...});
            */

            text = text.replace(/(^|[^\\])(`+)([^\r]*?[^`])\2(?!`)/gm,
                function (wholeMatch, m1, m2, m3, m4) {
                    var c = m3;
                    c = c.replace(/^([ \t]*)/g, ""); // leading whitespace
                    c = c.replace(/[ \t]*$/g, ""); // trailing whitespace
                    c = _EncodeCode(c);
                    c = c.replace(/:\/\//g, "~P"); // to prevent auto-linking. Not necessary in code *blocks*, but in code spans. Will be converted back after the auto-linker runs.
                    return m1 + "<code>" + c + "</code>";
                }
            );

            return text;
        }

        function _EncodeCode(text) {
            //
            // Encode/escape certain characters inside Markdown code runs.
            // The point is that in code, these characters are literals,
            // and lose their special Markdown meanings.
            //
            // Encode all ampersands; HTML entities are not
            // entities within a Markdown code span.
            text = text.replace(/&/g, "&amp;");

            // Do the angle bracket song and dance:
            text = text.replace(/</g, "&lt;");
            text = text.replace(/>/g, "&gt;");

            // Now, escape characters that are magic in Markdown:
            text = escapeCharacters(text, "\*_{}[]\\", false);

            // jj the line above breaks this:
            //---

            //* Item

            //   1. Subitem

            //            special char: *
            //---

            return text;
        }

        function _DoItalicsAndBold(text) {

            // <strong> must go first:
            text = text.replace(/([\W_]|^)(\*\*|__)(?=\S)([^\r]*?\S[\*_]*)\2([\W_]|$)/g,
            "$1<strong>$3</strong>$4");

            text = text.replace(/([\W_]|^)(\*|_)(?=\S)([^\r\*_]*?\S)\2([\W_]|$)/g,
            "$1<em>$3</em>$4");

            return text;
        }

        function _DoBlockQuotes(text) {

            /*
            text = text.replace(/
            (                           // Wrap whole match in $1
            (
            ^[ \t]*>[ \t]?      // '>' at the start of a line
            .+\n                // rest of the first line
            (.+\n)*             // subsequent consecutive lines
            \n*                 // blanks
            )+
            )
            /gm, function(){...});
            */

            text = text.replace(/((^[ \t]*>[ \t]?.+\n(.+\n)*\n*)+)/gm,
                function (wholeMatch, m1) {
                    var bq = m1;

                    // attacklab: hack around Konqueror 3.5.4 bug:
                    // "----------bug".replace(/^-/g,"") == "bug"

                    bq = bq.replace(/^[ \t]*>[ \t]?/gm, "~0"); // trim one level of quoting

                    // attacklab: clean up hack
                    bq = bq.replace(/~0/g, "");

                    bq = bq.replace(/^[ \t]+$/gm, "");     // trim whitespace-only lines
                    bq = _RunBlockGamut(bq);             // recurse

                    bq = bq.replace(/(^|\n)/g, "$1  ");
                    // These leading spaces screw with <pre> content, so we need to fix that:
                    bq = bq.replace(
                            /(\s*<pre>[^\r]+?<\/pre>)/gm,
                        function (wholeMatch, m1) {
                            var pre = m1;
                            // attacklab: hack around Konqueror 3.5.4 bug:
                            pre = pre.replace(/^  /mg, "~0");
                            pre = pre.replace(/~0/g, "");
                            return pre;
                        });

                    return hashBlock("<blockquote>\n" + bq + "\n</blockquote>");
                }
            );
            return text;
        }

        function _FormParagraphs(text, doNotUnhash) {
            //
            //  Params:
            //    $text - string to process with html <p> tags
            //

            // Strip leading and trailing lines:
            text = text.replace(/^\n+/g, "");
            text = text.replace(/\n+$/g, "");

            var grafs = text.split(/\n{2,}/g);
            var grafsOut = [];

            var markerRe = /~K(\d+)K/;

            //
            // Wrap <p> tags.
            //
            var end = grafs.length;
            for (var i = 0; i < end; i++) {
                var str = grafs[i];

                // if this is an HTML marker, copy it
                if (markerRe.test(str)) {
                    grafsOut.push(str);
                }
                else if (/\S/.test(str)) {
                    str = _RunSpanGamut(str);
                    str = str.replace(/^([ \t]*)/g, "<p>");
                    str += "</p>"
                    grafsOut.push(str);
                }

            }
            //
            // Unhashify HTML blocks
            //
            if (!doNotUnhash) {
                end = grafsOut.length;
                for (var i = 0; i < end; i++) {
                    var foundAny = true;
                    while (foundAny) { // we may need several runs, since the data may be nested
                        foundAny = false;
                        grafsOut[i] = grafsOut[i].replace(/~K(\d+)K/g, function (wholeMatch, id) {
                            foundAny = true;
                            return g_html_blocks[id];
                        });
                    }
                }
            }
            return grafsOut.join("\n\n");
        }

        function _EncodeAmpsAndAngles(text) {
            // Smart processing for ampersands and angle brackets that need to be encoded.

            // Ampersand-encoding based entirely on Nat Irons's Amputator MT plugin:
            //   http://bumppo.net/projects/amputator/
            text = text.replace(/&(?!#?[xX]?(?:[0-9a-fA-F]+|\w+);)/g, "&amp;");

            // Encode naked <'s
            text = text.replace(/<(?![a-z\/?\$!])/gi, "&lt;");

            return text;
        }

        function _EncodeBackslashEscapes(text) {
            //
            //   Parameter:  String.
            //   Returns:    The string, with after processing the following backslash
            //               escape sequences.
            //

            // attacklab: The polite way to do this is with the new
            // escapeCharacters() function:
            //
            //     text = escapeCharacters(text,"\\",true);
            //     text = escapeCharacters(text,"`*_{}[]()>#+-.!",true);
            //
            // ...but we're sidestepping its use of the (slow) RegExp constructor
            // as an optimization for Firefox.  This function gets called a LOT.

            text = text.replace(/\\(\\)/g, escapeCharacters_callback);
            text = text.replace(/\\([`*_{}\[\]()>#+-.!])/g, escapeCharacters_callback);
            return text;
        }

        function _DoAutoLinks(text) {

            // note that at this point, all other URL in the text are already hyperlinked as <a href=""></a>
            // *except* for the <http://www.foo.com> case

            // automatically add < and > around unadorned raw hyperlinks
            // must be preceded by space/BOF and followed by non-word/EOF character    
            text = text.replace(/(^|\s)(https?|ftp)(:\/\/[-A-Z0-9+&@#\/%?=~_|\[\]\(\)!:,\.;]*[-A-Z0-9+&@#\/%=~_|\[\]])($|\W)/gi, "$1<$2$3>$4");

            //  autolink anything like <http://example.com>

            var replacer = function (wholematch, m1) { return "<a href=\"" + m1 + "\">" + pluginHooks.plainLinkText(m1) + "</a>"; }
            text = text.replace(/<((https?|ftp):[^'">\s]+)>/gi, replacer);

            // Email addresses: <address@domain.foo>
            /*
            text = text.replace(/
            <
            (?:mailto:)?
            (
            [-.\w]+
            \@
            [-a-z0-9]+(\.[-a-z0-9]+)*\.[a-z]+
            )
            >
            /gi, _DoAutoLinks_callback());
            */

            /* disabling email autolinking, since we don't do that on the server, either
            text = text.replace(/<(?:mailto:)?([-.\w]+\@[-a-z0-9]+(\.[-a-z0-9]+)*\.[a-z]+)>/gi,
            function(wholeMatch,m1) {
            return _EncodeEmailAddress( _UnescapeSpecialChars(m1) );
            }
            );
            */
            return text;
        }

        function _UnescapeSpecialChars(text) {
            //
            // Swap back in all the special characters we've hidden.
            //
            text = text.replace(/~E(\d+)E/g,
                function (wholeMatch, m1) {
                    var charCodeToReplace = parseInt(m1);
                    return String.fromCharCode(charCodeToReplace);
                }
            );
            return text;
        }

        function _Outdent(text) {
            //
            // Remove one level of line-leading tabs or spaces
            //

            // attacklab: hack around Konqueror 3.5.4 bug:
            // "----------bug".replace(/^-/g,"") == "bug"

            text = text.replace(/^(\t|[ ]{1,4})/gm, "~0"); // attacklab: g_tab_width

            // attacklab: clean up hack
            text = text.replace(/~0/g, "")

            return text;
        }

        function _Detab(text) {
            if (!/\t/.test(text))
                return text;

            var spaces = ["    ", "   ", "  ", " "],
            skew = 0,
            v;

            return text.replace(/[\n\t]/g, function (match, offset) {
                if (match === "\n") {
                    skew = offset + 1;
                    return match;
                }
                v = (offset - skew) % 4;
                skew = offset + 1;
                return spaces[v];
            });
        }

        //
        //  attacklab: Utility functions
        //

        var _problemUrlChars = /(?:["'*()[\]:]|~D)/g;

        // hex-encodes some unusual "problem" chars in URLs to avoid URL detection problems 
        function encodeProblemUrlChars(url) {
            if (!url)
                return "";

            var len = url.length;

            return url.replace(_problemUrlChars, function (match, offset) {
                if (match == "~D") // escape for dollar
                    return "%24";
                if (match == ":") {
                    if (offset == len - 1 || /[0-9\/]/.test(url.charAt(offset + 1)))
                        return ":"
                }
                return "%" + match.charCodeAt(0).toString(16);
            });
        }


        function escapeCharacters(text, charsToEscape, afterBackslash) {
            // First we have to escape the escape characters so that
            // we can build a character class out of them
            var regexString = "([" + charsToEscape.replace(/([\[\]\\])/g, "\\$1") + "])";

            if (afterBackslash) {
                regexString = "\\\\" + regexString;
            }

            var regex = new RegExp(regexString, "g");
            text = text.replace(regex, escapeCharacters_callback);

            return text;
        }


        function escapeCharacters_callback(wholeMatch, m1) {
            var charCodeToEscape = m1.charCodeAt(0);
            return "~E" + charCodeToEscape + "E";
        }

    }; // end of the Markdown.Converter constructor

})();

var hljs = new function () { function m(p) { return p.replace(/&/gm, "&amp;").replace(/</gm, "&lt;") } function f(r, q, p) { return RegExp(q, "m" + (r.cI ? "i" : "") + (p ? "g" : "")) } function b(r) { for (var p = 0; p < r.childNodes.length; p++) { var q = r.childNodes[p]; if (q.nodeName == "CODE") { return q } if (!(q.nodeType == 3 && q.nodeValue.match(/\s+/))) { break } } } function h(t, s) { var p = ""; for (var r = 0; r < t.childNodes.length; r++) { if (t.childNodes[r].nodeType == 3) { var q = t.childNodes[r].nodeValue; if (s) { q = q.replace(/\n/g, "") } p += q } else { if (t.childNodes[r].nodeName == "BR") { p += "\n" } else { p += h(t.childNodes[r]) } } } if (/MSIE [678]/.test(navigator.userAgent)) { p = p.replace(/\r/g, "\n") } return p } function a(s) { var r = s.className.split(/\s+/); r = r.concat(s.parentNode.className.split(/\s+/)); for (var q = 0; q < r.length; q++) { var p = r[q].replace(/^language-/, ""); if (e[p] || p == "no-highlight") { return p } } } function c(q) { var p = []; (function (s, t) { for (var r = 0; r < s.childNodes.length; r++) { if (s.childNodes[r].nodeType == 3) { t += s.childNodes[r].nodeValue.length } else { if (s.childNodes[r].nodeName == "BR") { t += 1 } else { p.push({ event: "start", offset: t, node: s.childNodes[r] }); t = arguments.callee(s.childNodes[r], t); p.push({ event: "stop", offset: t, node: s.childNodes[r] }) } } } return t })(q, 0); return p } function k(y, w, x) { var q = 0; var z = ""; var s = []; function u() { if (y.length && w.length) { if (y[0].offset != w[0].offset) { return (y[0].offset < w[0].offset) ? y : w } else { return w[0].event == "start" ? y : w } } else { return y.length ? y : w } } function t(D) { var A = "<" + D.nodeName.toLowerCase(); for (var B = 0; B < D.attributes.length; B++) { var C = D.attributes[B]; A += " " + C.nodeName.toLowerCase(); if (C.nodeValue != undefined && C.nodeValue != false && C.nodeValue != null) { A += '="' + m(C.nodeValue) + '"' } } return A + ">" } while (y.length || w.length) { var v = u().splice(0, 1)[0]; z += m(x.substr(q, v.offset - q)); q = v.offset; if (v.event == "start") { z += t(v.node); s.push(v.node) } else { if (v.event == "stop") { var r = s.length; do { r--; var p = s[r]; z += ("</" + p.nodeName.toLowerCase() + ">") } while (p != v.node); s.splice(r, 1); while (r < s.length) { z += t(s[r]); r++ } } } } z += x.substr(q); return z } function j() { function q(u, v, t) { if (u.compiled) { return } if (!t) { u.bR = f(v, u.b ? u.b : "\\B|\\b"); if (!u.e && !u.eW) { u.e = "\\B|\\b" } if (u.e) { u.eR = f(v, u.e) } } if (u.i) { u.iR = f(v, u.i) } if (u.r == undefined) { u.r = 1 } if (u.k) { u.lR = f(v, u.l || hljs.IR, true) } for (var s in u.k) { if (!u.k.hasOwnProperty(s)) { continue } if (u.k[s] instanceof Object) { u.kG = u.k } else { u.kG = { keyword: u.k} } break } if (!u.c) { u.c = [] } u.compiled = true; for (var r = 0; r < u.c.length; r++) { q(u.c[r], v, false) } if (u.starts) { q(u.starts, v, false) } } for (var p in e) { if (!e.hasOwnProperty(p)) { continue } q(e[p].dM, e[p], true) } } function d(B, C) { if (!j.called) { j(); j.called = true } function q(r, M) { for (var L = 0; L < M.c.length; L++) { if (M.c[L].bR.test(r)) { return M.c[L] } } } function v(L, r) { if (D[L].e && D[L].eR.test(r)) { return 1 } if (D[L].eW) { var M = v(L - 1, r); return M ? M + 1 : 0 } return 0 } function w(r, L) { return L.iR && L.iR.test(r) } function K(N, O) { var M = []; for (var L = 0; L < N.c.length; L++) { M.push(N.c[L].b) } var r = D.length - 1; do { if (D[r].e) { M.push(D[r].e) } r-- } while (D[r + 1].eW); if (N.i) { M.push(N.i) } return f(O, "(" + M.join("|") + ")", true) } function p(M, L) { var N = D[D.length - 1]; if (!N.t) { N.t = K(N, E) } N.t.lastIndex = L; var r = N.t.exec(M); if (r) { return [M.substr(L, r.index - L), r[0], false] } else { return [M.substr(L), "", true] } } function z(O, r) { var L = E.cI ? r[0].toLowerCase() : r[0]; for (var N in O.kG) { if (!O.kG.hasOwnProperty(N)) { continue } var M = O.kG[N].hasOwnProperty(L); if (M) { return [N, M] } } return false } function F(L, P) { if (!P.k) { return m(L) } var r = ""; var O = 0; P.lR.lastIndex = 0; var M = P.lR.exec(L); while (M) { r += m(L.substr(O, M.index - O)); var N = z(P, M); if (N) { x += N[1]; r += '<span class="' + N[0] + '">' + m(M[0]) + "</span>" } else { r += m(M[0]) } O = P.lR.lastIndex; M = P.lR.exec(L) } r += m(L.substr(O, L.length - O)); return r } function J(L, M) { if (M.sL && e[M.sL]) { var r = d(M.sL, L); x += r.keyword_count; return r.value } else { return F(L, M) } } function I(M, r) { var L = M.cN ? '<span class="' + M.cN + '">' : ""; if (M.rB) { y += L; M.buffer = "" } else { if (M.eB) { y += m(r) + L; M.buffer = "" } else { y += L; M.buffer = r } } D.push(M); A += M.r } function G(N, M, Q) { var R = D[D.length - 1]; if (Q) { y += J(R.buffer + N, R); return false } var P = q(M, R); if (P) { y += J(R.buffer + N, R); I(P, M); return P.rB } var L = v(D.length - 1, M); if (L) { var O = R.cN ? "</span>" : ""; if (R.rE) { y += J(R.buffer + N, R) + O } else { if (R.eE) { y += J(R.buffer + N, R) + O + m(M) } else { y += J(R.buffer + N + M, R) + O } } while (L > 1) { O = D[D.length - 2].cN ? "</span>" : ""; y += O; L--; D.length-- } var r = D[D.length - 1]; D.length--; D[D.length - 1].buffer = ""; if (r.starts) { I(r.starts, "") } return R.rE } if (w(M, R)) { throw "Illegal" } } var E = e[B]; var D = [E.dM]; var A = 0; var x = 0; var y = ""; try { var u = 0; E.dM.buffer = ""; do { var s = p(C, u); var t = G(s[0], s[1], s[2]); u += s[0].length; if (!t) { u += s[1].length } } while (!s[2]); if (D.length > 1) { throw "Illegal" } return { r: A, keyword_count: x, value: y} } catch (H) { if (H == "Illegal") { return { r: 0, keyword_count: 0, value: m(C)} } else { throw H } } } function g(t) { var p = { keyword_count: 0, r: 0, value: m(t) }; var r = p; for (var q in e) { if (!e.hasOwnProperty(q)) { continue } var s = d(q, t); s.language = q; if (s.keyword_count + s.r > r.keyword_count + r.r) { r = s } if (s.keyword_count + s.r > p.keyword_count + p.r) { r = p; p = s } } if (r.language) { p.second_best = r } return p } function i(r, q, p) { if (q) { r = r.replace(/^((<[^>]+>|\t)+)/gm, function (t, w, v, u) { return w.replace(/\t/g, q) }) } if (p) { r = r.replace(/\n/g, "<br>") } return r } function n(t, w, r) { var x = h(t, r); var v = a(t); if (v == "no-highlight") { return } if (v) { var y = d(v, x) } else { var y = g(x); v = y.language } var q = c(t); if (q.length) { var s = document.createElement("pre"); s.innerHTML = y.value; y.value = k(q, c(s), x) } y.value = i(y.value, w, r); var u = t.className; if (!u.match("(\\s|^)(language-)?" + v + "(\\s|$)")) { u = u ? (u + " " + v) : v } if (/MSIE [678]/.test(navigator.userAgent) && t.tagName == "CODE" && t.parentNode.tagName == "PRE") { var s = t.parentNode; var p = document.createElement("div"); p.innerHTML = "<pre><code>" + y.value + "</code></pre>"; t = p.firstChild.firstChild; p.firstChild.cN = s.cN; s.parentNode.replaceChild(p.firstChild, s) } else { t.innerHTML = y.value } t.className = u; t.result = { language: v, kw: y.keyword_count, re: y.r }; if (y.second_best) { t.second_best = { language: y.second_best.language, kw: y.second_best.keyword_count, re: y.second_best.r} } } function o() { if (o.called) { return } o.called = true; var r = document.getElementsByTagName("pre"); for (var p = 0; p < r.length; p++) { var q = b(r[p]); if (q) { n(q, hljs.tabReplace) } } } function l() { if (window.addEventListener) { window.addEventListener("DOMContentLoaded", o, false); window.addEventListener("load", o, false) } else { if (window.attachEvent) { window.attachEvent("onload", o) } else { window.onload = o } } } var e = {}; this.LANGUAGES = e; this.highlight = d; this.highlightAuto = g; this.fixMarkup = i; this.highlightBlock = n; this.initHighlighting = o; this.initHighlightingOnLoad = l; this.IR = "[a-zA-Z][a-zA-Z0-9_]*"; this.UIR = "[a-zA-Z_][a-zA-Z0-9_]*"; this.NR = "\\b\\d+(\\.\\d+)?"; this.CNR = "\\b(0x[A-Za-z0-9]+|\\d+(\\.\\d+)?)"; this.RSR = "!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|\\.|-|-=|/|/=|:|;|<|<<|<<=|<=|=|==|===|>|>=|>>|>>=|>>>|>>>=|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~"; this.BE = { b: "\\\\.", r: 0 }; this.ASM = { cN: "string", b: "'", e: "'", i: "\\n", c: [this.BE], r: 0 }; this.QSM = { cN: "string", b: '"', e: '"', i: "\\n", c: [this.BE], r: 0 }; this.CLCM = { cN: "comment", b: "//", e: "$" }; this.CBLCLM = { cN: "comment", b: "/\\*", e: "\\*/" }; this.HCM = { cN: "comment", b: "#", e: "$" }; this.NM = { cN: "number", b: this.NR, r: 0 }; this.CNM = { cN: "number", b: this.CNR, r: 0 }; this.inherit = function (r, s) { var p = {}; for (var q in r) { p[q] = r[q] } if (s) { for (var q in s) { p[q] = s[q] } } return p } } (); hljs.LANGUAGES.java = { dM: { k: { "false": 1, "synchronized": 1, "int": 1, "abstract": 1, "float": 1, "private": 1, "char": 1, "interface": 1, "boolean": 1, "static": 1, "null": 1, "if": 1, "const": 1, "for": 1, "true": 1, "while": 1, "long": 1, "throw": 1, strictfp: 1, "finally": 1, "protected": 1, "extends": 1, "import": 1, "native": 1, "final": 1, "implements": 1, "return": 1, "void": 1, "enum": 1, "else": 1, "break": 1, "transient": 1, "new": 1, "catch": 1, "instanceof": 1, "byte": 1, "super": 1, "class": 1, "volatile": 1, "case": 1, assert: 1, "short": 1, "package": 1, "default": 1, "double": 1, "public": 1, "try": 1, "this": 1, "switch": 1, "continue": 1, "throws": 1 }, c: [{ cN: "javadoc", b: "/\\*\\*", e: "\\*/", c: [{ cN: "javadoctag", b: "@[A-Za-z]+"}], r: 10 }, hljs.CLCM, hljs.CBLCLM, hljs.ASM, hljs.QSM, { cN: "class", b: "(class |interface )", e: "{", k: { "class": 1, "interface": 1 }, i: ":", c: [{ b: "(implements|extends)", k: { "extends": 1, "implements": 1 }, r: 10 }, { cN: "title", b: hljs.UIR}] }, hljs.CNM, { cN: "annotation", b: "@[A-Za-z]+"}]} }; hljs.LANGUAGES.python = function () { var c = { cN: "string", b: "(u|b)?r?'''", e: "'''", r: 10 }; var b = { cN: "string", b: '(u|b)?r?"""', e: '"""', r: 10 }; var a = { cN: "string", b: "(u|r|ur|b|br)'", e: "'", c: [hljs.BE], r: 10 }; var f = { cN: "string", b: '(u|r|ur|b|br)"', e: '"', c: [hljs.BE], r: 10 }; var e = { cN: "title", b: hljs.UIR }; var d = { cN: "params", b: "\\(", e: "\\)", c: [c, b, a, f, hljs.ASM, hljs.QSM] }; return { dM: { k: { keyword: { and: 1, elif: 1, is: 1, global: 1, as: 1, "in": 1, "if": 1, from: 1, raise: 1, "for": 1, except: 1, "finally": 1, print: 1, "import": 1, pass: 1, "return": 1, exec: 1, "else": 1, "break": 1, not: 1, "with": 1, "class": 1, assert: 1, yield: 1, "try": 1, "while": 1, "continue": 1, del: 1, or: 1, def: 1, lambda: 1, nonlocal: 10 }, built_in: { None: 1, True: 1, False: 1, Ellipsis: 1, NotImplemented: 1} }, i: "(</|->|\\?)", c: [hljs.HCM, c, b, a, f, hljs.ASM, hljs.QSM, { cN: "function", b: "\\bdef ", e: ":", i: "$", k: { def: 1 }, c: [e, d], r: 10 }, { cN: "class", b: "\\bclass ", e: ":", i: "[${]", k: { "class": 1 }, c: [e, d], r: 10 }, hljs.CNM, { cN: "decorator", b: "@", e: "$"}]}} } (); hljs.LANGUAGES.bash = function () { var e = { "true": 1, "false": 1 }; var c = { cN: "variable", b: "\\$([a-zA-Z0-9_]+)\\b" }; var b = { cN: "variable", b: "\\$\\{(([^}])|(\\\\}))+\\}", c: [hljs.CNM] }; var a = { cN: "string", b: '"', e: '"', i: "\\n", c: [hljs.BE, c, b], r: 0 }; var d = { cN: "test_condition", b: "", e: "", c: [a, c, b, hljs.CNM], k: { literal: e }, r: 0 }; return { dM: { k: { keyword: { "if": 1, then: 1, "else": 1, fi: 1, "for": 1, "break": 1, "continue": 1, "while": 1, "in": 1, "do": 1, done: 1, echo: 1, exit: 1, "return": 1, set: 1, declare: 1 }, literal: e }, c: [{ cN: "shebang", b: "(#!\\/bin\\/bash)|(#!\\/bin\\/sh)", r: 10 }, hljs.HCM, hljs.CNM, a, c, b, hljs.inherit(d, { b: "\\[ ", e: " \\]", r: 0 }), hljs.inherit(d, { b: "\\[\\[ ", e: " \\]\\]" })]}} } (); hljs.LANGUAGES.xml = function () { var b = "[A-Za-z0-9\\._:-]+"; var a = { eW: true, c: [{ cN: "attribute", b: b, r: 0 }, { b: '="', rB: true, e: '"', c: [{ cN: "value", b: '"', eW: true}] }, { b: "='", rB: true, e: "'", c: [{ cN: "value", b: "'", eW: true}] }, { b: "=", c: [{ cN: "value", b: "[^\\s/>]+"}]}] }; return { cI: true, dM: { c: [{ cN: "pi", b: "<\\?", e: "\\?>", r: 10 }, { cN: "doctype", b: "<!DOCTYPE", e: ">", r: 10, c: [{ b: "\\[", e: "\\]"}] }, { cN: "comment", b: "<!--", e: "-->", r: 10 }, { cN: "cdata", b: "<\\!\\[CDATA\\[", e: "\\]\\]>", r: 10 }, { cN: "tag", b: "<style", e: ">", k: { title: { style: 1} }, c: [a], starts: { cN: "css", e: "</style>", rE: true, sL: "css"} }, { cN: "tag", b: "<script", e: ">", k: { title: { script: 1} }, c: [a], starts: { cN: "javascript", e: "<\/script>", rE: true, sL: "javascript"} }, { cN: "vbscript", b: "<%", e: "%>", sL: "vbscript" }, { cN: "tag", b: "</?", e: "/?>", c: [{ cN: "title", b: "[^ />]+" }, a]}]}} } (); hljs.LANGUAGES.perl = function () { var d = { getpwent: 1, getservent: 1, quotemeta: 1, msgrcv: 1, scalar: 1, kill: 1, dbmclose: 1, undef: 1, lc: 1, ma: 1, syswrite: 1, tr: 1, send: 1, umask: 1, sysopen: 1, shmwrite: 1, vec: 1, qx: 1, utime: 1, local: 1, oct: 1, semctl: 1, localtime: 1, readpipe: 1, "do": 1, "return": 1, format: 1, read: 1, sprintf: 1, dbmopen: 1, pop: 1, getpgrp: 1, not: 1, getpwnam: 1, rewinddir: 1, qq: 1, fileno: 1, qw: 1, endprotoent: 1, wait: 1, sethostent: 1, bless: 1, s: 1, opendir: 1, "continue": 1, each: 1, sleep: 1, endgrent: 1, shutdown: 1, dump: 1, chomp: 1, connect: 1, getsockname: 1, die: 1, socketpair: 1, close: 1, flock: 1, exists: 1, index: 1, shmget: 1, sub: 1, "for": 1, endpwent: 1, redo: 1, lstat: 1, msgctl: 1, setpgrp: 1, abs: 1, exit: 1, select: 1, print: 1, ref: 1, gethostbyaddr: 1, unshift: 1, fcntl: 1, syscall: 1, "goto": 1, getnetbyaddr: 1, join: 1, gmtime: 1, symlink: 1, semget: 1, splice: 1, x: 1, getpeername: 1, recv: 1, log: 1, setsockopt: 1, cos: 1, last: 1, reverse: 1, gethostbyname: 1, getgrnam: 1, study: 1, formline: 1, endhostent: 1, times: 1, chop: 1, length: 1, gethostent: 1, getnetent: 1, pack: 1, getprotoent: 1, getservbyname: 1, rand: 1, mkdir: 1, pos: 1, chmod: 1, y: 1, substr: 1, endnetent: 1, printf: 1, next: 1, open: 1, msgsnd: 1, readdir: 1, use: 1, unlink: 1, getsockopt: 1, getpriority: 1, rindex: 1, wantarray: 1, hex: 1, system: 1, getservbyport: 1, endservent: 1, "int": 1, chr: 1, untie: 1, rmdir: 1, prototype: 1, tell: 1, listen: 1, fork: 1, shmread: 1, ucfirst: 1, setprotoent: 1, "else": 1, sysseek: 1, link: 1, getgrgid: 1, shmctl: 1, waitpid: 1, unpack: 1, getnetbyname: 1, reset: 1, chdir: 1, grep: 1, split: 1, require: 1, caller: 1, lcfirst: 1, until: 1, warn: 1, "while": 1, values: 1, shift: 1, telldir: 1, getpwuid: 1, my: 1, getprotobynumber: 1, "delete": 1, and: 1, sort: 1, uc: 1, defined: 1, srand: 1, accept: 1, "package": 1, seekdir: 1, getprotobyname: 1, semop: 1, our: 1, rename: 1, seek: 1, "if": 1, q: 1, chroot: 1, sysread: 1, setpwent: 1, no: 1, crypt: 1, getc: 1, chown: 1, sqrt: 1, write: 1, setnetent: 1, setpriority: 1, foreach: 1, tie: 1, sin: 1, msgget: 1, map: 1, stat: 1, getlogin: 1, unless: 1, elsif: 1, truncate: 1, exec: 1, keys: 1, glob: 1, tied: 1, closedir: 1, ioctl: 1, socket: 1, readlink: 1, "eval": 1, xor: 1, readline: 1, binmode: 1, setservent: 1, eof: 1, ord: 1, bind: 1, alarm: 1, pipe: 1, atan2: 1, getgrent: 1, exp: 1, time: 1, push: 1, setgrent: 1, gt: 1, lt: 1, or: 1, ne: 1, m: 1 }; var e = { cN: "subst", b: "[$@]\\{", e: "}", k: d, r: 10 }; var c = { cN: "variable", b: "\\$\\d" }; var b = { cN: "variable", b: "[\\$\\%\\@\\*](\\^\\w\\b|#\\w+(\\:\\:\\w+)*|[^\\s\\w{]|{\\w+}|\\w+(\\:\\:\\w*)*)" }; var g = [hljs.BE, e, c, b]; var f = { b: "->", c: [{ b: hljs.IR }, { b: "{", e: "}"}] }; var a = [c, b, hljs.HCM, { cN: "comment", b: "^(__END__|__DATA__)", e: "\\n$", r: 5 }, f, { cN: "string", b: "q[qwxr]?\\s*\\(", e: "\\)", c: g, r: 5 }, { cN: "string", b: "q[qwxr]?\\s*\\[", e: "\\]", c: g, r: 5 }, { cN: "string", b: "q[qwxr]?\\s*\\{", e: "\\}", c: g, r: 5 }, { cN: "string", b: "q[qwxr]?\\s*\\|", e: "\\|", c: g, r: 5 }, { cN: "string", b: "q[qwxr]?\\s*\\<", e: "\\>", c: g, r: 5 }, { cN: "string", b: "qw\\s+q", e: "q", c: g, r: 5 }, { cN: "string", b: "'", e: "'", c: [hljs.BE], r: 0 }, { cN: "string", b: '"', e: '"', c: g, r: 0 }, { cN: "string", b: "`", e: "`", c: [hljs.BE] }, { cN: "string", b: "{\\w+}", r: 0 }, { cN: "string", b: "-?\\w+\\s*\\=\\>", r: 0 }, { cN: "number", b: "(\\b0[0-7_]+)|(\\b0x[0-9a-fA-F_]+)|(\\b[1-9][0-9_]*(\\.[0-9_]+)?)|[0_]\\b", r: 0 }, { cN: "regexp", b: "(s|tr|y)/(\\\\.|[^/])*/(\\\\.|[^/])*/[a-z]*", r: 10 }, { cN: "regexp", b: "(m|qr)?/", e: "/[a-z]*", c: [hljs.BE], r: 0 }, { cN: "sub", b: "\\bsub\\b", e: "(\\s*\\(.*?\\))?[;{]", k: { sub: 1 }, r: 5 }, { cN: "operator", b: "-\\w\\b", r: 0 }, { cN: "pod", b: "\\=\\w", e: "\\=cut"}]; e.c = a; f.c[1].c = a; return { dM: { k: d, c: a}} } (); hljs.LANGUAGES.css = function () { var a = { cN: "function", b: hljs.IR + "\\(", e: "\\)", c: [{ eW: true, eE: true, c: [hljs.NM, hljs.ASM, hljs.QSM]}] }; return { cI: true, dM: { i: "[=/|']", c: [hljs.CBLCLM, { cN: "id", b: "\\#[A-Za-z0-9_-]+" }, { cN: "class", b: "\\.[A-Za-z0-9_-]+", r: 0 }, { cN: "attr_selector", b: "\\[", e: "\\]", i: "$" }, { cN: "pseudo", b: ":(:)?[a-zA-Z0-9\\_\\-\\+\\(\\)\\\"\\']+" }, { cN: "at_rule", b: "@(font-face|page)", l: "[a-z-]+", k: { "font-face": 1, page: 1} }, { cN: "at_rule", b: "@", e: "[{;]", eE: true, k: { "import": 1, page: 1, media: 1, charset: 1 }, c: [a, hljs.ASM, hljs.QSM, hljs.NM] }, { cN: "tag", b: hljs.IR, r: 0 }, { cN: "rules", b: "{", e: "}", i: "[^\\s]", r: 0, c: [hljs.CBLCLM, { cN: "rule", b: "[^\\s]", rB: true, e: ";", eW: true, c: [{ cN: "attribute", b: "[A-Z\\_\\.\\-]+", e: ":", eE: true, i: "[^\\s]", starts: { cN: "value", eW: true, eE: true, c: [a, hljs.NM, hljs.QSM, hljs.ASM, hljs.CBLCLM, { cN: "hexcolor", b: "\\#[0-9A-F]+" }, { cN: "important", b: "!important"}]}}]}]}]}} } (); hljs.LANGUAGES.ruby = function () { var g = "[a-zA-Z_][a-zA-Z0-9_]*(\\!|\\?)?"; var a = "[a-zA-Z_]\\w*[!?=]?|[-+~]\\@|<<|>>|=~|===?|<=>|[<>]=?|\\*\\*|[-/+%^&*~`|]|\\[\\]=?"; var v = { keyword: { and: 1, "false": 1, then: 1, defined: 1, module: 1, "in": 1, "return": 1, redo: 1, "if": 1, BEGIN: 1, retry: 1, end: 1, "for": 1, "true": 1, self: 1, when: 1, next: 1, until: 1, "do": 1, begin: 1, unless: 1, END: 1, rescue: 1, nil: 1, "else": 1, "break": 1, undef: 1, not: 1, "super": 1, "class": 1, "case": 1, require: 1, yield: 1, alias: 1, "while": 1, ensure: 1, elsif: 1, or: 1, def: 1 }, keymethods: { __id__: 1, __send__: 1, abort: 1, abs: 1, "all?": 1, allocate: 1, ancestors: 1, "any?": 1, arity: 1, assoc: 1, at: 1, at_exit: 1, autoload: 1, "autoload?": 1, "between?": 1, binding: 1, binmode: 1, "block_given?": 1, call: 1, callcc: 1, caller: 1, capitalize: 1, "capitalize!": 1, casecmp: 1, "catch": 1, ceil: 1, center: 1, chomp: 1, "chomp!": 1, chop: 1, "chop!": 1, chr: 1, "class": 1, class_eval: 1, "class_variable_defined?": 1, class_variables: 1, clear: 1, clone: 1, close: 1, close_read: 1, close_write: 1, "closed?": 1, coerce: 1, collect: 1, "collect!": 1, compact: 1, "compact!": 1, concat: 1, "const_defined?": 1, const_get: 1, const_missing: 1, const_set: 1, constants: 1, count: 1, crypt: 1, "default": 1, default_proc: 1, "delete": 1, "delete!": 1, delete_at: 1, delete_if: 1, detect: 1, display: 1, div: 1, divmod: 1, downcase: 1, "downcase!": 1, downto: 1, dump: 1, dup: 1, each: 1, each_byte: 1, each_index: 1, each_key: 1, each_line: 1, each_pair: 1, each_value: 1, each_with_index: 1, "empty?": 1, entries: 1, eof: 1, "eof?": 1, "eql?": 1, "equal?": 1, "eval": 1, exec: 1, exit: 1, "exit!": 1, extend: 1, fail: 1, fcntl: 1, fetch: 1, fileno: 1, fill: 1, find: 1, find_all: 1, first: 1, flatten: 1, "flatten!": 1, floor: 1, flush: 1, for_fd: 1, foreach: 1, fork: 1, format: 1, freeze: 1, "frozen?": 1, fsync: 1, getc: 1, gets: 1, global_variables: 1, grep: 1, gsub: 1, "gsub!": 1, "has_key?": 1, "has_value?": 1, hash: 1, hex: 1, id: 1, include: 1, "include?": 1, included_modules: 1, index: 1, indexes: 1, indices: 1, induced_from: 1, inject: 1, insert: 1, inspect: 1, instance_eval: 1, instance_method: 1, instance_methods: 1, "instance_of?": 1, "instance_variable_defined?": 1, instance_variable_get: 1, instance_variable_set: 1, instance_variables: 1, "integer?": 1, intern: 1, invert: 1, ioctl: 1, "is_a?": 1, isatty: 1, "iterator?": 1, join: 1, "key?": 1, keys: 1, "kind_of?": 1, lambda: 1, last: 1, length: 1, lineno: 1, ljust: 1, load: 1, local_variables: 1, loop: 1, lstrip: 1, "lstrip!": 1, map: 1, "map!": 1, match: 1, max: 1, "member?": 1, merge: 1, "merge!": 1, method: 1, "method_defined?": 1, method_missing: 1, methods: 1, min: 1, module_eval: 1, modulo: 1, name: 1, nesting: 1, "new": 1, next: 1, "next!": 1, "nil?": 1, nitems: 1, "nonzero?": 1, object_id: 1, oct: 1, open: 1, pack: 1, partition: 1, pid: 1, pipe: 1, pop: 1, popen: 1, pos: 1, prec: 1, prec_f: 1, prec_i: 1, print: 1, printf: 1, private_class_method: 1, private_instance_methods: 1, "private_method_defined?": 1, private_methods: 1, proc: 1, protected_instance_methods: 1, "protected_method_defined?": 1, protected_methods: 1, public_class_method: 1, public_instance_methods: 1, "public_method_defined?": 1, public_methods: 1, push: 1, putc: 1, puts: 1, quo: 1, raise: 1, rand: 1, rassoc: 1, read: 1, read_nonblock: 1, readchar: 1, readline: 1, readlines: 1, readpartial: 1, rehash: 1, reject: 1, "reject!": 1, remainder: 1, reopen: 1, replace: 1, require: 1, "respond_to?": 1, reverse: 1, "reverse!": 1, reverse_each: 1, rewind: 1, rindex: 1, rjust: 1, round: 1, rstrip: 1, "rstrip!": 1, scan: 1, seek: 1, select: 1, send: 1, set_trace_func: 1, shift: 1, singleton_method_added: 1, singleton_methods: 1, size: 1, sleep: 1, slice: 1, "slice!": 1, sort: 1, "sort!": 1, sort_by: 1, split: 1, sprintf: 1, squeeze: 1, "squeeze!": 1, srand: 1, stat: 1, step: 1, store: 1, strip: 1, "strip!": 1, sub: 1, "sub!": 1, succ: 1, "succ!": 1, sum: 1, superclass: 1, swapcase: 1, "swapcase!": 1, sync: 1, syscall: 1, sysopen: 1, sysread: 1, sysseek: 1, system: 1, syswrite: 1, taint: 1, "tainted?": 1, tell: 1, test: 1, "throw": 1, times: 1, to_a: 1, to_ary: 1, to_f: 1, to_hash: 1, to_i: 1, to_int: 1, to_io: 1, to_proc: 1, to_s: 1, to_str: 1, to_sym: 1, tr: 1, "tr!": 1, tr_s: 1, "tr_s!": 1, trace_var: 1, transpose: 1, trap: 1, truncate: 1, "tty?": 1, type: 1, ungetc: 1, uniq: 1, "uniq!": 1, unpack: 1, unshift: 1, untaint: 1, untrace_var: 1, upcase: 1, "upcase!": 1, update: 1, upto: 1, "value?": 1, values: 1, values_at: 1, warn: 1, write: 1, write_nonblock: 1, "zero?": 1, zip: 1} }; var h = { cN: "yardoctag", b: "@[A-Za-z]+" }; var d = { cN: "comment", b: "#", e: "$", c: [h] }; var c = { cN: "comment", b: "^\\=begin", e: "^\\=end", c: [h], r: 10 }; var b = { cN: "comment", b: "^__END__", e: "\\n$" }; var t = { cN: "subst", b: "#\\{", e: "}", l: g, k: v }; var u = [hljs.BE, t]; var r = { cN: "string", b: "'", e: "'", c: u, r: 0 }; var q = { cN: "string", b: '"', e: '"', c: u, r: 0 }; var p = { cN: "string", b: "%[qw]?\\(", e: "\\)", c: u, r: 10 }; var o = { cN: "string", b: "%[qw]?\\[", e: "\\]", c: u, r: 10 }; var n = { cN: "string", b: "%[qw]?{", e: "}", c: u, r: 10 }; var m = { cN: "string", b: "%[qw]?<", e: ">", c: u, r: 10 }; var l = { cN: "string", b: "%[qw]?/", e: "/", c: u, r: 10 }; var k = { cN: "string", b: "%[qw]?%", e: "%", c: u, r: 10 }; var i = { cN: "string", b: "%[qw]?-", e: "-", c: u, r: 10 }; var s = { cN: "string", b: "%[qw]?\\|", e: "\\|", c: u, r: 10 }; var f = { cN: "function", b: "\\bdef\\s+", e: " |$|;", l: g, k: v, c: [{ cN: "title", b: a, l: g, k: v }, { cN: "params", b: "\\(", e: "\\)", l: g, k: v }, d, c, b] }; var e = { cN: "identifier", b: g, l: g, k: v, r: 0 }; var j = [d, c, b, r, q, p, o, n, m, l, k, i, s, { cN: "class", b: "\\b(class|module)\\b", e: "$|;", k: { "class": 1, module: 1 }, c: [{ cN: "title", b: "[A-Za-z_]\\w*(::\\w+)*(\\?|\\!)?", r: 0 }, { cN: "inheritance", b: "<\\s*", c: [{ cN: "parent", b: "(" + hljs.IR + "::)?" + hljs.IR}] }, d, c, b] }, f, { cN: "constant", b: "(::)?([A-Z]\\w*(::)?)+", r: 0 }, { cN: "symbol", b: ":", c: [r, q, p, o, n, m, l, k, i, s, e], r: 0 }, { cN: "number", b: "(\\b0[0-7_]+)|(\\b0x[0-9a-fA-F_]+)|(\\b[1-9][0-9_]*(\\.[0-9_]+)?)|[0_]\\b", r: 0 }, { cN: "number", b: "\\?\\w" }, { cN: "variable", b: "(\\$\\W)|((\\$|\\@\\@?)(\\w+))" }, e, { b: "(" + hljs.RSR + ")\\s*", c: [d, c, b, { cN: "regexp", b: "/", e: "/[a-z]*", i: "\\n", c: [hljs.BE]}], r: 0}]; t.c = j; f.c[1].c = j; return { dM: { l: g, k: v, c: j}} } (); hljs.LANGUAGES.javascript = { dM: { k: { keyword: { "in": 1, "if": 1, "for": 1, "while": 1, "finally": 1, "var": 1, "new": 1, "function": 1, "do": 1, "return": 1, "void": 1, "else": 1, "break": 1, "catch": 1, "instanceof": 1, "with": 1, "throw": 1, "case": 1, "default": 1, "try": 1, "this": 1, "switch": 1, "continue": 1, "typeof": 1, "delete": 1 }, literal: { "true": 1, "false": 1, "null": 1} }, c: [hljs.ASM, hljs.QSM, hljs.CLCM, hljs.CBLCLM, hljs.CNM, { b: "(" + hljs.RSR + "|case|return|throw)\\s*", k: { "return": 1, "throw": 1, "case": 1 }, c: [hljs.CLCM, hljs.CBLCLM, { cN: "regexp", b: "/", e: "/[gim]*", c: [{ b: "\\\\/"}]}], r: 0 }, { cN: "function", b: "\\bfunction\\b", e: "{", k: { "function": 1 }, c: [{ cN: "title", b: "[A-Za-z$_][0-9A-Za-z$_]*" }, { cN: "params", b: "\\(", e: "\\)", c: [hljs.ASM, hljs.QSM, hljs.CLCM, hljs.CBLCLM]}]}]} }; hljs.LANGUAGES.ini = { cI: true, dM: { i: "[^\\s]", c: [{ cN: "comment", b: ";", e: "$" }, { cN: "title", b: "^\\[", e: "\\]" }, { cN: "setting", b: "^[a-z0-9_\\[\\]]+[ \\t]*=[ \\t]*", e: "$", c: [{ cN: "value", eW: true, k: { on: 1, off: 1, "true": 1, "false": 1, yes: 1, no: 1 }, c: [hljs.QSM, hljs.NM]}]}]} }; hljs.LANGUAGES.php = { cI: true, dM: { k: { and: 1, include_once: 1, list: 1, "abstract": 1, global: 1, "private": 1, echo: 1, "interface": 1, as: 1, "static": 1, endswitch: 1, array: 1, "null": 1, "if": 1, endwhile: 1, or: 1, "const": 1, "for": 1, endforeach: 1, self: 1, "var": 1, "while": 1, isset: 1, "public": 1, "protected": 1, exit: 1, foreach: 1, "throw": 1, elseif: 1, "extends": 1, include: 1, __FILE__: 1, empty: 1, require_once: 1, "function": 1, "do": 1, xor: 1, "return": 1, "implements": 1, parent: 1, clone: 1, use: 1, __CLASS__: 1, __LINE__: 1, "else": 1, "break": 1, print: 1, "eval": 1, "new": 1, "catch": 1, __METHOD__: 1, "class": 1, "case": 1, exception: 1, php_user_filter: 1, "default": 1, die: 1, require: 1, __FUNCTION__: 1, enddeclare: 1, "final": 1, "try": 1, "this": 1, "switch": 1, "continue": 1, endfor: 1, endif: 1, declare: 1, unset: 1, "true": 1, "false": 1, namespace: 1 }, c: [hljs.CLCM, hljs.HCM, { cN: "comment", b: "/\\*", e: "\\*/", c: [{ cN: "phpdoc", b: "\\s@[A-Za-z]+", r: 10}] }, hljs.CNM, hljs.inherit(hljs.ASM, { i: null }), hljs.inherit(hljs.QSM, { i: null }), { cN: "variable", b: "\\$[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*" }, { cN: "preprocessor", b: "<\\?php", r: 10 }, { cN: "preprocessor", b: "\\?>"}]} }; hljs.LANGUAGES.cpp = function () { var b = { keyword: { "false": 1, "int": 1, "float": 1, "while": 1, "private": 1, "char": 1, "catch": 1, "export": 1, virtual: 1, operator: 2, sizeof: 2, dynamic_cast: 2, typedef: 2, const_cast: 2, "const": 1, struct: 1, "for": 1, static_cast: 2, union: 1, namespace: 1, unsigned: 1, "long": 1, "throw": 1, "volatile": 2, "static": 1, "protected": 1, bool: 1, template: 1, mutable: 1, "if": 1, "public": 1, friend: 2, "do": 1, "return": 1, "goto": 1, auto: 1, "void": 2, "enum": 1, "else": 1, "break": 1, "new": 1, extern: 1, using: 1, "true": 1, "class": 1, asm: 1, "case": 1, typeid: 1, "short": 1, reinterpret_cast: 2, "default": 1, "double": 1, register: 1, explicit: 1, signed: 1, typename: 1, "try": 1, "this": 1, "switch": 1, "continue": 1, wchar_t: 1, inline: 1, "delete": 1, alignof: 1, char16_t: 1, char32_t: 1, constexpr: 1, decltype: 1, noexcept: 1, nullptr: 1, static_assert: 1, thread_local: 1 }, built_in: { std: 1, string: 1, cin: 1, cout: 1, cerr: 1, clog: 1, stringstream: 1, istringstream: 1, ostringstream: 1, auto_ptr: 1, deque: 1, list: 1, queue: 1, stack: 1, vector: 1, map: 1, set: 1, bitset: 1, multiset: 1, multimap: 1, unordered_set: 1, unordered_map: 1, unordered_multiset: 1, unordered_multimap: 1, array: 1, shared_ptr: 1} }; var a = { cN: "stl_container", b: "\\b(deque|list|queue|stack|vector|map|set|bitset|multiset|multimap|unordered_map|unordered_set|unordered_multiset|unordered_multimap|array)\\s*<", e: ">", k: b, r: 10 }; a.c = [a]; return { dM: { k: b, i: "</", c: [hljs.CLCM, hljs.CBLCLM, hljs.QSM, { cN: "string", b: "'", e: "[^\\\\]'", i: "[^\\\\][^']" }, hljs.CNM, { cN: "preprocessor", b: "#", e: "$" }, a]}} } (); hljs.LANGUAGES.sql = { cI: true, dM: { i: "[^\\s]", c: [{ cN: "operator", b: "(begin|start|commit|rollback|savepoint|lock|alter|create|drop|rename|call|delete|do|handler|insert|load|replace|select|truncate|update|set|show|pragma)\\b", e: ";|$", k: { keyword: { all: 1, partial: 1, global: 1, month: 1, current_timestamp: 1, using: 1, go: 1, revoke: 1, smallint: 1, indicator: 1, "end-exec": 1, disconnect: 1, zone: 1, "with": 1, character: 1, assertion: 1, to: 1, add: 1, current_user: 1, usage: 1, input: 1, local: 1, alter: 1, match: 1, collate: 1, real: 1, then: 1, rollback: 1, get: 1, read: 1, timestamp: 1, session_user: 1, not: 1, integer: 1, bit: 1, unique: 1, day: 1, minute: 1, desc: 1, insert: 1, execute: 1, like: 1, ilike: 2, level: 1, decimal: 1, drop: 1, "continue": 1, isolation: 1, found: 1, where: 1, constraints: 1, domain: 1, right: 1, national: 1, some: 1, module: 1, transaction: 1, relative: 1, second: 1, connect: 1, escape: 1, close: 1, system_user: 1, "for": 1, deferred: 1, section: 1, cast: 1, current: 1, sqlstate: 1, allocate: 1, intersect: 1, deallocate: 1, numeric: 1, "public": 1, preserve: 1, full: 1, "goto": 1, initially: 1, asc: 1, no: 1, key: 1, output: 1, collation: 1, group: 1, by: 1, union: 1, session: 1, both: 1, last: 1, language: 1, constraint: 1, column: 1, of: 1, space: 1, foreign: 1, deferrable: 1, prior: 1, connection: 1, unknown: 1, action: 1, commit: 1, view: 1, or: 1, first: 1, into: 1, "float": 1, year: 1, primary: 1, cascaded: 1, except: 1, restrict: 1, set: 1, references: 1, names: 1, table: 1, outer: 1, open: 1, select: 1, size: 1, are: 1, rows: 1, from: 1, prepare: 1, distinct: 1, leading: 1, create: 1, only: 1, next: 1, inner: 1, authorization: 1, schema: 1, corresponding: 1, option: 1, declare: 1, precision: 1, immediate: 1, "else": 1, timezone_minute: 1, external: 1, varying: 1, translation: 1, "true": 1, "case": 1, exception: 1, join: 1, hour: 1, "default": 1, "double": 1, scroll: 1, value: 1, cursor: 1, descriptor: 1, values: 1, dec: 1, fetch: 1, procedure: 1, "delete": 1, and: 1, "false": 1, "int": 1, is: 1, describe: 1, "char": 1, as: 1, at: 1, "in": 1, varchar: 1, "null": 1, trailing: 1, any: 1, absolute: 1, current_time: 1, end: 1, grant: 1, privileges: 1, when: 1, cross: 1, check: 1, write: 1, current_date: 1, pad: 1, begin: 1, temporary: 1, exec: 1, time: 1, update: 1, catalog: 1, user: 1, sql: 1, date: 1, on: 1, identity: 1, timezone_hour: 1, natural: 1, whenever: 1, interval: 1, work: 1, order: 1, cascade: 1, diagnostics: 1, nchar: 1, having: 1, left: 1, call: 1, "do": 1, handler: 1, load: 1, replace: 1, truncate: 1, start: 1, lock: 1, show: 1, pragma: 1 }, aggregate: { count: 1, sum: 1, min: 1, max: 1, avg: 1} }, c: [{ cN: "string", b: "'", e: "'", c: [hljs.BE, { b: "''"}], r: 0 }, { cN: "string", b: '"', e: '"', c: [hljs.BE, { b: '""'}], r: 0 }, { cN: "string", b: "`", e: "`", c: [hljs.BE] }, hljs.CNM, { b: "\\n"}] }, hljs.CBLCLM, { cN: "comment", b: "--", e: "$"}]} }; hljs.LANGUAGES.diff = { cI: true, dM: { c: [{ cN: "chunk", b: "^\\@\\@ +\\-\\d+,\\d+ +\\+\\d+,\\d+ +\\@\\@$", r: 10 }, { cN: "chunk", b: "^\\*\\*\\* +\\d+,\\d+ +\\*\\*\\*\\*$", r: 10 }, { cN: "chunk", b: "^\\-\\-\\- +\\d+,\\d+ +\\-\\-\\-\\-$", r: 10 }, { cN: "header", b: "Index: ", e: "$" }, { cN: "header", b: "=====", e: "=====$" }, { cN: "header", b: "^\\-\\-\\-", e: "$" }, { cN: "header", b: "^\\*{3} ", e: "$" }, { cN: "header", b: "^\\+\\+\\+", e: "$" }, { cN: "header", b: "\\*{5}", e: "\\*{5}$" }, { cN: "addition", b: "^\\+", e: "$" }, { cN: "deletion", b: "^\\-", e: "$" }, { cN: "change", b: "^\\!", e: "$"}]} }; hljs.LANGUAGES.cs = { dM: { k: { "abstract": 1, as: 1, base: 1, bool: 1, "break": 1, "byte": 1, "case": 1, "catch": 1, "char": 1, checked: 1, "class": 1, "const": 1, "continue": 1, decimal: 1, "default": 1, delegate: 1, "do": 1, "do": 1, "double": 1, "else": 1, "enum": 1, event: 1, explicit: 1, extern: 1, "false": 1, "finally": 1, fixed: 1, "float": 1, "for": 1, foreach: 1, "goto": 1, "if": 1, implicit: 1, "in": 1, "int": 1, "interface": 1, internal: 1, is: 1, lock: 1, "long": 1, namespace: 1, "new": 1, "null": 1, object: 1, operator: 1, out: 1, override: 1, params: 1, "private": 1, "protected": 1, "public": 1, readonly: 1, ref: 1, "return": 1, sbyte: 1, sealed: 1, "short": 1, sizeof: 1, stackalloc: 1, "static": 1, string: 1, struct: 1, "switch": 1, "this": 1, "throw": 1, "true": 1, "try": 1, "typeof": 1, uint: 1, ulong: 1, unchecked: 1, unsafe: 1, ushort: 1, using: 1, virtual: 1, "volatile": 1, "void": 1, "while": 1, ascending: 1, descending: 1, from: 1, get: 1, group: 1, into: 1, join: 1, let: 1, orderby: 1, partial: 1, select: 1, set: 1, value: 1, "var": 1, where: 1, yield: 1 }, c: [{ cN: "comment", b: "///", e: "$", rB: true, c: [{ cN: "xmlDocTag", b: "///|<!--|-->" }, { cN: "xmlDocTag", b: "</?", e: ">"}] }, hljs.CLCM, hljs.CBLCLM, { cN: "string", b: '@"', e: '"', c: [{ b: '""'}] }, hljs.ASM, hljs.QSM, hljs.CNM]} };


(function () {

    window.markdownize = function() {
        $("div.markdown").each(function () {
            var converter = new Markdown.Converter().makeHtml;
            var instructions = $(this).html();//normalizeLineBreaks($(this).html());
            var withcode = convertCodeBlocks(instructions);
            var converted = converter(withcode);
            $(this).html(converted);
            $(this).show();
        });
    }

    function normalizeLineBreaks(str, lineEnd) {
        lineEnd = lineEnd || '\n';
        return str
                .replace(/\r\n/g, lineEnd) // DOS
                .replace(/\r/g, lineEnd) // Mac
                .replace(/\n/g, lineEnd); // Unix
    }

    function wrapCode(match, lang, code) {
        var hl;
        if (lang) {
            try {
                hl = hljs.highlight(lang, code).value;
            } catch (err) { }
        }
        hl = hl || hljs.highlightAuto(code).value;
        hl = hl.replace(/\n/, '');
        return '<pre><code>' + hl + '</code></pre>';
    }



    // Edited from Miller Medeiros's version to use a regex
    function convertCodeBlocks(mdown) {
        var re = /^```\s*(\w+)\s*$([\s\S]*?)^```$/gm;
        return mdown.replace(re, wrapCode);
    }
})();