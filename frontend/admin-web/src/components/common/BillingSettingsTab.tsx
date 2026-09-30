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
  ShieldCheck,
  Play,
  Zap,
  Building2,
  Check,
  Lock,
} from "lucide-react";
import { useStore } from "../../lib/store";
import { DriveCapacityPanel } from "./DriveCapacityPanel";

export function BillingSettingsTab() {
  const fetchBillingAccount = useStore((s) => s.fetchBillingAccount);
  const drives = useStore((s) => s.drives);
  const fetchDrives = useStore((s) => s.fetchDrives);

  const [accountData, setAccountData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDriveId, setSelectedDriveId] = useState<string>("");

  const loadBillingAccount = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchBillingAccount();
      setAccountData(data);
    } catch (err: any) {
      console.error("Failed to load billing account:", err);
      toast.error(err.message || "Failed to load billing account data");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadBillingAccount();
    fetchDrives?.(undefined, true).then((driveList) => {
      if (Array.isArray(driveList) && driveList.length > 0) {
        setSelectedDriveId(driveList[0].id);
      }
    });
  }, []);

  if (loading && !accountData) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw size={22} className="animate-spin text-[#2563EB] mr-2" />
        <span className="text-[13px] text-[#64748B]">Loading billing account and pool details…</span>
      </div>
    );
  }

  const activePools = accountData?.activePools || [];
  const queuedPools = accountData?.queuedPools || [];
  const totalRemaining = accountData?.totalRemaining || 0;
  const overdraftLimit = accountData?.overdraftLimit || 0;
  const overdraftUsed = accountData?.overdraftUsed || 0;
  const overdraftAvailable = accountData?.overdraftAvailable || 0;

  return (
    <div className="space-y-8 max-w-[1000px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#F1F5F9] gap-4">
        <div>
          <h2 className="text-[16px] font-bold text-[#0F172A] flex items-center gap-2">
            <span>Credit Pool &amp; Capacity Management</span>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">
              ACID ENFORCEMENT ENGINE
            </span>
          </h2>
          <p className="text-[12px] text-[#64748B] mt-0.5">
            Manage organization-wide assessment credits, drive passes, auto-promotion queues, and held session capacity.
          </p>
        </div>

        <button
          onClick={() => loadBillingAccount()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold text-[#2563EB] hover:text-white bg-[#EFF6FF] hover:bg-[#2563EB] border border-[#BFDBFE] hover:border-[#2563EB] rounded-[8px] transition-all cursor-pointer shadow-xs self-start sm:self-auto"
        >
          <RefreshCw size={13} />
          <span>Refresh Balances</span>
        </button>
      </div>

      {/* Account Balance Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Remaining Credits */}
        <div className="p-5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px]">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-[12px] font-semibold">Total Active Balance</span>
            <Coins size={16} className="text-[#2563EB]" />
          </div>
          <div className="text-[26px] font-bold text-[#0F172A]">
            {totalRemaining}
            <span className="text-[13px] font-normal text-[#64748B] ml-1.5">credits</span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">
            Available across {activePools.length} active pool{activePools.length === 1 ? "" : "s"}
          </p>
        </div>

        {/* Queued Auto-Promotion Pools */}
        <div className="p-5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px]">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-[12px] font-semibold">Queued Pools ("Jio Model")</span>
            <Clock size={16} className="text-[#059669]" />
          </div>
          <div className="text-[26px] font-bold text-[#0F172A]">
            {queuedPools.length}
            <span className="text-[13px] font-normal text-[#64748B] ml-1.5">in queue</span>
          </div>
          <p className="text-[11px] text-[#059669] mt-1 flex items-center">
            <CheckCircle2 size={12} className="mr-1" />
            <span>Clock starts automatically on activation</span>
          </p>
        </div>

        {/* Enterprise Overdraft */}
        <div className="p-5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px]">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-[12px] font-semibold">Overdraft Buffer</span>
            <ShieldCheck size={16} className="text-[#D97706]" />
          </div>
          <div className="text-[26px] font-bold text-[#0F172A]">
            {overdraftAvailable}
            <span className="text-[13px] font-normal text-[#64748B] ml-1.5">/ {overdraftLimit}</span>
          </div>
          <p className="text-[11px] text-[#64748B] mt-1">
            Used: {overdraftUsed} credits
          </p>
        </div>
      </div>

      {/* Active & Queued Pools Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-[12px] overflow-hidden shadow-2xs">
        <div className="px-5 py-4 border-b border-[#F1F5F9] flex items-center justify-between bg-[#F8FAFC]">
          <div>
            <h3 className="text-[14px] font-bold text-[#0F172A]">Credit Pools &amp; Validity Clocks</h3>
            <p className="text-[12px] text-[#64748B] mt-0.5">
              Strict pool priority order: Drive Pass &gt; Talent Reserve &gt; Queued Pool Promotion &gt; Overdraft.
            </p>
          </div>
        </div>

        {activePools.length === 0 && queuedPools.length === 0 ? (
          <div className="p-8 text-center text-[#64748B]">
            <Layers size={28} className="mx-auto text-[#94A3B8] mb-2" />
            <p className="text-[13px] font-medium text-[#0F172A]">No credit pools found</p>
            <p className="text-[12px] text-[#94A3B8] mt-0.5">
              Contact your administrator to provision credit packs via maker-checker approval.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                <tr>
                  <th className="px-5 py-3">Pool Name / Type</th>
                  <th className="px-5 py-3">Remaining / Total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Queue Order</th>
                  <th className="px-5 py-3">Validity Window</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-[#0F172A]">
                {[...activePools, ...queuedPools].map((pool: any) => (
                  <tr key={pool.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-[#0F172A]">{pool.name}</div>
                      <div className="text-[11px] text-[#64748B] uppercase">{pool.poolType}</div>
                    </td>
                    <td className="px-5 py-3.5 font-semibold">
                      {pool.cachedRemaining}{" "}
                      <span className="text-[#64748B] font-normal">/ {pool.totalCredits}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                          pool.status === "ACTIVE"
                            ? "bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]"
                            : "bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]"
                        }`}
                      >
                        {pool.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[#64748B]">
                      {pool.queueOrder ? `#${pool.queueOrder}` : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[#64748B]">
                      {pool.expiresAt
                        ? `Expires ${new Date(pool.expiresAt).toLocaleDateString()}`
                        : `${pool.validityDays} days validity (on activation)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drive-Specific Capacity & Held Session Management */}
      <div className="pt-4 border-t border-[#F1F5F9] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold text-[#0F172A]">
              Drive Capacity &amp; Held Sessions Inspector
            </h3>
            <p className="text-[12px] text-[#64748B] mt-0.5">
              Inspect candidate waiting-room status and trigger FIFO capacity release for any drive.
            </p>
          </div>

          {Array.isArray(drives) && drives.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-[12px] font-semibold text-[#475569]">Select Drive:</label>
              <select
                value={selectedDriveId}
                onChange={(e) => setSelectedDriveId(e.target.value)}
                className="h-[36px] px-3 border border-[#E2E8F0] rounded-[8px] text-[12px] text-[#0F172A] bg-white outline-none focus:ring-2 focus:ring-[#2563EB]/10"
              >
                {drives.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {selectedDriveId ? (
          <DriveCapacityPanel
            driveId={selectedDriveId}
            driveName={drives.find((d) => d.id === selectedDriveId)?.name}
            onRefresh={() => loadBillingAccount(true)}
          />
        ) : (
          <div className="p-8 text-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px] text-[#64748B]">
            <p className="text-[13px]">Select an active drive above to inspect real-time capacity and held sessions.</p>
          </div>
        )}
      </div>
    </div>
  );
}
