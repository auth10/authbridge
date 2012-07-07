namespace SampleRP.Controllers
{
    using System.Web.Mvc;
    using Microsoft.IdentityModel.Claims;
    using Microsoft.IdentityModel.Web;

    using SampleRP.Library;

    [HandleError]
    public class HomeController : Controller
    {
        [ValidateInput(false)]
        public ActionResult UnSecure()
        {
            return View();
        }

        [ValidateInput(false)]
        [AuthenticateAndAuthorize(Realm = "http://sample-with-policyengine/")]
        public ActionResult SecureWithPolicyEngine()
        {
            ViewData["Claims"] = ((IClaimsIdentity)User.Identity).Claims;

            return View("Secure");
        }

        [ValidateInput(false)]
        [AuthenticateAndAuthorize(Realm = "http://sample-without-policyengine/")]
        public ActionResult SecureWithoutPolicyEngine()
        {
            ViewData["Claims"] = ((IClaimsIdentity)User.Identity).Claims;

            return View("Secure");
        }


        [ValidateInput(false)]
        public ActionResult LogOut()
        {
            var authModule = FederatedAuthentication.WSFederationAuthenticationModule;
            authModule.SignOut(false);
            var logoutUrl = WSFederationAuthenticationModule.GetFederationPassiveSignOutUrl(authModule.Issuer, authModule.SignOutReply, authModule.SignOutQueryString);
            return new RedirectResult(logoutUrl);     
        }
    }
}
