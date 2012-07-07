namespace AuthBridge.Protocols.LiveId
{
    using System;
    using System.Collections.Generic;
    using System.Web;

    using Microsoft.IdentityModel.Claims;

    using AuthBridge.Model;

    using DotNetOpenAuth.AspNet.Clients;
    using System.Net;
    using System.IO;
    using DotNetOpenAuth.AspNet;

    public class LiveIdHandler : ProtocolHandlerBase
    {
        private readonly ClaimProvider issuer;
        private readonly string appId;
        private readonly string secretKey;

        public LiveIdHandler(ClaimProvider issuer) : base(issuer)
        {
            if (issuer == null)
                throw new ArgumentNullException("issuer");

            this.issuer = issuer;
            this.appId = this.issuer.Parameters["wll_appid"];
            this.secretKey = this.issuer.Parameters["wll_secret"];
        }

        public override void ProcessSignInRequest(Scope scope, HttpContextBase httpContext)
        {
            var client = new MicrosoftClient(this.appId, this.secretKey);
            client.RequestAuthentication(httpContext, this.MultiProtocolIssuer.ReplyUrl);
        }

        public override IClaimsIdentity ProcessSignInResponse(string realm, string originalUrl, HttpContextBase httpContext)
        {
            var client = new MicrosoftClient(this.appId, this.secretKey);
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
                claims.Add(new Claim("http://schemas.live.com/" + claim.Key, claim.Value));
            }
  
            return new ClaimsIdentity(claims, "LiveId");
        }      
    }
}