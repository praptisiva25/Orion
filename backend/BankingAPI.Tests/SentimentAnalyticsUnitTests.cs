using BankingAPI.Controllers;
using BankingAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Xunit;

namespace BankingAPI.Tests;

public sealed class SentimentAnalyticsUnitTests
{
    [Fact]
    public void DateRange_DefaultsToLastThirtyUtcDays()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        Assert.True(AdminSentimentAnalyticsService.TryResolveRange(null, null, out var range, out _));
        Assert.Equal(today.AddDays(-29), range.FromDate);
        Assert.Equal(today, range.ToDate);
        Assert.Equal(TimeSpan.FromDays(30), range.EndExclusiveUtc - range.StartUtc);
    }

    [Fact]
    public void DateRange_RejectsReversedFutureAndExcessiveRanges()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        Assert.False(AdminSentimentAnalyticsService.TryResolveRange(today, today.AddDays(-1), out _, out _));
        Assert.False(AdminSentimentAnalyticsService.TryResolveRange(null, today.AddDays(1), out _, out _));
        Assert.False(AdminSentimentAnalyticsService.TryResolveRange(today.AddDays(-366), today, out _, out _));
    }

    [Fact]
    public void AnalyticsController_RequiresAdminRole()
    {
        var authorization = typeof(AdminSentimentAnalyticsController)
            .GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true)
            .Cast<AuthorizeAttribute>()
            .Single();

        Assert.Equal("Admin", authorization.Roles);
    }
}
