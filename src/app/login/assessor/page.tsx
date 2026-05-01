"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { GreencoLogo } from "@/components/GreencoLogo";
import {
  AUTH_LOGIN_EMAIL_KEY,
  AUTH_TOKEN_KEY,
  AUTH_USER_STORAGE_KEY,
} from "@/lib/auth-user";
import { AuthApiError, loginFacilitator } from "@/lib/auth-api";
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

function Toast({
  message,
  onClose,
}: Readonly<{
  message: string;
  onClose: () => void;
}>) {
  if (!message) return null;
  return (
    <div className="fixed right-4 top-4 z-[60] w-[min(420px,calc(100vw-2rem))] rounded border border-[#c3e6cb] bg-[#e8f6ea] px-3 py-2 text-sm text-[#2d6a3e] shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-0.5 text-sm text-[#2d6a3e] hover:bg-[#d7f0dc]"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default function AssessorLoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (pathname === "/login/assessor") {
      router.replace("/login/facilitator");
    }
  }, [pathname, router]);

  useEffect(() => {
    if (!globalThis.window) return;
    const stored = globalThis.window.sessionStorage.getItem("gc_toast_login") ?? "";
    if (!stored.trim()) return;
    globalThis.window.sessionStorage.removeItem("gc_toast_login");
    setToastMessage(stored.trim());
    if (toastTimerRef.current !== null) {
      globalThis.window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = globalThis.window.setTimeout(() => {
      setToastMessage("");
      toastTimerRef.current = null;
    }, 3500);
  }, []);

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
      const response = await loginFacilitator({ email: trimmedEmail, password });
      localStorage.setItem(AUTH_TOKEN_KEY, response.token);
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(response.user ?? {}));
      localStorage.setItem(AUTH_LOGIN_EMAIL_KEY, trimmedEmail);
      router.push("/facilitator/dashboard");
    } catch (error) {
      if (error instanceof AuthApiError) {
        const msg = error.message?.trim() || "Something went wrong. Please try again.";
        // Prioritize password/auth credential errors so they render under Password.
        if (/password|credential|invalid login|unauthori[sz]ed|auth/i.test(msg)) {
          setPasswordError(msg);
          setEmailError("");
        } else if (/email|account/i.test(msg)) {
          setEmailError(msg);
          setPasswordError("");
        } else {
          setPasswordError(msg);
        }
      } else {
        setPasswordError("Something went wrong. Please try again.");
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
    <>
      <Toast
        message={toastMessage}
        onClose={() => {
          if (toastTimerRef.current !== null && globalThis.window) {
            globalThis.window.clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
          }
          setToastMessage("");
        }}
      />
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
                    // Clear backend login errors as soon as user edits to a valid email.
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
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      const next = event.target.value;
                      setPassword(next);

                      const trimmed = next.trim();
                      if (!trimmed) {
                        // Show required only on submit/blur, not while actively typing.
                        if (passwordError) setPasswordError("");
                        return;
                      }

                      // Clear API/password errors immediately once user starts correcting input.
                      if (passwordError) setPasswordError("");
                    }}
                    onBlur={() => {
                      if (!password.trim()) {
                        setPasswordError("Password must not be empty.");
                      }
                    }}
                    placeholder="Enter your password"
                    className={`w-full rounded-xl px-4 py-2.5 pr-12 text-sm text-[#1e2923] outline-none transition ${
                      passwordError
                        ? "border border-[#e57373] focus:border-[#c0392b] focus:ring-2 focus:ring-[#f5c6cb]"
                        : "border border-[#dce5df] focus:border-[#2f8b55] focus:ring-2 focus:ring-[#c6ebd2]"
                    }`}
                    aria-invalid={Boolean(passwordError)}
                    aria-describedby={passwordError ? "password-error" : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-3 my-auto inline-flex h-7 w-7 items-center justify-center rounded text-[#5f6b65] hover:bg-[#f3f7f4]"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
                        <path
                          d="M3 4l17 17"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                        />
                        <path
                          d="M10.6 10.7a2 2 0 0 0 2.7 2.7"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                        />
                        <path
                          d="M9.2 5.5A10.8 10.8 0 0 1 12 5c4.8 0 8.5 2.8 10 7-0.5 1.4-1.2 2.7-2.1 3.8"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                        />
                        <path
                          d="M6.2 8A12.3 12.3 0 0 0 2 12c1.5 4.2 5.2 7 10 7 1.2 0 2.4-0.2 3.4-0.5"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
                        <path
                          d="M2 12c1.5-4.2 5.2-7 10-7s8.5 2.8 10 7c-1.5 4.2-5.2 7-10 7s-8.5-2.8-10-7z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <circle
                          cx="12"
                          cy="12"
                          r="3"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />
                      </svg>
                    )}
                  </button>
                </div>
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
                href="/forgot-password/role-facilitator"
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
    </>
  );
}
