using Xunit;

namespace BankingAPI.Tests;

[AttributeUsage(AttributeTargets.Method)]
public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ORION_TEST_POSTGRES")))
            Skip = "Set ORION_TEST_POSTGRES to an isolated localhost PostgreSQL database named orion_test* to run integration tests.";
    }
}
