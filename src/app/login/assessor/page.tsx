"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GreencoLogo } from "@/components/GreencoLogo";
import {
  AUTH_LOGIN_EMAIL_KEY,
  AUTH_TOKEN_KEY,
  AUTH_USER_STORAGE_KEY,
} from "@/lib/auth-user";
import { AuthApiError, loginAssessor } from "@/lib/auth-api";
import { isValidEmailFormat } from "@/lib/validation";

const highlights = [
  {
    title: "View Certificates",
    description:
      "Access and download your GreenCo certificates and feedback documents",
  },
  {
    title: "Track Progress",
    description: "Monitor your project status and assessment scores in real-time",
  },
  {
    title: "Secure Access",
    description: "Your data is protected with enterprise-grade security",
  },
];

function FieldError({ message }: Readonly<{ message: string }>) {
  if (!message) {
    return null;
  }
  return <p className="text-sm text-[#c0392b]">{message}</p>;
}

export default function AssessorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const submitLogin = async () => {
    setEmailError("");
    setPasswordError("");

    const trimmedEmail = email.trim();
    let hasError = false;
    if (!trimmedEmail) {
      setEmailError("Email must not be empty.");
      hasError = true;
    } else if (!isValidEmailFormat(trimmedEmail)) {
      setEmailError("Please enter a valid email format.");
      hasError = true;
    }

    if (!password.trim()) {
      setPasswordError("Password must not be empty.");
      hasError = true;
    }

    if (hasError) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await loginAssessor({ email: trimmedEmail, password });
      localStorage.setItem(AUTH_TOKEN_KEY, response.token);
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(response.user ?? {}));
      localStorage.setItem(AUTH_LOGIN_EMAIL_KEY, trimmedEmail);
      router.push("/assessor/dashboard");
    } catch (error) {
      if (error instanceof AuthApiError) {
        setEmailError(error.message);
      } else {
        setEmailError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    void submitLogin();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6faf6] px-4 py-10">
      <div className="w-full max-w-6xl">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <section className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#9ca9a0]">
              Welcome Back
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight text-[#1f2933]">
              Manage Your Certifications
            </h1>
            <p className="max-w-xl text-[15px] leading-7 text-[#5f6b65]">
              Access your GreenCo dashboard to track your sustainability journey,
              view certifications, and manage all your projects in one secure
              platform.
            </p>
            <ul className="space-y-4">
              {highlights.map((item) => (
                <li key={item.title} className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#e6f6ea] text-[11px] font-semibold text-[#2e8b57]">
                    ✓
                  </span>
                  <div>
                    <p className="font-semibold text-[#1f2a24]">{item.title}</p>
                    <p className="text-sm text-[#63706a]">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="mx-auto w-full max-w-md rounded-[22px] border border-[#edf2ed] bg-white p-8 shadow-[0_16px_48px_rgba(26,78,50,0.12)]">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#dcebdc] px-3 py-1">
                <GreencoLogo width={26} height={26} rounded="full" />
                <span className="text-sm font-semibold text-[#3f8b53]">GreenCo</span>
              </div>
              <h2 className="mt-5 text-[38px] font-semibold leading-none text-[#1d252c]">
                Welcome Back
              </h2>
              <p className="mt-3 text-sm text-[#70807b]">
                Sign in to continue to your GreenCo dashboard
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit} noValidate>
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6f7a74]"
                >
                  Email Address *
                </label>
                <input
                  id="email"
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => {
                    const next = event.target.value;
                    setEmail(next);

                    const trimmed = next.trim();
                    if (!trimmed) {
                      // Don't show "empty" error while typing; show it on submit.
                      setEmailError("");
                      return;
                    }
                    if (!isValidEmailFormat(trimmed)) {
                      setEmailError("Please enter a valid email format.");
                      return;
                    }
                    setEmailError("");
                  }}
                  onBlur={() => {
                    const trimmed = email.trim();
                    if (!trimmed) {
                      setEmailError("Email must not be empty.");
                      return;
                    }
                    if (!isValidEmailFormat(trimmed)) {
                      setEmailError("Please enter a valid email format.");
                      return;
                    }
                    setEmailError("");
                  }}
                  placeholder="Enter your email"
                  className={`w-full rounded-xl px-4 py-2.5 text-sm text-[#1e2923] outline-none transition ${
                    emailError
                      ? "border border-[#e57373] focus:border-[#c0392b] focus:ring-2 focus:ring-[#f5c6cb]"
                      : "border border-[#dce5df] focus:border-[#2f8b55] focus:ring-2 focus:ring-[#c6ebd2]"
                  }`}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? "email-error" : undefined}
                />
                <div id="email-error">
                  <FieldError message={emailError} />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6f7a74]"
                >
                  Password *
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (passwordError) {
                      setPasswordError("");
                    }
                  }}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-[#dce5df] px-4 py-2.5 text-sm text-[#1e2923] outline-none transition focus:border-[#2f8b55] focus:ring-2 focus:ring-[#c6ebd2]"
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? "password-error" : undefined}
                />
                <div id="password-error">
                  <FieldError message={passwordError} />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-gradient-to-r from-[#43af53] to-[#44ba59] py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <div className="mt-4 text-center text-sm">
              <Link
                href="/forgot-password/role-assessor"
                className="font-medium text-[#67a06f] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </section>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-2 border-t border-[#eef2ee] pt-5 text-xs text-[#95a19b] md:flex-row">
          <p>© 2026 GreenCo. All rights reserved.</p>
          <p>Designed for clarity, security, and ease of use.</p>
        </div>
      </div>
    </main>
  );
}
