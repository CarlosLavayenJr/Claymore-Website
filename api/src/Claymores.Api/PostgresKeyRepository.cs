using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Npgsql;

/// <summary>
/// Stores the ASP.NET Core data-protection key ring in Postgres so sign-in cookies and
/// Google sign-in state survive restarts and work across instances. Keys are stored as
/// plain XML: the database must stay private (Render's internal network or an SSL-only
/// managed Postgres).
/// </summary>
internal sealed class PostgresKeyRepository(NpgsqlDataSource dataSource) : IXmlRepository
{
    public IReadOnlyCollection<XElement> GetAllElements()
    {
        using var command = dataSource.CreateCommand(
            "SELECT xml FROM data_protection_keys ORDER BY created_at, friendly_name");
        using var reader = command.ExecuteReader();
        var elements = new List<XElement>();
        while (reader.Read())
            elements.Add(XElement.Parse(reader.GetString(0)));
        return elements;
    }

    public void StoreElement(XElement element, string friendlyName)
    {
        using var command = dataSource.CreateCommand("""
            INSERT INTO data_protection_keys (friendly_name, xml) VALUES (@name, @xml)
            ON CONFLICT (friendly_name) DO NOTHING
            """);
        command.Parameters.AddWithValue("name", friendlyName);
        command.Parameters.AddWithValue("xml", element.ToString(SaveOptions.DisableFormatting));
        command.ExecuteNonQuery();
    }
}
