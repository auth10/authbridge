namespace AuthBridge.Configuration
{
    using System.Configuration;

    public class AuthBridgeSectionGroup : ConfigurationSectionGroup
    {
        [ConfigurationProperty("multiProtocolIssuer", IsRequired = true)]
        public MultiProtocolIssuerSection MultiProtocolIssuer
        {
            get { return (MultiProtocolIssuerSection)this.Sections["multiProtocolIssuer"]; }
        }
    }
}
