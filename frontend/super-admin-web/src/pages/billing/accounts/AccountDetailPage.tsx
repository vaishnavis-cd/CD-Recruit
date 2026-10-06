import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Layers, Building2, History } from 'lucide-react';
import { useBillingAccountDetail } from '@/hooks/billing/useBilling';
import { useAuthStore } from '@/lib/auth-store';
import { AccountDetailHeader } from './components/AccountDetailHeader';
import { AccountPoolsTab } from './components/AccountPoolsTab';
import { AccountOrganizationsTab } from './components/AccountOrganizationsTab';
import { AccountTransactionsTab } from './components/AccountTransactionsTab';
import { OverdraftModal } from './components/OverdraftModal';
import { StatusChangeModal } from './components/StatusChangeModal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';

export const AccountDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { staff } = useAuthStore();
  const { data: account, isLoading, error, refetch } = useBillingAccountDetail(id || '');

  const [activeTab, setActiveTab] = useState('pools');
  const [isOverdraftModalOpen, setIsOverdraftModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  const canManage = staff?.role === 'OWNER' || staff?.role === 'FINANCE';

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        <p className="text-xs text-slate-400">Loading commercial account ledger...</p>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="p-8 max-w-xl mx-auto bg-slate-900/60 border border-slate-800 rounded-2xl text-center space-y-4">
        <h2 className="text-base font-bold text-white">Account Not Found</h2>
        <p className="text-xs text-slate-400">
          The requested billing account could not be retrieved from the authoritative ledger.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/billing/accounts">
            <Button variant="outline" size="sm" icon={ArrowLeft}>
              Back to Accounts
            </Button>
          </Link>
          <Button variant="primary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Account Header Banner */}
      <AccountDetailHeader
        account={account}
        onOpenOverdraft={() => setIsOverdraftModalOpen(true)}
        onOpenStatusModal={() => setIsStatusModalOpen(true)}
        canManage={canManage}
      />

      {/* Detail Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pools" icon={Layers} count={account.pools?.length}>
            Credit Pools
          </TabsTrigger>
          <TabsTrigger value="orgs" icon={Building2} count={account.organizations?.length}>
            Organizations
          </TabsTrigger>
          <TabsTrigger value="ledger" icon={History} count={account.recentTransactions?.length}>
            Authoritative Ledger
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pools">
          <AccountPoolsTab pools={account.pools || []} canCreatePool={canManage} />
        </TabsContent>

        <TabsContent value="orgs">
          <AccountOrganizationsTab organizations={account.organizations || []} />
        </TabsContent>

        <TabsContent value="ledger">
          <AccountTransactionsTab
            accountId={account.id}
            transactions={account.recentTransactions || []}
          />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <OverdraftModal
        account={account as any}
        isOpen={isOverdraftModalOpen}
        onClose={() => setIsOverdraftModalOpen(false)}
      />

      <StatusChangeModal
        account={account}
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
      />
    </div>
  );
};

export default AccountDetailPage;
