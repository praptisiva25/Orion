"use client";

import { useEffect, useState } from "react";
import CustomerShell from "@/components/customer/CustomerShell";
import { bankingApi, ApiError } from "@/lib/api";
import type { CustomerProfile } from "@/types/banking";

export default function ProfilePage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [form, setForm] = useState({
    phoneNumber: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    dateOfBirth: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    bankingApi
      .getProfile()
      .then((data) => {
        setProfile(data);
        setForm({
          phoneNumber: data.phoneNumber ?? "",
          address: data.address ?? "",
          city: data.city ?? "",
          state: data.state ?? "",
          postalCode: data.postalCode ?? "",
          dateOfBirth: data.dateOfBirth?.slice(0, 10) ?? "",
        });
      })
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 404)) {
          setError(err.message || "Unable to load profile.");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function updateField(name: string, value: string) {
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const result = await bankingApi.updateProfile({
        ...form,
        dateOfBirth: form.dateOfBirth || null,
      });
      setProfile(result.profile);
      setMessage("Your profile has been updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  const fieldClass =
    "mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-[#25354A] outline-none focus:border-[#6B8E80]";

  return (
    <CustomerShell
      title="My Profile"
      subtitle="Manage your personal and contact information."
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading profile...</p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:p-8"
        >
          <div className="mb-7 border-b border-slate-100 pb-5">
            <h2 className="font-semibold text-[#172C46]">
              Personal information
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Your registered account details.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm text-slate-600">Full name</label>
                <input
                  value={profile?.fullName ?? ""}
                  readOnly
                  className={fieldClass}
                />
              </div>
              <div>
                <label className="text-sm text-slate-600">Email address</label>
                <input
                  value={profile?.email ?? ""}
                  readOnly
                  className={fieldClass}
                />
              </div>
            </div>
          </div>

          <h2 className="font-semibold text-[#172C46]">Contact information</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {[
              ["phoneNumber", "Phone number"],
              ["address", "Address"],
              ["city", "City"],
              ["state", "State"],
              ["postalCode", "Postal code"],
            ].map(([name, label]) => (
              <div key={name}>
                <label className="text-sm text-slate-600">{label}</label>
                <input
                  value={form[name as keyof typeof form]}
                  onChange={(e) => updateField(name, e.target.value)}
                  className={fieldClass}
                  required
                />
              </div>
            ))}

            <div>
              <label className="text-sm text-slate-600">Date of birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => updateField("dateOfBirth", e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          {message && (
            <p className="mt-5 text-sm text-green-700">{message}</p>
          )}
          {error && <p className="mt-5 text-sm text-red-600">{error}</p>}

          <button
            disabled={saving}
            className="mt-7 rounded-lg bg-[#172C46] px-6 py-3 text-sm font-medium text-white hover:bg-[#243F60] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </form>
      )}
    </CustomerShell>
  );
}