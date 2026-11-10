"use client";

import { useEffect, useState } from "react";
import { bankingApi } from "@/lib/api";
import type { AdminAuditLog } from "@/types/banking";

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    bankingApi.getAdminAuditLogs({ search, action, entityType, fromDate: fromDate || undefined, toDate: toDate || undefined, page, pageSize: 25 })
      .then((items) => { if (active) setLogs(items); })
      .catch((err) => { if (active) setError(err.message || "Unable to load audit logs."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, action, entityType, fromDate, toDate, page]);

  function changeFilter(setter: (value: string) => void, value: string) { setter(value); setPage(1); }
  return <div><div className="mb-7"><h1 className="text-3xl font-semibold text-[#172C46]">Audit Logs</h1><p className="mt-2 text-sm text-slate-500">Review administrative and operational actions.</p></div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 xl:grid-cols-5"><input placeholder="Search actor, action, entity or details" value={search} onChange={(e) => changeFilter(setSearch, e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input placeholder="Action contains" value={action} onChange={(e) => changeFilter(setAction, e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input placeholder="Entity type" value={entityType} onChange={(e) => changeFilter(setEntityType, e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input type="date" aria-label="From date" value={fromDate} onChange={(e) => changeFilter(setFromDate, e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /><input type="date" aria-label="To date" value={toDate} onChange={(e) => changeFilter(setToDate, e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
      {loading ? <p className="p-8 text-sm text-slate-500">Loading audit logs...</p> : !logs.length ? <p className="p-10 text-center text-sm text-slate-500">No audit entries match these filters.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-[#F8F9F7] text-xs uppercase text-slate-500"><tr><th className="px-5 py-4">Timestamp</th><th className="px-5 py-4">Actor</th><th className="px-5 py-4">Action</th><th className="px-5 py-4">Entity</th><th className="px-5 py-4">Details</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-t border-slate-100 align-top"><td className="whitespace-nowrap px-5 py-4 text-slate-500">{new Date(log.timestamp).toLocaleString("en-IN")}</td><td className="px-5 py-4"><p className="font-medium text-[#172C46]">{log.actorName ?? "System"}</p><p className="text-xs text-slate-400">{log.userId ? `User #${log.userId}` : "System"}</p></td><td className="px-5 py-4 font-medium text-[#172C46]">{log.action}</td><td className="px-5 py-4 text-slate-600">{log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</td><td className="max-w-md px-5 py-4 text-slate-500">{log.description ?? "—"}</td></tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4"><p className="text-xs text-slate-500">Page {page} · {logs.length} entries</p><div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40">Previous</button><button disabled={logs.length < 25 || loading} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-40">Next</button></div></div>
    </section>
  </div>;
}
