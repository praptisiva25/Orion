namespace BankingAPI.Services.AI;

public sealed class AiServiceOptions
{
    public const string SectionName = "AiService";

    public string BaseUrl { get; set; } = "http://127.0.0.1:8001/";

    public string InternalServiceKey { get; set; } = string.Empty;

    public int TimeoutSeconds { get; set; } = 75;
}
