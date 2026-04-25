"use client";

import { useEffect, useState } from "react";
import { AuthApiError } from "@/lib/auth-api";
import { getAssessorProjectTabData } from "@/lib/assessor-project-api";

function Row({ label, value }: Readonly<{ label: string; value: unknown }>) {
  const text = typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 py-1 text-sm">
      <p className="text-[#667083]">{label}</p>
      <p className="text-[#2f3a46]">{text || "—"}</p>
    </div>
  );
}

export default function AssessorProjectQuickViewPage({
  params,
}: Readonly<{ params: { projectId: string } }>) {
  const { projectId } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void getAssessorProjectTabData(projectId, "quick-view")
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof AuthApiError ? e.message : "Could not load quick view.");
        setData({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) return <p className="text-sm text-[#667083]">Loading…</p>;
  if (error) return <p className="text-sm text-[#a94442]">{error}</p>;

  const profile =
    (data.profile as Record<string, unknown> | undefined) ??
    (data.company as Record<string, unknown> | undefined) ??
    (data.project as Record<string, unknown> | undefined) ??
    data;

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-[#2f3a46]">Company Details</p>
        <div className="space-y-1">
          <Row label="Company Name" value={profile.name ?? profile.company_name ?? profile.companyName} />
          <Row label="Company ID" value={profile.reg_id ?? profile.company_id ?? profile.companyId} />
          <Row label="Project Code" value={profile.project_id ?? profile.projectId ?? profile.project_code ?? profile.projectCode} />
          <Row label="Email" value={profile.email} />
          <Row label="Mobile Number" value={profile.mobile ?? profile.phone} />
          <Row label="Turnover" value={profile.turnover} />
          <Row label="State" value={profile.state ?? profile.state_name} />
          <Row label="Sector" value={profile.sector ?? profile.sector_name} />
          <Row label="Industry" value={profile.industry ?? profile.industry_name} />
          <Row label="Entity" value={profile.entity ?? profile.entity_name} />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-[#2f3a46]">Quick View Data</p>
        <pre className="overflow-auto rounded border border-[#e6eaf2] p-3 text-xs text-[#445063]">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
}

