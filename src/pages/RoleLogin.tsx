"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AUTH_LOGIN_EMAIL_KEY,
  AUTH_TOKEN_KEY,
  AUTH_USER_STORAGE_KEY,
} from "@/lib/auth-user";
import { AuthApiError, loginCompany, loginFacilitator } from "@/lib/auth-api";
import { GreencoLogo } from "@/components/GreencoLogo";
import { isValidEmailFormat } from "@/lib/validation";

type Role = "assessor" | "company";

const roleLabel: Record<Role, string> = {
  assessor: "Facilitator",
  company: "Company",
};

export default function RoleLogin() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("assessor");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitLabel = useMemo(() => {
    if (isSubmitting) {
      return "Signing in...";
    }
    return `Sign In as ${roleLabel[role]}`;
  }, [isSubmitting, role]);

  const submitLogin = async () => {
    const trimmedEmail = email.trim();
    setEmailError("");
    setErrorMessage("");

    if (!trimmedEmail) {
      setEmailError("Email must not be empty.");
      return;
    }
    if (!isValidEmailFormat(trimmedEmail)) {
      setEmailError("Please enter a valid email format.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = { email: trimmedEmail, password };
      const loginResponse =
        role === "assessor"
          ? await loginFacilitator(payload)
          : await loginCompany(payload);

      localStorage.setItem(AUTH_TOKEN_KEY, loginResponse.token);
      localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(loginResponse.user ?? {}));
      localStorage.setItem(AUTH_LOGIN_EMAIL_KEY, trimmedEmail);
      if (role === "assessor") {
        router.push("/facilitator/dashboard");
      } else {
        router.push("/company/dashboard");
      }
    } catch (error) {
      if (error instanceof AuthApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Something went wrong. Please try again.");
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
    <main className="flex min-h-screen items-center justify-center bg-[#f4f9f4] px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-[#e6ece7] bg-white p-7 shadow-[0_24px_60px_rgba(37,84,55,0.12)]">
        <div className="mb-5 flex justify-center">
          <GreencoLogo width={72} height={72} rounded="lg" />
        </div>
        <h1 className="text-center text-3xl font-semibold text-[#1d252c]">Role Login</h1>
        <p className="mt-2 text-center text-sm text-[#70807b]">
          Sign in using your role credentials
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-[#f1f5f2] p-1">
          {(["assessor", "company"] as Role[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRole(item)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                role === item
                  ? "bg-[#2f8854] text-white"
                  : "text-[#4d5d56] hover:bg-white hover:text-[#2f8854]"
              }`}
            >
              {roleLabel[item]}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
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
              placeholder="Enter your email"
              className={`w-full rounded-xl px-4 py-2.5 text-sm text-[#1e2923] outline-none transition ${
                emailError
                  ? "border border-[#e57373] focus:border-[#c0392b] focus:ring-2 focus:ring-[#f5c6cb]"
                  : "border border-[#dce5df] focus:border-[#2f8b55] focus:ring-2 focus:ring-[#c6ebd2]"
              }`}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "role-login-email-error" : undefined}
            />
            {emailError ? (
              <p id="role-login-email-error" className="text-sm text-[#c0392b]">
                {emailError}
              </p>
            ) : null}
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-xl border border-[#dce5df] px-4 py-2.5 text-sm text-[#1e2923] outline-none transition focus:border-[#2f8b55] focus:ring-2 focus:ring-[#c6ebd2]"
              required
            />
          </div>

          {errorMessage ? (
            <p className="rounded-lg bg-[#fff0f0] px-3 py-2 text-sm text-[#c0392b]">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-gradient-to-r from-[#2f8854] to-[#36a060] py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </form>
      </section>
    </main>
  );
}
