import React, { useState } from 'react';
import { ShieldCheck, Plus, RefreshCw } from 'lucide-react';
import { usePendingBillingRequests } from '@/hooks/billing/useBilling';
import { useAuthStore } from '@/lib/auth-store';
import { MakerCheckerTabs, type QueueTabType } from './components/MakerCheckerTabs';
import { RequestTable } from './components/RequestTable';
import { ApproveRequestDialog } from './components/ApproveRequestDialog';
import { RejectRequestDialog } from './components/RejectRequestDialog';
import { CreateBillingRequestModal } from './components/CreateBillingRequestModal';
import { Button } from '@/components/ui/Button';
import type { ManualBillingRequestItem } from '@/lib/api/billing/types';

export const MakerCheckerQueuePage: React.FC = () => {
  const { staff } = useAuthStore();
  const [currentTab, setCurrentTab] = useState<QueueTabType>('pending');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [selectedApproveRequest, setSelectedApproveRequest] = useState<ManualBillingRequestItem | null>(null);
  const [selectedRejectRequest, setSelectedRejectRequest] = useState<ManualBillingRequestItem | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Map active tab to query filters
  const queryParams = {
    page,
    pageSize,
    status: currentTab === 'pending' ? 'PENDING' : currentTab === 'resolved' ? 'EXECUTED' : undefined,
    requestedBy: currentTab === 'my_requests' ? staff?.id : undefined,
  };

  const { data, isLoading, refetch, isRefetching } = usePendingBillingRequests(queryParams);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              Maker-Checker Authorization Queue
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Dual-custody verification. Grants, refunds, and buffer increases require approval by an independent operator (Rule R8).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            isLoading={isRefetching}
            icon={RefreshCw}
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            icon={Plus}
          >
            File New Request
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <MakerCheckerTabs
        currentTab={currentTab}
        onTabChange={(tab) => {
          setCurrentTab(tab);
          setPage(1);
        }}
        pendingCount={currentTab === 'pending' ? data?.total : undefined}
      />

      {/* Requests Table */}
      <RequestTable
        requests={data?.items || []}
        isLoading={isLoading}
        total={data?.total || 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        currentUserId={staff?.id}
        userRole={staff?.role}
        onApprove={(req) => setSelectedApproveRequest(req)}
        onReject={(req) => setSelectedRejectRequest(req)}
      />

      {/* Dialogs */}
      <ApproveRequestDialog
        request={selectedApproveRequest}
        isOpen={!!selectedApproveRequest}
        onClose={() => setSelectedApproveRequest(null)}
      />

      <RejectRequestDialog
        request={selectedRejectRequest}
        isOpen={!!selectedRejectRequest}
        onClose={() => setSelectedRejectRequest(null)}
      />

      <CreateBillingRequestModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
  );
};

export default MakerCheckerQueuePage;
