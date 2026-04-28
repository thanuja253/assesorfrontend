import { redirect } from "next/navigation";

export default async function FacilitatorCompatibilityPage({
  params,
}: Readonly<{ params: Promise<{ parts?: string[] }> }>) {
  const { parts = [] } = await params;
  if (parts[0] === "login") {
    redirect("/login/facilitator");
  }
  const suffix = parts.length ? `/${parts.join("/")}` : "";
  const target = `/assessor${suffix}`;
  redirect(target);
}
