namespace AuthBridge.Configuration
{
    using System;
    using System.Configuration;
    using AuthBridge.Model;
    using AuthBridge.Utilities;
    using System.Security.Cryptography.X509Certificates;
    using System.IO;

    public class DefaultConfigurationRepository : IConfigurationRepository
    {
        public ClaimProvider RetrieveIssuer(Uri identifier)
        {
            var configuration = ConfigurationManager.GetSection("authBridge/multiProtocolIssuer") as MultiProtocolIssuerSection;
            var claimProvider = configuration.ClaimProviders[identifier.ToString()];

            var issuer = claimProvider.ToModel();
            return issuer;
        }

        public MultiProtocolIssuer RetrieveMultiProtocolIssuer()
        {
            var configuration = ConfigurationManager.GetSection("authBridge/multiProtocolIssuer") as MultiProtocolIssuerSection;

            if (string.IsNullOrEmpty(configuration.SigningCertificate.FindValue) && string.IsNullOrEmpty(configuration.SigningCertificateFile.PfxFilePath))
                throw new ConfigurationErrorsException("Specify either a signing certificate in the machine store or point to a PFX in the file system");

            X509Certificate2 cert = null;
            if (!string.IsNullOrEmpty(configuration.SigningCertificate.FindValue))
            {
                cert = CertificateUtil.GetCertificate(
                        configuration.SigningCertificate.StoreName,
                        configuration.SigningCertificate.StoreLocation,
                        configuration.SigningCertificate.FindValue);
            }
            else
            {
                var certRawData = File.ReadAllBytes(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, configuration.SigningCertificateFile.PfxFilePath));
                cert = new X509Certificate2(certRawData, configuration.SigningCertificateFile.Password, X509KeyStorageFlags.PersistKeySet);
            }
            
            return new MultiProtocolIssuer
            {
                Identifier = new Uri(configuration.Identifier),
                ReplyUrl = new Uri(configuration.ResponseEndpoint),
                SigningCertificate = cert
            };
        }

        public Scope RetrieveScope(Uri identifier)
        {
            var configuration = ConfigurationManager.GetSection("authBridge/multiProtocolIssuer") as MultiProtocolIssuerSection;

            var scope = configuration.Scopes[identifier.ToString()];
            var model = scope.ToModel();

            return model;
        }
    }
}
