namespace AuthBridge.Web.Services
{
    using AuthBridge.Model;
    using AuthBridge.Protocols;

    public interface IProtocolDiscovery
    {
        IProtocolHandler RetrieveProtocolHandler(ClaimProvider issuer);
    }
}