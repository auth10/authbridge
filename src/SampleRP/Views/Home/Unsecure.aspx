<%@ Page Title="" Language="C#" MasterPageFile="~/Views/Shared/Site.Master" Inherits="System.Web.Mvc.ViewPage" %>

<asp:Content ID="Content1" ContentPlaceHolderID="TitleContent" runat="server">
	AuthBridge MVC Sample
</asp:Content>

<asp:Content ID="Content2" ContentPlaceHolderID="MainContent" runat="server">

    <h2>Welcome to AuthBridge MVC Sample</h2>
    <p>In this sample you can trigger the login process by tryig to access a secure page which will redirect to the AuthBridge. <br />
    The AuthBridge will present the identity provider and after login on one of those, it will come back to the AuthBridge and it will transform that to WS-Federation and SAML tokens</p>
    <%= Html.ActionLink("Login ", "SecureWithoutPolicyEngine", "Home")%>
    <br />
    <br />
    <h3>Advanced</h3>
    <%= Html.ActionLink("Login and normalize attributes from different identity providers", "SecureWithPolicyEngine", "Home")%>
    
</asp:Content>
