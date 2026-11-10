"use client";

import { useEffect, useState } from "react";
import CustomerShell from "@/components/customer/CustomerShell";
import { bankingApi } from "@/lib/api";
import type { KycDocument } from "@/types/banking";

export default function KycPage() {
  const [documents, setDocuments] = useState<KycDocument[]>([]);
  const [documentType, setDocumentType] = useState("PAN");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadDocuments() {
    const data = await bankingApi.getKycDocuments();
    setDocuments(data);
  }

  useEffect(() => {
    loadDocuments()
      .catch((err) => setError(err.message || "Unable to load documents."))
      .finally(() => setLoading(false));
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();

    if (!file) {
      setError("Please select a document.");
      return;
    }

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("Only PDF, JPG, JPEG and PNG files are accepted.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("The file must be smaller than 5 MB.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");

    try {
      await bankingApi.uploadKyc(file, documentType);
      setMessage("Document uploaded successfully.");
      setFile(null);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function statusStyle(status: string) {
    switch (status.toLowerCase()) {
      case "verified":
        return "bg-green-50 text-green-700";
      case "rejected":
        return "bg-red-50 text-red-700";
      default:
        return "bg-amber-50 text-amber-700";
    }
  }

  return (
    <CustomerShell
      title="KYC Documents"
      subtitle="Submit and track your identity verification documents."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <form
          onSubmit={handleUpload}
          className="rounded-2xl border border-slate-100 bg-white p-7 shadow-sm"
        >
          <h2 className="font-semibold text-[#172C46]">
            Upload a document
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Upload a clear copy of your PAN or Aadhaar document.
          </p>

          <label className="mt-6 block text-sm text-slate-600">
            Document type
          </label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#6B8E80]"
          >
            <option value="PAN">PAN Card</option>
            <option value="Aadhaar">Aadhaar Card</option>
          </select>

          <label className="mt-5 block text-sm text-slate-600">
            Choose file
          </label>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#EAF0EC] file:px-3 file:py-2 file:text-xs file:font-medium file:text-[#345B4A]"
          />

          <p className="mt-2 text-xs text-slate-400">
            PDF, JPG, JPEG or PNG · Maximum size 5 MB
          </p>

          {file && (
            <p className="mt-3 break-all text-xs text-slate-500">
              Selected: {file.name}
            </p>
          )}

          {message && (
            <p className="mt-4 text-sm text-green-700">{message}</p>
          )}
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <button
            disabled={uploading}
            className="mt-6 w-full rounded-lg bg-[#172C46] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload document"}
          </button>
        </form>

        <section className="rounded-2xl border border-slate-100 bg-white p-7 shadow-sm">
          <h2 className="font-semibold text-[#172C46]">
            Submitted documents
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Review the current status of your submitted documents.
          </p>

          {loading ? (
            <p className="mt-6 text-sm text-slate-500">Loading documents...</p>
          ) : documents.length === 0 ? (
            <p className="mt-8 text-center text-sm text-slate-500">
              You have not uploaded any documents yet.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {documents.map((document) => (
                <div
                  key={document.id}
                  className="rounded-xl border border-slate-100 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-[#172C46]">
                        {document.documentType}
                      </p>
                      <p className="mt-1 max-w-64 break-all text-xs text-slate-400">
                        {document.fileName}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyle(
                        document.status
                      )}`}
                    >
                      {document.status}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    Uploaded{" "}
                    {new Date(document.uploadedAt).toLocaleDateString("en-IN")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </CustomerShell>
  );
}