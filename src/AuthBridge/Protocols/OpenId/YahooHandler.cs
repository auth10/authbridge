namespace AuthBridge.Protocols.OpenID
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

    public class YahooHandler : ProtocolHandlerBase
    {
        public YahooHandler(ClaimProvider issuer)
            : base(issuer)
        {
        }


        public override void ProcessSignInRequest(Scope scope, HttpContextBase httpContext)
        {
            var client = new YahooOpenIdClient();
            client.RequestAuthentication(httpContext, this.MultiProtocolIssuer.ReplyUrl);
        }

        public override IClaimsIdentity ProcessSignInResponse(string realm, string originalUrl, HttpContextBase httpContext)
        {
            var client = new YahooOpenIdClient();

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
                    new Claim(System.IdentityModel.Claims.ClaimTypes.NameIdentifier, result.ExtraData["email"])
                };

            foreach (var claim in result.ExtraData)
            {
                claims.Add(new Claim("http://schemas.yahoo.com/" + claim.Key, claim.Value));
            }

            return new ClaimsIdentity(claims, "Yahoo");            
        }
    }
}