import { GreencoLogo } from "@/components/GreencoLogo";
import { AssessorDashboardWelcome } from "@/components/assessor/AssessorDashboardWelcome";

export default function AssessorDashboardPage() {
  return (
    <section className="flex min-h-[calc(100vh-96px)] flex-col rounded border border-[#dfe3ec] bg-[var(--gc-panel)]">
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <AssessorDashboardWelcome />
          <div className="mx-auto mt-4 flex items-center justify-center">
            <GreencoLogo width={146} height={146} alt="Greenco" />
          </div>
        </div>
      </div>
      <footer className="border-t border-[#dfe3ec] bg-[var(--gc-primary-soft)] px-6 py-3 text-xs text-[#5a6b63]">
        COPYRIGHT © 2026 Miraki Technologies. All rights reserved
      </footer>
    </section>
  );
}
