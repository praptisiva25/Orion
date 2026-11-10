"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import OfficerShell from "@/components/officer/OfficerShell";
import { bankingApi } from "@/lib/api";
import type { KycDocument } from "@/types/banking";

export default function OfficerKycPage() {
  const [documents, setDocuments] = useState<KycDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [filter, setFilter] = useState("Pending");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rejectTarget, setRejectTarget] = useState<KycDocument | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [preview, setPreview] = useState<{ document: KycDocument; url: string } | null>(null);
  const [view, setView] = useState<"active" | "history">("active");
  const [customer, setCustomer] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  async function loadDocuments() {
    const data = view === "active" ? (await bankingApi.getAllKycDocuments()).filter((item) => item.status === "Pending") : await bankingApi.getOfficerKycHistory({ status: filter === "All" ? "All" : filter, customer, documentType, fromDate, toDate });
    setDocuments(data);
  }

  useEffect(() => {
    let active = true;
    (view === "active" ? bankingApi.getAllKycDocuments().then((items) => items.filter((item) => item.status === "Pending")) : bankingApi.getOfficerKycHistory({ status: filter === "All" ? "All" : filter, customer, documentType, fromDate, toDate }))
      .then((data) => { if (active) setDocuments(data); })
      .catch((err) => { if (active) setError(err.message || "Unable to load documents."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [view, filter, customer, documentType, fromDate, toDate]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  async function showDocument(document: KycDocument) {
    setError("");
    try {
      const blob = await bankingApi.getKycDocumentFile(document.id);
      setPreview({ document, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to preview document.");
    }
  }

  async function downloadDocument(document: KycDocument) {
    setError("");
    try {
      const blob = await bankingApi.getKycDocumentFile(document.id, true);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to download document.");
    }
  }

  async function reviewDocument(document: KycDocument, status: "Verified" | "Rejected", reason?: string) {
    setReviewingId(document.id);
    setError("");
    setMessage("");
    try {
      await bankingApi.reviewKycDocument(document.id, status, reason);
      setMessage(`${document.documentType} for ${document.customerName ?? "the customer"} marked ${status.toLowerCase()}.`);
      setRejectTarget(null);
      setRejectionReason("");
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed.");
    } finally {
      setReviewingId(null);
    }
  }

  const filteredDocuments = documents;

  return (
    <OfficerShell title="KYC Reviews" subtitle="Review customer-submitted identity documents.">
      {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mb-5 rounded-lg bg-green-50 p-4 text-sm text-green-700">{message}</p>}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="font-semibold text-[#172C46]">{view === "active" ? "Pending KYC documents" : "KYC history"}</h2>
            <p className="mt-1 text-sm text-slate-500">{documents.length} {view === "active" ? "document(s) awaiting review" : "reviewed document(s)"}</p>
          </div>
          <div className="flex gap-2"><button onClick={() => { setView("active"); setLoading(true); }} className={`rounded-lg px-4 py-2 text-sm ${view === "active" ? "bg-[#172C46] text-white" : "border border-slate-200"}`}>Active</button><button onClick={() => { setView("history"); setFilter("All"); setLoading(true); }} className={`rounded-lg px-4 py-2 text-sm ${view === "history" ? "bg-[#172C46] text-white" : "border border-slate-200"}`}>History</button></div>
        </div>
        {view === "history" && <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 xl:grid-cols-5"><select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="All">All reviewed</option><option>Verified</option><option>Rejected</option></select><select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">All document types</option><option>PAN</option><option>Aadhaar</option></select><input placeholder="Customer name or email" value={customer} onChange={(e) => setCustomer(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"/><input aria-label="Uploaded from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"/><input aria-label="Uploaded to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"/></div>}

        {loading ? <p className="p-8 text-sm text-slate-500">Loading documents...</p> : filteredDocuments.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">No documents found for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#F8F9F7] text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Document</th><th className="px-5 py-4">Uploaded / reviewed</th><th className="px-5 py-4">Status / reason</th><th className="px-5 py-4">Reviewer / action</th></tr>
              </thead>
              <tbody>
                {filteredDocuments.map((document) => {
                  const pending = document.status.toLowerCase() === "pending";
                  return (
                    <tr key={document.id} className="border-t border-slate-100 align-top">
                      <td className="px-5 py-5">
                        <p className="font-medium text-[#172C46]">{document.customerName ?? "Customer"}</p>
                        <p className="mt-1 text-xs text-slate-500">{document.customerEmail}</p>
                        <p className="mt-1 text-xs text-slate-400">Customer #{document.userId}</p>
                      </td>
                      <td className="px-5 py-5">
                        <p className="font-medium text-[#172C46]">{document.documentType}</p>
                        <p className="mt-1 max-w-48 break-all text-xs text-slate-400">{document.fileName}</p>
                        <div className="mt-3 flex gap-3">
                          <button onClick={() => showDocument(document)} className="text-xs font-medium text-[#456B58] hover:underline">Preview</button>
                          <button onClick={() => downloadDocument(document)} className="text-xs font-medium text-[#456B58] hover:underline">Download</button>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-5 text-slate-500">{new Date(document.uploadedAt).toLocaleString("en-IN")}{document.reviewedAt && <p className="mt-1">Reviewed {new Date(document.reviewedAt).toLocaleString("en-IN")}</p>}</td>
                      <td className="px-5 py-5">
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${document.status === "Verified" ? "bg-green-50 text-green-700" : document.status === "Rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{document.status}</span>
                        {document.reviewReason && <p className="mt-2 max-w-48 text-xs text-red-700">{document.reviewReason}</p>}
                      </td>
                      <td className="px-5 py-5">
                        {document.reviewerName && <p className="mb-2 text-xs text-slate-500">{document.reviewerName}</p>}{pending ? <div className="flex gap-2">
                          <button disabled={reviewingId === document.id} onClick={() => reviewDocument(document, "Verified")} className="rounded-md bg-[#EAF0EC] px-3 py-2 text-xs font-medium text-[#345B4A] hover:bg-[#DCE8E0] disabled:opacity-50">Approve</button>
                          <button disabled={reviewingId === document.id} onClick={() => { setRejectTarget(document); setRejectionReason(""); }} className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">Reject</button>
                        </div> : <span className="text-xs text-slate-400">Reviewed {document.reviewedAt ? new Date(document.reviewedAt).toLocaleDateString("en-IN") : ""}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {rejectTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-[#172C46]">Reject {rejectTarget.documentType} document</h2>
          <p className="mt-2 text-sm text-slate-500">Explain what the customer needs to correct.</p>
          <textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} maxLength={1000} rows={4} className="mt-4 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-[#6B8E80]" />
          <div className="mt-4 flex justify-end gap-3">
            <button onClick={() => setRejectTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">Cancel</button>
            <button disabled={!rejectionReason.trim() || reviewingId === rejectTarget.id} onClick={() => reviewDocument(rejectTarget, "Rejected", rejectionReason.trim())} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{reviewingId === rejectTarget.id ? "Submitting..." : "Confirm rejection"}</button>
          </div>
        </section>
      </div>}

      {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreview(null)}>
        <section className="flex h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 pb-3">
            <p className="truncate font-medium text-[#172C46]">{preview.document.customerName} · {preview.document.documentType}</p>
            <button onClick={() => setPreview(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Close</button>
          </div>
          {preview.document.fileName.toLowerCase().endsWith(".pdf")
            ? <iframe title="KYC document preview" src={preview.url} className="min-h-0 flex-1 rounded-lg border border-slate-200" />
            : <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-50"><Image src={preview.url} alt={`${preview.document.documentType} document`} width={1200} height={900} unoptimized className="max-h-full max-w-full object-contain" /></div>}
        </section>
      </div>}
    </OfficerShell>
  );
}
