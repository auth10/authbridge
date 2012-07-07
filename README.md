#AuthBridge

An implementation of a bridge written in ASP.NET/C# using [WIF](http://msdn.microsoft.com/en-us/security/aa570351.aspx) and [DotNetOpenAuth](http://www.dotnetopenauth.net), that talks WS-Federation and SAML tokens on one side and OpenID, OAuth, WS-Federation or any other protocol on the identity provider.

![](http://puu.sh/GzU1)

##Features

* Support Social Identity Providers: for Facebook (OAuth 2), Google (OpenID), Yahoo (OpenID), Twitter (OAuth 1.0a), Windows Live (OAuth 2). More can be added easily.
* Support for Enterprise Identity Providers like ADFS or IdentityServer using WS-Federation Protocol and SAML 1.1 or 2.0 Tokens. SAML 2.0 *protocol* could be added easily using the WIF SAML Extensions
* Support for Single Sign On
* Extensibility points to add more protocols
* Attribute transformation rule engine to normalize attributes coming from different identity providers

##Getting Started

1. Download the code
```
git clone https://github.com/auth10/authbridge.git
```
2. Create a site pointing to `AuthBridge.Web` in IIS and assign it a host header like `identity.bridge.com` (otherwise the social identity providers won't work). If it's production use SSL.

3. Create your own certificate. Instructions: https://gist.github.com/3066840

4. Edit the [Web.Config] (https://github.com/auth10/authbridge/blob/master/src/AuthBridge.Web/Web.config) 
  * Change the certificate file  [signingCertificateFile](https://github.com/auth10/authbridge/blob/master/src/AuthBridge.Web/Web.config#L64) (you can also use a certificate in the machine store)
  * Change the [app ids and secrets](https://github.com/auth10/authbridge/blob/master/src/AuthBridge.Web/Web.config#L65) for the identity providers 
  * Add an application as a new [scope](https://github.com/auth10/authbridge/blob/master/src/AuthBridge.Web/Web.config#L93). Note: `identifier` needs to match the "realm" paremeter sent by the application and the uri is the endpoint where the token will be POSTed to.
  * You can decide to use or not the attribute rule transformation engine (`useClaimsPolicyEngine`) per application. If you do, the rule are stored in an XML file on `App_Data`  
5. Create an ASP.NET application with Visual Studio or use the SampleRP that is part of the code and create a trust relationship with AuthBridge. FederationMetadata is available @ http://yourhostname/FederationMetadata/2007-06/FederationMetadata.xml

##FAQ

### How it compares with [DotNetOpenAuth](http://www.dotnetopenauth.net)?

[DotNetOpenAuth](http://www.dotnetopenauth.net) is a library that simplifies writing OAuth and OpenID clients and servers. AuthBridge builds on top of it and adds support for WS-Federation protocol with SAML tokens which is generally used across Microsoft products like SharePoint, Windows Azure Active Directory, ASP.NET, etc. AuthBridge is a library and a server at the same time that will run on its own host to act as a federation hub between your applications and identity providers.

### How it compares with [SocialAuth.NET](http://code.google.com/p/socialauth-net/)?

[SocialAuth.NET](http://code.google.com/p/socialauth-net/) is a library that focuses on social integration using OAuth. It is similar to DotNetOpenAuth but it born as a port of its Java counterpart. They also have a separate STS project that speaks WS-Federation to be able to integrate SocialAuth with SharePoint. In that sense, AuthBridge is similar to SocialAuth, except that AuthBridge supports more protocols on the identity provider side (so that you can integrate with enterprise identity providers like ADFS, SiteMinder, Ping, etc.)

### How it compares with [Windows Azure Active Directory](https://www.windowsazure.com/en-us/home/features/identity/) (previously known as Windows Azure Access Control Service)?

[Windows Azure Active Directory](https://www.windowsazure.com/en-us/home/features/identity/) (WAAD) is a cloud service run by Microsoft. In essence it's similar to what AuthBridge provides (it's a federation provider that sits between your apps and identity providers), however WAAD is a cloud service and that means that it has been thoroughly tested in terms of performance, security and scalability. AuthBridge has not gone through all that (yet). WAAD is being used extensively by millions of customers (Office365 and Windows Azure). If you are looking for a production ready service, then WAAD would be the right choice. 

Also in the future WAAD will also provide a "Graph" API and syncronization capabilities with the on-premise AD. If you want to know more about it read ["What is Windows Azure Active Directory"](http://blog.auth10.com/2012/06/13/what-is-windows-azure-active-directory/) and ["Reimagining Active Directory for the Social Enterprise Part I"](http://blogs.msdn.com/b/windowsazure/archive/2012/05/23/reimagining-active-directory-for-the-social-enterprise-part-1.aspx) and ["Reimagining Active Directory for the Social Enterprise Part II"] (http://blogs.msdn.com/b/windowsazure/archive/2012/06/19/reimagining-active-directory-for-the-social-enterprise-part-2.aspx). 

### How it compares with [Auth10](http://auth10.com)?

[Auth10](http://auth10.com) is a tool that aims to simplify and ease the adoption of federated claims based identity by providing recipes for most common scenarios (cloud, mobile, different platforms and languages, different identity providers, etc.). It is the dashboard for the federation provider. It currently runs on top of Windows Azure Active Directory but it might run on top of other "Fedeation Providers" like ADFS or even AuthBridge if it gets a critical mass.

### How it compares with JanRain Engage?

[JanRain](http://janrain.com/) provides a third party solution for handling Social Login, Social Sharing, Social Analytics and more with their Janrain Engage product. They will act as a hub between your apps and the social identity providers. It's similar in that sense to SocialAuth.NET and DotNetOpenAuth but it's a cloud service with all that means. AuthBridge is a library and a server that will provide some of the featuress of Janrain Engage (mostly on providing attributes for the user coming from the social identity providers) but Janrain implements a propietary protocol to get those into your app (it's a simple protocol based on HTTP). AuthBridge relies on WS-Federation, hence it is ideal to integrate with Microsoft-related stuff. 

### How it compares with IdentityServer?

[IdentityServer](http://identityserver.codeplex.com/) is an identity provider that supports Membership provider databases and various protocols to get tokes out of it. It's complimentary to AuthBridge. If IdentityServer is the open source Identity Provider, AuthBridge is the open source Federation Provider. AuthBridge can be configured to trust IdentityServer as well as ADFS.

## Known Issues

* Single sign on is not working properly with web applications hosted in localhost.
* The allowedClaimProviders configuration does not alter the behavior of the STS
* Exception handling can be enhanced with more detailed errors
* No performance/stress test has been done
* No threats and countermeasures analysis has been done

## Credits

Some of the code was extracted from a proof of concept we did couple of years ago with Microsoft together with some Southworks devs like @jpgd, @anero79

## License

MIT

