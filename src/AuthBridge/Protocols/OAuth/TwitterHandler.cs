namespace AuthBridge.Protocols.OAuth
{
    using System;
    using System.Collections.Generic;
    using System.IO;
    using System.Net;
    using System.Web;
    using AuthBridge.Model;
    using DotNetOpenAuth.AspNet;
    using DotNetOpenAuth.AspNet.Clients;
    using Microsoft.IdentityModel.Claims;

    public class TwitterHandler : ProtocolHandlerBase
    {
        private readonly ClaimProvider issuer;
        private readonly string consumerKey;
        private readonly string consumerSecret;

        public TwitterHandler(ClaimProvider issuer)
            : base(issuer)
        {
            this.issuer = issuer;
            this.consumerKey = issuer.Parameters["consumer_key"];
            this.consumerSecret = issuer.Parameters["consumer_secret"];
        }

        public override void ProcessSignInRequest(Scope scope, HttpContextBase httpContext)
        {
            var client = new TwitterClient(this.consumerKey, this.consumerSecret);
            client.RequestAuthentication(httpContext, this.MultiProtocolIssuer.ReplyUrl);
        }

        public override IClaimsIdentity ProcessSignInResponse(string realm, string originalUrl, HttpContextBase httpContext)
        {
            var client = new TwitterClient(this.consumerKey, this.consumerSecret);

            AuthenticationResult result;
            try
            {
                result = client.VerifyAuthentication(httpContext);
            }
            catch (WebException wex)
            {
                throw new InvalidOperationException(new StreamReader(wex.Response.GetResponseStream()).ReadToEnd(), wex);
            }

            var claims = new List<Claim>
                {
                    new Claim(System.IdentityModel.Claims.ClaimTypes.NameIdentifier, result.ExtraData["name"])
                };

            foreach (var claim in result.ExtraData)
            {
                claims.Add(new Claim("http://schemas.twitter.com/" + claim.Key, claim.Value));
            }

            return new ClaimsIdentity(claims, "Twitter");
        }
    }
}
