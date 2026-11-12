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
