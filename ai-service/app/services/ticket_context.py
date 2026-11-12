from __future__ import annotations

import json

from app.schemas.tickets import TicketContext
from app.services.redaction import redact_sensitive_text


def to_minimized_context(ticket: TicketContext) -> str:
    """Send only the ticket content needed for the task and redact common identifiers."""
    return json.dumps(
        {
            "subject": redact_sensitive_text(ticket.subject),
            "description": redact_sensitive_text(ticket.description),
            "conversation": [
                {
                    "sender": message.sender_role,
                    "text": redact_sensitive_text(message.message),
                }
                for message in ticket.messages
            ],
        },
        ensure_ascii=False,
    )
