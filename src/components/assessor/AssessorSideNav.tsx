"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearAssessorSession } from "@/lib/auth-user";
import {
  NavIconDashboard,
  NavIconLogout,
  NavIconPages,
  NavIconPassword,
  NavIconProfile,
} from "@/components/assessor/AssessorNavIcons";

export function AssessorSideNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  const isDashboard =
    pathname === "/assessor/dashboard" || pathname.startsWith("/assessor/dashboard/");
  const isProfile =
    pathname === "/assessor/profile" || pathname.startsWith("/assessor/profile/");
  const isChangePassword =
    pathname === "/assessor/change-password" ||
    pathname.startsWith("/assessor/change-password/");
  const isPageManagement =
    pathname === "/assessor/page-management" ||
    pathname.startsWith("/assessor/page-management/");

  const itemClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm leading-snug text-white/95 hover:bg-white/15 ${
      active ? "bg-white/20 font-semibold text-white" : "font-medium"
    }`;

  const handleLogout = () => {
    clearAssessorSession();
    router.push("/login/assessor");
  };

  return (
    <nav className="mt-2 space-y-0.5 px-2 pb-4">
      <Link href="/assessor/dashboard" className={itemClass(isDashboard)}>
        <NavIconDashboard />
        <span>Dashboard</span>
      </Link>
      <Link href="/assessor/profile" className={itemClass(isProfile)}>
        <NavIconProfile />
        <span>Profile</span>
      </Link>
      <Link href="/assessor/page-management" className={itemClass(isPageManagement)}>
        <NavIconPages />
        <span>Project Management</span>
      </Link>
      <Link href="/assessor/change-password" className={itemClass(isChangePassword)}>
        <NavIconPassword />
        <span>Change Password</span>
      </Link>
      <button type="button" onClick={handleLogout} className={itemClass(false)}>
        <NavIconLogout />
        <span>Logout</span>
      </button>
    </nav>
  );
}
