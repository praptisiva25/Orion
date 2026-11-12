"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";
import { bankingApi } from "@/lib/api";
import type {
  AdminSentimentDistribution,
  AdminSentimentTrends,
  AdminTicketSentimentInsightsPage,
} from "@/types/banking";

function utcDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function DistributionChart({ data }: { data: AdminSentimentDistribution }) {
  const total = data.analyzedTickets;
  const circumference = 2 * Math.PI * 36;
  const positiveLength = total ? circumference * data.positiveCount / total : 0;
  const neutralLength = total ? circumference * data.neutralCount / total : 0;
  const negativeLength = total ? circumference * data.negativeCount / total : 0;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
      <div className="relative h-48 w-48 shrink-0" role="img" aria-label={`Sentiment distribution for ${total} analyzed tickets`}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="36" fill="none" stroke="#E2E8F0" strokeWidth="15" />
          {total > 0 && <>
            <circle cx="50" cy="50" r="36" fill="none" stroke="#456B58" strokeWidth="15" strokeDasharray={`${positiveLength} ${circumference - positiveLength}`} />
            <circle cx="50" cy="50" r="36" fill="none" stroke="#D5A642" strokeWidth="15" strokeDasharray={`${neutralLength} ${circumference - neutralLength}`} strokeDashoffset={-positiveLength} />
            <circle cx="50" cy="50" r="36" fill="none" stroke="#C75B5B" strokeWidth="15" strokeDasharray={`${negativeLength} ${circumference - negativeLength}`} strokeDashoffset={-(positiveLength + neutralLength)} />
          </>}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-semibold text-[#172C46]">{total}</span>
          <span className="text-xs text-slate-500">analysed tickets</span>
        </div>
      </div>
      <div className="grid w-full gap-3 sm:max-w-xs">
        {[
          ["Positive", data.positiveCount, data.positivePercentage, "bg-[#456B58]"],
          ["Neutral", data.neutralCount, data.neutralPercentage, "bg-[#D5A642]"],
          ["Negative", data.negativeCount, data.negativePercentage, "bg-[#C75B5B]"],
        ].map(([label, count, percentage, color]) => (
          <div key={label} className="flex items-center justify-between rounded-xl bg-[#F8F9F7] px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-[#25354A]"><span className={`h-3 w-3 rounded-full ${color}`} />{label}</span>
            <span className="text-sm font-semibold text-[#172C46]">{count} <span className="font-normal text-slate-500">({formatPercent(Number(percentage))})</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ data }: { data: AdminSentimentTrends }) {
  const maximum = Math.max(1, ...data.points.flatMap((point) => [point.positiveCount, point.neutralCount, point.negativeCount]));
  const xForIndex = (index: number) => data.points.length <= 1 ? 50 : 8 + index * 84 / (data.points.length - 1);
  const yForValue = (value: number) => 88 - value * 76 / maximum;
  const makePoints = (value: (index: number) => number) => data.points.map((_, index) => {
    const x = xForIndex(index);
    const y = yForValue(value(index));
    return `${x},${y}`;
  }).join(" ");

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#456B58]" />Positive</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#D5A642]" />Neutral</span>
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#C75B5B]" />Negative</span>
      </div>
      <svg viewBox="0 0 100 100" role="img" aria-label="Daily historical sentiment counts" className="h-64 w-full overflow-visible">
        {[12, 50, 88].map((y) => <line key={y} x1="6" x2="94" y1={y} y2={y} stroke="#E2E8F0" strokeWidth="0.5" />)}
        <polyline points={makePoints((index) => data.points[index].positiveCount)} fill="none" stroke="#456B58" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polyline points={makePoints((index) => data.points[index].neutralCount)} fill="none" stroke="#D5A642" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <polyline points={makePoints((index) => data.points[index].negativeCount)} fill="none" stroke="#C75B5B" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {data.points.map((point, index) => <g key={point.date}>
          <circle cx={xForIndex(index)} cy={yForValue(point.positiveCount)} r="1.4" fill="#456B58" />
          <circle cx={xForIndex(index)} cy={yForValue(point.neutralCount)} r="1.4" fill="#D5A642" />
          <circle cx={xForIndex(index)} cy={yForValue(point.negativeCount)} r="1.4" fill="#C75B5B" />
        </g>)}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-slate-400"><span>{data.fromDate}</span><span>{data.toDate}</span></div>
    </div>
  );
}

export default function AdminSentimentPage() {
  const authorized = useAdminAuth();
  const [distribution, setDistribution] = useState<AdminSentimentDistribution | null>(null);
  const [trends, setTrends] = useState<AdminSentimentTrends | null>(null);
  const [insights, setInsights] = useState<AdminTicketSentimentInsightsPage | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [label, setLabel] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [finishedRequestKey, setFinishedRequestKey] = useState("");
  const [error, setError] = useState("");
  const requestKey = `${authorized}|${fromDate}|${toDate}|${label}|${page}|${reloadKey}`;
  const loading = authorized && finishedRequestKey !== requestKey;

  useEffect(() => {
    if (!authorized) return;

    let active = true;
    Promise.all([
      bankingApi.getAdminSentimentDistribution(),
      bankingApi.getAdminSentimentTrends(fromDate, toDate),
      bankingApi.getAdminTicketSentimentInsights({ label: label || undefined, page, pageSize: 10 }),
    ]).then(([distributionData, trendData, insightData]) => {
      if (!active) return;
      setError("");
      setDistribution(distributionData);
      setTrends(trendData);
      setInsights(insightData);
    }).catch((requestError: unknown) => {
      if (active) setError(requestError instanceof Error ? requestError.message : "Unable to load sentiment analytics.");
    }).finally(() => {
      if (active) setFinishedRequestKey(requestKey);
    });

    return () => { active = false; };
  }, [authorized, fromDate, toDate, label, page, reloadKey, requestKey]);

  const maxPages = useMemo(() => Math.max(1, Math.ceil((insights?.totalCount ?? 0) / (insights?.pageSize ?? 10))), [insights]);
  const overview = distribution ? [
    ["Tickets analysed", distribution.analyzedTickets, "Historical sentiment is available"],
    ["Positive", distribution.positiveCount, formatPercent(distribution.positivePercentage)],
    ["Neutral", distribution.neutralCount, formatPercent(distribution.neutralPercentage)],
    ["Negative", distribution.negativeCount, formatPercent(distribution.negativePercentage)],
    ["Unanalysed", distribution.unanalyzedTickets, `of ${distribution.totalTickets} tickets`],
  ] as const : [];

  return (
    <div>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-medium tracking-[0.18em] text-[#78917E]">ORION BANK · SUPPORT INTELLIGENCE</p><h1 className="mt-2 text-3xl font-semibold text-[#172C46]">Sentiment Analytics</h1><p className="mt-2 text-sm text-slate-500">Historical customer-conversation sentiment. Sentiment is separate from ticket urgency and priority.</p></div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">From<input type="date" value={fromDate || trends?.fromDate || ""} max={toDate || trends?.toDate} onChange={(event) => { setFromDate(event.target.value); setPage(1); }} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#172C46]" /></label>
          <label className="text-xs text-slate-500">To<input type="date" value={toDate || trends?.toDate || ""} min={fromDate || trends?.fromDate} max={utcDate()} onChange={(event) => { setToDate(event.target.value); setPage(1); }} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#172C46]" /></label>
        </div>
      </div>

      {error && <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"><span>{error}</span><button onClick={() => { setError(""); setReloadKey((key) => key + 1); }} className="rounded-lg border border-red-200 px-3 py-1.5 font-medium hover:bg-red-100">Retry</button></div>}

      <section aria-label="Sentiment overview" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {overview.map(([title, value, detail]) => <article key={title} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{title}</p><p className="mt-2 text-3xl font-semibold text-[#172C46]">{loading && !distribution ? "—" : value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></article>)}
        {loading && !distribution && Array.from({ length: 5 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-white" />)}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6"><h2 className="font-semibold text-[#172C46]">Current ticket distribution</h2><p className="mb-5 mt-1 text-xs text-slate-500">Percentages are calculated from classified tickets.</p>{loading && !distribution ? <p className="text-sm text-slate-500">Loading distribution…</p> : distribution ? distribution.analyzedTickets === 0 ? <p className="rounded-xl bg-[#F8F9F7] p-6 text-center text-sm text-slate-500">No tickets have a successful sentiment analysis yet.</p> : <DistributionChart data={distribution} /> : <p className="text-sm text-slate-500">Distribution is unavailable.</p>}</section>
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold text-[#172C46]">Historical trends</h2><p className="mt-1 text-xs text-slate-500">Successful analysis events grouped by UTC day.</p></div></div>{loading && !trends ? <p className="text-sm text-slate-500">Loading trends…</p> : trends?.points.some((point) => point.totalCount > 0) ? <TrendChart data={trends} /> : <p className="rounded-xl bg-[#F8F9F7] p-6 text-center text-sm text-slate-500">No sentiment history in this date range.</p>}</section>
      </div>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="font-semibold text-[#172C46]">Latest ticket insights</h2><p className="mt-1 text-xs text-slate-500">One latest successful event per ticket.</p></div><label className="text-xs text-slate-500">Filter sentiment<select value={label} onChange={(event) => { setLabel(event.target.value); setPage(1); }} className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#172C46]"><option value="">All labels</option><option value="positive">Positive</option><option value="neutral">Neutral</option><option value="negative">Negative</option></select></label></div>
        {loading && !insights ? <p className="p-8 text-sm text-slate-500">Loading ticket insights…</p> : !insights?.items.length ? <p className="p-8 text-center text-sm text-slate-500">No matching ticket sentiment records.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#F8F9F7] text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Ticket</th><th className="px-5 py-3">Status / priority</th><th className="px-5 py-3">Sentiment</th><th className="px-5 py-3">Confidence</th><th className="px-5 py-3">Analysed</th></tr></thead><tbody>{insights.items.map((item) => <tr key={item.ticketId} className="border-t border-slate-100"><td className="px-5 py-4"><Link className="font-medium text-[#456B58] hover:underline" href={`/admin/support?search=${item.ticketId}`}>Ticket #{item.ticketId}</Link></td><td className="px-5 py-4 text-slate-600">{item.status} · {item.priority}</td><td className="px-5 py-4"><span className="capitalize">{item.sentimentLabel}</span><span className="ml-2 text-xs text-slate-400">Event {item.eventSequence}</span></td><td className="px-5 py-4 text-slate-600">{formatPercent(item.confidence * 100)}</td><td className="px-5 py-4 text-slate-500">{new Date(item.analyzedAt).toLocaleString("en-IN")}</td></tr>)}</tbody></table><div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500"><span>{insights.totalCount} ticket records</span><div className="flex items-center gap-3"><button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button><span>Page {page} of {maxPages}</span><button disabled={page >= maxPages} onClick={() => setPage((current) => Math.min(maxPages, current + 1))} className="rounded border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button></div></div></div>}
      </section>
    </div>
  );
}
