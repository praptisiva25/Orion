import Link from "next/link";
import type { NextBestActionResponse } from "@/types/banking";
import { uniqueEvidenceReferences } from "@/lib/nbaSourceContext";

const priorityClasses = {
  urgent: "bg-rose-50 text-rose-800 ring-rose-200",
  high: "bg-orange-50 text-orange-800 ring-orange-200",
  normal: "bg-slate-100 text-slate-700 ring-slate-200",
  low: "bg-sky-50 text-sky-800 ring-sky-200",
} as const;

export default function NextBestActionPanel({
  ticketId,
  result,
  loading,
  error,
  onRefresh,
  focusedRecommendationIndex,
}: {
  ticketId: number;
  result: NextBestActionResponse | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  focusedRecommendationIndex: number | null;
}) {
  const hasIllustrativeEvidence = result?.recommendations.some((item) =>
    item.evidence_references.some(
      (reference) => reference.source_type === "illustrative_internal",
    ),
  );

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-[#172C46]">Next Best Action</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              Officer review required
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">
            Advisory suggestions to support your review. No banking action or customer message is executed.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-[#345B4A] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#294A3B] disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Generating..." : result ? "Refresh recommendations" : error ? "Retry recommendations" : "Generate recommendations"}
        </button>
      </header>

      <div className="p-4 md:p-5">
        {loading && (
          <div className="space-y-3" role="status" aria-live="polite">
            <p className="text-sm text-slate-600">Reviewing the ticket and available approved knowledge...</p>
            <div className="h-20 animate-pulse rounded-lg bg-slate-200/70" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-rose-800" role="alert">{error}</p>
            <button onClick={onRefresh} className="shrink-0 text-left text-sm font-semibold text-rose-900 underline underline-offset-2">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && !result && (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600">
            Generate recommendations when you need additional guidance for this ticket.
          </p>
        )}

        {!loading && result && (
          <div className="space-y-4">
            {result.recommendation_mode === "general_guidance" ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950" role="note">
                {result.disclaimer}
              </p>
            ) : hasIllustrativeEvidence ? (
              <p className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs leading-5 text-slate-600" role="note">
                {"Illustrative Orion Demo Guidance \u2014 This fictional demonstration handbook is not actual bank policy, RBI guidance or a regulatory requirement."}
              </p>
            ) : (
              <p className="text-xs leading-5 text-slate-600" role="note">
                Evidence-backed suggestions are advisory. Review the cited sources before relying on them.
              </p>
            )}

            {result.recommendations.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-600">
                No recommendations are currently available for this ticket.
              </p>
            ) : result.recommendations.map((recommendation, index) => {
              const sources = uniqueEvidenceReferences(recommendation.evidence_references);
              const priority = recommendation.priority;
              return (
                <article
                  key={`${recommendation.title}-${index}`}
                  id={`nba-recommendation-${index}`}
                  className={`min-w-0 rounded-lg border bg-white p-4 ${focusedRecommendationIndex === index ? "ring-2 ring-[#6B8E80] ring-offset-2" : index === 0 ? "border-[#B8CCBF] shadow-sm" : "border-slate-200"}`}
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <h4 className="min-w-0 flex-1 break-words text-base font-semibold leading-6 text-[#172C46]">
                      {recommendation.title}
                    </h4>
                    {priority && (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${priorityClasses[priority]}`}>
                        {priority === "urgent" ? "Urgent" : priority === "high" ? "High" : priority === "low" ? "Low" : "Normal"}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 break-words text-sm leading-6 text-slate-700">{recommendation.rationale}</p>

                  {recommendation.suggested_actions.length > 0 && (
                    <div className="mt-4">
                      <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested next steps</h5>
                      <ol className="mt-2 space-y-2">
                        {recommendation.suggested_actions.map((action, actionIndex) => (
                          <li key={`${actionIndex}-${action}`} className="flex min-w-0 gap-2.5 text-sm leading-5 text-slate-700">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{actionIndex + 1}</span>
                            <span className="min-w-0 break-words">{action} <span className="text-xs text-slate-500">(review before acting)</span></span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {recommendation.additional_suggestions.length > 0 && (
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <h5 className="text-xs font-semibold text-slate-600">Additional suggestions</h5>
                      <ul className="mt-1.5 space-y-1 text-sm leading-5 text-slate-700">
                        {recommendation.additional_suggestions.map((suggestion, suggestionIndex) => (
                          <li key={`${suggestionIndex}-${suggestion}`} className="break-words">{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(recommendation.missing_information.length > 0 || recommendation.escalation_conditions.length > 0) && (
                    <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                      {recommendation.missing_information.length > 0 && (
                        <div className="min-w-0">
                          <h5 className="text-xs font-semibold text-slate-500">Information to clarify</h5>
                          <ul className="mt-1 space-y-1 text-xs leading-5 text-slate-600">
                            {recommendation.missing_information.map((item, itemIndex) => <li key={`${itemIndex}-${item}`} className="break-words">{item}</li>)}
                          </ul>
                        </div>
                      )}
                      {recommendation.escalation_conditions.length > 0 && (
                        <div className="min-w-0">
                          <h5 className="text-xs font-semibold text-slate-500">Consider escalation if</h5>
                          <ul className="mt-1 space-y-1 text-xs leading-5 text-slate-600">
                            {recommendation.escalation_conditions.map((item, itemIndex) => <li key={`${itemIndex}-${item}`} className="break-words">{item}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">
                      {recommendation.requires_officer_review ? "Officer review required before any action." : "Advisory suggestion."}
                    </p>
                    {sources.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500">Supporting sources available</span>
                        <Link
                          href={`/officer/tickets/${ticketId}/next-best-action/sources/${index}`}
                          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[#9FB7A8] px-3 py-1.5 text-xs font-semibold text-[#294A3B] transition hover:bg-[#F2F7F3] focus:outline-none focus:ring-2 focus:ring-[#6B8E80]"
                        >
                          View Sources ({sources.length})
                        </Link>
                      </div>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
