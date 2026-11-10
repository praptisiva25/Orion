"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OfficerShell from "@/components/officer/OfficerShell";
import { bankingApi } from "@/lib/api";
import type { KycDocument, SupportTicket } from "@/types/banking";

export default function OfficerDashboard() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [documents, setDocuments] = useState<KycDocument[]>([]);
  const [applications, setApplications] = useState<Awaited<ReturnType<typeof bankingApi.getOfficerApplications>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      const results = await Promise.allSettled([
        bankingApi.getOfficerTickets(),
        bankingApi.getAllKycDocuments(),
        bankingApi.getOfficerApplications(),
      ]);

      if (results[0].status === "fulfilled") {
        setTickets(results[0].value);
      }

      if (results[1].status === "fulfilled") {
        setDocuments(results[1].value);
      }

      if (results[2].status === "fulfilled") {
        setApplications(results[2].value);
      }

      if (results.some((result) => result.status === "rejected")) {
        setError("Some dashboard information could not be loaded.");
      }

      setLoading(false);
    }

    loadDashboard();
  }, []);

  const openTickets = tickets.filter((ticket) =>
    ["open", "inprogress", "in progress"].includes(
      ticket.status.toLowerCase()
    )
  ).length;

  const pendingKyc = documents.filter(
    (document) => document.status.toLowerCase() === "pending"
  ).length;

  const recentTickets = [...tickets]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() -
        new Date(a.updatedAt).getTime()
    )
    .slice(0, 5);

  const cards = [
    {
      label: "Assigned tickets",
      value: tickets.length,
      detail: "Tickets assigned to you",
      href: "/officer/tickets",
    },
    {
      label: "Open tickets",
      value: openTickets,
      detail: "Require attention",
      href: "/officer/tickets",
    },
    {
      label: "KYC documents",
      value: documents.length,
      detail: "Documents submitted",
      href: "/officer/kyc",
    },
    {
      label: "Pending KYC",
      value: pendingKyc,
      detail: "Awaiting review",
      href: "/officer/kyc",
    },
    {
      label: "Pending applications",
      value: applications.length,
      detail: "Awaiting review",
      href: "/officer/applications",
    },
  ];

  return (
    <OfficerShell
      title="Officer Dashboard"
      subtitle="Your assigned work and review activity."
    >
      {error && (
        <p className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </p>
      )}

      <section className="mb-8 rounded-2xl bg-[#172C46] p-7 text-white md:p-9">
        <p className="text-xs tracking-[0.2em] text-slate-300">
          ORION BANK · OPERATIONS
        </p>
        <h2 className="mt-4 text-2xl font-semibold md:text-3xl">
          Welcome to your workspace.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
          Manage customer support requests, review submitted KYC documents,
          and keep customer operations moving.
        </p>
      </section>

      <section>
        <h2 className="mb-5 text-lg font-semibold text-[#172C46]">
          Work overview
        </h2>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
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
              <p className="mt-2 text-xs text-slate-400">{card.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-[#172C46]">
                Recently updated tickets
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Your latest assigned support requests.
              </p>
            </div>
            <Link
              href="/officer/tickets"
              className="text-sm font-medium text-[#456B58] hover:underline"
            >
              View all
            </Link>
          </div>

          {loading ? (
            <p className="mt-6 text-sm text-slate-500">Loading tickets...</p>
          ) : recentTickets.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">
              No tickets are currently assigned to you.
            </p>
          ) : (
            <div className="mt-5 divide-y divide-slate-100">
              {recentTickets.map((ticket) => (
                <div key={ticket.id} className="py-4 first:pt-0 last:pb-0">
                  <p className="font-medium text-[#172C46]">
                    {ticket.subject}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Ticket #{ticket.id}</span>
                    <span>Status: {ticket.status}</span>
                    <span>Priority: {ticket.priority}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-[#172C46]">Quick actions</h2>
          <div className="mt-5 space-y-3">
            <Link
              href="/officer/tickets"
              className="block rounded-lg border border-slate-100 px-4 py-4 text-sm font-medium text-[#172C46] hover:bg-[#F8FAF8]"
            >
              Manage assigned tickets →
            </Link>
            <Link
              href="/officer/kyc"
              className="block rounded-lg border border-slate-100 px-4 py-4 text-sm font-medium text-[#172C46] hover:bg-[#F8FAF8]"
            >
              Review KYC documents →
            </Link>
            <Link
              href="/officer/applications"
              className="block rounded-lg border border-slate-100 px-4 py-4 text-sm font-medium text-[#172C46] hover:bg-[#F8FAF8]"
            >
              Review applications →
            </Link>
          </div>
        </div>
      </section>
    </OfficerShell>
  );
}
