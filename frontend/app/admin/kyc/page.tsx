"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { bankingApi } from "@/lib/api";
import type { KycDocument } from "@/types/banking";

export default function AdminKycPage() {
  const [documents, setDocuments] = useState<KycDocument[]>([]);
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rejectTarget, setRejectTarget] = useState<KycDocument | null>(null);
  const [reason, setReason] = useState("");
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ document: KycDocument; url: string } | null>(null);
  async function load() { setDocuments(await bankingApi.getAllKycDocuments()); }
  useEffect(() => {
    let active = true;
    bankingApi.getAllKycDocuments().then((items) => { if (active) setDocuments(items); })
      .catch((err) => { if (active) setError(err.message || "Unable to load KYC documents."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function view(document: KycDocument, download = false) {
    setError("");
    try {
      const blob = await bankingApi.getKycDocumentFile(document.id, download);
      const url = URL.createObjectURL(blob);
      if (download) {
        const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = document.fileName; anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else setPreview({ document, url });
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to retrieve document."); }
  }
  async function review(document: KycDocument, status: "Verified" | "Rejected", reviewReason?: string) {
    setReviewingId(document.id); setError(""); setMessage("");
    try {
      await bankingApi.reviewKycDocument(document.id, status, reviewReason);
      setMessage(`${document.documentType} for ${document.customerName ?? "customer"} marked ${status.toLowerCase()}.`);
      setRejectTarget(null); setReason(""); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to review document."); }
    finally { setReviewingId(null); }
  }
  const visible = filter === "All" ? documents : documents.filter((d) => d.status.toLowerCase() === filter.toLowerCase());

  return <div><div className="mb-7"><h1 className="text-3xl font-semibold text-[#172C46]">KYC Reviews</h1><p className="mt-2 text-sm text-slate-500">Securely review submitted customer identity documents.</p></div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h2 className="font-semibold text-[#172C46]">Customer documents</h2><p className="mt-1 text-sm text-slate-500">{visible.length} document(s)</p></div><select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option>All</option><option>Pending</option><option>Verified</option><option>Rejected</option></select></div>
      {loading ? <p className="p-8 text-sm text-slate-500">Loading documents...</p> : !visible.length ? <p className="p-10 text-center text-sm text-slate-500">No KYC documents found.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-[#F8F9F7] text-xs uppercase text-slate-500"><tr><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Document</th><th className="px-5 py-4">Submitted</th><th className="px-5 py-4">Review</th><th className="px-5 py-4">Actions</th></tr></thead><tbody>{visible.map((d) => <tr key={d.id} className="border-t border-slate-100 align-top"><td className="px-5 py-4"><p className="font-medium text-[#172C46]">{d.customerName}</p><p className="text-xs text-slate-500">{d.customerEmail}</p></td><td className="px-5 py-4"><p className="font-medium">{d.documentType}</p><p className="mt-1 max-w-48 break-all text-xs text-slate-400">{d.fileName}</p><div className="mt-2 flex gap-3"><button onClick={() => view(d)} className="text-xs font-medium text-[#456B58]">Preview</button><button onClick={() => view(d, true)} className="text-xs font-medium text-[#456B58]">Download</button></div></td><td className="px-5 py-4 text-slate-500">{new Date(d.uploadedAt).toLocaleString("en-IN")}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs ${d.status === "Verified" ? "bg-green-50 text-green-700" : d.status === "Rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{d.status}</span>{d.reviewedAt && <p className="mt-2 text-xs text-slate-500">{d.reviewerName ? `By ${d.reviewerName} · ` : ""}{new Date(d.reviewedAt).toLocaleString("en-IN")}</p>}{d.reviewReason && <p className="mt-2 max-w-52 text-xs text-red-700">{d.reviewReason}</p>}</td><td className="px-5 py-4">{d.status === "Pending" ? <div className="flex gap-2"><button disabled={reviewingId === d.id} onClick={() => review(d, "Verified")} className="rounded-md bg-[#EAF0EC] px-3 py-2 text-xs font-medium text-[#345B4A] disabled:opacity-50">Approve</button><button disabled={reviewingId === d.id} onClick={() => { setRejectTarget(d); setReason(""); }} className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50">Reject</button></div> : <span className="text-xs text-slate-400">Reviewed</span>}</td></tr>)}</tbody></table></div>}
    </section>
    {rejectTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-lg font-semibold text-[#172C46]">Reject KYC document</h2><p className="mt-2 text-sm text-slate-500">Provide the reason the customer will see.</p><textarea rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-4 w-full rounded-lg border border-slate-200 p-3 text-sm" /><div className="mt-4 flex justify-end gap-3"><button onClick={() => setRejectTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Cancel</button><button disabled={!reason.trim() || reviewingId === rejectTarget.id} onClick={() => review(rejectTarget, "Rejected", reason.trim())} className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50">Confirm rejection</button></div></section></div>}
    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreview(null)}><section className="flex h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}><div className="flex justify-between pb-3"><p className="font-medium text-[#172C46]">{preview.document.customerName} · {preview.document.documentType}</p><button onClick={() => setPreview(null)} className="text-sm text-slate-500">Close</button></div>{preview.document.fileName.toLowerCase().endsWith(".pdf") ? <iframe title="KYC document preview" src={preview.url} className="min-h-0 flex-1 rounded-lg border" /> : <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50"><Image src={preview.url} alt={`${preview.document.documentType} document`} width={1200} height={900} unoptimized className="max-h-full max-w-full object-contain" /></div>}</section></div>}
  </div>;
}
