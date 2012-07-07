namespace AuthBridge.Protocols
{
    using System;
    using System.Web;
    using Microsoft.IdentityModel.Claims;
    using AuthBridge.Model;

    public interface IProtocolHandler
    {
        void ProcessSignInRequest(Scope scope, HttpContextBase httpContext);

        IClaimsIdentity ProcessSignInResponse(string realm, string originalUrl, HttpContextBase httpContext);
    }
}