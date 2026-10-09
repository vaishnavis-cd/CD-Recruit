import React, { useState } from 'react';
import { Tag, Plus, RefreshCw } from 'lucide-react';
import { usePriceBook } from '@/hooks/billing/useBilling';
import { useAuthStore } from '@/lib/auth-store';
import { CountryTabs, type CountryCode } from './components/CountryTabs';
import { PriceBookTable } from './components/PriceBookTable';
import { PublishPriceModal } from './components/PublishPriceModal';
import { Button } from '@/components/ui/Button';

const COUNTRY_TO_CURRENCY: Record<CountryCode, string> = {
  IN: 'INR',
  US: 'USD',
  MY: 'MYR',
};

export const PriceBookPage: React.FC = () => {
  const { staff } = useAuthStore();
  const [country, setCountry] = useState<CountryCode>('IN');
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);

  const currency = COUNTRY_TO_CURRENCY[country];
  const { data, isLoading, refetch, isRefetching } = usePriceBook(currency);

  const canPublish = staff?.role === 'OWNER' || staff?.role === 'FINANCE';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <Tag className="w-6 h-6 text-[#2f68ff]" />
              Regional Commercial Price Books
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative unit prices pegged to territorial currency zones. Historical contracts remain protected.
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

          {canPublish && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsPublishModalOpen(true)}
              icon={Plus}
            >
              Publish New Price
            </Button>
          )}
        </div>
      </div>

      {/* Territorial Tabs */}
      <CountryTabs country={country} onCountryChange={setCountry} />

      {/* Price Schedule Table */}
      <PriceBookTable items={data || []} isLoading={isLoading} />

      {/* Publish Modal */}
      <PublishPriceModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        defaultCurrency={currency}
      />
    </div>
  );
};

export default PriceBookPage;
