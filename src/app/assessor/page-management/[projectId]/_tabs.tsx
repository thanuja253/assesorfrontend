"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type TabItem = {
  key: string;
  label: string;
  href: string;
};

/** Match admin-style tabs: blue when active, slate when idle. */
function TabIcon({ tabKey, active }: Readonly<{ tabKey: string; active: boolean }>): ReactNode {
  const color = active ? "#2563eb" : "#64748b";
  const commonProps = {
    width: 16,
    height: 16,
    viewBox: "0 0 20 20",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
  } as const;
  const strokeProps = {
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;

  if (tabKey === "quick-view") {
    return (
      <svg {...commonProps}>
        <path d="M1.5 10C3.6 6.4 6.4 4.6 10 4.6C13.6 4.6 16.4 6.4 18.5 10C16.4 13.6 13.6 15.4 10 15.4C6.4 15.4 3.6 13.6 1.5 10Z" {...strokeProps} />
        <circle cx="10" cy="10" r="2.3" fill={color} />
      </svg>
    );
  }
  if (tabKey === "launch-training") {
    return (
      <svg {...commonProps}>
        <rect x="3.2" y="4.2" width="13.6" height="12" rx="2" {...strokeProps} />
        <line x1="3.2" y1="8" x2="16.8" y2="8" {...strokeProps} />
        <line x1="7" y1="2.8" x2="7" y2="6" {...strokeProps} />
        <line x1="13" y1="2.8" x2="13" y2="6" {...strokeProps} />
        <path d="M7.2 11.4H12.8" {...strokeProps} />
      </svg>
    );
  }
  if (tabKey === "expenses") {
    return (
      <svg {...commonProps}>
        <rect x="2.2" y="5.2" width="15.6" height="9.8" rx="2.2" {...strokeProps} />
        <path d="M2.8 8.8H17.2" {...strokeProps} />
        <circle cx="12.8" cy="10.2" r="1.6" {...strokeProps} />
      </svg>
    );
  }
  if (tabKey === "assessment-checklist-documents") {
    return (
      <svg {...commonProps}>
        <path d="M6 2.5H12.8L16.5 6.2V16C16.5 16.8 15.8 17.5 15 17.5H6C5.2 17.5 4.5 16.8 4.5 16V4C4.5 3.2 5.2 2.5 6 2.5Z" {...strokeProps} />
        <path d="M12.5 2.8V6.2H16.2" {...strokeProps} />
        <line x1="7" y1="9.2" x2="14" y2="9.2" {...strokeProps} />
        <line x1="7" y1="12" x2="14" y2="12" {...strokeProps} />
      </svg>
    );
  }
  if (tabKey === "scoring") {
    return (
      <svg {...commonProps}>
        <path d="M3.2 16H17" {...strokeProps} />
        <rect x="5.2" y="10.2" width="2.2" height="5.8" rx="0.6" fill={color} />
        <rect x="9" y="7.5" width="2.2" height="8.5" rx="0.6" fill={color} />
        <rect x="12.8" y="5" width="2.2" height="11" rx="0.6" fill={color} />
      </svg>
    );
  }
  return (
    <svg {...commonProps}>
      <circle cx="10" cy="10" r="6" {...strokeProps} />
    </svg>
  );
}

export default function ProjectTabs({ tabs }: Readonly<{ tabs: TabItem[] }>) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-end gap-x-1 gap-y-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const isActive =
          tab.key === "expenses"
            ? pathname === tab.href || pathname.startsWith(`${tab.href}/`)
            : pathname === tab.href;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`inline-flex items-center gap-2 whitespace-nowrap px-2 pb-2.5 pt-2 text-sm font-medium transition-colors ${
              isActive
                ? "border-b-2 border-blue-600 text-blue-600 -mb-px"
                : "border-b-2 border-transparent text-slate-600 hover:text-slate-800"
            }`}
          >
            <span className="inline-flex shrink-0 items-center justify-center [&_svg]:block">
              <TabIcon tabKey={tab.key} active={isActive} />
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

