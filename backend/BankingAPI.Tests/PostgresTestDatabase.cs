using BankingAPI.Data;
using BankingAPI.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace BankingAPI.Tests;

internal sealed class PostgresTestDatabase : IAsyncDisposable
{
    private readonly string _adminConnectionString;

    private PostgresTestDatabase(string adminConnectionString, string schema, string connectionString)
    {
        _adminConnectionString = adminConnectionString;
        Schema = schema;
        ConnectionString = connectionString;
        Options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(connectionString)
            .Options;
    }

    public string Schema { get; }
    public string ConnectionString { get; }
    public DbContextOptions<ApplicationDbContext> Options { get; }

    public ApplicationDbContext CreateContext() => new(Options);

    public static async Task<PostgresTestDatabase?> TryCreateAsync()
    {
        var rawConnectionString = Environment.GetEnvironmentVariable("ORION_TEST_POSTGRES");
        if (string.IsNullOrWhiteSpace(rawConnectionString))
            return null;

        var admin = new NpgsqlConnectionStringBuilder(rawConnectionString);
        if (admin.Host is not ("localhost" or "127.0.0.1" or "::1") ||
            string.IsNullOrWhiteSpace(admin.Database) ||
            !admin.Database.StartsWith("orion_test", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "ORION_TEST_POSTGRES must target localhost and a database whose name starts with 'orion_test'.");
        }

        var schema = $"orion_batch3_test_{Guid.NewGuid():N}";
        admin.SearchPath = "public";
        admin.Pooling = false;
        var scoped = new NpgsqlConnectionStringBuilder(admin.ConnectionString)
        {
            SearchPath = schema,
            Pooling = false
        };
        var fixture = new PostgresTestDatabase(admin.ConnectionString, schema, scoped.ConnectionString);

        await using (var connection = new NpgsqlConnection(admin.ConnectionString))
        {
            await connection.OpenAsync();
            await using var command = connection.CreateCommand();
            command.CommandText = $"CREATE SCHEMA \"{schema}\"";
            await command.ExecuteNonQueryAsync();
        }

        try
        {
            await using var db = fixture.CreateContext();
            await db.Database.EnsureCreatedAsync(); // Creates only this random test schema; never applies migrations.
            return fixture;
        }
        catch
        {
            await fixture.DisposeAsync();
            throw;
        }
    }

    public static async Task<PostgresTestDatabase> CreateRequiredAsync() =>
        await TryCreateAsync() ?? throw new InvalidOperationException("PostgreSQL test database is not configured.");

    public async Task<int> CreateCustomerAsync()
    {
        await using var db = CreateContext();
        var email = $"customer-{Guid.NewGuid():N}@example.test";
        var user = new ApplicationUser
        {
            UserName = email,
            NormalizedUserName = email.ToUpperInvariant(),
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            FullName = "Synthetic Integration Customer",
            IsActive = true
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    public async Task<SupportTicket> CreateTicketAsync(int customerId, long sequence = 0)
    {
        await using var db = CreateContext();
        var ticket = new SupportTicket
        {
            UserId = customerId,
            Subject = "Synthetic ticket",
            Description = "Synthetic ticket description for integration coverage.",
            SentimentEventSequence = sequence
        };
        db.SupportTickets.Add(ticket);
        await db.SaveChangesAsync();
        return ticket;
    }

    public async ValueTask DisposeAsync()
    {
        await using var connection = new NpgsqlConnection(_adminConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"DROP SCHEMA IF EXISTS \"{Schema}\" CASCADE";
        await command.ExecuteNonQueryAsync();
    }
}
