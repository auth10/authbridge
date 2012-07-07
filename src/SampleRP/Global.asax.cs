namespace SampleRP
{
    using System.Web.Mvc;
    using System.Web.Routing;

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
        }
    }
}