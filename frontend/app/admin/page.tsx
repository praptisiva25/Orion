"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { bankingApi } from "@/lib/api";
import type { AdminActivity, AdminDashboard } from "@/types/banking";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";

function ActivitySection({ title, items, href, loading }: { title: string; items: AdminActivity[]; href: string; loading: boolean }) {
  return <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-[#172C46]">{title}</h2><Link href={href} className="text-xs font-medium text-[#456B58] hover:underline">View all</Link></div>
    {loading ? <p className="mt-5 text-sm text-slate-500">Loading...</p> : !items.length ? <p className="mt-5 text-sm text-slate-500">No recent records.</p> : <div className="mt-4 divide-y divide-slate-100">{items.map((item, index) => <div key={`${item.type}-${index}`} className="py-3 first:pt-0 last:pb-0"><p className="text-sm text-[#25354A]">{item.description}</p><div className="mt-1 flex justify-between gap-3 text-xs text-slate-400"><span>{item.status}</span><time>{new Date(item.timestamp).toLocaleString("en-IN")}</time></div></div>)}</div>}
  </section>;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const authorized = useAdminAuth();

  useEffect(() => {
  if (!authorized) return;

  let active = true;

  bankingApi.getAdminDashboard()
    .then((result) => {
      if (active) setData(result);
    })
    .catch((err) => {
      if (active) setError(err.message || "Unable to load dashboard.");
    })
    .finally(() => {
      if (active) setLoading(false);
    });

  return () => {
    active = false;
  };
}, [authorized]);

  const stats = [
    ["Customers", data?.totalCustomers, "/admin/customers"],
    ["Officers", data?.totalOfficers, "/admin/officers"],
    ["Banking products", data?.totalBankingProducts, "/admin/products"],
    ["Applications", data?.totalApplications, "/admin/applications"],
    ["Pending applications", data?.pendingApplications, "/admin/applications"],
    ["Approved applications", data?.approvedApplications, "/admin/applications"],
    ["Rejected applications", data?.rejectedApplications, "/admin/applications"],
    ["KYC documents", data?.totalKycDocuments, "/admin/kyc"],
    ["Pending KYC", data?.pendingKyc, "/admin/kyc"],
    ["Support tickets", data?.totalSupportTickets, "/admin/support"],
    ["Open tickets", data?.openSupportTickets, "/admin/support"],
    ["Resolved tickets", data?.resolvedSupportTickets, "/admin/support"],
  ] as const;

  return <div>
    <div className="mb-8"><p className="text-xs font-medium tracking-[0.18em] text-[#78917E]">ORION BANK · OPERATIONS</p><h1 className="mt-2 text-3xl font-semibold text-[#172C46]">Admin Dashboard</h1><p className="mt-2 text-sm text-slate-500">Live overview of customers, products, reviews and service activity.</p></div>
    {error && <p role="alert" className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([label, value, href]) => <Link key={label} href={href} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-semibold text-[#172C46]">{loading ? "—" : value ?? "—"}</p></Link>)}</section>
    {!loading && !data && !error && <p className="mt-6 text-sm text-slate-500">No dashboard data is available.</p>}
    <div className="mt-7 grid gap-5 xl:grid-cols-2">
      <ActivitySection title="Recent applications" items={data?.recentApplications ?? []} href="/admin/applications" loading={loading} />
      <ActivitySection title="Recent KYC submissions" items={data?.recentKycSubmissions ?? []} href="/admin/kyc" loading={loading} />
      <ActivitySection title="Recent support tickets" items={data?.recentSupportTickets ?? []} href="/admin/support" loading={loading} />
      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold text-[#172C46]">Recently created Officers</h2><Link href="/admin/officers" className="text-xs font-medium text-[#456B58] hover:underline">Manage Officers</Link></div>{loading ? <p className="mt-5 text-sm text-slate-500">Loading...</p> : !data?.recentOfficers.length ? <p className="mt-5 text-sm text-slate-500">No Officers found.</p> : <div className="mt-4 divide-y divide-slate-100">{data.recentOfficers.map((officer) => <div key={officer.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium text-[#172C46]">{officer.fullName}</p><p className="text-xs text-slate-500">{officer.email}</p></div><time className="text-xs text-slate-400">{new Date(officer.createdAt).toLocaleDateString("en-IN")}</time></div>)}</div>}</section>
    </div>
    <section className="mt-7 rounded-2xl bg-[#172C46] p-6 text-white"><h2 className="font-semibold">Quick actions</h2><div className="mt-4 flex flex-wrap gap-3">{[["Add Officer", "/admin/officers"], ["Create product", "/admin/products"], ["Review applications", "/admin/applications"], ["Review KYC", "/admin/kyc"], ["Manage tickets", "/admin/support"]].map(([label, href]) => <Link key={href} href={href} className="rounded-lg bg-white/10 px-4 py-3 text-sm hover:bg-white/20">{label} →</Link>)}</div></section>
  </div>;
}
