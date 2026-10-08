import React, { useState } from 'react';
import { DollarSign, Plus, RefreshCw, Radio } from 'lucide-react';
import { usePayments } from '@/hooks/billing/useBilling';
import { useAuthStore } from '@/lib/auth-store';
import { PaymentsTable } from './components/PaymentsTable';
import { RecordManualInvoiceModal } from './components/RecordManualInvoiceModal';
import { WebhookInboxTab } from './components/WebhookInboxTab';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';

export const PaymentsConsolePage: React.FC = () => {
  const { staff } = useAuthStore();
  const [activeTab, setActiveTab] = useState('payments');
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);

  const { data, isLoading, refetch, isRefetching } = usePayments({ page, pageSize });

  const canManage = staff?.role === 'OWNER' || staff?.role === 'FINANCE';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <DollarSign className="w-6 h-6 text-[#2f68ff]" />
              Payments & Invoices Console
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Reconciled payment gateway charges, automated webhook ingest, and enterprise manual wire settlements.
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
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsRecordModalOpen(true)}
              icon={Plus}
            >
              Record Manual Wire / Invoice
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="payments" icon={DollarSign} count={data?.total}>
            Settled Transactions
          </TabsTrigger>
          <TabsTrigger value="webhooks" icon={Radio}>
            Gateway Webhook Ingest
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payments">
          <PaymentsTable
            payments={data?.items || []}
            isLoading={isLoading}
            total={data?.total || 0}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </TabsContent>

        <TabsContent value="webhooks">
          <WebhookInboxTab />
        </TabsContent>
      </Tabs>

      {/* Manual Invoice Modal */}
      <RecordManualInvoiceModal
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
      />
    </div>
  );
};

export default PaymentsConsolePage;
