using BankingAPI.DTOs.Admin;
using BankingAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BankingAPI.Controllers;

[ApiController]
[Route("api/admin/sentiment-analytics")]
[Authorize(Roles = "Admin")]
public sealed class AdminSentimentAnalyticsController(AdminSentimentAnalyticsService analytics) : ControllerBase
{
    [HttpGet("distribution")]
    [ProducesResponseType<SentimentDistributionDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<SentimentDistributionDto>> GetDistribution(CancellationToken cancellationToken) =>
        Ok(await analytics.GetDistributionAsync(cancellationToken));

    [HttpGet("trends")]
    [ProducesResponseType<SentimentTrendsDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<SentimentTrendsDto>> GetTrends(
        [FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate,
        CancellationToken cancellationToken)
    {
        if (!AdminSentimentAnalyticsService.TryResolveRange(fromDate, toDate, out var range, out var error))
            return BadRequest(new { message = error });

        return Ok(await analytics.GetTrendsAsync(range, cancellationToken));
    }

    [HttpGet("tickets")]
    [ProducesResponseType<AdminTicketSentimentInsightsPageDto>(StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminTicketSentimentInsightsPageDto>> GetTicketInsights(
        [FromQuery] string? label,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken cancellationToken = default)
    {
        var result = await analytics.GetTicketInsightsAsync(label, page, pageSize, cancellationToken);
        return result is null
            ? BadRequest(new { message = "Page, pageSize, or sentiment label is invalid." })
            : Ok(result);
    }
}
