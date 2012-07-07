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

    public class FacebookHandler : ProtocolHandlerBase
    {
        private readonly ClaimProvider issuer;

        private readonly string applicationId;

        private readonly string apiUrl;

        private readonly string secret;

        public FacebookHandler(ClaimProvider issuer)
            : base(issuer)
        {
            this.issuer = issuer;
            this.applicationId = issuer.Parameters["application_id"];
            this.apiUrl = issuer.Parameters["api_url"];
            this.secret = issuer.Parameters["secret"];
        }

        public override void ProcessSignInRequest(Scope scope, HttpContextBase httpContext)
        {
            var facebook = new FacebookClient(this.applicationId, this.secret);
            facebook.RequestAuthentication(httpContext, this.MultiProtocolIssuer.ReplyUrl);
        }

        public override IClaimsIdentity ProcessSignInResponse(string realm, string originalUrl, HttpContextBase httpContext)
        {
            var client = new FacebookClient(this.applicationId, this.secret);
            
            AuthenticationResult result;
            try
            {
                result = client.VerifyAuthentication(httpContext, this.MultiProtocolIssuer.ReplyUrl);
            }
            catch (WebException wex)
            {
                throw new InvalidOperationException(new StreamReader(wex.Response.GetResponseStream()).ReadToEnd(), wex);
            }

            var claims = new List<Claim>
                {
                    new Claim(System.IdentityModel.Claims.ClaimTypes.NameIdentifier, result.ExtraData["id"])
                };

            foreach (var claim in result.ExtraData)
            {
                claims.Add(new Claim("http://schemas.facebook.com/me/" + claim.Key, claim.Value));
            }

            return new ClaimsIdentity(claims, "Facebook");
        }
    }
}
