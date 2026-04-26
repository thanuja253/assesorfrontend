"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AuthApiError } from "@/lib/auth-api";
import { getCompanyProjectAssignments } from "@/lib/assessor-project-api";
import { KVRow, SectionCard, normalizeRecords } from "../_ui";

export default function AssessorProjectVisitDetailsPage() {
  const routeParams = useParams<{ projectId: string }>();
  const projectId = typeof routeParams?.projectId === "string" ? routeParams.projectId : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignments, setAssignments] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    if (!projectId || projectId === "undefined") {
      console.log("projectId", projectId);
      setError("Invalid project id.");
      setAssignments({});
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    setError("");
    const load = async () => {
      try {
        const payload = await getCompanyProjectAssignments(projectId);
        if (cancelled) return;
        setAssignments(payload);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof AuthApiError ? e.message : "Could not load visit details.");
        setAssignments({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) return <p className="text-sm text-[#667083]">Loading…</p>;
  if (error) return <p className="text-sm text-[#a94442]">{error}</p>;
  const visits = normalizeRecords(assignments.assessors ?? assignments.visit_details ?? assignments.assignment_details);

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <SectionCard title="Visit Details">
        <KVRow label="Name" value={visits[0]?.name ?? visits[0]?.assessor_name} />
        <KVRow label="Email" value={visits[0]?.email} />
        <KVRow label="Mobile Number" value={visits[0]?.mobile ?? visits[0]?.phone} />
        <KVRow label="Visit Date" value={visits[0]?.visitDate ?? visits[0]?.visit_date ?? visits[0]?.site_visit_date} />
      </SectionCard>

      <SectionCard title="Visit Details">
        <KVRow label="Name" value={visits[1]?.name ?? visits[1]?.assessor_name} />
        <KVRow label="Email" value={visits[1]?.email} />
        <KVRow label="Mobile Number" value={visits[1]?.mobile ?? visits[1]?.phone} />
        <KVRow label="Visit Date" value={visits[1]?.visitDate ?? visits[1]?.visit_date ?? visits[1]?.site_visit_date} />
      </SectionCard>
    </div>
  );
}

