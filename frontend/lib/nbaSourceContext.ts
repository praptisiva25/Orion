import type { NextBestActionEvidence, NextBestActionResponse } from "@/types/banking";

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_PREFIX = "orion:nba-source-context:v1:";

interface CachedNbaResponse {
  expiresAt: number;
  response: NextBestActionResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNbaResponse(value: unknown): value is NextBestActionResponse {
  if (!isRecord(value) || !Array.isArray(value.recommendations)) return false;
  if (
    !["knowledge_backed", "general_guidance"].includes(String(value.recommendation_mode)) ||
    typeof value.evidence_available !== "boolean" ||
    value.advisory_only !== true ||
    !(value.disclaimer === null || typeof value.disclaimer === "string")
  ) return false;

  return value.recommendations.every((recommendation) => {
    if (!isRecord(recommendation)) return false;
    if (
      typeof recommendation.title !== "string" ||
      typeof recommendation.rationale !== "string" ||
      !isStringArray(recommendation.evidence_supported_guidance) ||
      !isStringArray(recommendation.additional_suggestions) ||
      !isStringArray(recommendation.suggested_actions) ||
      !isStringArray(recommendation.missing_information) ||
      !isStringArray(recommendation.escalation_conditions) ||
      !(recommendation.priority === null || ["low", "normal", "high", "urgent"].includes(String(recommendation.priority))) ||
      recommendation.requires_officer_review !== true ||
      !Array.isArray(recommendation.evidence_references)
    ) return false;

    return recommendation.evidence_references.every((reference) =>
      isRecord(reference) &&
      typeof reference.evidence_id === "string" &&
      typeof reference.document_id === "string" &&
      typeof reference.title === "string" &&
      ["official_public", "illustrative_internal"].includes(String(reference.source_type)) &&
      typeof reference.source_label === "string" &&
      typeof reference.excerpt === "string" &&
      (reference.canonical_url == null || typeof reference.canonical_url === "string") &&
      (reference.page_number == null || typeof reference.page_number === "number") &&
      (reference.section_heading == null || typeof reference.section_heading === "string"),
    );
  });
}

export function uniqueEvidenceReferences(
  references: NextBestActionEvidence[],
): NextBestActionEvidence[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const signature = [
      reference.document_id,
      reference.source_type,
      reference.page_number ?? "",
      reference.section_heading ?? "",
      reference.excerpt.trim(),
    ].join("\u001f");
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function saveNbaSourceContext(
  ticketId: number,
  response: NextBestActionResponse,
): void {
  if (typeof window === "undefined") return;

  const value: CachedNbaResponse = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    response,
  };
  try {
    window.sessionStorage.setItem(
      `${CACHE_PREFIX}${ticketId}`,
      JSON.stringify(value),
    );
  } catch {
    // Source navigation will show a safe unavailable state if this tab cannot cache it.
  }
}

export function loadNbaSourceContext(
  ticketId: number,
): NextBestActionResponse | null {
  if (typeof window === "undefined") return null;

  try {
    const key = `${CACHE_PREFIX}${ticketId}`;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;

    const cached = JSON.parse(raw) as CachedNbaResponse;
    if (
      !isRecord(cached) ||
      typeof cached.expiresAt !== "number" ||
      !Number.isFinite(cached.expiresAt) ||
      cached.expiresAt <= Date.now() ||
      !isNbaResponse(cached.response)
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    return cached.response;
  } catch {
    return null;
  }
}
