using Microsoft.AspNetCore.Authentication;

/// <summary>
/// CSRF protection for writes. The browser session cookie is an ambient credential, so a
/// request it authenticates must come from this origin (<c>Sec-Fetch-Site: same-origin</c>).
/// Bearer tokens are never attached by the browser on its own, so requests authenticated
/// only by a bearer token (the app, or a server-side web client) pass.
/// </summary>
internal static class SameOriginGuard
{
    public static async Task<bool> IsAllowedAsync(HttpContext context)
    {
        if (context.Request.Headers["Sec-Fetch-Site"] == "same-origin")
            return true;
        // The cookie handler caches its result per request, so this doesn't validate it twice.
        var cookie = await context.AuthenticateAsync(GoogleSignIn.Session);
        return !cookie.Succeeded;
    }

    public static async ValueTask<object?> Filter(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        context.HttpContext.Response.Headers.CacheControl = "no-store";
        return await IsAllowedAsync(context.HttpContext)
            ? await next(context)
            : Results.StatusCode(StatusCodes.Status403Forbidden);
    }
}
