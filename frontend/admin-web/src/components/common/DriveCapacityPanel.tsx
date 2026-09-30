import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Coins,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  ShieldAlert,
  Play,
  User,
  Zap,
} from "lucide-react";
import { useStore } from "../../lib/store";

interface DriveCapacityPanelProps {
  driveId: string;
  driveName?: string;
  onRefresh?: () => void;
}

export function DriveCapacityPanel({ driveId, driveName, onRefresh }: DriveCapacityPanelProps) {
  const fetchDriveCapacity = useStore((s) => s.fetchDriveCapacity);
  const releaseHeldSessions = useStore((s) => s.releaseHeldSessions);

  const [capacityData, setCapacityData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState(false);

  const loadCapacity = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchDriveCapacity(driveId);
      setCapacityData(data);
    } catch (err: any) {
      console.error("Failed to load drive capacity:", err);
      toast.error(err.message || "Failed to load drive credit capacity");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (driveId) {
      loadCapacity();
    }
  }, [driveId]);

  const handleRelease = async () => {
    setReleasing(true);
    try {
      const result = await releaseHeldSessions(driveId);
      toast.success(
        `Released ${result.releasedCount} held session${result.releasedCount === 1 ? "" : "s"} successfully`,
      );
      await loadCapacity(true);
      onRefresh?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to release held sessions");
    } finally {
      setReleasing(false);
    }
  };

  if (loading && !capacityData) {
    return (
      <div className="flex items-center justify-center p-8 bg-white rounded-[16px] border border-[#E2E8F0]">
        <RefreshCw size={20} className="animate-spin text-[#2563EB] mr-2" />
        <span className="text-[13px] text-[#64748B]">Loading credit capacity &amp; held sessions…</span>
      </div>
    );
  }

  const isExhausted = capacityData?.assessmentCommenceStatus === "EXHAUSTED";
  const heldCount = capacityData?.heldSessionsCount || 0;
  const totalAvailable = capacityData?.totalAvailableCapacity || 0;

  return (
    <div className="space-y-6">
      {/* Top Banner / Status Overview */}
      <div
        className={`p-5 rounded-[12px] border transition-all ${
          heldCount > 0 || isExhausted
            ? "bg-[#FEF2F2] border-[#FECACA]"
            : "bg-[#F8FAFC] border-[#E2E8F0]"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 ${
                heldCount > 0 || isExhausted
                  ? "bg-[#FEE2E2] text-[#DC2626]"
                  : "bg-[#EFF6FF] text-[#2563EB]"
              }`}
            >
              {heldCount > 0 || isExhausted ? (
                <AlertTriangle size={20} />
              ) : (
                <Coins size={20} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-bold text-[#0F172A]">
                  {driveName ? `${driveName} — Capacity Status` : "Assessment Credit Capacity"}
                </h3>
                <span
                  className={`px-2.5 py-0.5 text-[11px] font-bold uppercase rounded-full tracking-wider ${
                    isExhausted
                      ? "bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA]"
                      : "bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]"
                  }`}
                >
                  {isExhausted ? "CAPACITY EXHAUSTED" : "CAPACITY READY"}
                </span>
              </div>
              <p className="text-[12px] text-[#64748B] mt-0.5">
                {heldCount > 0
                  ? `${heldCount} candidate session${heldCount === 1 ? "" : "s"} currently placed on hold due to exhausted credits.`
                  : "Sufficient credit capacity available for candidate assessment commencement."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => loadCapacity()}
              className="p-2 text-[#64748B] hover:text-[#0F172A] hover:bg-white rounded-[8px] border border-transparent hover:border-[#E2E8F0] transition-all cursor-pointer"
              title="Refresh Capacity"
            >
              <RefreshCw size={15} />
            </button>
            {heldCount > 0 && (
              <button
                onClick={handleRelease}
                disabled={releasing || totalAvailable === 0}
                className="flex items-center gap-1.5 px-4 h-[36px] text-[12px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-full shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {releasing ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <Play size={13} />
                )}
                <span>Release Held ({heldCount})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Metric Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Drive Pass Pool */}
        <div className="p-4 bg-white border border-[#E2E8F0] rounded-[12px] shadow-2xs">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-[12px] font-medium">Drive Pass Pool</span>
            <Coins size={15} className="text-[#2563EB]" />
          </div>
          <div className="text-[22px] font-bold text-[#0F172A]">
            {capacityData?.drivePassPool?.remaining ?? 0}
            <span className="text-[12px] font-normal text-[#64748B] ml-1">
              / {capacityData?.drivePassPool?.total ?? 0} credits
            </span>
          </div>
          <div className="mt-2 flex items-center text-[11px] text-[#64748B]">
            <Clock size={12} className="mr-1 text-[#94A3B8]" />
            <span>
              {capacityData?.drivePassPool?.expiresAt
                ? `Expires ${new Date(capacityData.drivePassPool.expiresAt).toLocaleDateString()}`
                : "Dedicated pool for this drive"}
            </span>
          </div>
        </div>

        {/* Talent Reserve Fallback */}
        <div className="p-4 bg-white border border-[#E2E8F0] rounded-[12px] shadow-2xs">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-[12px] font-medium">Talent Reserve</span>
            <Layers size={15} className="text-[#8B5CF6]" />
          </div>
          <div className="text-[22px] font-bold text-[#0F172A]">
            {capacityData?.talentReserveTotalRemaining ?? 0}
            <span className="text-[12px] font-normal text-[#64748B] ml-1">credits</span>
          </div>
          <div className="mt-2 flex items-center text-[11px] text-[#64748B]">
            <Zap size={12} className="mr-1 text-[#8B5CF6]" />
            <span>Account-wide reserve pool</span>
          </div>
        </div>

        {/* Auto-Promotion Queue */}
        <div className="p-4 bg-white border border-[#E2E8F0] rounded-[12px] shadow-2xs">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-[12px] font-medium">Queued Pools</span>
            <Clock size={15} className="text-[#059669]" />
          </div>
          <div className="text-[22px] font-bold text-[#0F172A]">
            {capacityData?.queuedPoolsCount ?? 0}
            <span className="text-[12px] font-normal text-[#64748B] ml-1">waiting</span>
          </div>
          <div className="mt-2 flex items-center text-[11px] text-[#059669]">
            <CheckCircle2 size={12} className="mr-1" />
            <span>Auto-promotes when active empty</span>
          </div>
        </div>

        {/* Enterprise Overdraft */}
        <div className="p-4 bg-white border border-[#E2E8F0] rounded-[12px] shadow-2xs">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-[12px] font-medium">Enterprise Overdraft</span>
            <ShieldAlert size={15} className="text-[#D97706]" />
          </div>
          <div className="text-[22px] font-bold text-[#0F172A]">
            {capacityData?.overdraftAvailable ?? 0}
            <span className="text-[12px] font-normal text-[#64748B] ml-1">
              / {capacityData?.overdraftLimit ?? 0} available
            </span>
          </div>
          <div className="mt-2 flex items-center text-[11px] text-[#64748B]">
            <span>Used: {capacityData?.overdraftUsed ?? 0} credits</span>
          </div>
        </div>
      </div>

      {/* Held Sessions Section */}
      <div className="bg-white border border-[#E2E8F0] rounded-[12px] overflow-hidden shadow-2xs">
        <div className="px-5 py-4 border-b border-[#F1F5F9] flex items-center justify-between bg-[#F8FAFC]">
          <div>
            <h4 className="text-[14px] font-bold text-[#0F172A]">
              Held Sessions Queue ({heldCount})
            </h4>
            <p className="text-[12px] text-[#64748B] mt-0.5">
              Candidate sessions queued in waiting room pending capacity replenishment.
            </p>
          </div>
          {heldCount > 0 && (
            <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase rounded-full bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
              ACTION REQUIRED
            </span>
          )}
        </div>

        {heldCount === 0 ? (
          <div className="p-8 text-center text-[#64748B]">
            <CheckCircle2 size={28} className="mx-auto text-[#10B981] mb-2" />
            <p className="text-[13px] font-medium text-[#0F172A]">No sessions currently on hold</p>
            <p className="text-[12px] text-[#94A3B8] mt-0.5">
              All candidate starts are being processed without capacity delays.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                <tr>
                  <th className="px-5 py-3">Candidate</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Held At</th>
                  <th className="px-5 py-3">Hold Reason</th>
                  <th className="px-5 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-[#0F172A]">
                {capacityData?.heldSessions?.map((session: any) => (
                  <tr key={session.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-5 py-3.5 font-medium flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center font-bold text-[10px]">
                        {session.candidateName
                          ? session.candidateName
                              .split(" ")
                              .map((n: string) => n[0])
                              .join("")
                              .substring(0, 2)
                              .toUpperCase()
                          : "CA"}
                      </div>
                      <span>{session.candidateName || "Candidate"}</span>
                    </td>
                    <td className="px-5 py-3.5 text-[#64748B]">{session.candidateEmail || "—"}</td>
                    <td className="px-5 py-3.5 text-[#64748B]">
                      {session.heldAt ? new Date(session.heldAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
                        {session.holdReason || "CAPACITY"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium text-[#D97706]">
                      HELD (WAITING ROOM)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
