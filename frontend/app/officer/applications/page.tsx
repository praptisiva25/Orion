"use client";

import { useEffect, useState } from "react";
import OfficerShell from "@/components/officer/OfficerShell";
import { bankingApi } from "@/lib/api";
import type { Application } from "@/types/banking";

export default function OfficerApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Application | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"active" | "history">("active");
  const [historyStatus, setHistoryStatus] = useState("All");
  const [customer, setCustomer] = useState("");
  const [product, setProduct] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  async function loadApplications() {
    const data = view === "active" ? await bankingApi.getOfficerApplications() : await bankingApi.getOfficerApplicationHistory({ status: historyStatus, customer, product, fromDate, toDate });
    setApplications(data);
  }

  useEffect(() => {
    let active = true;
    (view === "active" ? bankingApi.getOfficerApplications() : bankingApi.getOfficerApplicationHistory({ status: historyStatus, customer, product, fromDate, toDate }))
      .then((data) => { if (active) setApplications(data); })
      .catch((err) => { if (active) setError(err.message || "Unable to load applications."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [view, historyStatus, customer, product, fromDate, toDate]);

  async function approve(application: Application) {
    setReviewing(true);
    setError("");
    setMessage("");
    try {
      await bankingApi.reviewApplication(application.id, "Approved");
      setSelected(null);
      setMessage(`Application #${application.id} was approved.`);
      await loadApplications();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to approve application.");
    } finally {
      setReviewing(false);
    }
  }

  async function reject() {
    if (!rejectTarget || !reason.trim()) return;
    setReviewing(true);
    setError("");
    setMessage("");
    try {
      await bankingApi.reviewApplication(rejectTarget.id, "Rejected", reason.trim());
      setSelected(null);
      setRejectTarget(null);
      setReason("");
      setMessage(`Application #${rejectTarget.id} was rejected.`);
      await loadApplications();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reject application.");
    } finally {
      setReviewing(false);
    }
  }

  return (
    <OfficerShell title="Application Reviews" subtitle="Review pending customer product applications and browse completed decisions.">
      {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mb-5 rounded-lg bg-green-50 p-4 text-sm text-green-700">{message}</p>}
      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-[#172C46]">{view === "active" ? "Pending applications" : "Application history"}</h2><p className="mt-1 text-sm text-slate-500">{applications.length} {view === "active" ? "application(s) awaiting a decision" : "reviewed application(s)"}</p></div><div className="flex gap-2"><button onClick={() => { setView("active"); setLoading(true); }} className={`rounded-lg px-4 py-2 text-sm ${view === "active" ? "bg-[#172C46] text-white" : "border border-slate-200"}`}>Active</button><button onClick={() => { setView("history"); setLoading(true); }} className={`rounded-lg px-4 py-2 text-sm ${view === "history" ? "bg-[#172C46] text-white" : "border border-slate-200"}`}>History</button></div></div>
          {view === "history" && <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><select value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option>All</option><option>Approved</option><option>Rejected</option></select><input placeholder="Customer name or email" value={customer} onChange={(e) => setCustomer(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"/><input placeholder="Product" value={product} onChange={(e) => setProduct(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"/><input aria-label="Applied from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"/><input aria-label="Applied to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"/></div>}
        </div>
        {loading ? <p className="p-8 text-sm text-slate-500">Loading applications...</p> : applications.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">No applications are waiting for review.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-[#F8F9F7] text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Product</th><th className="px-5 py-4">Requested amount</th><th className="px-5 py-4">Applied / reviewed</th><th className="px-5 py-4">Decision</th><th className="px-5 py-4">Reviewer / reason</th><th className="px-5 py-4">Details</th></tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr key={application.id} className="border-t border-slate-100">
                    <td className="px-5 py-5"><p className="font-medium text-[#172C46]">{application.customerName}</p><p className="mt-1 text-xs text-slate-500">{application.customerEmail}</p></td>
                    <td className="px-5 py-5 font-medium text-[#172C46]">{application.product}</td>
                    <td className="px-5 py-5 text-slate-600">₹{application.requestedAmount.toLocaleString("en-IN")}</td>
                    <td className="px-5 py-5 text-slate-600">{new Date(application.appliedAt).toLocaleDateString("en-IN")}{application.reviewedAt && <p className="mt-1 text-xs">Reviewed {new Date(application.reviewedAt).toLocaleDateString("en-IN")}</p>}</td>
                    <td className="px-5 py-5"><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">{application.status}</span></td>
                    <td className="px-5 py-5 text-xs text-slate-600">{application.reviewerName ?? "—"}{application.reviewReason && <p className="mt-1 text-red-700">{application.reviewReason}</p>}</td><td className="px-5 py-5"><button onClick={() => setSelected(application)} className="text-sm font-medium text-[#456B58] hover:underline">{view === "active" ? "Review details" : "View details"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}>
        <section className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-[#78917E]">Application #{selected.id}</p><h2 className="mt-1 text-xl font-semibold text-[#172C46]">{selected.product}</h2></div><button onClick={() => setSelected(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Close</button></div>
          <dl className="mt-5 grid gap-4 rounded-xl bg-[#F8FAF8] p-4 sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Customer</dt><dd className="mt-1 text-sm font-medium text-[#172C46]">{selected.customerName}</dd><dd className="text-xs text-slate-500">{selected.customerEmail}</dd></div>
            <div><dt className="text-xs text-slate-500">Requested amount</dt><dd className="mt-1 text-sm font-medium text-[#172C46]">₹{selected.requestedAmount.toLocaleString("en-IN")}</dd></div>
            <div><dt className="text-xs text-slate-500">Applied on</dt><dd className="mt-1 text-sm text-[#172C46]">{new Date(selected.appliedAt).toLocaleString("en-IN")}</dd></div>
            <div><dt className="text-xs text-slate-500">Customer remarks</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-[#172C46]">{selected.remarks || "No remarks provided."}</dd></div>
          </dl>
          {selected.status === "Pending" ? <div className="mt-5 flex justify-end gap-3"><button disabled={reviewing} onClick={() => setRejectTarget(selected)} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">Reject</button><button disabled={reviewing} onClick={() => approve(selected)} className="rounded-lg bg-[#172C46] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{reviewing ? "Saving..." : "Approve"}</button></div> : <p className="mt-5 text-sm text-slate-500">This application has already been reviewed and cannot be changed.</p>}
        </section>
      </div>}

      {rejectTarget && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
        <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-[#172C46]">Reject application #{rejectTarget.id}</h2>
          <p className="mt-2 text-sm text-slate-500">Provide the reason that will be shared with the customer.</p>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={4} className="mt-4 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-[#6B8E80]" />
          <div className="mt-4 flex justify-end gap-3"><button disabled={reviewing} onClick={() => setRejectTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">Cancel</button><button disabled={reviewing || !reason.trim()} onClick={reject} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{reviewing ? "Submitting..." : "Confirm rejection"}</button></div>
        </section>
      </div>}
    </OfficerShell>
  );
}
