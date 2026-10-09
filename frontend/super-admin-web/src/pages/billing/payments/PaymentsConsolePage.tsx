import React, { useState } from 'react';
import { DollarSign, Plus, RefreshCw, RotateCw } from 'lucide-react';
import { usePayments } from '@/hooks/billing/useBilling';
import { useAuthStore } from '@/lib/auth-store';
import { PaymentsTable } from './components/PaymentsTable';
import { RecordManualInvoiceModal } from './components/RecordManualInvoiceModal';
import { ReplayWebhookDialog } from './components/ReplayWebhookDialog';
import { Button } from '@/components/ui/Button';

export const PaymentsConsolePage: React.FC = () => {
  const { staff } = useAuthStore();
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isReplayModalOpen, setIsReplayModalOpen] = useState(false);

  const { data, isLoading, refetch, isRefetching } = usePayments({ page, pageSize });

  const canManage = staff?.role === 'OWNER' || staff?.role === 'FINANCE';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              
              Payments & Invoices Console
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative payment transactions, gateway captures, and enterprise manual wire settlements.
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

          {canManage && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReplayModalOpen(true)}
                icon={RotateCw}
              >
                Replay Webhook
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsRecordModalOpen(true)}
                icon={Plus}
              >
                Record Manual Wire / Invoice
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Settled Transactions Data Table */}
      <div className="space-y-4">
        <PaymentsTable
          payments={data?.items || []}
          isLoading={isLoading}
          total={data?.total || 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>

      {/* Manual Invoice Modal */}
      <RecordManualInvoiceModal
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
      />

      {/* Replay Webhook Dialog */}
      <ReplayWebhookDialog
        isOpen={isReplayModalOpen}
        onClose={() => setIsReplayModalOpen(false)}
      />
    </div>
  );
};

export default PaymentsConsolePage;
