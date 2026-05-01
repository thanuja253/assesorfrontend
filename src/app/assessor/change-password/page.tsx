"use client";

import { useState } from "react";
import { GreencoLogo } from "@/components/GreencoLogo";
import { AuthApiError, changeFacilitatorPassword } from "@/lib/auth-api";

function EyeIcon({ open }: Readonly<{ open: boolean }>) {
  if (open) {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 3l18 18M10.5 10.5a2 2 0 002.8 2.8M9.9 5.1A10.4 10.4 0 0112 5c4.2 0 7.6 2.5 9 6a10.1 10.1 0 01-3.6 4.7M6.3 6.3A9.7 9.7 0 003 11c1.4 3.5 4.8 6 9 6 1 0 2-.1 2.9-.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5c4.2 0 7.6 2.5 9 6-1.4 3.5-4.8 6-9 6s-7.6-2.5-9-6c1.4-3.5 4.8-6 9-6z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PasswordRow({
  id,
  label,
  value,
  onChange,
  show,
  onToggleShow,
}: Readonly<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  onToggleShow: () => void;
}>) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-[#606a78]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full rounded border border-[#d7dbe4] bg-white pr-10 pl-2 text-sm text-[#2b3340] outline-none focus:border-[var(--gc-focus)] focus:ring-1 focus:ring-[var(--gc-focus-ring)]"
          autoComplete={id === "old-password" ? "current-password" : "new-password"}
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#7b8593] hover:bg-[#f0f2f7] hover:text-[#4b5563]"
          aria-label={show ? "Hide password" : "Show password"}
        >
          <EyeIcon open={show} />
        </button>
      </div>
    </div>
  );
}

const PASSWORD_RULE =
  "Note: Your New Password must contain atleast 1 uppercase, lowercase, number and special character and should be of atleast 6 characters in length.";

function isValidNewPassword(password: string): boolean {
  if (password.length < 6) {
    return false;
  }
  if (!/[A-Z]/.test(password)) {
    return false;
  }
  if (!/[a-z]/.test(password)) {
    return false;
  }
  if (!/[0-9]/.test(password)) {
    return false;
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return false;
  }
  return true;
}

export default function AssessorChangePasswordPage() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitChange = async () => {
    setFormError("");
    setFormSuccess("");

    if (!isValidNewPassword(newPassword)) {
      setFormError(PASSWORD_RULE);
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("New password and confirmed password must match.");
      return;
    }
    if (oldPassword === newPassword) {
      setFormError("New password must be different from your current password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await changeFacilitatorPassword({
        current_password: oldPassword,
        new_password: newPassword,
        confirmed: confirmPassword,
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFormSuccess(result.message?.trim() || "Password updated successfully.");
    } catch (error) {
      if (error instanceof AuthApiError) {
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    void submitChange();
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <section className="w-full rounded border border-[#dfe3ec] bg-white p-6 shadow-sm md:p-8">
        <h1 className="sr-only">Change Password</h1>
        <div className="mb-5 flex justify-center">
          <GreencoLogo width={64} height={64} rounded="lg" />
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordRow
            id="old-password"
            label="Old Password *"
            value={oldPassword}
            onChange={setOldPassword}
            show={showOld}
            onToggleShow={() => setShowOld((value) => !value)}
          />
          <PasswordRow
            id="new-password"
            label="New Password *"
            value={newPassword}
            onChange={setNewPassword}
            show={showNew}
            onToggleShow={() => setShowNew((value) => !value)}
          />
          <p className="text-xs leading-relaxed text-[#c0392b]">{PASSWORD_RULE}</p>
          <PasswordRow
            id="confirm-password"
            label="Confirm Password *"
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showConfirm}
            onToggleShow={() => setShowConfirm((value) => !value)}
          />

          {formError ? (
            <p className="rounded border border-[#f5c6cb] bg-[#fdeaea] px-3 py-2 text-sm text-[#a94442]">
              {formError}
            </p>
          ) : null}
          {formSuccess ? (
            <p className="rounded border border-[#c3e6cb] bg-[#e8f6ea] px-3 py-2 text-sm text-[#2d6a3e]">
              {formSuccess}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full rounded bg-[var(--gc-primary)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--gc-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Submitting…" : "Submit"}
          </button>
        </form>
      </section>

      <footer className="mt-8 text-center text-xs text-[#7b8593]">
        COPYRIGHT © 2026 Miraki Technologies. All rights reserved
      </footer>
    </div>
  );
}
