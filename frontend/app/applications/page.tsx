"use client";

import { useEffect, useState } from "react";
import CustomerShell from "@/components/customer/CustomerShell";
import { bankingApi } from "@/lib/api";
import type { Application } from "@/types/banking";

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  const styles: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700",
    approved: "bg-green-50 text-green-700",
    rejected: "bg-red-50 text-red-700",
    "in review": "bg-blue-50 text-blue-700",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        styles[normalized] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    bankingApi
      .getApplications()
      .then(setApplications)
      .catch((err) => setError(err.message || "Unable to load applications."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <CustomerShell
      title="My Applications"
      subtitle="Track the progress of your banking product applications."
    >
      {error && <p className="mb-5 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="font-semibold text-[#172C46]">
            Application history
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {applications.length} application(s)
          </p>
        </div>

        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading applications...</p>
        ) : applications.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-medium text-[#172C46]">
              No applications yet
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Explore our banking products to get started.
            </p>
            <a
              href="/products"
              className="mt-5 inline-block rounded-lg bg-[#172C46] px-5 py-3 text-sm text-white"
            >
              Explore products
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="bg-[#F8F9F7] text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4">Product</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Applied on</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((application) => (
                  <tr
                    key={application.id}
                    className="border-t border-slate-100"
                  >
                    <td className="px-6 py-5 font-medium text-[#172C46]">
                      {application.product}
                    </td>
                    <td className="px-6 py-5 text-slate-600">
                      ₹{application.requestedAmount.toLocaleString("en-IN")}
                    </td>
                    <td className="px-6 py-5 text-slate-600">
                      {new Date(application.appliedAt).toLocaleDateString(
                        "en-IN"
                      )}
                    </td>
                    <td className="px-6 py-5">
                      <StatusBadge status={application.status} />
                    </td>
                    <td className="max-w-48 px-6 py-5 text-slate-500">
                      {application.remarks || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CustomerShell>
  );
}