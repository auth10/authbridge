namespace AuthBridge.Configuration
{
    using System.Configuration;

    public class SigningCertificateFileElement : ConfigurationElement
    {
        [ConfigurationProperty("pfxFilePath", IsRequired = true)]
        public string PfxFilePath
        {
            get { return (string)this["pfxFilePath"]; }
        }

        [ConfigurationProperty("password", IsRequired = true)]
        public string Password
        {
            get { return (string)this["password"]; }
        }
    }
}