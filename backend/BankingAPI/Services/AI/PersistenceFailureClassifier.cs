using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace BankingAPI.Services.AI;

public static class PersistenceFailureClassifier
{
    public static bool IsTransient(DbUpdateException exception)
    {
        for (Exception? current = exception; current is not null; current = current.InnerException)
        {
            if (current is PostgresException postgresException)
            {
                if (postgresException.IsTransient || postgresException.SqlState is "40001" or "40P01" or "55P03")
                    return true;

                // Integrity violations and other server-side data errors need intervention, not retries.
                return false;
            }

            if (current is NpgsqlException npgsqlException)
                return npgsqlException.IsTransient;
        }

        // Unknown EF persistence failures are not retried to avoid looping on invalid data/schema.
        return false;
    }
}
