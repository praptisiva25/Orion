"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { bankingApi, ApiError } from "@/lib/api";
import type { AuthUser } from "@/types/banking";

const navigation = [
  { label: "Overview", href: "/", icon: "◫" },
  { label: "My Profile", href: "/profile", icon: "○" },
  { label: "Banking Products", href: "/products", icon: "▤" },
  { label: "Applications", href: "/applications", icon: "▣" },
  { label: "KYC Documents", href: "/kyc", icon: "◇" },
  { label: "Notifications", href: "/notifications", icon: "♧" },
  { label: "Support", href: "/support", icon: "?" },
];

export default function CustomerShell({
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
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initialize() {
      if (!sessionStorage.getItem("token")) {
        router.replace("/login");
        return;
      }

      try {
        const [currentUser, unreadData] = await Promise.all([
          bankingApi.getCurrentUser(),
          bankingApi.getUnreadCount(),
        ]);

        setUser(currentUser);
        setUnread(unreadData.unreadCount);
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
        <p className="text-sm text-[#64748B]">Loading your account...</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F7F5] md:flex">
      <aside className="flex w-full flex-col bg-[#172C46] text-white md:fixed md:inset-y-0 md:w-64">
        <div className="border-b border-white/10 px-7 py-7">
          <p className="text-xl font-bold tracking-[0.16em]">ORION BANK</p>
          <p className="mt-1 text-[10px] tracking-[0.22em] text-slate-300">
            BANKING, REIMAGINED.
          </p>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 py-4 md:flex-1 md:flex-col">
          {navigation.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm transition ${
                  active
                    ? "bg-white text-[#172C46] font-semibold"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
                {item.href === "/notifications" && unread > 0 && (
                  <span className="ml-auto rounded-full bg-[#A8C5B5] px-2 py-0.5 text-xs text-[#172C46]">
                    {unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden border-t border-white/10 p-5 md:block">
          <p className="truncate text-sm font-medium">{user.fullName}</p>
          <p className="mt-1 truncate text-xs text-slate-400">{user.email}</p>
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
              <p className="text-xs text-slate-500">Customer account</p>
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