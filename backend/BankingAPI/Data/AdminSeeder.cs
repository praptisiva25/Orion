using BankingAPI.Models;
using Microsoft.AspNetCore.Identity;

namespace BankingAPI.Data;

public static class AdminSeeder
{
    public static async Task SeedAsync(
        UserManager<ApplicationUser> userManager,
        IConfiguration configuration)
    {
        var email = configuration["AdminSeed:Email"];
        var password = configuration["AdminSeed:Password"];

        if (string.IsNullOrWhiteSpace(email) ||
            string.IsNullOrWhiteSpace(password))
        {
            throw new InvalidOperationException(
                "Admin seed email or password is missing.");
        }

        var user = await userManager.FindByEmailAsync(email);

        if (user == null)
        {
            user = new ApplicationUser
            {
                FullName = "System Administrator",
                UserName = email,
                Email = email,
                EmailConfirmed = true,
                IsActive = true
            };

            var createResult = await userManager.CreateAsync(user, password);

            if (!createResult.Succeeded)
                throw new InvalidOperationException(
                    string.Join("; ", createResult.Errors.Select(e => e.Description)));
        }
        else
        {
            user.IsActive = true;
            user.EmailConfirmed = true;

            var updateResult = await userManager.UpdateAsync(user);

            if (!updateResult.Succeeded)
                throw new InvalidOperationException(
                    string.Join("; ", updateResult.Errors.Select(e => e.Description)));
        }

        if (!await userManager.IsInRoleAsync(user, "Admin"))
        {
            var roleResult = await userManager.AddToRoleAsync(user, "Admin");

            if (!roleResult.Succeeded)
                throw new InvalidOperationException(
                    string.Join("; ", roleResult.Errors.Select(e => e.Description)));
        }
    }
}
