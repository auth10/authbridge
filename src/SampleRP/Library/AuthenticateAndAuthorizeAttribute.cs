namespace SampleRP.Library
{
    using System;
    using System.Globalization;
    using System.Text;
    using System.Web.Mvc;
    using System.Web.Routing;
    using Microsoft.IdentityModel.Protocols.WSFederation;
    using Microsoft.IdentityModel.Web;

    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
    public sealed class AuthenticateAndAuthorizeAttribute : FilterAttribute, IAuthorizationFilter
    {
        public string Roles { get; set; }

        public string Realm { get; set; }

        public void OnAuthorization(AuthorizationContext filterContext)
        {
            if (!filterContext.HttpContext.User.Identity.IsAuthenticated)
            {
                AuthenticateUser(filterContext, this.Realm);
            }
        }

        private static void AuthenticateUser(AuthorizationContext context, string realm)
        {
            // user is not authenticated and it's entering for the first time
            var fam = FederatedAuthentication.WSFederationAuthenticationModule;
            var signIn = new SignInRequestMessage(new Uri(fam.Issuer), realm ?? fam.Realm)
            {
                Context = "ru=" + context.HttpContext.Request.Path
            };

            context.Result = new RedirectResult(signIn.WriteQueryString());
        }
    }
}