import Link from "next/link";

const TABS: { key: string; label: string; href: (projectId: string) => string }[] = [
  { key: "quick-view", label: "Quick view", href: (id) => `/assessor/page-management/${id}/quick-view` },
  { key: "visit-details", label: "Visit Details & Training Schedules", href: (id) => `/assessor/page-management/${id}/visit-details` },
  { key: "launch-training", label: "Launch & Training Program", href: (id) => `/assessor/page-management/${id}/launch-training` },
  { key: "expenses", label: "Finance", href: (id) => `/assessor/page-management/${id}/expenses` },
  { key: "assessment-checklist-documents", label: "View Assessment Submittals", href: (id) => `/assessor/page-management/${id}/assessment-checklist-documents` },
  { key: "scoring", label: "Assessment Scoring", href: (id) => `/assessor/page-management/${id}/scoring` },
];

export default async function AssessorProjectLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-[#2f3a46]">Project Management</p>
          <p className="text-xs text-[#667083]">Project: {projectId}</p>
        </div>
        <Link
          href="/assessor/page-management"
          className="text-sm font-semibold text-[#3b79b3] hover:underline"
        >
          ← Back to projects
        </Link>
      </div>

      <nav className="flex flex-wrap gap-x-4 gap-y-2 border-b border-[#e8edf4] pb-2">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href(projectId)}
            className="text-sm font-semibold text-[#667083] hover:text-[#2f3a46] hover:underline hover:underline-offset-4"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div>{children}</div>
    </section>
  );
}

