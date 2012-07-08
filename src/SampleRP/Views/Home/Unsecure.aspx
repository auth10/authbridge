﻿<%@ Page Title="" Language="C#" MasterPageFile="~/Views/Shared/Site.Master" Inherits="System.Web.Mvc.ViewPage" %>

<asp:Content ID="Content1" ContentPlaceHolderID="TitleContent" runat="server">
	AuthBridge MVC Sample
</asp:Content>

<asp:Content ID="Content2" ContentPlaceHolderID="MainContent" runat="server">

    <div class="markdown">

<% if (Request.IsAuthenticated)
   { %>
You are logged in and these are the claims generated by AuthBridge
```term<%=Environment.NewLine %>
<% foreach (Microsoft.IdentityModel.Claims.Claim c in ((Microsoft.IdentityModel.Claims.ClaimsIdentity)User.Identity).Claims) { %>
<%= c.ClaimType %> : <%= c.Value%>
<% } %>
```

You can <%= Html.ActionLink("logout", "LogOut", "Home")%>

---
<% } %>


#Sample 1

<a href="<%=Microsoft.IdentityModel.Web.FederatedAuthentication.WSFederationAuthenticationModule.Issuer%>?wa=wsignin1.0&wtrealm=http://sample-without-policyengine/">
Login with AuthBridge and present the identity provider selector
</a>

#Sample 2

<a href="<%=Microsoft.IdentityModel.Web.FederatedAuthentication.WSFederationAuthenticationModule.Issuer%>?wa=wsignin1.0&wtrealm=http://sample-without-policyengine/&whr=urn:Facebook">
Login with AuthBridge using Facebook
</a>

#Sample 3

<a href="<%=Microsoft.IdentityModel.Web.FederatedAuthentication.WSFederationAuthenticationModule.Issuer%>?wa=wsignin1.0&wtrealm=http://sample-with-policyengine/">
Login with AuthBridge and normalize user attributes
</a>


#Sample 4

<a href="<%=Microsoft.IdentityModel.Web.FederatedAuthentication.WSFederationAuthenticationModule.Issuer%>?wa=wsignin1.0&wtrealm=http://sample-with-policyengine/&wctx=ru=/home/myclaims">
Login with AuthBridge and send some context information
</a>

----

## Integrate with AuthBridge

AuthBridge understands the **WS-Federation** protocol which is used by many Microsoft applications (like SharePoint, CRM) and it's the built-in protocol used in Windows Identity Foundation.

### Login

This protocol is really simple. This is the url you have to redirect the user to: 

```term
https://{authbridge-url}?
wa=wsignin1.0                         -- signin verb. This is fixed.
wtrealm={your-application-identifier} -- logical identifier of your application. This is an arbitrary string with URI format that will have to be added to AuthBridge Web.Config as a scope.  
wctx={context-information}            -- [optional] contextual information that you want to keep around (e.g.: wctx=ru=/home/some-deep-link this would the original url the user was navigating to)
whr={identity-provider-identifier}    -- [optional] hint AuthBridge to use a specific identity provider (e.g.: whr=urn:Google)
```

For instance, the following link will send the user to login to AuthBridge specifying the identifier for this app (that was previously registered in AuthBridge)

<%=Microsoft.IdentityModel.Web.FederatedAuthentication.WSFederationAuthenticationModule.Issuer%>?wa=wsignin1.0&wtrealm=http://sample-with-policyengine/&wctx=ru=/home/myclaims

### Processing the response

Once the user logged in using one of the identity providers, AuthBridge will generate a token and will POST it to your application (through the client, not server to server). 
The default implementation uses SAML 2.0 Tokens. These tokens are cryptographically signed with a private key so that the application can verify that it was generated by someone they trust.
You need a library like Windows Identity Foundation to do that.

You can use the Windows Identity Foundation SDK which comes with a wizard or this NuGet package 

```
Install-Package Auth10.AspNet
```

If you use the NuGet, once it installed, make sure to replace all these values

* audienceUri = logical identifier of your application
* realm = logical identifier of your application
* thumbrpint = thumbprint of the certificate used to sign the token
* issuer = AuthBridge url

Here is an example for this same application:

```html
<microsoft.identityModel>
    <service>
        <audienceUris>
            <add value="http://sample-with-policyengine/" />
        </audienceUris>
        <federatedAuthentication>
            <wsFederation passiveRedirectEnabled="false" 
                                issuer="<%=Microsoft.IdentityModel.Web.FederatedAuthentication.WSFederationAuthenticationModule.Issuer%>" 
                                realm="http://sample-with-policyengine/" 
                                requireHttps="true" />
            <cookieHandler requireSsl="false" />
        </federatedAuthentication>
        <certificateValidation certificateValidationMode="None" />
        <issuerNameRegistry type="Microsoft.IdentityModel.Tokens.ConfigurationBasedIssuerNameRegistry, Microsoft.IdentityModel, Version=3.5.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35">
        <trustedIssuers>
            <add thumbprint="964ff0fb99cb81............a4b0466713483aada" name="AuthBridge" />
        </trustedIssuers>
        </issuerNameRegistry>
    </service>
</microsoft.identityModel>
```
</div>

    <script type="text/javascript">
        $(function () {
            window.markdownize();
        });
    </script>
</asp:Content>
