"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { loadProjectHybridContext } from "@/lib/assessor-project-api";
import { resolveFacilitatorProcessFromContext } from "@/lib/hybrid-workflow";

export default function ExpensesLayout({ children }: Readonly<{ children: ReactNode }>) {
  const params = useParams<{ projectId: string }>();
  const pathname = usePathname();
  const projectId = typeof params?.projectId === "string" ? params.projectId : "";
  const [isFacilitatorProcess, setIsFacilitatorProcess] = useState(false);

  useEffect(() => {
    if (!projectId || projectId === "undefined") {
      setIsFacilitatorProcess(false);
      return;
    }
    let cancelled = false;
    loadProjectHybridContext(projectId, "company")
      .then((ctx) => {
        if (!cancelled) setIsFacilitatorProcess(resolveFacilitatorProcessFromContext(ctx, ctx.quickview));
      })
      .catch(() => {
        if (!cancelled) setIsFacilitatorProcess(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const base = `/assessor/page-management/${projectId}/expenses`;
  const items = [
    { href: base, label: "Expenses" },
    { href: `${base}/proforma-invoice`, label: "Proforma/Invoice" },
    { href: `${base}/tax-invoice`, label: "Tax invoice" },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <div className="space-y-3">
      {isFacilitatorProcess ? (
        <nav className="flex flex-wrap gap-2 border-b border-[#e6ebf3] pb-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                isActive(item.href)
                  ? "bg-[#ea580c]/15 text-[#c2410c]"
                  : "text-[#677285] hover:bg-[#f8fafd]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
      {children}
    </div>
  );
}
