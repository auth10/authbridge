namespace SampleRP
{
    using System.Web.Mvc;
    using System.Web.Routing;
    using Microsoft.IdentityModel.Web;
    using Microsoft.IdentityModel.Protocols.WSFederation;
    using System.Web;
    using System;

    public class MvcApplication : System.Web.HttpApplication
    {
        public static void RegisterRoutes(RouteCollection routes)
        {
            routes.IgnoreRoute("{resource}.axd/{*pathInfo}");

            routes.MapRoute("Logout", "logout", new { controller = "Home", action = "LogOut" });

            routes.MapRoute(
                "Fallback",
                "{controller}/{action}",
                new { controller = "Home", action = "UnSecure" });
        }

        protected void Application_Start()
        {
            RegisterRoutes(RouteTable.Routes);

            FederatedAuthentication.WSFederationAuthenticationModule.SignedIn += new System.EventHandler(WSFederationAuthenticationModule_SignedIn);
        }

        void WSFederationAuthenticationModule_SignedIn(object sender, System.EventArgs e)
        {
            WSFederationMessage wsFederationMessage = WSFederationMessage.CreateFromFormPost(HttpContext.Current.Request);
            if (wsFederationMessage.Context != null)
            {
                var wctx = HttpUtility.ParseQueryString(wsFederationMessage.Context);
                string returnUrl = wctx["ru"];

                // TODO: check for absolute url and throw to avoid open redirects
                HttpContext.Current.Response.Redirect(returnUrl, false);
                HttpContext.Current.ApplicationInstance.CompleteRequest();
            }
        }
    }
}