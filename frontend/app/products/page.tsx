"use client";

import { useEffect, useState } from "react";
import CustomerShell from "@/components/customer/CustomerShell";
import { bankingApi } from "@/lib/api";
import type { BankingProduct } from "@/types/banking";

export default function ProductsPage() {
  const [products, setProducts] = useState<BankingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BankingProduct | null>(null);
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    bankingApi
      .getProducts()
      .then(setProducts)
      .catch((err) => setError(err.message || "Unable to load products."))
      .finally(() => setLoading(false));
  }, []);

  async function submitApplication(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      await bankingApi.createApplication({
        bankingProductId: selected.id,
        requestedAmount: Number(amount),
        remarks,
      });

      setMessage(`Your application for ${selected.name} was submitted.`);
      setSelected(null);
      setAmount("");
      setRemarks("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Application failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CustomerShell
      title="Banking Products"
      subtitle="Explore products designed around your financial needs."
    >
      {message && (
        <p className="mb-5 rounded-lg bg-green-50 p-4 text-sm text-green-700">
          {message}
        </p>
      )}
      {error && (
        <p className="mb-5 rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading products...</p>
      ) : products.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-500">
          No banking products are currently available.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {products.map((product) => (
            <article
              key={product.id}
              className="rounded-2xl border border-slate-100 bg-white p-7 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="rounded-full bg-[#EAF0EC] px-3 py-1 text-xs font-medium text-[#456B58]">
                  {product.category}
                </span>
                <span className="text-xs text-slate-400">
                  ORION BANK
                </span>
              </div>

              <h2 className="mt-5 text-xl font-semibold text-[#172C46]">
                {product.name}
              </h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">
                {product.description}
              </p>

              <div className="my-6 grid grid-cols-2 gap-4 border-y border-slate-100 py-5">
                <div>
                  <p className="text-xs text-slate-400">Interest rate</p>
                  <p className="mt-1 text-lg font-semibold text-[#172C46]">
                    {product.interestRate}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Minimum amount</p>
                  <p className="mt-1 text-lg font-semibold text-[#172C46]">
                    ₹{product.minimumAmount.toLocaleString("en-IN")}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelected(product);
                  setAmount(String(product.minimumAmount));
                  setError("");
                  setMessage("");
                }}
                className="w-full rounded-lg bg-[#172C46] px-5 py-3 text-sm font-medium text-white hover:bg-[#243F60]"
              >
                Apply now
              </button>
            </article>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submitApplication}
            className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#172C46]">
                  Apply for {selected.name}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Enter the requested amount and additional details.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-xl text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <label className="mt-6 block text-sm text-slate-600">
              Requested amount (₹)
            </label>
            <input
              type="number"
              min={selected.minimumAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#6B8E80]"
            />

            <label className="mt-5 block text-sm text-slate-600">
              Remarks (optional)
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              maxLength={1000}
              className="mt-2 w-full rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#6B8E80]"
            />

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <button
              disabled={submitting}
              className="mt-6 w-full rounded-lg bg-[#172C46] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit application"}
            </button>
          </form>
        </div>
      )}
    </CustomerShell>
  );
}