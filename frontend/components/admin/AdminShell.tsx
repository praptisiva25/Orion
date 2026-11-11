"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, bankingApi } from "@/lib/api";
import type { AuthUser } from "@/types/banking";
import AdminAuthContext from "@/components/admin/AdminAuthContext";

const navigation = [
  ["Dashboard", "/admin"],
  ["Customers", "/admin/customers"],
  ["Officers", "/admin/officers"],
  ["Banking Products", "/admin/products"],
  ["Applications", "/admin/applications"],
  ["KYC Reviews", "/admin/kyc"],
  ["Support Tickets", "/admin/support"],
  ["Audit Logs", "/admin/audit-logs"],
] as const;

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function initialize() {
      if (!sessionStorage.getItem("token")) {
        router.replace("/login");
        return;
      }
      try {
        const current = await bankingApi.getCurrentUser();
        if (!current.roles.some((role) => role.toLowerCase() === "admin")) {
          router.replace(current.roles.some((role) => role.toLowerCase() === "officer") ? "/officer" : "/");
          return;
        }
        if (active) setUser(current);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          sessionStorage.removeItem("token");
          sessionStorage.removeItem("user");
          router.replace("/login");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [router]);

  function logout() {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    router.replace("/login");
  }

  const authorized = !loading && !!user;

  return (
    <AdminAuthContext.Provider value={authorized}>
      <div className="relative min-h-screen bg-[#F6F7F5]">
        <div aria-hidden={!authorized} className={authorized ? "min-h-screen bg-[#F6F7F5] md:flex" : "invisible min-h-screen bg-[#F6F7F5] md:flex pointer-events-none"}>
      <aside className="flex w-full flex-col bg-[#172C46] text-white md:fixed md:inset-y-0 md:w-64">
        <div className="border-b border-white/10 px-7 py-7"><p className="text-xl font-bold tracking-[0.16em]">ORION BANK</p><p className="mt-1 text-[10px] tracking-[0.22em] text-slate-300">ADMIN PORTAL</p></div>
        <nav className="flex gap-1 overflow-x-auto px-3 py-4 md:flex-1 md:flex-col">
          {navigation.map(([label, href]) => {
            const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
            return <Link key={href} href={href} className={`shrink-0 rounded-lg px-4 py-3 text-sm transition ${active ? "bg-white font-semibold text-[#172C46]" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>{label}</Link>;
          })}
        </nav>
        <div className="hidden border-t border-white/10 p-5 md:block"><p className="truncate text-sm font-medium">{user.fullName}</p><p className="mt-1 truncate text-xs text-slate-400">{user.email}</p><button onClick={logout} className="mt-5 text-sm text-slate-300 hover:text-white">Sign out</button></div>
      </aside>
      <main className="min-w-0 flex-1 md:ml-64">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5 md:px-10"><div><p className="text-xs font-medium tracking-[0.16em] text-[#78917E]">ADMINISTRATION</p><p className="mt-1 text-sm font-medium text-[#172C46]">{user.fullName}</p></div><button onClick={logout} className="text-sm text-slate-500 hover:text-[#172C46] md:hidden">Sign out</button></header>
        <div className="mx-auto max-w-7xl p-6 md:p-10">{children}</div>
        </main>
        </div>
        {!authorized && <main className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-[#F6F7F5]"><p className="text-sm text-slate-500">Loading Admin portal...</p></main>}
      </div>
    </AdminAuthContext.Provider>
  );
}
