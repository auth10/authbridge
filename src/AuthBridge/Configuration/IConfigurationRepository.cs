namespace AuthBridge.Configuration
{
    using System;
    using AuthBridge.Model;

    public interface IConfigurationRepository
    {
        ClaimProvider RetrieveIssuer(Uri identifier);

        Scope RetrieveScope(Uri identifier);

        MultiProtocolIssuer RetrieveMultiProtocolIssuer();
    }
}
