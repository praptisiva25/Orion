"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { bankingApi, ApiError } from "@/lib/api";
import type { AuthUser } from "@/types/banking";

const navigation = [
  { label: "Dashboard", href: "/officer", icon: "◫" },
  { label: "Assigned Tickets", href: "/officer/tickets", icon: "▣" },
  { label: "KYC Reviews", href: "/officer/kyc", icon: "◇" },
  { label: "Applications", href: "/officer/applications", icon: "◉" },
];

export default function OfficerShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initialize() {
      if (!sessionStorage.getItem("token")) {
        router.replace("/login");
        return;
      }

      try {
        const currentUser = await bankingApi.getCurrentUser();

        if (!currentUser.roles.includes("Officer")) {
          router.replace("/");
          return;
        }

        setUser(currentUser);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          sessionStorage.removeItem("token");
          sessionStorage.removeItem("user");
          router.replace("/login");
        }
      } finally {
        setLoading(false);
      }
    }

    initialize();
  }, [router]);

  function logout() {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    router.replace("/login");
  }

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F6F7F5]">
        <p className="text-sm text-slate-500">Loading officer portal...</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7F5] md:flex">
      <aside className="flex w-full flex-col bg-[#172C46] text-white md:fixed md:inset-y-0 md:w-64">
        <div className="border-b border-white/10 px-7 py-7">
          <p className="text-xl font-bold tracking-[0.16em]">ORION BANK</p>
          <p className="mt-1 text-[10px] tracking-[0.22em] text-slate-300">
            OFFICER PORTAL
          </p>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 py-4 md:flex-1 md:flex-col">
          {navigation.map((item) => {
            const active =
              item.href === "/officer"
                ? pathname === "/officer"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm transition ${
                  active
                    ? "bg-white font-semibold text-[#172C46]"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden border-t border-white/10 p-5 md:block">
          <p className="truncate text-sm font-medium">{user.fullName}</p>
          <p className="mt-1 text-xs text-slate-400">{user.email}</p>
          <p className="mt-2 text-xs text-[#A8C5B5]">Officer account</p>
          <button
            onClick={logout}
            className="mt-5 text-sm text-slate-300 hover:text-white"
          >
            Sign out →
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 md:ml-64">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-6 md:px-10">
          <div>
            <h1 className="text-2xl font-semibold text-[#172C46]">
              {title}
            </h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E5ECE8] font-semibold text-[#345B4A]">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-[#172C46]">
                {user.fullName}
              </p>
              <p className="text-xs text-slate-500">Officer</p>
            </div>
            <button
              onClick={logout}
              className="ml-2 text-sm text-slate-500 hover:text-[#172C46] md:hidden"
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl p-6 md:p-10">{children}</div>
      </main>
    </div>
  );
}
