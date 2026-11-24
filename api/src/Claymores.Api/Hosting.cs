using Microsoft.AspNetCore.HttpOverrides;
using Npgsql;

/// <summary>Settings for running behind a hosting platform such as Render.</summary>
public static class Hosting
{
    /// <summary>
    /// Returns <c>ConnectionStrings:Claymores</c>, or converts a <c>DATABASE_URL</c> in
    /// <c>postgres://user:pass@host:port/db?sslmode=require</c> form, as Render and Neon provide it.
    /// </summary>
    public static string? ResolveConnectionString(IConfiguration configuration)
    {
        var configured = configuration.GetConnectionString("Claymores");
        if (!string.IsNullOrWhiteSpace(configured)) return configured;

        var url = configuration["DATABASE_URL"];
        return string.IsNullOrWhiteSpace(url) ? null : FromDatabaseUrl(url);
    }

    public static string FromDatabaseUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme is not ("postgres" or "postgresql"))
            throw new InvalidOperationException("DATABASE_URL must be a postgres:// or postgresql:// URL.");

        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort || uri.Port <= 0 ? 5432 : uri.Port,
            Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : null,
            SslMode = SslMode.Prefer,
        };

        foreach (var pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            if (parts.Length == 2 && parts[0].Equals("sslmode", StringComparison.OrdinalIgnoreCase) &&
                Enum.TryParse<SslMode>(parts[1].Replace("-", ""), ignoreCase: true, out var mode))
                builder.SslMode = mode;
        }

        if (string.IsNullOrEmpty(builder.Host) || string.IsNullOrEmpty(builder.Database) || string.IsNullOrEmpty(builder.Username))
            throw new InvalidOperationException("DATABASE_URL must include a user, host, and database name.");
        return builder.ConnectionString;
    }

    /// <summary>Listen on <c>PORT</c> when the platform sets it (Render does).</summary>
    public static void UsePlatformPort(WebApplicationBuilder builder)
    {
        if (int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var port) && port is > 0 and < 65536)
            builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
    }

    /// <summary>
    /// Trust X-Forwarded-For/Proto from the platform's TLS-terminating proxy, so the Google
    /// redirect URI uses https and the Secure session cookie is issued. Only enable this when
    /// the app is reachable solely through that proxy, as on Render.
    /// </summary>
    /// <remarks>
    /// The client IP: <c>ForwardLimit = 1</c> (the default, set explicitly here) makes the middleware
    /// read only the right-most <c>X-Forwarded-For</c> entry, the one the platform proxy appended for
    /// the connection it received. Entries further left came from the client and are ignored, so a
    /// client can't pick its own rate-limit partition by sending the header. Program.cs runs
    /// <c>UseForwardedHeaders</c> first, before <c>UseRateLimiter</c>, so the join-request limiter
    /// partitions on the forwarded address in <c>HttpContext.Connection.RemoteIpAddress</c>.
    /// The known proxy lists are cleared because the platform's proxy addresses aren't fixed; that is
    /// safe only while the app accepts no traffic except through the proxy.
    /// </remarks>
    public static bool ConfigureForwardedHeaders(WebApplicationBuilder builder)
    {
        var enabled = builder.Configuration.GetValue<bool?>("ForwardedHeaders:Enabled")
            ?? string.Equals(Environment.GetEnvironmentVariable("RENDER"), "true", StringComparison.OrdinalIgnoreCase);
        if (!enabled) return false;

        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.ForwardLimit = 1;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
        });
        return true;
    }
}
