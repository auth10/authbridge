<%@ Page Title="" Language="C#" MasterPageFile="~/Views/Shared/Site.Master" Inherits="System.Web.Mvc.ViewPage" %>
<%@ Import Namespace="SampleRP.Library" %>
<%@ Import Namespace="System.IdentityModel" %>
<%@ Import Namespace="Microsoft.IdentityModel.Claims" %>

<asp:Content ID="Content1" ContentPlaceHolderID="TitleContent" runat="server">
</asp:Content>

<asp:Content ID="Content2" ContentPlaceHolderID="MainContent" runat="server">

    <h2>some random page</h2>

    Request.IsAuthenticated = <%=Request.IsAuthenticated %>
</asp:Content>
