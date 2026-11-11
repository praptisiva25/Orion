
"use client";

import { useEffect, useMemo, useState } from "react";
import { bankingApi } from "@/lib/api";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";
import type { Application } from "@/types/banking";

export default function AdminApplicationsPage() {
  const authorized = useAdminAuth();

  const [applications, setApplications] = useState<Application[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<Application | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Application | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setApplications(await bankingApi.getAdminApplications());
  }

  useEffect(() => {
    if (!authorized) return;

    let active = true;

    bankingApi.getAdminApplications()
      .then((items) => {
        if (active) setApplications(items);
      })
      .catch((err) => {
        if (active) setError(err.message || "Unable to load applications.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authorized]);

  const visible = useMemo(
    () =>
      applications.filter((application) => {
        const matchesStatus =
          filter === "All" ||
          application.status.toLowerCase() === filter.toLowerCase();

        const value =
          `${application.customerName ?? ""} ${application.customerEmail ?? ""} ${application.product}`.toLowerCase();

        const day = application.appliedAt.slice(0, 10);

        return (
          matchesStatus &&
          value.includes(search.toLowerCase()) &&
          (!fromDate || day >= fromDate) &&
          (!toDate || day <= toDate)
        );
      }),
    [applications, filter, search, fromDate, toDate]
  );

  async function review(
    application: Application,
    status: "Approved" | "Rejected",
    reviewReason?: string
  ) {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await bankingApi.reviewApplication(
        application.id,
        status,
        reviewReason
      );

      setMessage(
        `Application #${application.id} was ${status.toLowerCase()}.`
      );

      setSelected(null);
      setRejectTarget(null);
      setReason("");

      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update application."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-3xl font-semibold text-[#172C46]">
          Application Management
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Review customer applications and their decision history.
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {message}
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-5">
          <input
            placeholder="Search customer or product"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-56 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option>All</option>
            <option>Pending</option>
            <option>Approved</option>
            <option>Rejected</option>
          </select>

          <input
            type="date"
            aria-label="Applied from"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />

          <input
            type="date"
            aria-label="Applied to"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        {loading ? (
          <p className="p-8 text-sm text-slate-500">
            Loading applications...
          </p>
        ) : !visible.length ? (
          <p className="p-10 text-center text-sm text-slate-500">
            No applications match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#F8F9F7] text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-4">Customer</th>
                  <th className="px-5 py-4">Product</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Applied</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Details</th>
                </tr>
              </thead>

              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-5 py-4">
                      <p className="font-medium text-[#172C46]">
                        {item.customerName ?? `Customer #${item.userId}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.customerEmail}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-[#172C46]">
                      {item.product}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      ₹{item.requestedAmount.toLocaleString("en-IN")}
                    </td>

                    <td className="px-5 py-4 text-slate-500">
                      {new Date(item.appliedAt).toLocaleDateString("en-IN")}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${
                          item.status === "Approved"
                            ? "bg-green-50 text-green-700"
                            : item.status === "Rejected"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <button
                        onClick={() => setSelected(item)}
                        className="font-medium text-[#456B58] hover:underline"
                      >
                        View details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <section
            className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-[#78917E]">
                  Application #{selected.id}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-[#172C46]">
                  {selected.product}
                </h2>
              </div>

              <button
                onClick={() => setSelected(null)}
                className="text-sm text-slate-500"
              >
                Close
              </button>
            </div>

            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              {[
                ["Customer", selected.customerName ?? `#${selected.userId}`],
                ["Email", selected.customerEmail ?? "—"],
                ["Requested amount", `₹${selected.requestedAmount.toLocaleString("en-IN")}`],
                ["Status", selected.status],
                ["Applied", new Date(selected.appliedAt).toLocaleString("en-IN")],
                ["Reviewed", selected.reviewedAt ? new Date(selected.reviewedAt).toLocaleString("en-IN") : "Not reviewed"],
                ["Reviewer", selected.reviewerName ?? "—"],
                ["Customer remarks", selected.remarks ?? "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-[#F8FAF8] p-4">
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-1 text-sm text-[#172C46]">{value}</dd>
                </div>
              ))}
            </dl>

            {selected.reviewReason && (
              <p className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
                Review reason: {selected.reviewReason}
              </p>
            )}

            {selected.status === "Pending" && (
              <div className="mt-5 flex justify-end gap-3">
                <button
                  disabled={saving}
                  onClick={() => setRejectTarget(selected)}
                  className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700"
                >
                  Reject
                </button>

                <button
                  disabled={saving}
                  onClick={() => review(selected, "Approved")}
                  className="rounded-lg bg-[#172C46] px-4 py-2 text-sm text-white"
                >
                  {saving ? "Saving..." : "Approve"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-[#172C46]">
              Reject application #{rejectTarget.id}
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              This reason is stored and shared with the customer.
            </p>

            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={4}
              className="mt-4 w-full rounded-lg border border-slate-200 p-3 text-sm"
            />

            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setRejectTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
              >
                Cancel
              </button>

              <button
                disabled={saving || !reason.trim()}
                onClick={() => review(rejectTarget, "Rejected", reason.trim())}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Confirm rejection
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
