import { GreencoLogo } from "@/components/GreencoLogo";

export default function CompanyDashboardPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--gc-page)] px-4">
      <section className="w-full max-w-2xl rounded-2xl border border-[#d5e8dc] bg-white p-8 text-center shadow-sm">
        <div className="mb-6 flex justify-center">
          <GreencoLogo width={88} height={88} rounded="lg" />
        </div>
        <h1 className="text-2xl font-semibold text-[#303a4a]">Company Dashboard</h1>
        <p className="mt-2 text-sm text-[#657083]">
          Login redirect works. Replace this placeholder with your company dashboard UI.
        </p>
      </section>
    </main>
  );
}
