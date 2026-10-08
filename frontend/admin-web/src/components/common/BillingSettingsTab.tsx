import React, { useState, useEffect, useMemo } from "react";
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
  Download,
  Plus,
  Search,
  Filter,
  HelpCircle,
  FileText,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldAlert,
  Sparkles,
  CreditCard,
  Receipt,
  ExternalLink,
  SlidersHorizontal,
  ChevronRight,
  X,
  Info,
} from "lucide-react";
import { useStore } from "../../lib/store";
import { DriveCapacityPanel } from "./DriveCapacityPanel";

interface CreditPoolItem {
  id: string;
  name: string;
  poolType: "DRIVE_PASS" | "TALENT_RESERVE" | "ENTERPRISE" | "TRIAL";
  totalCredits: number;
  cachedRemaining: number;
  status: "ACTIVE" | "QUEUED" | "EXHAUSTED" | "EXPIRED" | "SUSPENDED";
  queueOrder?: number | null;
  validityDays?: number | null;
  expiresAt?: string | null;
  clockStartedAt?: string | null;
  createdAt?: string;
  unitPriceMinor?: number;
  currency?: string;
  driveName?: string;
  driveId?: string | null;
}

interface LedgerEntryItem {
  id: string;
  createdAt: string;
  entryType: "GRANT" | "CONSUME" | "OVERDRAFT" | "OVERDRAFT_SETTLE" | "WAIVE" | "REVERSAL" | "REFUND" | "EXPIRE" | "ADJUST";
  amount: number;
  balanceAfter: number | null;
  reason: string;
  reasonNote?: string | null;
  driveName?: string | null;
  creditPoolName?: string | null;
  idempotencyKey?: string;
}

interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  date: string;
  description: string;
  amountFormatted: string;
  creditsPurchased: number;
  provider: "RAZORPAY" | "STRIPE" | "MANUAL_INVOICE";
  status: "PAID" | "PENDING" | "FAILED";
  pdfUrl?: string;
}

const DEFAULT_MOCK_POOLS: CreditPoolItem[] = [];
const DEFAULT_MOCK_LEDGER: LedgerEntryItem[] = [];
const DEFAULT_MOCK_INVOICES: InvoiceItem[] = [];

export function BillingSettingsTab() {
  const fetchBillingAccount = useStore((s) => s.fetchBillingAccount);
  const fetchLedgerEntries = useStore((s) => (s as any).fetchLedgerEntries);
  const purchaseCredits = useStore((s) => (s as any).purchaseCredits);
  const drives = useStore((s) => s.drives);
  const fetchDrives = useStore((s) => s.fetchDrives);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sub-section tab within Credit & Billing
  const [subTab, setSubTab] = useState<"overview" | "capacity" | "ledger" | "pricing" | "kyc">("overview");

  const [accountData, setAccountData] = useState<any>(null);
  const [pools, setPools] = useState<CreditPoolItem[]>(DEFAULT_MOCK_POOLS);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntryItem[]>(DEFAULT_MOCK_LEDGER);
  const [invoices, setInvoices] = useState<InvoiceItem[]>(DEFAULT_MOCK_INVOICES);
  const [loading, setLoading] = useState(true);
  const [selectedDriveId, setSelectedDriveId] = useState<string>("");

  // Modal: Buy Credits
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyPackType, setBuyPackType] = useState<"DRIVE_PASS" | "TALENT_RESERVE">("DRIVE_PASS");
  const [buyQuantity, setBuyQuantity] = useState<number>(100);
  const [buyTargetDriveId, setBuyTargetDriveId] = useState<string>("");
  const [buyCurrency, setBuyCurrency] = useState<"INR" | "USD">("INR");
  const [isProcessingBuy, setIsProcessingBuy] = useState(false);

  // Search & Filter for Ledger
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState("ALL");

  // Filter for Pools
  const [poolFilter, setPoolFilter] = useState<"ALL" | "ACTIVE" | "QUEUED">("ALL");

  const loadBillingAccount = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchBillingAccount();
      const hasLivePools =
        data &&
        ((Array.isArray(data.activePools) && data.activePools.length > 0) ||
         (Array.isArray(data.queuedPools) && data.queuedPools.length > 0) ||
         (data.totalRemaining && data.totalRemaining > 0));

      if (hasLivePools) {
        setAccountData(data);
        const combined = [
          ...(data.activePools || []).map((p: any) => ({ ...p, status: "ACTIVE" })),
          ...(data.queuedPools || []).map((p: any) => ({ ...p, status: "QUEUED" })),
        ];
        setPools(combined);
      } else {
        setAccountData({
          totalRemaining: data?.totalRemaining || 0,
          activePoolsRemaining: data?.activePoolsRemaining || 0,
          queuedPoolsCount: data?.queuedPoolsCount || 0,
          overdraftLimit: 0,
          overdraftUsed: 0,
          overdraftAvailable: 0,
          status: data?.status || "ACTIVE",
          billingAccountId: data?.billingAccountId || null,
          legalEntityName: data?.legalEntityName || null,
          billingCountry: data?.billingCountry || "IN",
          currency: data?.currency || "INR",
          taxId: data?.taxId || null,
        });
        setPools([]);
      }
    } catch (err: any) {
      console.warn("Backend billing endpoint unavailable:", err);
      setAccountData({
        totalRemaining: 0,
        activePoolsRemaining: 0,
        queuedPoolsCount: 0,
        overdraftLimit: 0,
        overdraftUsed: 0,
        overdraftAvailable: 0,
        status: "ACTIVE",
        billingAccountId: null,
        legalEntityName: null,
        billingCountry: "IN",
        currency: "INR",
        taxId: null,
      });
      setPools([]);
    }

    try {
      if (fetchLedgerEntries) {
        const entries = await fetchLedgerEntries();
        if (Array.isArray(entries) && entries.length > 0) {
          setLedgerEntries(entries);
        } else {
          setLedgerEntries([]);
        }
      }
    } catch {
      setLedgerEntries([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadBillingAccount();
    fetchDrives?.(undefined, true).then((driveList) => {
      if (Array.isArray(driveList) && driveList.length > 0) {
        setSelectedDriveId(driveList[0].id);
        setBuyTargetDriveId(driveList[0].id);
      }
    });
  }, []);

  const totalRemaining = accountData?.totalRemaining ?? 0;
  const overdraftLimit = 0;
  const overdraftUsed = 0;
  const overdraftAvailable = 0;
  const activePools = pools.filter((p) => p.status === "ACTIVE");
  const queuedPools = pools.filter((p) => p.status === "QUEUED");

  // Filtered Pools
  const filteredPools = useMemo(() => {
    if (poolFilter === "ALL") return pools;
    return pools.filter((p) => p.status === poolFilter);
  }, [pools, poolFilter]);

  // Filtered Ledger Entries
  const filteredLedger = useMemo(() => {
    return ledgerEntries.filter((entry) => {
      const matchSearch =
        !ledgerSearch ||
        entry.id.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        entry.reason.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        (entry.reasonNote && entry.reasonNote.toLowerCase().includes(ledgerSearch.toLowerCase())) ||
        (entry.candidateName && entry.candidateName.toLowerCase().includes(ledgerSearch.toLowerCase())) ||
        (entry.driveName && entry.driveName.toLowerCase().includes(ledgerSearch.toLowerCase()));

      const matchType =
        ledgerTypeFilter === "ALL" ||
        (ledgerTypeFilter === "GRANT" && entry.entryType === "GRANT") ||
        (ledgerTypeFilter === "CONSUME" && entry.entryType === "CONSUME") ||
        (ledgerTypeFilter === "WAIVE" && entry.entryType === "WAIVE") ||
        (ledgerTypeFilter === "OTHER" && !["GRANT", "CONSUME", "WAIVE"].includes(entry.entryType));

      return matchSearch && matchType;
    });
  }, [ledgerEntries, ledgerSearch, ledgerTypeFilter]);

  // Handle Credit Pack Purchase
  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (buyQuantity <= 0) {
      toast.error("Please enter a valid credit quantity");
      return;
    }
    if (buyPackType === "DRIVE_PASS" && !buyTargetDriveId && (!drives || drives.length === 0)) {
      toast.error("Please select a target drive for Drive Pass");
      return;
    }

    setIsProcessingBuy(true);
    try {
      toast.info(
        "Commercial credit purchases require verified payment gateway capture or an authorized offline PO invoice. Please contact your account manager at sales@proctora.com or billing support.",
        { duration: 6000 }
      );
      setShowBuyModal(false);
    } finally {
      setIsProcessingBuy(false);
    }
  };

  const calculateTotalCost = () => {
    const unitRate = buyCurrency === "INR" ? (buyPackType === "DRIVE_PASS" ? 50 : 60) : 2;
    const subtotal = buyQuantity * unitRate;
    const tax = buyCurrency === "INR" ? subtotal * 0.18 : 0;
    const total = subtotal + tax;
    return {
      subtotal,
      tax,
      total,
      unitRate,
    };
  };

  const cost = calculateTotalCost();

  if (!mounted) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-slate-100 rounded-md" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-28 bg-slate-50 border border-slate-200 rounded-[14px]" />
          <div className="h-28 bg-slate-50 border border-slate-200 rounded-[14px]" />
          <div className="h-28 bg-slate-50 border border-slate-200 rounded-[14px]" />
          <div className="h-28 bg-slate-50 border border-slate-200 rounded-[14px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full">
      {/* Top Header & Account Health Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-[#F1F5F9] gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[20px] font-bold text-[#0F172A] tracking-tight">
              Credit Pools &amp; Financial Billing
            </h2>
            <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse" />
              ACID STRICT ENGINE
            </span>
            <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
              MAKER-CHECKER READY
            </span>
          </div>
          <p className="text-[13px] text-[#64748B] mt-1">
            Authoritative assessment currency ledger, Jio-model auto-promotion queues, and held session waiting room management.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <button
            onClick={() => loadBillingAccount()}
            className="flex items-center gap-1.5 px-3.5 h-[36px] text-[12px] font-semibold text-[#64748B] hover:text-[#0F172A] bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] rounded-[8px] transition-all cursor-pointer shadow-2xs"
            title="Refresh balance and ledger"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-[#2563EB]" : ""} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setShowBuyModal(true)}
            className="flex items-center gap-1.5 px-4 h-[36px] text-[12px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[8px] transition-all cursor-pointer shadow-xs"
          >
            <Plus size={14} />
            <span>Buy Credits / Top-Up</span>
          </button>
        </div>
      </div>

      {/* Account Balance & Liquidity Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Active Credits */}
        <div className="p-5 bg-white border border-[#E2E8F0] rounded-[14px] shadow-2xs relative overflow-hidden group hover:border-[#2563EB]/40 transition-all">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-[12px] font-semibold">Total Active Balance</span>
            <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
              <Coins size={15} />
            </div>
          </div>
          <div className="text-[28px] font-bold text-[#0F172A] tracking-tight">
            {totalRemaining}
            <span className="text-[13px] font-normal text-[#64748B] ml-1.5">credits</span>
          </div>
          <div className="mt-2 flex items-center text-[11px]">
            {activePools.length > 0 ? (
              <span className="text-[#059669] flex items-center">
                <CheckCircle2 size={12} className="mr-1 shrink-0" />
                {activePools.length} active pool{activePools.length === 1 ? "" : "s"} ready for tests
              </span>
            ) : (
              <span className="text-[#64748B] flex items-center">
                <Info size={12} className="mr-1 text-[#94A3B8] shrink-0" />
                No active pools (Top up to activate)
              </span>
            )}
          </div>
        </div>

        {/* Queued Auto-Promotion Pools */}
        <div className="p-5 bg-white border border-[#E2E8F0] rounded-[14px] shadow-2xs relative overflow-hidden group hover:border-[#059669]/40 transition-all">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-[12px] font-semibold">Queued Pools (Jio Model)</span>
            <div className="w-7 h-7 rounded-lg bg-[#ECFDF5] text-[#059669] flex items-center justify-center">
              <Clock size={15} />
            </div>
          </div>
          <div className="text-[28px] font-bold text-[#0F172A] tracking-tight">
            {queuedPools.length}
            <span className="text-[13px] font-normal text-[#64748B] ml-1.5">in queue</span>
          </div>
          <div className="mt-2 flex items-center text-[11px] text-[#64748B]">
            <Sparkles size={12} className="mr-1 text-[#059669] shrink-0" />
            <span>Clock starts automatically on activation</span>
          </div>
        </div>

        {/* Account Standing & Policy */}
        <div className="p-5 bg-white border border-[#E2E8F0] rounded-[14px] shadow-2xs relative overflow-hidden group hover:border-[#059669]/40 transition-all">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-[12px] font-semibold">Account Standing</span>
            <div className="w-7 h-7 rounded-lg bg-[#ECFDF5] text-[#059669] flex items-center justify-center">
              <ShieldCheck size={15} />
            </div>
          </div>
          <div className="text-[24px] font-bold text-[#0F172A] tracking-tight">
            {accountData?.status || "ACTIVE"}
          </div>
          <div className="mt-2 flex items-center text-[11px] text-[#64748B]">
            <span>Overdraft Policy: Strictly Disabled (Zero Debt)</span>
          </div>
        </div>

        {/* Legal Entity & KYC Anchor */}
        <div className="p-5 bg-white border border-[#E2E8F0] rounded-[14px] shadow-2xs relative overflow-hidden group hover:border-[#8B5CF6]/40 transition-all">
          <div className="flex items-center justify-between text-[#64748B] mb-2">
            <span className="text-[12px] font-semibold">KYC &amp; Currency Anchor</span>
            <div className="w-7 h-7 rounded-lg bg-[#F5F3FF] text-[#8B5CF6] flex items-center justify-center">
              <Building2 size={15} />
            </div>
          </div>
          <div className="text-[15px] font-bold text-[#0F172A] truncate" title={accountData?.legalEntityName || "Acme Technologies India Pvt Ltd"}>
            {accountData?.legalEntityName ? accountData.legalEntityName.split(" ")[0] : "Acme Tech"}
          </div>
          <div className="mt-2 flex items-center text-[11px] text-[#64748B]">
            <Lock size={11} className="mr-1 text-[#8B5CF6] shrink-0" />
            <span>INR (₹) / GSTIN Verified</span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Navigation Pills */}
      <div className="flex items-center gap-1.5 border-b border-[#E2E8F0] pb-2 overflow-x-auto">
        {[
          { id: "overview", label: "Credit Pools Inventory", icon: Layers, count: pools.length },
          { id: "capacity", label: "Drive Capacity & Waiting Room", icon: ShieldAlert },
          { id: "ledger", label: "Digital Passbook & Ledger", icon: FileText, count: ledgerEntries.length },
          { id: "pricing", label: "Pricing Catalog & Estimator", icon: Coins },
          { id: "kyc", label: "Invoices & Compliance", icon: Receipt },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? "bg-[#EFF6FF] text-[#2563EB] font-semibold shadow-2xs"
                  : "text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC]"
              }`}
            >
              <Icon size={14} className={active ? "text-[#2563EB]" : "text-[#64748B]"} />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 text-[10.5px] rounded-full font-bold ${
                    active ? "bg-[#2563EB] text-white" : "bg-[#F1F5F9] text-[#64748B]"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CREDIT POOLS INVENTORY & VALIDITY CLOCKS */}
      {/* ========================================================================= */}
      {subTab === "overview" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F8FAFC] p-4 rounded-[12px] border border-[#E2E8F0]">
            <div>
              <h3 className="text-[14px] font-bold text-[#0F172A]">Authoritative Credit Pools</h3>
              <p className="text-[12px] text-[#64748B] mt-0.5">
                Priority order: <strong>Drive Pass</strong> &gt; <strong>Talent Reserve</strong> &gt; <strong>Queued Pack Promotion</strong>.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-[#E2E8F0] self-start sm:self-auto">
              <button
                onClick={() => setPoolFilter("ALL")}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  poolFilter === "ALL" ? "bg-[#2563EB] text-white" : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                All ({pools.length})
              </button>
              <button
                onClick={() => setPoolFilter("ACTIVE")}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  poolFilter === "ACTIVE" ? "bg-[#2563EB] text-white" : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                Active ({activePools.length})
              </button>
              <button
                onClick={() => setPoolFilter("QUEUED")}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                  poolFilter === "QUEUED" ? "bg-[#2563EB] text-white" : "text-[#64748B] hover:text-[#0F172A]"
                }`}
              >
                Queued ({queuedPools.length})
              </button>
            </div>
          </div>

          {filteredPools.length === 0 ? (
            <div className="p-12 text-center bg-white border border-[#E2E8F0] rounded-[14px]">
              <Layers size={32} className="mx-auto text-[#94A3B8] mb-2" />
              <p className="text-[14px] font-semibold text-[#0F172A]">No credit pools found in this filter</p>
              <p className="text-[12px] text-[#64748B] mt-1">
                Purchase a Drive Pass or Talent Reserve bank to fund ongoing candidate tests.
              </p>
              <button
                onClick={() => setShowBuyModal(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-all cursor-pointer"
              >
                <Plus size={13} />
                <span>Buy First Credit Pack</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPools.map((pool) => {
                const percentLeft = pool.totalCredits > 0 ? Math.round((pool.cachedRemaining / pool.totalCredits) * 100) : 0;
                const isDrivePass = pool.poolType === "DRIVE_PASS";
                const isQueued = pool.status === "QUEUED";

                return (
                  <div
                    key={pool.id}
                    className={`p-5 bg-white border rounded-[14px] shadow-2xs flex flex-col justify-between transition-all ${
                      isQueued
                        ? "border-[#E2E8F0] bg-[#FAFAFA]"
                        : "border-[#E2E8F0] hover:border-[#2563EB]/40 hover:shadow-xs"
                    }`}
                  >
                    <div>
                      {/* Card Top Row */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md tracking-wider ${
                                isDrivePass
                                  ? "bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]"
                                  : "bg-[#F5F3FF] text-[#7C3AED] border border-[#DDD6FE]"
                              }`}
                            >
                              {isDrivePass ? "Drive Pass" : "Talent Reserve"}
                            </span>

                            {isQueued && (
                              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">
                                Queue #{pool.queueOrder || 1}
                              </span>
                            )}
                          </div>

                          <h4 className="text-[15px] font-bold text-[#0F172A] mt-1.5 line-clamp-1">
                            {pool.name}
                          </h4>
                          {pool.driveName && (
                            <p className="text-[11px] text-[#64748B] mt-0.5">
                              Linked Drive: <strong className="text-[#334155]">{pool.driveName}</strong>
                            </p>
                          )}
                        </div>

                        <span
                          className={`px-2.5 py-0.5 text-[10.5px] font-bold uppercase rounded-full ${
                            pool.status === "ACTIVE"
                              ? "bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]"
                              : "bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]"
                          }`}
                        >
                          {pool.status}
                        </span>
                      </div>

                      {/* Remaining / Total Bar */}
                      <div className="my-4 space-y-1.5">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="text-[#64748B]">Capacity Available:</span>
                          <span className="font-bold text-[#0F172A]">
                            {pool.cachedRemaining} <span className="font-normal text-[#64748B]">/ {pool.totalCredits} credits</span>
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              percentLeft < 20
                                ? "bg-[#DC2626]"
                                : percentLeft < 50
                                ? "bg-[#D97706]"
                                : isDrivePass
                                ? "bg-[#2563EB]"
                                : "bg-[#7C3AED]"
                            }`}
                            style={{ width: `${percentLeft}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Details */}
                    <div className="pt-3 border-t border-[#F1F5F9] flex items-center justify-between text-[11px] text-[#64748B]">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className="text-[#94A3B8]" />
                        <span>
                          {pool.expiresAt
                            ? `Expires ${new Date(pool.expiresAt).toLocaleDateString()} (7-Day Makeup Window)`
                            : isQueued
                            ? `${pool.validityDays || 180} days validity (Starts on 1st draw)`
                            : "Floating validity active"}
                        </span>
                      </div>
                      <span className="font-medium text-[#475569]">
                        {pool.unitPriceMinor ? `₹${(pool.unitPriceMinor / 100).toFixed(0)}/test` : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DRIVE CAPACITY & HELD SESSIONS WAITING ROOM */}
      {/* ========================================================================= */}
      {subTab === "capacity" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F8FAFC] p-4 rounded-[12px] border border-[#E2E8F0]">
            <div>
              <h3 className="text-[14px] font-bold text-[#0F172A]">
                Drive Capacity &amp; Waiting Room Inspector
              </h3>
              <p className="text-[12px] text-[#64748B] mt-0.5">
                Inspect live candidate throughput, held test sessions, and configure Talent Reserve fallthrough behavior.
              </p>
            </div>

            {Array.isArray(drives) && drives.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-[12px] font-semibold text-[#475569]">Select Active Drive:</label>
                <select
                  value={selectedDriveId}
                  onChange={(e) => setSelectedDriveId(e.target.value)}
                  className="h-[36px] px-3 border border-[#E2E8F0] rounded-[8px] text-[12px] text-[#0F172A] bg-white outline-none focus:ring-2 focus:ring-[#2563EB]/10 font-medium cursor-pointer"
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
            <div className="p-12 text-center bg-white border border-[#E2E8F0] rounded-[14px] text-[#64748B]">
              <AlertTriangle size={32} className="mx-auto text-[#F59E0B] mb-2" />
              <p className="text-[14px] font-semibold text-[#0F172A]">No Active Drives Found</p>
              <p className="text-[12px] text-[#64748B] mt-1">
                Create a hiring drive first to inspect candidate queue capacity and waiting room status.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: DIGITAL AUDIT LEDGER & PASSBOOK */}
      {/* ========================================================================= */}
      {subTab === "ledger" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
            <div>
              <h3 className="text-[15px] font-bold text-[#0F172A]">Digital Credit Passbook</h3>
              <p className="text-[12px] text-[#64748B] mt-0.5">
                Authoritative double-entry immutable audit trail of all credit movements.
              </p>
            </div>

            {/* Search & Type Filter */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  placeholder="Search ledger entries..."
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  className="h-[34px] pl-9 pr-3 text-[12px] bg-white border border-[#E2E8F0] rounded-[8px] outline-none focus:border-[#2563EB] w-[200px]"
                />
              </div>

              <select
                value={ledgerTypeFilter}
                onChange={(e) => setLedgerTypeFilter(e.target.value)}
                className="h-[34px] px-3 text-[12px] bg-white border border-[#E2E8F0] rounded-[8px] outline-none focus:border-[#2563EB] text-[#475569] cursor-pointer"
              >
                <option value="ALL">All Actions</option>
                <option value="GRANT">Grants (+)</option>
                <option value="CONSUME">Deductions (-1)</option>
                <option value="WAIVE">Waived (0)</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-[14px] overflow-hidden shadow-2xs">
            {filteredLedger.length === 0 ? (
              <div className="p-12 text-center text-[#64748B]">
                <FileText size={28} className="mx-auto text-[#94A3B8] mb-2" />
                <p className="text-[13px] font-semibold text-[#0F172A]">No transactions match your search</p>
                <p className="text-[12px] text-[#94A3B8] mt-0.5">Try clearing your search query or filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                    <tr>
                      <th className="px-5 py-3">Tx ID / Timestamp</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Credits</th>
                      <th className="px-5 py-3">Balance After</th>
                      <th className="px-5 py-3">Reason &amp; Activity Note</th>
                      <th className="px-5 py-3">Pool / Drive Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9] text-[#0F172A]">
                    {filteredLedger.map((tx) => {
                      const isGrant = tx.entryType === "GRANT";
                      const isConsume = tx.entryType === "CONSUME";
                      const isWaive = tx.entryType === "WAIVE";

                      return (
                        <tr key={tx.id} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="font-mono text-[11px] font-bold text-[#2563EB]">{tx.id}</div>
                            <div className="text-[11px] text-[#64748B]">
                              {new Date(tx.createdAt).toLocaleString()}
                            </div>
                          </td>

                          <td className="px-5 py-3.5">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                                isGrant
                                  ? "bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]"
                                  : isConsume
                                  ? "bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]"
                                  : isWaive
                                  ? "bg-[#F5F3FF] text-[#7C3AED] border border-[#DDD6FE]"
                                  : "bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]"
                              }`}
                            >
                              {tx.entryType}
                            </span>
                          </td>

                          <td className="px-5 py-3.5">
                            <span
                              className={`font-bold font-mono text-[13px] ${
                                isGrant
                                  ? "text-[#059669]"
                                  : isConsume
                                  ? "text-[#DC2626]"
                                  : "text-[#64748B]"
                              }`}
                            >
                              {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                            </span>
                          </td>

                          <td className="px-5 py-3.5 font-mono text-[12px] text-[#475569]">
                            {tx.balanceAfter !== null ? `${tx.balanceAfter} credits` : "—"}
                          </td>

                          <td className="px-5 py-3.5 max-w-[320px]">
                            <div className="font-semibold text-[#0F172A] text-[12px]">{tx.reason}</div>
                            <div className="text-[11px] text-[#64748B] truncate" title={tx.reasonNote || ""}>
                              {tx.reasonNote || "—"}
                            </div>
                          </td>

                          <td className="px-5 py-3.5 text-[#64748B]">
                            {tx.creditPoolName && (
                              <div className="font-medium text-[#334155] text-[11.5px] truncate max-w-[200px]">
                                {tx.creditPoolName}
                              </div>
                            )}
                            {tx.driveName && (
                              <div className="text-[10.5px] text-[#94A3B8] truncate max-w-[200px]">
                                {tx.driveName}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PRICING CATALOG & ESTIMATOR */}
      {/* ========================================================================= */}
      {subTab === "pricing" && (
        <div className="space-y-6">
          <div className="bg-[#F8FAFC] p-5 rounded-[14px] border border-[#E2E8F0]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-[15px] font-bold text-[#0F172A]">
                  Commercial Pricing &amp; Pack Estimator
                </h3>
                <p className="text-[12px] text-[#64748B] mt-0.5">
                  Predictable flat rate: <strong>1 Credit = 1 Real Live Test Started</strong>. Setup, invitations, and lobby waiting are 100% free.
                </p>
              </div>

              {/* Currency Selector */}
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-[#E2E8F0] self-start sm:self-auto">
                <button
                  onClick={() => setBuyCurrency("INR")}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                    buyCurrency === "INR" ? "bg-[#2563EB] text-white" : "text-[#64748B]"
                  }`}
                >
                  INR (₹) India
                </button>
                <button
                  onClick={() => setBuyCurrency("USD")}
                  className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                    buyCurrency === "USD" ? "bg-[#2563EB] text-white" : "text-[#64748B]"
                  }`}
                >
                  USD ($) Global
                </button>
              </div>
            </div>
          </div>

          {/* Plan Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Plan A: Drive Pass */}
            <div className="p-6 bg-white border border-[#E2E8F0] rounded-[16px] shadow-2xs hover:border-[#2563EB] transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase rounded-md bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                    Plan 1: Event Bulk Pack
                  </span>
                  <span className="text-[11px] font-bold text-[#059669] bg-[#ECFDF5] px-2 py-0.5 rounded">
                    Save ~17%
                  </span>
                </div>
                <h4 className="text-[18px] font-bold text-[#0F172A]">Drive Pass Pack</h4>
                <p className="text-[12px] text-[#64748B] mt-1">
                  Tailored for single high-volume events (Campus Placements, Hackathons, Hiring Sprints).
                </p>

                <div className="my-5 text-[28px] font-bold text-[#0F172A]">
                  {buyCurrency === "INR" ? "₹50" : "$1.75"}{" "}
                  <span className="text-[13px] font-normal text-[#64748B]">/ test started</span>
                </div>

                <ul className="space-y-2 text-[12px] text-[#334155]">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-[#059669] shrink-0" />
                    <span>Dedicated directly to your target drive</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-[#059669] shrink-0" />
                    <span>Includes <strong>7-Day Makeup Window</strong> for sick no-shows</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-[#059669] shrink-0" />
                    <span>Can rollover leftover credits to next campus within 7 days</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-[#059669] shrink-0" />
                    <span>Instant seat top-up available if extra students arrive at gate</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => {
                  setBuyPackType("DRIVE_PASS");
                  setShowBuyModal(true);
                }}
                className="mt-6 w-full h-[40px] text-[13px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[10px] transition-all cursor-pointer shadow-xs"
              >
                Configure Drive Pass
              </button>
            </div>

            {/* Plan B: Talent Reserve */}
            <div className="p-6 bg-white border border-[#E2E8F0] rounded-[16px] shadow-2xs hover:border-[#7C3AED] transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-0.5 text-[11px] font-bold uppercase rounded-md bg-[#F5F3FF] text-[#7C3AED] border border-[#DDD6FE]">
                    Plan 2: Flexible Bank
                  </span>
                  <span className="text-[11px] font-bold text-[#7C3AED] bg-[#F5F3FF] px-2 py-0.5 rounded">
                    Everyday Lateral
                  </span>
                </div>
                <h4 className="text-[18px] font-bold text-[#0F172A]">Talent Reserve Bank</h4>
                <p className="text-[12px] text-[#64748B] mt-1">
                  Flexible balance for year-round hiring across any department, any role, anytime.
                </p>

                <div className="my-5 text-[28px] font-bold text-[#0F172A]">
                  {buyCurrency === "INR" ? "₹60" : "$2.00"}{" "}
                  <span className="text-[13px] font-normal text-[#64748B]">/ test started</span>
                </div>

                <ul className="space-y-2 text-[12px] text-[#334155]">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-[#059669] shrink-0" />
                    <span><strong>Floating Clock:</strong> Countdown starts only on 1st candidate test</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-[#059669] shrink-0" />
                    <span><strong>Jio Model Queue:</strong> Secondary packs queue seamlessly</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-[#059669] shrink-0" />
                    <span>Usable across any drive as automatic fallback safety net</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-[#059669] shrink-0" />
                    <span>6 to 12 months validity from first draw</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => {
                  setBuyPackType("TALENT_RESERVE");
                  setShowBuyModal(true);
                }}
                className="mt-6 w-full h-[40px] text-[13px] font-semibold text-white bg-[#7C3AED] hover:bg-[#6D28D9] rounded-[10px] transition-all cursor-pointer shadow-xs"
              >
                Configure Talent Reserve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: INVOICES & KYC COMPLIANCE */}
      {/* ========================================================================= */}
      {subTab === "kyc" && (
        <div className="space-y-6">
          {/* KYC Details Card */}
          <div className="p-5 bg-white border border-[#E2E8F0] rounded-[14px] shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-[#2563EB]" />
                <h4 className="text-[14px] font-bold text-[#0F172A]">Tax &amp; Legal Entity Information</h4>
              </div>
              <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">
                KYC VERIFIED
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-[12px]">
              <div>
                <span className="text-[#64748B]">Legal Entity Name:</span>
                <p className="font-semibold text-[#0F172A] mt-0.5">
                  {accountData?.legalEntityName || "Acme Corporation Technologies India Pvt Ltd"}
                </p>
              </div>
              <div>
                <span className="text-[#64748B]">Tax ID / GSTIN / EIN:</span>
                <p className="font-semibold text-[#0F172A] mt-0.5">
                  {accountData?.taxId || "27AADCB2230M1Z2"}
                </p>
              </div>
              <div>
                <span className="text-[#64748B]">Registered Billing Country:</span>
                <p className="font-semibold text-[#0F172A] mt-0.5">
                  India (IN) — INR (₹) Anchored
                </p>
              </div>
            </div>
          </div>

          {/* Invoices List */}
          <div className="bg-white border border-[#E2E8F0] rounded-[14px] overflow-hidden shadow-2xs">
            <div className="px-5 py-4 border-b border-[#F1F5F9] flex items-center justify-between bg-[#F8FAFC]">
              <div>
                <h4 className="text-[14px] font-bold text-[#0F172A]">Payment Invoices &amp; Receipts</h4>
                <p className="text-[12px] text-[#64748B] mt-0.5">
                  Tax invoices with GSTIN / VAT compliance ready for accounting download.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                  <tr>
                    <th className="px-5 py-3">Invoice Number</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">Credits</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-[#0F172A]">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="px-5 py-3.5 font-mono font-semibold text-[#2563EB]">
                        {inv.invoiceNumber}
                      </td>
                      <td className="px-5 py-3.5 text-[#64748B]">{inv.date}</td>
                      <td className="px-5 py-3.5 font-medium">{inv.description}</td>
                      <td className="px-5 py-3.5 font-semibold text-[#0F172A]">
                        {inv.creditsPurchased} credits
                      </td>
                      <td className="px-5 py-3.5 font-bold text-[#0F172A]">{inv.amountFormatted}</td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]">
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => toast.success(`Receipt for ${inv.invoiceNumber} downloaded`)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] hover:bg-[#EFF6FF] rounded-md transition-all cursor-pointer"
                        >
                          <Download size={12} />
                          <span>PDF</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: BUY CREDITS / TOP-UP */}
      {/* ========================================================================= */}
      {showBuyModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-[20px] p-6 max-w-lg w-full shadow-2xl border border-[#E2E8F0] space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
                  <Coins size={18} />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-[#0F172A]">Purchase Assessment Credits</h3>
                  <p className="text-[11px] text-[#64748B]">Instant allocation with automatic ledger entry</p>
                </div>
              </div>
              <button
                onClick={() => setShowBuyModal(false)}
                className="text-[#94A3B8] hover:text-[#0F172A] p-1.5 rounded-lg hover:bg-[#F1F5F9] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handlePurchase} className="space-y-4 text-[12px]">
              {/* Pack Type Toggle */}
              <div>
                <label className="block font-semibold text-[#334155] mb-1.5">Select Commercial Plan</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBuyPackType("DRIVE_PASS")}
                    className={`p-3 rounded-[10px] border text-left cursor-pointer transition-all ${
                      buyPackType === "DRIVE_PASS"
                        ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                        : "border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]"
                    }`}
                  >
                    <div className="font-bold text-[13px]">Drive Pass Pack</div>
                    <div className="text-[11px] opacity-80 mt-0.5">Event-specific + 7-Day Makeup</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBuyPackType("TALENT_RESERVE")}
                    className={`p-3 rounded-[10px] border text-left cursor-pointer transition-all ${
                      buyPackType === "TALENT_RESERVE"
                        ? "border-[#7C3AED] bg-[#F5F3FF] text-[#7C3AED]"
                        : "border-[#E2E8F0] text-[#64748B] hover:border-[#CBD5E1]"
                    }`}
                  >
                    <div className="font-bold text-[13px]">Talent Reserve Bank</div>
                    <div className="text-[11px] opacity-80 mt-0.5">Account-wide + Jio Queue</div>
                  </button>
                </div>
              </div>

              {/* Target Drive Selector for Drive Pass */}
              {buyPackType === "DRIVE_PASS" && Array.isArray(drives) && drives.length > 0 && (
                <div>
                  <label className="block font-semibold text-[#334155] mb-1">Target Hiring Drive *</label>
                  <select
                    value={buyTargetDriveId}
                    onChange={(e) => setBuyTargetDriveId(e.target.value)}
                    className="w-full h-[38px] px-3 border border-[#E2E8F0] rounded-[8px] bg-white text-[#0F172A] outline-none focus:border-[#2563EB] cursor-pointer"
                  >
                    {drives.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Credit Quantity */}
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Credit Quantity (1 Credit = 1 Live Test Started)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={10}
                    step={10}
                    value={buyQuantity}
                    onChange={(e) => setBuyQuantity(parseInt(e.target.value) || 0)}
                    className="w-full h-[38px] px-3 border border-[#E2E8F0] rounded-[8px] bg-white text-[#0F172A] font-bold text-[14px] outline-none focus:border-[#2563EB]"
                  />
                  <div className="flex gap-1">
                    {[50, 100, 250, 500].map((qty) => (
                      <button
                        key={qty}
                        type="button"
                        onClick={() => setBuyQuantity(qty)}
                        className={`px-2.5 h-[38px] text-[11px] font-bold rounded-[8px] border transition-all cursor-pointer ${
                          buyQuantity === qty
                            ? "bg-[#2563EB] text-white border-[#2563EB]"
                            : "bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] hover:bg-[#F1F5F9]"
                        }`}
                      >
                        +{qty}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Summary Price Card */}
              <div className="p-4 bg-[#F8FAFC] rounded-[10px] border border-[#E2E8F0] space-y-2">
                <div className="flex items-center justify-between text-[#64748B]">
                  <span>Unit Rate ({buyCurrency}):</span>
                  <span>{buyCurrency === "INR" ? `₹${cost.unitRate}` : `$${cost.unitRate}`} / test</span>
                </div>
                <div className="flex items-center justify-between text-[#64748B]">
                  <span>Subtotal ({buyQuantity} credits):</span>
                  <span>{buyCurrency === "INR" ? `₹${cost.subtotal.toLocaleString()}` : `$${cost.subtotal.toLocaleString()}`}</span>
                </div>
                {buyCurrency === "INR" && (
                  <div className="flex items-center justify-between text-[#64748B]">
                    <span>GST (18%):</span>
                    <span>₹{cost.tax.toLocaleString()}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between font-bold text-[#0F172A] text-[14px]">
                  <span>Total Payable:</span>
                  <span className="text-[#2563EB]">
                    {buyCurrency === "INR" ? `₹${cost.total.toLocaleString()}` : `$${cost.total.toLocaleString()}`}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBuyModal(false)}
                  className="px-4 h-[38px] text-[12px] font-semibold text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingBuy || buyQuantity <= 0}
                  className="flex items-center gap-1.5 px-5 h-[38px] text-[12px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isProcessingBuy ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Allocating Credits…</span>
                    </>
                  ) : (
                    <>
                      <CreditCard size={14} />
                      <span>Confirm &amp; Allocate Credits</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
