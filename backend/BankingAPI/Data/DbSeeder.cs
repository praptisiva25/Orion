
using BankingAPI.Models;
using Microsoft.EntityFrameworkCore;

namespace BankingAPI.Data;

public static class DbSeeder
{
    public static async Task SeedAsync(ApplicationDbContext db)
    {
        // Backfill profiles for customers registered before profile creation
        // was added to the registration flow.
        var customerUserIds =
            from userRole in db.UserRoles
            join role in db.Roles on userRole.RoleId equals role.Id
            where role.Name == "Customer"
            select userRole.UserId;

        var existingProfileUserIds = db.CustomerProfiles
            .Select(profile => profile.UserId);

        var missingProfiles = await customerUserIds
            .Where(userId => !existingProfileUserIds.Contains(userId))
            .Select(userId => new CustomerProfile { UserId = userId })
            .ToListAsync();

        if (missingProfiles.Count > 0)
            db.CustomerProfiles.AddRange(missingProfiles);

        if (!await db.BankingProducts.AnyAsync())
        {
            var products = new List<BankingProduct>
            {
                new()
                {
                    Name = "Personal Loan",
                    Category = "Loan",
                    Description = "Flexible personal loans for planned and unexpected expenses.",
                    InterestRate = 10.5m,
                    MinimumAmount = 50000
                },
                new()
                {
                    Name = "Home Loan",
                    Category = "Loan",
                    Description = "Financing solutions for purchasing your dream home.",
                    InterestRate = 8.5m,
                    MinimumAmount = 500000
                },
                new()
                {
                    Name = "Savings Account",
                    Category = "Account",
                    Description = "A savings account with competitive interest rates.",
                    InterestRate = 3.5m,
                    MinimumAmount = 1000
                },
                new()
                {
                    Name = "Fixed Deposit",
                    Category = "Deposit",
                    Description = "Grow your savings with a fixed-term deposit.",
                    InterestRate = 7.0m,
                    MinimumAmount = 10000
                }
            };

            db.BankingProducts.AddRange(products);
        }

        await db.SaveChangesAsync();
    }
}
