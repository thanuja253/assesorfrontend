"use client";

import type { ReactNode } from "react";
import { formatDisplayDate, isDateFieldLabel } from "@/lib/date-format";

export function textValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    const cleaned = value.trim();
    return cleaned || "—";
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => textValue(item))
      .filter((item) => item !== "—")
      .join(", ");
    return joined || "—";
  }
  return "—";
}

export function cardClassName(extra?: string): string {
  return `rounded border border-[#e5eaf3] bg-white shadow-[0_1px_2px_rgba(14,34,61,0.04)] ${extra ?? ""}`.trim();
}

export function SectionCard({
  title,
  action,
  children,
}: Readonly<{ title: string; action?: ReactNode; children: ReactNode }>) {
  return (
    <section className={cardClassName()}>
      <header className="flex items-center justify-between border-b border-[#edf1f7] px-5 py-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#4f5a69]">{title}</p>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function KVRow({
  label,
  value,
  hidePlaceholder = false,
}: Readonly<{ label: string; value: unknown; hidePlaceholder?: boolean }>) {
  const normalized = isDateFieldLabel(label) ? formatDisplayDate(value) : textValue(value);
  const display = hidePlaceholder && normalized === "—" ? "" : normalized;
  return (
    <div className="grid grid-cols-[180px_16px_1fr] gap-x-2 py-1.5 text-sm">
      <p className="text-[#5c6777]">{label}</p>
      <p className="text-[#9099a8]">:</p>
      <p className="text-[#2d3746]">{display}</p>
    </div>
  );
}

export function normalizeRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
  }
  if (!payload || typeof payload !== "object") return [];
  return [payload as Record<string, unknown>];
}

