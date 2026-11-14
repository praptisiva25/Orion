using System.Text.Json.Serialization;

namespace BankingAPI.DTOs.AI;

public sealed class AiTicketContextRequestDto
{
    [JsonPropertyName("subject")]
    public string Subject { get; init; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("messages")]
    public List<AiConversationMessageDto> Messages { get; init; } = [];
}

public sealed class AiConversationMessageDto
{
    [JsonPropertyName("sender_role")]
    public string SenderRole { get; init; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; init; } = string.Empty;
}

public sealed class AiGeneratedTextResponseDto
{
    [JsonPropertyName("result")]
    public string Result { get; init; } = string.Empty;
}

public sealed class AiNextBestActionRequestDto
{
    [JsonPropertyName("ticket_id")]
    public int TicketId { get; init; }

    [JsonPropertyName("subject")]
    public string Subject { get; init; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; init; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; init; } = string.Empty;

    [JsonPropertyName("priority")]
    public string Priority { get; init; } = string.Empty;

    [JsonPropertyName("messages")]
    public List<AiCustomerMessageDto> Messages { get; init; } = [];

    [JsonPropertyName("latest_sentiment")]
    public AiLatestSentimentDto? LatestSentiment { get; init; }
}

public sealed class AiCustomerMessageDto
{
    [JsonPropertyName("sender_role")]
    public string SenderRole { get; init; } = "customer";

    [JsonPropertyName("message")]
    public string Message { get; init; } = string.Empty;
}

public sealed class AiLatestSentimentDto
{
    [JsonPropertyName("label")]
    public string Label { get; init; } = string.Empty;

    [JsonPropertyName("confidence")]
    public double Confidence { get; init; }
}

public sealed class AiNextBestActionResponseDto
{
    [JsonPropertyName("recommendation_mode")]
    public string RecommendationMode { get; init; } = string.Empty;

    [JsonPropertyName("evidence_available")]
    public bool EvidenceAvailable { get; init; }

    [JsonPropertyName("recommendations")]
    public List<AiNextBestActionRecommendationDto> Recommendations { get; init; } = [];

    [JsonPropertyName("disclaimer")]
    public string? Disclaimer { get; init; }

    [JsonPropertyName("advisory_only")]
    public bool AdvisoryOnly { get; init; }
}

public sealed class AiNextBestActionRecommendationDto
{
    [JsonPropertyName("title")]
    public string Title { get; init; } = string.Empty;

    [JsonPropertyName("rationale")]
    public string Rationale { get; init; } = string.Empty;

    [JsonPropertyName("evidence_supported_guidance")]
    public List<string> EvidenceSupportedGuidance { get; init; } = [];

    [JsonPropertyName("additional_suggestions")]
    public List<string> AdditionalSuggestions { get; init; } = [];

    [JsonPropertyName("suggested_actions")]
    public List<string> SuggestedActions { get; init; } = [];

    [JsonPropertyName("missing_information")]
    public List<string> MissingInformation { get; init; } = [];

    [JsonPropertyName("escalation_conditions")]
    public List<string> EscalationConditions { get; init; } = [];

    [JsonPropertyName("priority")]
    public string? Priority { get; init; }

    [JsonPropertyName("evidence_references")]
    public List<AiRecommendationEvidenceDto> EvidenceReferences { get; init; } = [];

    [JsonPropertyName("requires_officer_review")]
    public bool RequiresOfficerReview { get; init; }
}

public sealed class AiRecommendationEvidenceDto
{
    [JsonPropertyName("evidence_id")]
    public string EvidenceId { get; init; } = string.Empty;

    [JsonPropertyName("document_id")]
    public string DocumentId { get; init; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; init; } = string.Empty;

    [JsonPropertyName("source_type")]
    public string SourceType { get; init; } = string.Empty;

    [JsonPropertyName("source_label")]
    public string SourceLabel { get; init; } = string.Empty;

    [JsonPropertyName("canonical_url")]
    public string? CanonicalUrl { get; init; }

    [JsonPropertyName("page_number")]
    public int? PageNumber { get; init; }

    [JsonPropertyName("section_heading")]
    public string? SectionHeading { get; init; }

    [JsonPropertyName("excerpt")]
    public string Excerpt { get; init; } = string.Empty;

}
