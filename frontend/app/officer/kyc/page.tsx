"use client";

import { useEffect, useState } from "react";
import OfficerShell from "@/components/officer/OfficerShell";
import { bankingApi } from "@/lib/api";
import type { KycDocument } from "@/types/banking";

export default function OfficerKycPage() {
  const [documents, setDocuments] = useState<KycDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [filter, setFilter] = useState("Pending");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadDocuments() {
    const data = await bankingApi.getAllKycDocuments();
    setDocuments(data);
  }

  useEffect(() => {
    loadDocuments()
      .catch((err) => setError(err.message || "Unable to load documents."))
      .finally(() => setLoading(false));
  }, []);

  async function reviewDocument(id: number, status: "Verified" | "Rejected") {
    setReviewingId(id);
    setError("");
    setMessage("");

    try {
      await bankingApi.reviewKycDocument(id, status);
      setMessage(`Document marked as ${status.toLowerCase()}.`);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed.");
    } finally {
      setReviewingId(null);
    }
  }

  const filteredDocuments =
    filter === "All"
      ? documents
      : documents.filter(
          (document) =>
            document.status.toLowerCase() === filter.toLowerCase()
        );

  return (
    <OfficerShell
      title="KYC Reviews"
      subtitle="Review customer-submitted identity documents."
    >
      {error && (
        <p className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {message && (
        <p className="mb-5 rounded-lg bg-green-50 p-4 text-sm text-green-700">
          {message}
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="font-semibold text-[#172C46]">
              Submitted KYC documents
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {documents.length} document(s) in the system
            </p>
          </div>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none"
          >
            <option value="Pending">Pending review</option>
            <option value="Verified">Verified</option>
            <option value="Rejected">Rejected</option>
            <option value="All">All documents</option>
          </select>
        </div>

        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading documents...</p>
        ) : filteredDocuments.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            No documents found for this filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-sm">
              <thead className="bg-[#F8F9F7] text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4">Document</th>
                  <th className="px-6 py-4">Customer ID</th>
                  <th className="px-6 py-4">Uploaded</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Review action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((document) => {
                  const pending =
                    document.status.toLowerCase() === "pending";

                  return (
                    <tr
                      key={document.id}
                      className="border-t border-slate-100"
                    >
                      <td className="px-6 py-5">
                        <p className="font-medium text-[#172C46]">
                          {document.documentType}
                        </p>
                        <p className="mt-1 max-w-56 break-all text-xs text-slate-400">
                          {document.fileName}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          Document #{document.id}
                        </p>
                      </td>

                      <td className="px-6 py-5 text-slate-600">
                        {document.userId ?? "—"}
                      </td>

                      <td className="px-6 py-5 text-slate-500">
                        {new Date(document.uploadedAt).toLocaleDateString(
                          "en-IN"
                        )}
                      </td>

                      <td className="px-6 py-5">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            document.status.toLowerCase() === "verified"
                              ? "bg-green-50 text-green-700"
                              : document.status.toLowerCase() === "rejected"
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {document.status}
                        </span>
                      </td>

                      <td className="px-6 py-5">
                        {pending ? (
                          <div className="flex gap-2">
                            <button
                              disabled={reviewingId === document.id}
                              onClick={() =>
                                reviewDocument(document.id, "Verified")
                              }
                              className="rounded-md bg-[#EAF0EC] px-3 py-2 text-xs font-medium text-[#345B4A] hover:bg-[#DCE8E0] disabled:opacity-50"
                            >
                              Verify
                            </button>
                            <button
                              disabled={reviewingId === document.id}
                              onClick={() =>
                                reviewDocument(document.id, "Rejected")
                              }
                              className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            Reviewed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-5 text-xs leading-5 text-slate-400">
        Review decisions update the document's application status. Marking a
        document Verified records the review decision; it does not independently
        establish the customer's identity.
      </p>
    </OfficerShell>
  );
}