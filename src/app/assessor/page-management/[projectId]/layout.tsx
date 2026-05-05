import ProjectTabs from "./_tabs";

const TABS: { key: string; label: string; href: (projectId: string) => string }[] = [
  { key: "quick-view", label: "Quick view", href: (id) => `/assessor/page-management/${id}/quick-view` },
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
    <section className="space-y-3">
      <div className="bg-slate-100/90 px-4 py-1">
        <ProjectTabs tabs={TABS.map((tab) => ({ key: tab.key, label: tab.label, href: tab.href(projectId) }))} />
      </div>

      <div>{children}</div>
    </section>
  );
}

