import React from 'react';
import { Search, Plus } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

interface AccountsFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  currency: string;
  onCurrencyChange: (value: string) => void;
  onCreateClick?: () => void;
  canCreate?: boolean;
}

export const AccountsFilterBar: React.FC<AccountsFilterBarProps> = ({
  search,
  onSearchChange,
  status,
  onStatusChange,
  currency,
  onCurrencyChange,
  onCreateClick,
  canCreate = false,
}) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-white border border-[#e8ecf4] rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
      <div className="flex flex-1 flex-col sm:flex-row items-center gap-3">
        <div className="w-full sm:w-72">
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search account ID, org name..."
            icon={Search}
          />
        </div>

        <div className="w-full sm:w-44">
          <Select
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'RESTRICTED', label: 'Restricted' },
              { value: 'SUSPENDED', label: 'Suspended' },
            ]}
          />
        </div>

        <div className="w-full sm:w-36">
          <Select
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            options={[
              { value: '', label: 'All Currencies' },
              { value: 'INR', label: 'INR (₹)' },
              { value: 'USD', label: 'USD ($)' },
              { value: 'MYR', label: 'MYR (RM)' },
            ]}
          />
        </div>
      </div>

      {canCreate && onCreateClick && (
        <Button onClick={onCreateClick} variant="primary" icon={Plus} className="shrink-0">
          Create Account
        </Button>
      )}
    </div>
  );
};
