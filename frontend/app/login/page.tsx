
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await login(email.trim(), password);

      if (new Date(result.expiresAt).getTime() <= Date.now()) {
        throw new Error("The server returned an expired login token.");
      }

      // Demo-stage token storage. We will move authentication
      // to secure HttpOnly cookies before production.
      sessionStorage.setItem("token", result.token);
      sessionStorage.setItem("user", JSON.stringify(result.user));

      const roles = result.user.roles.map((role) => role.toLowerCase());

      if (roles.includes("admin")) {
        router.push("/admin");
      } else if (roles.includes("officer")) {
        router.push("/officer");
      } else if (roles.includes("customer")) {
        router.push("/");
      } else {
        sessionStorage.clear();
        throw new Error("Your account does not have an assigned role.");
      }
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
            Banking that
            <br />
            moves with
            <br />
            <span className="text-[#B9D1C0]">your future.</span>
          </h1>
          <p className="mt-7 max-w-md text-base leading-8 text-slate-300">
            Experience a smarter way to manage your finances.
            Everything you need, thoughtfully brought together.
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

      <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-12 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#172C46] text-xl text-white">
              ✦
            </div>
            <div>
              <p className="font-bold tracking-[0.15em] text-[#172C46]">ORION</p>
              <p className="text-[9px] tracking-[0.3em] text-slate-400">BANK</p>
            </div>
          </Link>

          <div>
            <p className="text-sm font-medium text-[#78917E]">WELCOME BACK</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#172C46]">
              Sign in to your account
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Enter your credentials to access your banking dashboard.
            </p>
          </div>

          <form className="mt-9 space-y-6" onSubmit={handleLogin}>
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
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-[#34465A]">
                  Password
                </label>
                <button type="button" className="text-xs font-medium text-[#66836E] hover:underline">
                  Forgot password?
                </button>
              </div>

              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
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
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 accent-[#172C46]"
              />
              Remember me
            </label>

            {error && (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-[#172C46] text-sm font-semibold text-white shadow-sm transition hover:bg-[#263F5C] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in →"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-500">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-semibold text-[#66836E] hover:underline">
              Create an account
            </Link>
          </p>

          <p className="mt-12 text-center text-xs text-slate-400">
            Secure banking experience · Orion Bank
          </p>
        </div>
      </section>
    </main>
  );
}
