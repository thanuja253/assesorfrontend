import ProjectTabs from "./_tabs";

const TABS: { key: string; label: string; href: (projectId: string) => string }[] = [
  { key: "quick-view", label: "Quick view", href: (id) => `/facilitator/page-management/${id}/quick-view` },
  { key: "launch-training", label: "Launch & Training Program", href: (id) => `/facilitator/page-management/${id}/launch-training` },
  { key: "expenses", label: "Finance", href: (id) => `/facilitator/page-management/${id}/expenses` },
  { key: "assessment-checklist-documents", label: "View Assessment Submittals", href: (id) => `/facilitator/page-management/${id}/assessment-checklist-documents` },
  { key: "scoring", label: "Assessment Scoring", href: (id) => `/facilitator/page-management/${id}/scoring` },
];

export default async function AssessorProjectLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  return (
    <section className="space-y-3">
      <div className="rounded border border-[#e6ebf3] bg-[#f8fafd] px-3 py-2">
        <ProjectTabs tabs={TABS.map((tab) => ({ key: tab.key, label: tab.label, href: tab.href(projectId) }))} />
      </div>

      <div>{children}</div>
    </section>
  );
}

