<%@ Page Language="C#" MasterPageFile="~/Views/Shared/Site.Master" Inherits="System.Web.Mvc.ViewPage" %>

<asp:Content ID="loginTitle" ContentPlaceHolderID="TitleContent" runat="server">
    AuthBridge
</asp:Content>
<asp:Content ID="loginContent" ContentPlaceHolderID="MainContent" runat="server">
    <div id="selector">
        <form action="" method="get">
        <input type="hidden" name="action" value="verify" />
        <fieldset>
            <legend>Login with one of these identity providers</legend>
            <div>
                <div id="buttons">                
                        <a class="yahoo button"
                            href="authenticate?whr=urn:Yahoo" title="Yahoo"></a>                    
                        <a class="google button"
                            href="authenticate?whr=urn:Google" title="Google"></a>                    
                        <a class="liveid button"
                            href="authenticate?whr=urn:LiveId" title="Winodws Live"></a>                    
                        <a class="facebook button"
                            href="authenticate?whr=urn:Facebook" title="Facebook"></a>                     
                        <a class="twitter button"
                            href="authenticate?whr=urn:Twitter" title="Twitter"></a>    
                        <a class="button"
                            href="authenticate?whr=urn:IdentityServer" title="IdentityServer">Identity Server (WS-Fed + SAML)</a>    
                        <a class="button"
                            href="authenticate?whr=urn:office365:auth10preview" title="WindowsAzure AD">Windows Azure Active Directory (Office 365)</a>    
                                                
                                                        
                </div>
            </div>
            <noscript>
                <p>
                    OpenID is service that allows you to log-on to many different websites using a single
                    indentity. Find out <a href="http://openid.net/what/">more about OpenID</a> and
                    <a href="http://openid.net/get/">how to get an OpenID enabled account</a>.</p>
            </noscript>
        </fieldset>    
        <input type="hidden" value="<%=HttpContext.Current.Request.QueryString["ReturnUrl"] %>" />
        </form>
        <% if (Request.Url.Host == "localhost") { %>
        <div class="note">
        <strong>Note:</strong> You are running on localhost. Every identity provider (except Google and Yahoo) requires a fixed redirect/reply uri for security purposes. We preconfigured them using this url http://identity.bridge.com. Configure your host file by mapping 127.0.0.1 to identity.bridge.com.
        </div>
        <% } %>
   </div>
</asp:Content>
<asp:Content ID="pageSpecificScripts" ContentPlaceHolderID="PageSpecificScripts"
    runat="server">    

</asp:Content>
