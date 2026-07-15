import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "../components/app-shell";
import { SessionDetailBody } from "../components/session-detail";

export const Route = createFileRoute("/sessions/$id")({
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { id } = Route.useParams();
  return (
    <AppShell
      title="Session"
      actions={
        <Link
          to="/sessions"
          className="inline-flex items-center gap-1.5 text-[12px] text-[#5B5B64] hover:text-[#0B0B0D]"
        >
          <ArrowLeft size={14} /> Back to sessions
        </Link>
      }
    >
      <div className="bg-white border border-[#E6E6EA] rounded-[10px] overflow-hidden flex flex-col min-h-[calc(100vh-140px)]">
        <SessionDetailBody sessionId={id} />
      </div>
    </AppShell>
  );
}
