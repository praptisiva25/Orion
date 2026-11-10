
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 12) {
      setError("Password must contain at least 12 characters.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const validationErrors = Array.isArray(data.errors)
          ? data.errors.join(" ")
          : data.message;

        throw new Error(validationErrors || "Registration failed.");
      }

      setSuccess("Your account has been created successfully!");

      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      {/* Branding panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#172C46] p-12 text-white lg:flex xl:p-16">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-2xl text-[#172C46]">
            ✦
          </div>
          <div>
            <p className="text-xl font-bold tracking-[0.15em]">ORION</p>
            <p className="text-[10px] tracking-[0.35em] text-slate-400">BANK</p>
          </div>
        </Link>

        <div className="relative z-10 max-w-lg">
          <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-3xl">
            ✧
          </div>

          <h1 className="text-5xl font-semibold leading-tight xl:text-6xl">
            Your next
            <br />
            chapter starts
            <br />
            <span className="text-[#B9D1C0]">here.</span>
          </h1>

          <p className="mt-7 max-w-md text-base leading-8 text-slate-300">
            Join Orion Bank and experience a simpler,
            smarter way to manage your financial journey.
          </p>

          <div className="mt-12 flex items-center gap-4">
            <div className="h-px w-12 bg-[#B9D1C0]" />
            <p className="text-xs tracking-[0.2em] text-slate-300">
              BANKING, REIMAGINED.
            </p>
          </div>
        </div>

        <div className="pointer-events-none absolute -bottom-40 -right-32 h-[500px] w-[500px] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-24 -right-16 h-[350px] w-[350px] rounded-full border border-white/10" />

        <p className="text-xs text-slate-400">
          © 2026 Orion Bank. All rights reserved.
        </p>
      </section>

      {/* Registration form */}
      <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#172C46] text-xl text-white">
              ✦
            </div>
            <div>
              <p className="font-bold tracking-[0.15em] text-[#172C46]">ORION</p>
              <p className="text-[9px] tracking-[0.3em] text-slate-400">BANK</p>
            </div>
          </Link>

          <div>
            <p className="text-sm font-medium text-[#78917E]">GET STARTED</p>

            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#172C46]">
              Create your account
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Join Orion Bank and get started with smarter banking.
            </p>
          </div>

          <form onSubmit={handleRegister} className="mt-8 space-y-5">
            <div>
              <label htmlFor="fullName" className="mb-2 block text-sm font-medium text-[#34465A]">
                Full name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                required
                maxLength={100}
                autoComplete="name"
                className="h-12 w-full rounded-xl border border-[#E2E7E3] bg-[#FAFBFA] px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#78917E] focus:ring-2 focus:ring-[#78917E]/10"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-[#34465A]">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="h-12 w-full rounded-xl border border-[#E2E7E3] bg-[#FAFBFA] px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#78917E] focus:ring-2 focus:ring-[#78917E]/10"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-[#34465A]">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  required
                  autoComplete="new-password"
                  className="h-12 w-full rounded-xl border border-[#E2E7E3] bg-[#FAFBFA] px-4 pr-20 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#78917E] focus:ring-2 focus:ring-[#78917E]/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-[#66836E]"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                At least 12 characters, including uppercase, lowercase,
                number and special character.
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-[#34465A]">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                required
                autoComplete="new-password"
                className="h-12 w-full rounded-xl border border-[#E2E7E3] bg-[#FAFBFA] px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#78917E] focus:ring-2 focus:ring-[#78917E]/10"
              />
            </div>

            {error && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {success && (
              <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-[#172C46] text-sm font-semibold text-white shadow-sm transition hover:bg-[#263F5C] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Create account →"}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-[#66836E] hover:underline">
              Sign in
            </Link>
          </p>

          <p className="mt-10 text-center text-xs text-slate-400">
            Secure banking experience · Orion Bank
          </p>
        </div>
      </section>
    </main>
  );
}
