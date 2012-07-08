namespace SampleRP.Controllers
{
    using System.Web.Mvc;
    using Microsoft.IdentityModel.Claims;
    using Microsoft.IdentityModel.Web;

    using SampleRP.Library;

    [HandleError]
    public class HomeController : Controller
    {
        public ActionResult UnSecure()
        {
            return View();
        }

        [AuthenticateAndAuthorize()]
        public ActionResult MyClaims()
        {
            ViewData["Claims"] = ((IClaimsIdentity)User.Identity).Claims;

            return View("Secure");
        }
        
        public ActionResult LogOut()
        {
            var authModule = FederatedAuthentication.WSFederationAuthenticationModule;
            authModule.SignOut(false);
            var logoutUrl = WSFederationAuthenticationModule.GetFederationPassiveSignOutUrl(authModule.Issuer, authModule.SignOutReply, authModule.SignOutQueryString);
            return new RedirectResult(logoutUrl);     
        }
    }
}
