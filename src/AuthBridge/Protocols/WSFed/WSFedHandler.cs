namespace AuthBridge.Protocols.WSFed
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
    using System.Text;
    using Microsoft.IdentityModel.Protocols.WSFederation;
    using Microsoft.IdentityModel.Web;
    using System.IdentityModel.Selectors;
using Microsoft.IdentityModel.Tokens;
    using System.IdentityModel.Tokens;

    public class WSFedHandler : ProtocolHandlerBase
    {
        private readonly string signingKeyThumbprint;

        public WSFedHandler(ClaimProvider issuer)
            : base(issuer)
        {
            this.signingKeyThumbprint = issuer.Parameters["signingKeyThumbprint"];
        }


        public override void ProcessSignInRequest(Scope scope, HttpContextBase httpContext)
        {
            RequestAuthentication(httpContext, this.Issuer.Url.ToString(), this.MultiProtocolIssuer.Identifier.ToString(), this.MultiProtocolIssuer.ReplyUrl.ToString());    
        }

        public override IClaimsIdentity ProcessSignInResponse(string realm, string originalUrl, HttpContextBase httpContext)
        {
            var token = FederatedAuthentication.WSFederationAuthenticationModule.GetSecurityToken(HttpContext.Current.Request);
            FederatedAuthentication.ServiceConfiguration.AudienceRestriction.AllowedAudienceUris.Add(this.MultiProtocolIssuer.Identifier);
            FederatedAuthentication.ServiceConfiguration.SecurityTokenHandlers.Configuration.CertificateValidator = X509CertificateValidator.None;
            FederatedAuthentication.ServiceConfiguration.SecurityTokenHandlers.Configuration.IssuerNameRegistry = new SimpleIssuerNameRegistry(this.signingKeyThumbprint);

            ClaimsIdentityCollection identities = FederatedAuthentication.ServiceConfiguration.SecurityTokenHandlers.ValidateToken(token);

            return identities[0];            
        }

        private void RequestAuthentication(HttpContextBase httpContext, string identityProviderUrl, string realm, string replyUrl)
        {
            var signIn = new SignInRequestMessage(new Uri(identityProviderUrl), realm)
            {
                Context = replyUrl,
                Reply = replyUrl
            };

            var redirectUrl = signIn.WriteQueryString();

            httpContext.Response.Redirect(redirectUrl, false);
            httpContext.ApplicationInstance.CompleteRequest();
        }

        private class SimpleIssuerNameRegistry : IssuerNameRegistry
        {
            private readonly string trustedThumbrpint;

            public SimpleIssuerNameRegistry(string trustedThumbprint)
            {
                this.trustedThumbrpint = trustedThumbprint;
            }

            public override string GetIssuerName(System.IdentityModel.Tokens.SecurityToken securityToken)
            {
                var x509 = securityToken as X509SecurityToken;
                if (x509 != null)
                {
                    if (x509.Certificate.Thumbprint.Equals(trustedThumbrpint, StringComparison.OrdinalIgnoreCase))
                    {
                        return x509.Certificate.Subject;
                    }
                }

                return null;
            }
        }
 
    }
}