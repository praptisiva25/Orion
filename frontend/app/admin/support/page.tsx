"use client";

import { useEffect, useMemo, useState } from "react";
import { bankingApi } from "@/lib/api";
import type { AdminOfficer, AdminSupportTicket, AdminTicketMessage } from "@/types/banking";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [officers, setOfficers] = useState<AdminOfficer[]>([]);
  const [selected, setSelected] = useState<AdminSupportTicket | null>(null);
  const [messages, setMessages] = useState<AdminTicketMessage[]>([]);
  const [officerId, setOfficerId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const authorized = useAdminAuth();

  async function load() {
    const [ticketData, officerData] = await Promise.all([
      bankingApi.getAdminSupportTickets({ search, status: status || undefined, priority: priority || undefined, fromDate: fromDate || undefined, toDate: toDate || undefined }),
      bankingApi.getAdminOfficers(),
    ]);
    setTickets(ticketData); setOfficers(officerData);
  }
  useEffect(() => {
  if (!authorized) return;

  let active = true;

  Promise.all([
    bankingApi.getAdminSupportTickets({
      search,
      status: status || undefined,
      priority: priority || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    }),
    bankingApi.getAdminOfficers(),
  ])
    .then(([ticketData, officerData]) => {
      if (active) {
        setTickets(ticketData);
        setOfficers(officerData);
      }
    })
    .catch((err) => {
      if (active) {
        setError(err.message || "Unable to load support data.");
      }
    })
    .finally(() => {
      if (active) setLoading(false);
    });

  return () => {
    active = false;
  };
}, [authorized, search, status, priority, fromDate, toDate]);

  async function openTicket(ticket: AdminSupportTicket) {
    setError("");
    try {
      const detail = await bankingApi.getAdminSupportTicket(ticket.id);
      setSelected(detail.ticket); setMessages(detail.messages); setOfficerId(detail.ticket.assignedOfficerId?.toString() ?? "");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load ticket details."); }
  }
  async function saveAssignment() {
    if (!selected) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await bankingApi.assignAdminSupportTicket(selected.id, officerId ? Number(officerId) : null);
      setMessage(`Assignment updated for ticket #${selected.id}.`);
      await openTicket(selected); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to assign ticket."); }
    finally { setSaving(false); }
  }
  const summary = useMemo(() => ({
    open: tickets.filter((t) => t.status.toLowerCase() === "open").length,
    unresolved: tickets.filter((t) => !["resolved", "closed"].includes(t.status.toLowerCase())).length,
    resolved: tickets.filter((t) => ["resolved", "closed"].includes(t.status.toLowerCase())).length,
  }), [tickets]);

  return <div><div className="mb-7"><h1 className="text-3xl font-semibold text-[#172C46]">Support Tickets</h1><p className="mt-2 text-sm text-slate-500">Monitor customer conversations and manage Officer assignments.</p></div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
    <div className="mb-5 grid gap-4 sm:grid-cols-3">{[["Open", summary.open], ["Pending / active", summary.unresolved], ["Resolved / closed", summary.resolved]].map(([label, value]) => <div key={label} className="rounded-xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-[#172C46]">{loading ? "—" : value}</p></div>)}</div>
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 xl:grid-cols-5"><input placeholder="Search subject, customer, email" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">All statuses</option>{["Open", "InProgress", "Resolved", "Closed"].map((s) => <option key={s}>{s}</option>)}</select><select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">All priorities</option>{["Low", "Normal", "High", "Urgent"].map((p) => <option key={p}>{p}</option>)}</select><input type="date" aria-label="From date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input type="date" aria-label="To date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
      {loading ? <p className="p-8 text-sm text-slate-500">Loading tickets...</p> : !tickets.length ? <p className="p-10 text-center text-sm text-slate-500">No tickets match these filters.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#F8F9F7] text-xs uppercase text-slate-500"><tr><th className="px-5 py-4">Ticket</th><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Priority / status</th><th className="px-5 py-4">Assigned Officer</th><th className="px-5 py-4">Updated</th><th className="px-5 py-4">Details</th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id} className="border-t border-slate-100"><td className="px-5 py-4"><p className="font-medium text-[#172C46]">{ticket.subject}</p><p className="text-xs text-slate-400">#{ticket.id}</p></td><td className="px-5 py-4"><p>{ticket.customerName}</p><p className="text-xs text-slate-500">{ticket.customerEmail}</p></td><td className="px-5 py-4"><p>{ticket.priority}</p><p className="text-xs text-slate-500">{ticket.status}</p></td><td className="px-5 py-4">{ticket.assignedOfficerName ?? "Unassigned"}</td><td className="px-5 py-4 text-slate-500">{new Date(ticket.updatedAt).toLocaleDateString("en-IN")}</td><td className="px-5 py-4"><button onClick={() => openTicket(ticket)} className="font-medium text-[#456B58] hover:underline">Open ticket</button></td></tr>)}</tbody></table></div>}
    </section>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}><section className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}><div className="flex justify-between"><div><p className="text-xs uppercase text-[#78917E]">Ticket #{selected.id}</p><h2 className="mt-1 text-xl font-semibold text-[#172C46]">{selected.subject}</h2></div><button onClick={() => setSelected(null)} className="text-sm text-slate-500">Close</button></div><div className="mt-3 text-sm text-slate-500">{selected.customerName} · {selected.customerEmail} · {selected.priority} · {selected.status}</div><p className="mt-3 rounded-lg bg-[#F8FAF8] p-4 text-sm leading-6 text-slate-700">{selected.description}</p><div className="mt-4 flex flex-wrap items-end gap-3"><label className="flex-1 text-xs text-slate-500">Assign or reassign Officer<select value={officerId} onChange={(e) => setOfficerId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><option value="">Unassigned</option>{officers.filter((o) => o.isActive).map((o) => <option key={o.id} value={o.id}>{o.fullName} · {o.email}</option>)}</select></label><button disabled={saving || officerId === (selected.assignedOfficerId?.toString() ?? "")} onClick={saveAssignment} className="rounded-lg bg-[#172C46] px-4 py-2.5 text-sm text-white disabled:opacity-50">{saving ? "Saving..." : "Save assignment"}</button></div><h3 className="mt-6 font-semibold text-[#172C46]">Conversation</h3><div className="mt-3 min-h-32 flex-1 space-y-3 overflow-y-auto rounded-lg border border-slate-100 p-4">{!messages.length ? <p className="text-sm text-slate-500">No messages in this ticket yet.</p> : messages.map((m) => <article key={m.id} className="rounded-lg bg-[#F8FAF8] p-3"><div className="flex justify-between gap-2"><p className="text-sm font-medium text-[#172C46]">{m.senderName} <span className="text-xs font-normal text-slate-500">({m.senderRole})</span></p><time className="text-xs text-slate-400">{new Date(m.sentAt).toLocaleString("en-IN")}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{m.message}</p></article>)}</div></section></div>}
  </div>;
}
