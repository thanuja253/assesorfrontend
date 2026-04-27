import { redirect } from "next/navigation";

export default async function AssessorPageMangmentCompatibilityPage({
  params,
}: Readonly<{ params: Promise<{ parts?: string[] }> }>) {
  const { parts = [] } = await params;
  const target = `/assessor/page-management${parts.length ? `/${parts.join("/")}` : ""}`;
  redirect(target);
}

