"use client";

import { useEffect, useState } from "react";
import { bankingApi } from "@/lib/api";
import type { AdminOfficer } from "@/types/banking";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";

export default function AdminOfficersPage() {
  const [officers, setOfficers] = useState<AdminOfficer[]>([]);
  const [filter, setFilter] = useState("All");
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const authorized = useAdminAuth();

  async function load() { setOfficers(await bankingApi.getAdminOfficers()); }
  useEffect(() => {
  if (!authorized) return;

  let active = true;

  bankingApi.getAdminOfficers()
    .then((items) => {
      if (active) setOfficers(items);
    })
    .catch((err) => {
      if (active) {
        setError(err.message || "Unable to load Officers.");
      }
    })
    .finally(() => {
      if (active) setLoading(false);
    });

  return () => {
    active = false;
  };
}, [authorized]);

  async function createOfficer(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    if (form.fullName.trim().length < 2 || form.password.length < 12) {
      setError("Enter the Officer’s name and a password of at least 12 characters."); return;
    }
    setSaving(true);
    try {
      const result = await bankingApi.createAdminOfficer({ ...form, fullName: form.fullName.trim(), email: form.email.trim() });
      setMessage(`${result.fullName} was created as an Officer.`);
      setForm({ fullName: "", email: "", password: "" });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to create Officer."); }
    finally { setSaving(false); }
  }

  async function toggle(officer: AdminOfficer) {
    setError(""); setMessage("");
    try {
      await bankingApi.setAdminOfficerStatus(officer.id, !officer.isActive);
      setMessage(`${officer.fullName} was ${officer.isActive ? "deactivated" : "activated"}.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update Officer."); }
  }

  const visible = officers.filter((officer) => filter === "All" || (filter === "Active" ? officer.isActive : !officer.isActive));
  const field = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#6B8E80]";

  return <div><div className="mb-7"><h1 className="text-3xl font-semibold text-[#172C46]">Officer Management</h1><p className="mt-2 text-sm text-slate-500">Create staff accounts and manage their access.</p></div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
    <form onSubmit={createOfficer} className="mb-7 grid gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:grid-cols-2 xl:grid-cols-4">
      <label className="text-sm text-slate-600">Full name<input required maxLength={100} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={field} /></label>
      <label className="text-sm text-slate-600">Email<input required type="email" maxLength={256} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={field} /></label>
      <label className="text-sm text-slate-600">Temporary password<input required type="password" minLength={12} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={field} /><span className="mt-1 block text-xs text-slate-400">At least 12 characters with upper/lowercase, number and symbol.</span></label>
      <div className="flex items-end"><button disabled={saving} className="w-full rounded-lg bg-[#172C46] px-4 py-3 text-sm font-medium text-white disabled:opacity-50">{saving ? "Creating..." : "Create Officer"}</button></div>
    </form>
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5"><div><h2 className="font-semibold text-[#172C46]">Officers</h2><p className="mt-1 text-sm text-slate-500">{visible.length} account(s)</p></div><select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option>All</option><option>Active</option><option>Inactive</option></select></div>
      {loading ? <p className="p-8 text-sm text-slate-500">Loading Officers...</p> : !visible.length ? <p className="p-8 text-center text-sm text-slate-500">No Officers match this filter.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-[#F8F9F7] text-xs uppercase text-slate-500"><tr><th className="px-5 py-4">Officer</th><th className="px-5 py-4">Created</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Action</th></tr></thead><tbody>{visible.map((officer) => <tr key={officer.id} className="border-t border-slate-100"><td className="px-5 py-4"><p className="font-medium text-[#172C46]">{officer.fullName}</p><p className="mt-1 text-xs text-slate-500">{officer.email}</p></td><td className="px-5 py-4 text-slate-500">{new Date(officer.createdAt).toLocaleDateString("en-IN")}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs ${officer.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>{officer.isActive ? "Active" : "Inactive"}</span></td><td className="px-5 py-4"><button onClick={() => toggle(officer)} className="text-sm font-medium text-[#456B58] hover:underline">{officer.isActive ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
