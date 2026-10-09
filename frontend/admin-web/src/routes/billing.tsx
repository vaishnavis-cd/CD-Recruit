import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../components/app-shell";
import { BillingSettingsTab } from "../components/common/BillingSettingsTab";

export const Route = createFileRoute("/billing")({
  component: BillingPage,
  head: () => ({
    meta: [
      { title: "Credit Pools & Billing — Proctora" },
      {
        name: "description",
        content: "Manage assessment credit capacity, Talent Reserve pools, digital ledger audit trails, and automated fallthrough policies.",
      },
    ],
  }),
});

function BillingPage() {
  return (
    <AppShell title="Credit & Billing Suite" hideHeader={false}>
      <div className="max-w-[1320px] mx-auto w-full pb-20">
        <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-6 lg:p-8 shadow-xs">
          <BillingSettingsTab />
        </div>
      </div>
    </AppShell>
  );
}
