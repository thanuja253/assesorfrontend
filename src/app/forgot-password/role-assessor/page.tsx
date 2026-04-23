"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthApiError, forgotAssessorPassword } from "@/lib/auth-api";
import { isValidEmailFormat } from "@/lib/validation";

const recoverySteps = [
  {
    title: "Secure Process",
    description: "We'll send a secure reset link to your registered email address",
  },
  {
    title: "Quick Recovery",
    description: "Receive your password reset link within minutes",
  },
  {
    title: "Check Your Email",
    description: "Look for an email from GreenCo with your reset instructions",
  },
];

function FieldError({ message }: Readonly<{ message: string }>) {
  if (!message) {
    return null;
  }
  return <p className="text-sm text-[#c0392b]">{message}</p>;
}

export default function AssessorForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitForgot = async () => {
    setEmailError("");

    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError("Email must not be empty.");
      return;
    }
    if (!isValidEmailFormat(trimmed)) {
      setEmailError("Please enter a valid email format.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await forgotAssessorPassword({ email: trimmed });
      setEmail("");
      if (globalThis.window) {
        globalThis.window.sessionStorage.setItem(
          "gc_toast_login",
          result.message || "Password reset link sent to your email.",
        );
      }
      router.push("/login/assessor");
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
    void submitForgot();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6faf6] px-4 py-10">
      <div className="w-full max-w-6xl">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <section className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#9ca9a0]">
              Password Recovery
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-tight text-[#1f2933]">
              Reset Your Password
            </h1>
            <p className="max-w-xl text-[15px] leading-7 text-[#5f6b65]">
              Don&apos;t worry! Enter your registered email address and we&apos;ll send
              you a secure link to reset your password and regain access to your
              account.
            </p>
            <ul className="space-y-4">
              {recoverySteps.map((item) => (
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
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9ca9a0]">
                Security Check
              </p>
              <h2 className="mt-3 text-4xl font-semibold leading-none text-[#1d252c]">
                Forgot Password?
              </h2>
              <p className="mt-3 text-sm text-[#70807b]">
                Enter your email to receive secure reset instructions.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
                  aria-describedby={emailError ? "forgot-email-error" : undefined}
                />
                <div id="forgot-email-error">
                  <FieldError message={emailError} />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-gradient-to-r from-[#43af53] to-[#44ba59] py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Sending..." : "Send Reset Link"}
              </button>
            </form>

            <div className="mt-4 text-center text-sm">
              <Link href="/login/assessor" className="font-medium text-[#67a06f] hover:underline">
                ← Back to login
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
