"use client";

import { useEffect, useState } from "react";
import { bankingApi } from "@/lib/api";
import type { AdminCustomer } from "@/types/banking";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [selected, setSelected] = useState<AdminCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const authorized = useAdminAuth();

  async function load() {
    setCustomers(await bankingApi.getAdminCustomers(search, status === "All" ? undefined : status === "Active"));
  }
  useEffect(() => {
  if (!authorized) return;

  let active = true;

  bankingApi.getAdminCustomers(
    search,
    status === "All" ? undefined : status === "Active"
  )
    .then((items) => {
      if (active) setCustomers(items);
    })
    .catch((err) => {
      if (active) {
        setError(err.message || "Unable to load customers.");
      }
    })
    .finally(() => {
      if (active) setLoading(false);
    });

  return () => {
    active = false;
  };
}, [authorized, search, status]);

  async function viewDetails(id: number) {
    setError("");
    try { setSelected(await bankingApi.getAdminCustomer(id)); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load customer details."); }
  }

  async function toggle(customer: AdminCustomer) {
    setError(""); setMessage("");
    try {
      await bankingApi.setAdminCustomerStatus(customer.id, !customer.isActive);
      setMessage(`${customer.fullName} was ${customer.isActive ? "deactivated" : "activated"}.`);
      await load();
      if (selected?.id === customer.id) setSelected({ ...selected, isActive: !customer.isActive });
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update customer."); }
  }

  return <div><div className="mb-7"><h1 className="text-3xl font-semibold text-[#172C46]">Customer Management</h1><p className="mt-2 text-sm text-slate-500">Search registered customers and review their account profile.</p></div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"><div className="flex flex-wrap gap-3 border-b border-slate-100 p-5"><input aria-label="Search customers" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-56 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" /><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm"><option>All</option><option>Active</option><option>Inactive</option></select></div>
      {loading ? <p className="p-8 text-sm text-slate-500">Loading customers...</p> : !customers.length ? <p className="p-10 text-center text-sm text-slate-500">No customers match these filters.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#F8F9F7] text-xs uppercase text-slate-500"><tr><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Registered</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Profile</th><th className="px-5 py-4">Access</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id} className="border-t border-slate-100"><td className="px-5 py-4"><p className="font-medium text-[#172C46]">{customer.fullName}</p><p className="mt-1 text-xs text-slate-500">{customer.email}</p></td><td className="px-5 py-4 text-slate-500">{new Date(customer.createdAt).toLocaleDateString("en-IN")}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs ${customer.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>{customer.isActive ? "Active" : "Inactive"}</span></td><td className="px-5 py-4"><button onClick={() => viewDetails(customer.id)} className="font-medium text-[#456B58] hover:underline">View profile</button></td><td className="px-5 py-4"><button onClick={() => toggle(customer)} className="font-medium text-[#456B58] hover:underline">{customer.isActive ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>}
    </section>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}><section className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between"><div><h2 className="text-xl font-semibold text-[#172C46]">{selected.fullName}</h2><p className="mt-1 text-sm text-slate-500">{selected.email}</p></div><button onClick={() => setSelected(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Close</button></div><dl className="mt-6 grid gap-4 sm:grid-cols-2">{[["Phone", selected.phoneNumber], ["Address", selected.address], ["City", selected.city], ["State", selected.state], ["Postal code", selected.postalCode], ["Date of birth", selected.dateOfBirth ? new Date(selected.dateOfBirth).toLocaleDateString("en-IN") : "—"], ["Registered", new Date(selected.createdAt).toLocaleString("en-IN")], ["Account status", selected.isActive ? "Active" : "Inactive"]].map(([label, value]) => <div key={label} className="rounded-lg bg-[#F8FAF8] p-4"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm text-[#172C46]">{value || "—"}</dd></div>)}</dl><button onClick={() => toggle(selected)} className="mt-6 rounded-lg bg-[#172C46] px-4 py-2.5 text-sm text-white">{selected.isActive ? "Deactivate account" : "Activate account"}</button></section></div>}
  </div>;
}
