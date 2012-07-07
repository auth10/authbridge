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

2. Create your own certificate. Instructions: https://gist.github.com/3066840

3. Edit the Web.Config `https://github.com/auth10/authbridge/blob/master/src/AuthBridge.Web/Web.config` 

  * Change the certificate file  [signingCertificateFile](https://github.com/auth10/authbridge/blob/master/src/AuthBridge.Web/Web.config#L64) (you can also use a certificate in the machine store)
  * Add an application as a new [scope] (https://github.com/auth10/authbridge/blob/master/src/AuthBridge.Web/Web.config#L94). Note: `identifier` needs to match the "realm" paremeter sent by the application and the uri is the endpoint where the token will be POSTed to.
  * You can decide to use or not the attribute rule transformation engine (`useClaimsPolicyEngine`) per application. If you do, the rule are stored in an XML file on `App_Data`
  
4. Create the application with Visual Studio or use the SampleRP that is part of the code and create a trust relationship with AuthBridge. FederationMetadata is available @ http://yourhostname/FederationMetadata/2007-06/FederationMetadata.xml

##FAQ

### How it compares with DotNetOpenAuth?

This project relies on DotNetOpenAuth OAuth and OpenID implementations and augment it to support WS-Federation protocol with SAML tokens generally used in Microsoft products like SharePoint, Windows Azure Active Directory, ASP.NET, etc. 

### How it compares with SocialAuth.NET?

It's similar to what you can achieve with the STS plugin of SocialAuth.NET

### How it compares with Windows Azure Active Directory (previously known as Windows Azure Access Control Service)?

### How it compares with Auth10?

### How it compares with JanRain Engage?

### How it compares with IdentityServer?

* Single sign on is not working properly with web applications hosted in localhost.
* The allowedClaimProviders configuration does not alter the behavior of the STS
* Exception handling can be enhanced with more detailed errors
* No performance/stress test has been done
* No threats and countermeasures analysis has been done

###License

MIT


