"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import OfficerShell from "@/components/officer/OfficerShell";
import { bankingApi } from "@/lib/api";
import { loadNbaSourceContext, uniqueEvidenceReferences } from "@/lib/nbaSourceContext";
import type { NextBestActionRecommendation, SupportTicket } from "@/types/banking";

function NbaSourcesContent() {
  const params = useParams<{ ticketId: string; recommendationIndex: string }>();
  const ticketId = Number(params.ticketId);
  const recommendationIndex = Number(params.recommendationIndex);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [recommendation, setRecommendation] = useState<NextBestActionRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSourceContext() {
      if (!Number.isSafeInteger(ticketId) || ticketId < 1 || !Number.isSafeInteger(recommendationIndex) || recommendationIndex < 0) {
        setUnavailable(true);
        setLoading(false);
        return;
      }

      try {
        // This existing endpoint enforces Officer role and ticket assignment.
        const assignedTicket = await bankingApi.getOfficerTicket(ticketId);
        if (!active || assignedTicket.id !== ticketId) return;

        const response = loadNbaSourceContext(ticketId);
        const selectedRecommendation = response?.recommendations[recommendationIndex];
        const sources = selectedRecommendation
          ? uniqueEvidenceReferences(selectedRecommendation.evidence_references)
          : [];

        if (!selectedRecommendation || sources.length === 0) {
          setTicket(assignedTicket);
          setUnavailable(true);
          return;
        }

        setTicket(assignedTicket);
        setRecommendation({
          ...selectedRecommendation,
          evidence_references: sources,
        });
      } catch {
        if (active) setUnavailable(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSourceContext();
    return () => { active = false; };
  }, [ticketId, recommendationIndex]);

  const sources = useMemo(
    () => recommendation ? uniqueEvidenceReferences(recommendation.evidence_references) : [],
    [recommendation],
  );
  const recommendationHref = `/officer/tickets?ticketId=${ticketId}&showNba=1&recommendationIndex=${recommendationIndex}`;

  return (
    <OfficerShell
      title="Supporting Sources"
      subtitle="Review the retrieved passages associated with this advisory recommendation."
    >
      <div className="mx-auto max-w-4xl">
        <Link
          href={recommendationHref}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-[#294A3B] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#6B8E80]"
        >
          Back to Recommendation
        </Link>

        {loading ? (
          <section className="mt-6 space-y-4" role="status" aria-live="polite">
            <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
            <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
          </section>
        ) : unavailable ? (
          <section className="mt-6 rounded-xl border border-amber-200 bg-white p-5" role="alert">
            <p className="text-sm font-semibold text-[#172C46]">Source details are unavailable</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              This source context may have expired, or this ticket is not assigned to your Officer account. Return to the ticket and generate recommendations again.
            </p>
          </section>
        ) : recommendation && ticket ? (
          <>
            <header className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ticket #{ticket.id}</p>
              <h2 className="mt-1 break-words text-xl font-semibold text-[#172C46]">{ticket.subject}</h2>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Recommendation</p>
                <h3 className="mt-1 break-words text-base font-semibold text-[#294A3B]">{recommendation.title}</h3>
              </div>
            </header>

            <section className="mt-6" aria-labelledby="source-list-title">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="source-list-title" className="text-lg font-semibold text-[#172C46]">Retrieved supporting passages</h2>
                  <p className="mt-1 text-sm text-slate-600">{sources.length} source{sources.length === 1 ? "" : "s"} linked to this recommendation.</p>
                </div>
              </div>

              <div className="space-y-4">
                {sources.map((source, index) => {
                  const illustrative = source.source_type === "illustrative_internal";
                  const safeUrl = (() => {
                    if (!source.canonical_url) return null;
                    try {
                      const parsed = new URL(source.canonical_url);
                      return (parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password
                        ? parsed.toString()
                        : null;
                    } catch {
                      return null;
                    }
                  })();

                  return (
                    <article key={`${source.document_id}-${source.page_number ?? "page"}-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <header className="border-b border-slate-100 px-4 py-4 sm:px-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="break-words font-semibold text-[#172C46]">{source.title}</h3>
                            {(source.page_number !== null || source.section_heading) && (
                              <p className="mt-1 break-words text-xs text-slate-500">
                                {source.page_number !== null ? `Page ${source.page_number}` : ""}
                                {source.page_number !== null && source.section_heading ? " | " : ""}
                                {source.section_heading ?? ""}
                              </p>
                            )}
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${illustrative ? "bg-amber-50 text-amber-900" : "bg-blue-50 text-blue-900"}`}>
                            {illustrative ? "Illustrative Internal Guidance" : "Official Public Source"}
                          </span>
                        </div>
                      </header>
                      <div className="px-4 py-4 sm:px-5 sm:py-5">
                        {illustrative && (
                          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                            Fictional illustrative Orion demo guidance. This is not actual bank policy, RBI guidance or a regulatory requirement.
                          </p>
                        )}
                        <blockquote className="break-words whitespace-pre-wrap border-l-2 border-[#8BA895] pl-4 text-sm leading-6 text-slate-700">
                          {source.excerpt}
                        </blockquote>
                        {safeUrl && (
                          <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex text-sm font-medium text-[#345B4A] underline underline-offset-2 hover:text-[#172C46]">
                            Open source document
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </OfficerShell>
  );
}

export default function NbaSourcesPage() {
  return (
    <Suspense
      fallback={(
        <main className="flex min-h-48 items-center justify-center bg-[#F6F7F5] px-5 text-sm text-slate-600">
          Loading supporting sources...
        </main>
      )}
    >
      <NbaSourcesContent />
    </Suspense>
  );
}
