"use client";

import { useEffect, useState } from "react";
import { bankingApi } from "@/lib/api";
import type { AdminAuditLog } from "@/types/banking";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState<AdminAuditLog | null>(null);
  const [category, setCategory] = useState("");
  const [actorId, setActorId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const authorized = useAdminAuth();

  useEffect(() => {
  if (!authorized) return;

  let active = true;

  bankingApi.getAdminAuditLogs({
    search,
    action,
    entityType,
    category,
    actorId: actorId ? Number(actorId) : undefined,
    entityId: entityId ? Number(entityId) : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    page,
    pageSize: 25,
  })
    .then((result) => {
      if (active) {
        setLogs(result.items);
        setTotalCount(result.totalCount);
      }
    })
    .catch((err) => {
      if (active) {
        setError(err.message || "Unable to load audit logs.");
      }
    })
    .finally(() => {
      if (active) setLoading(false);
    });

  return () => {
    active = false;
  };
}, [
  authorized,
  search,
  action,
  entityType,
  category,
  actorId,
  entityId,
  fromDate,
  toDate,
  page,
]);

  function changeFilter(setter: (value: string) => void, value: string) { setter(value); setPage(1); }
  return <div><div className="mb-7"><h1 className="text-3xl font-semibold text-[#172C46]">Audit Logs</h1><p className="mt-2 text-sm text-slate-500">Review administrative and operational actions.</p></div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 xl:grid-cols-4"><select aria-label="Audit category" value={category} onChange={(e) => changeFilter(setCategory, e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">All categories</option>{["Customers", "Officers", "Products", "Applications", "KYC", "Support", "Other"].map((x) => <option key={x}>{x}</option>)}</select><input placeholder="Search actor, action, entity or details" value={search} onChange={(e) => changeFilter(setSearch, e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input placeholder="Action contains" value={action} onChange={(e) => changeFilter(setAction, e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input placeholder="Actor user ID" type="number" value={actorId} onChange={(e) => changeFilter(setActorId, e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input placeholder="Entity type" value={entityType} onChange={(e) => changeFilter(setEntityType, e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input placeholder="Entity ID" type="number" value={entityId} onChange={(e) => changeFilter(setEntityId, e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input type="date" aria-label="From date" value={fromDate} onChange={(e) => changeFilter(setFromDate, e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input type="date" aria-label="To date" value={toDate} onChange={(e) => changeFilter(setToDate, e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><button onClick={() => { setSearch(""); setAction(""); setEntityType(""); setCategory(""); setActorId(""); setEntityId(""); setFromDate(""); setToDate(""); setPage(1); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Reset filters</button></div>
      {loading ? <p className="p-8 text-sm text-slate-500">Loading audit logs...</p> : !logs.length ? <p className="p-10 text-center text-sm text-slate-500">No audit entries match these filters.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-[#F8F9F7] text-xs uppercase text-slate-500"><tr><th className="px-5 py-4">Timestamp</th><th className="px-5 py-4">Actor</th><th className="px-5 py-4">Category / action</th><th className="px-5 py-4">Entity</th><th className="px-5 py-4">Details</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-t border-slate-100 align-top"><td className="whitespace-nowrap px-5 py-4 text-slate-500">{new Date(log.timestamp).toLocaleString("en-IN")}</td><td className="px-5 py-4"><p className="font-medium text-[#172C46]">{log.actorName ?? "System"}</p><p className="text-xs text-slate-400">{log.actorEmail ?? (log.userId ? `User #${log.userId}` : "System")}</p><p className="text-xs text-slate-400">{log.actorRoles || "Role not recorded"}</p></td><td className="px-5 py-4"><span className="rounded-full bg-[#EAF0EC] px-2 py-1 text-xs text-[#456B58]">{log.category}</span><p className="mt-2 font-medium text-[#172C46]">{log.action}</p></td><td className="px-5 py-4 text-slate-600">{log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</td><td className="max-w-md px-5 py-4 text-slate-500"><p className="line-clamp-2">{log.description ?? "—"}</p><button onClick={() => setSelected(log)} className="mt-2 text-xs font-medium text-[#456B58] hover:underline">View details</button></td></tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4"><p className="text-xs text-slate-500">Page {page} · {totalCount} entries</p><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40">Previous</button><button disabled={page * 25 >= totalCount || loading} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40">Next</button></div></div>
    </section>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}><section className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}><div className="flex justify-between"><h2 className="text-xl font-semibold text-[#172C46]">Audit entry #{selected.id}</h2><button onClick={() => setSelected(null)} className="text-sm text-slate-500">Close</button></div><dl className="mt-5 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Actor</dt><dd>{selected.actorName ?? "System"} {selected.actorEmail && `(${selected.actorEmail})`}</dd><dd className="text-sm text-slate-500">{selected.actorRoles || "Role not recorded"}</dd></div><div><dt className="text-xs text-slate-500">Timestamp</dt><dd>{new Date(selected.timestamp).toLocaleString("en-IN")}</dd></div><div><dt className="text-xs text-slate-500">Category / action</dt><dd>{selected.category} · {selected.action}</dd></div><div><dt className="text-xs text-slate-500">Entity</dt><dd>{selected.entityType} #{selected.entityId ?? "—"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-slate-500">Recorded details</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6">{selected.description ?? "No details recorded."}</dd></div></dl></section></div>}
  </div>;
}
