"use client";

import { useEffect, useState } from "react";
import { bankingApi } from "@/lib/api";
import type { BankingProduct } from "@/types/banking";

type ProductForm = { name: string; category: string; description: string; interestRate: string; minimumAmount: string };
const emptyForm: ProductForm = { name: "", category: "Loan", description: "", interestRate: "0", minimumAmount: "1" };

export default function AdminProductsPage() {
  const [products, setProducts] = useState<BankingProduct[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editing, setEditing] = useState<BankingProduct | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() { setProducts(await bankingApi.getAdminProducts()); }
  useEffect(() => {
    let active = true;
    bankingApi.getAdminProducts().then((items) => { if (active) setProducts(items); })
      .catch((err) => { if (active) setError(err.message || "Unable to load products."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function openCreate() { setEditing(null); setForm(emptyForm); setShowForm(true); setError(""); }
  function openEdit(product: BankingProduct) {
    setEditing(product);
    setForm({ name: product.name, category: product.category, description: product.description, interestRate: String(product.interestRate), minimumAmount: String(product.minimumAmount) });
    setShowForm(true); setError("");
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); setMessage("");
    const interestRate = Number(form.interestRate); const minimumAmount = Number(form.minimumAmount);
    if (!form.name.trim() || !form.category.trim() || !form.description.trim() || interestRate < 0 || interestRate > 100 || minimumAmount <= 0) {
      setError("Provide product details with an interest rate from 0 to 100 and a positive minimum amount."); return;
    }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), category: form.category.trim(), description: form.description.trim(), interestRate, minimumAmount };
      if (editing) await bankingApi.updateAdminProduct(editing.id, payload);
      else await bankingApi.createAdminProduct(payload);
      setMessage(editing ? "Product updated." : "Product created."); setShowForm(false); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save product."); }
    finally { setSaving(false); }
  }

  async function toggle(product: BankingProduct) {
    setError(""); setMessage("");
    try { await bankingApi.setAdminProductStatus(product.id, !product.isActive); setMessage(`${product.name} was ${product.isActive ? "deactivated" : "activated"}.`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to update product."); }
  }

  const input = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#6B8E80]";
  const categories = [...new Set(["Loan", "Account", "Deposit", ...products.map((product) => product.category)].filter(Boolean))].sort();
  return <div><div className="mb-7 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-semibold text-[#172C46]">Banking Products</h1><p className="mt-2 text-sm text-slate-500">Manage customer-facing product details and availability.</p></div><button onClick={openCreate} className="rounded-lg bg-[#172C46] px-4 py-3 text-sm font-medium text-white">Create product</button></div>
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
    {loading ? <p className="rounded-xl bg-white p-8 text-sm text-slate-500">Loading products...</p> : !products.length ? <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500">No products have been created.</p> : <div className="grid gap-5 lg:grid-cols-2">{products.map((product) => <article key={product.id} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"><div className="flex items-start justify-between"><div><span className="rounded-full bg-[#EAF0EC] px-3 py-1 text-xs text-[#456B58]">{product.category}</span><h2 className="mt-4 text-xl font-semibold text-[#172C46]">{product.name}</h2></div><span className={`rounded-full px-3 py-1 text-xs ${product.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>{product.isActive ? "Active" : "Inactive"}</span></div><p className="mt-2 text-sm leading-6 text-slate-500">{product.description}</p><div className="mt-5 grid grid-cols-2 gap-3 border-y border-slate-100 py-4 text-sm"><div><p className="text-xs text-slate-400">Interest rate</p><p className="mt-1 font-medium text-[#172C46]">{product.interestRate}%</p></div><div><p className="text-xs text-slate-400">Minimum amount</p><p className="mt-1 font-medium text-[#172C46]">₹{product.minimumAmount.toLocaleString("en-IN")}</p></div></div><div className="mt-4 flex gap-4"><button onClick={() => openEdit(product)} className="text-sm font-medium text-[#456B58] hover:underline">Edit details</button><button onClick={() => toggle(product)} className="text-sm font-medium text-[#456B58] hover:underline">{product.isActive ? "Deactivate" : "Activate"}</button></div></article>)}</div>}
    {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowForm(false)}><form onSubmit={save} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold text-[#172C46]">{editing ? "Edit product" : "Create product"}</h2><button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500">Close</button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-600">Name<input required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} /></label><label className="text-sm text-slate-600">Category<select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={input}>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label className="text-sm text-slate-600">Interest rate (%)<input required type="number" min="0" max="100" step="0.01" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} className={input} /></label><label className="text-sm text-slate-600">Minimum amount<input required type="number" min="0.01" step="0.01" value={form.minimumAmount} onChange={(e) => setForm({ ...form, minimumAmount: e.target.value })} className={input} /></label><label className="text-sm text-slate-600 sm:col-span-2">Description<textarea required maxLength={1000} rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} /></label></div>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}<button disabled={saving} className="mt-5 rounded-lg bg-[#172C46] px-5 py-3 text-sm text-white disabled:opacity-50">{saving ? "Saving..." : editing ? "Save changes" : "Create product"}</button></form></div>}
  </div>;
}
