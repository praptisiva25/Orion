"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CustomerShell from "@/components/customer/CustomerShell";
import { bankingApi } from "@/lib/api";
import type {
  Application,
  CustomerProfile,
  KycDocument,
  Notification,
} from "@/types/banking";

export default function DashboardPage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [documents, setDocuments] = useState<KycDocument[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const results = await Promise.allSettled([
          bankingApi.getProfile(),
          bankingApi.getApplications(),
          bankingApi.getKycDocuments(),
          bankingApi.getNotifications(),
        ]);

        if (results[0].status === "fulfilled") {
          setProfile(results[0].value);
        }

        if (results[1].status === "fulfilled") {
          setApplications(results[1].value);
        }

        if (results[2].status === "fulfilled") {
          setDocuments(results[2].value);
        }

        if (results[3].status === "fulfilled") {
          setNotifications(results[3].value);
        }

        const failed = results.find(
          (result) => result.status === "rejected"
        );

        if (failed?.status === "rejected") {
          setError(
            failed.reason instanceof Error
              ? failed.reason.message
              : "Some dashboard information could not be loaded."
          );
        }
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const activeApplications = applications.filter((application) =>
    ["pending", "in review", "inprogress", "in progress"].includes(
      application.status.toLowerCase()
    )
  ).length;

  const latestKyc = [...documents].sort(
    (a, b) =>
      new Date(b.uploadedAt).getTime() -
      new Date(a.uploadedAt).getTime()
  )[0];

  const unreadNotifications = notifications.filter(
    (notification) => !notification.isRead
  ).length;

  const recentActivity = [
    ...applications.map((application) => ({
      id: `application-${application.id}`,
      title: `${application.product} application`,
      description: `Status: ${application.status}`,
      date: application.appliedAt,
    })),
    ...documents.map((document) => ({
      id: `kyc-${document.id}`,
      title: `${document.documentType} document uploaded`,
      description: `Status: ${document.status}`,
      date: document.uploadedAt,
    })),
    ...notifications.map((notification) => ({
      id: `notification-${notification.id}`,
      title: notification.title,
      description: notification.message,
      date: notification.createdAt,
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    .slice(0, 5);

  const cards = [
    {
      label: "Total applications",
      value: applications.length,
      description: "Applications submitted",
      href: "/applications",
    },
    {
      label: "In progress",
      value: activeApplications,
      description: "Awaiting an update",
      href: "/applications",
    },
    {
      label: "KYC documents",
      value: documents.length,
      description: latestKyc
        ? `Latest: ${latestKyc.status}`
        : "No documents uploaded",
      href: "/kyc",
    },
    {
      label: "Unread notifications",
      value: unreadNotifications,
      description: "Updates waiting for you",
      href: "/notifications",
    },
  ];

  return (
    <CustomerShell
      title="Overview"
      subtitle="Here's an overview of your banking activity."
    >
      {error && (
        <p className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </p>
      )}

      <section className="mb-8 rounded-2xl bg-[#172C46] p-7 text-white md:p-9">
        <p className="text-xs tracking-[0.2em] text-slate-300">
          ORION BANK CUSTOMER PORTAL
        </p>
        <h2 className="mt-4 max-w-xl text-2xl font-semibold leading-snug md:text-3xl">
          Welcome back{profile?.fullName ? `, ${profile.fullName}` : ""}.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
          Your finances. Your future. Manage your banking services and stay
          updated on your applications in one place.
        </p>
        <Link
          href="/products"
          className="mt-6 inline-block rounded-lg bg-white px-5 py-3 text-sm font-semibold text-[#172C46] hover:bg-slate-100"
        >
          Explore banking products
        </Link>
      </section>

      <section>
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-[#172C46]">
            Account overview
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            A quick look at your banking activity.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-3 text-3xl font-semibold text-[#172C46]">
                {loading ? "—" : card.value}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {loading ? "Loading..." : card.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-[#172C46]">Recent activity</h2>
          <p className="mt-1 text-sm text-slate-500">
            Your latest account updates.
          </p>

          {loading ? (
            <p className="mt-6 text-sm text-slate-500">
              Loading activity...
            </p>
          ) : recentActivity.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">
              No recent activity to display.
            </p>
          ) : (
            <div className="mt-5 divide-y divide-slate-100">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="py-4 first:pt-0 last:pb-0"
                >
                  <p className="text-sm font-medium text-[#172C46]">
                    {activity.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {activity.description}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    {new Date(activity.date).toLocaleDateString("en-IN")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-[#172C46]">Quick actions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Common banking tasks.
          </p>

          <div className="mt-5 space-y-3">
            {[
              ["Update profile", "/profile"],
              ["Browse products", "/products"],
              ["Upload KYC documents", "/kyc"],
              ["Contact support", "/support"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-4 text-sm font-medium text-[#172C46] transition hover:border-[#A8C5B5] hover:bg-[#F8FAF8]"
              >
                {label}
                <span className="text-slate-400">→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </CustomerShell>
  );
}