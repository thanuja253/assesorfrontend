"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabItem = {
  key: string;
  label: string;
  href: string;
};

const ICONS: Record<string, string> = {
  "quick-view": "◌",
  "visit-details": "◍",
  "launch-training": "◉",
  expenses: "◌",
  "assessment-checklist-documents": "◍",
  scoring: "◉",
};

export default function ProjectTabs({ tabs }: Readonly<{ tabs: TabItem[] }>) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-[#ccd5e3] bg-white text-[10px] text-[#6f7f95]">
        ✓
      </span>
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${
              isActive ? "text-[#2f3a46]" : "text-[#677285] hover:text-[#2f3a46]"
            }`}
          >
            <span className="text-xs text-[#a2adbd]">{ICONS[tab.key] ?? "◌"}</span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

