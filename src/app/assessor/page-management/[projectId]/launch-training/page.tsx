"use client";

import { useEffect, useState } from "react";
import { AuthApiError } from "@/lib/auth-api";
import { getAssessorProjectTabData } from "@/lib/assessor-project-api";

export default function AssessorProjectLaunchTrainingPage({
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
    void getAssessorProjectTabData(projectId, "launch-training")
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof AuthApiError ? e.message : "Could not load launch & training program.");
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

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-[#2f3a46]">Launch & Training Program</p>
      <pre className="overflow-auto rounded border border-[#e6eaf2] p-3 text-xs text-[#445063]">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

