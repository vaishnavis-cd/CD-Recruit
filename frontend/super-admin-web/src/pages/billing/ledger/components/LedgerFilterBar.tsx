import React from 'react';
import { Search, Eye } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ExportCsvButton } from './ExportCsvButton';

interface LedgerFilterBarProps {
  accountId: string;
  onAccountIdChange: (val: string) => void;
  entryType: string;
  onEntryTypeChange: (val: string) => void;
  datePreset: string;
  onDatePresetChange: (val: string) => void;
  shadowMode: boolean;
  onShadowModeToggle: (val: boolean) => void;
  exportParams: {
    accountId?: string;
    entryType?: string;
    startDate?: string;
    endDate?: string;
    shadowMode?: boolean;
  };
}

export const LedgerFilterBar: React.FC<LedgerFilterBarProps> = ({
  accountId,
  onAccountIdChange,
  entryType,
  onEntryTypeChange,
  datePreset,
  onDatePresetChange,
  shadowMode,
  onShadowModeToggle,
  exportParams,
}) => {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-white border border-[#e8ecf4] rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <div className="w-full sm:w-64">
          <Input
            value={accountId}
            onChange={(e) => onAccountIdChange(e.target.value)}
            placeholder="Filter by Account ID..."
            icon={Search}
          />
        </div>

        <div className="w-full sm:w-44">
          <Select
            value={entryType}
            onChange={(e) => onEntryTypeChange(e.target.value)}
            options={[
              { value: '', label: 'All Entry Types' },
              { value: 'GRANT', label: 'GRANT (Top-up)' },
              { value: 'CONSUME', label: 'CONSUME (Drawdown)' },
              { value: 'OVERDRAFT', label: 'OVERDRAFT (Buffer)' },
              { value: 'REVERSAL', label: 'REVERSAL (Dispute)' },
              { value: 'WAIVE', label: 'WAIVE (Forgiven)' },
            ]}
          />
        </div>

        <div className="w-full sm:w-40">
          <Select
            value={datePreset}
            onChange={(e) => onDatePresetChange(e.target.value)}
            options={[
              { value: 'all', label: 'All Time' },
              { value: '24h', label: 'Past 24 Hours' },
              { value: '7d', label: 'Past 7 Days' },
              { value: '30d', label: 'Past 30 Days' },
            ]}
          />
        </div>

        <button
          type="button"
          onClick={() => onShadowModeToggle(!shadowMode)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition ${
            shadowMode
              ? 'bg-[#fffbeb] border-[#fde68a] text-[#b54708]'
              : 'bg-white border-[#e2e8f0] text-slate-600 hover:text-slate-900 shadow-xs'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>{shadowMode ? 'Shadow Run View' : 'Authoritative Only'}</span>
        </button>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <ExportCsvButton params={exportParams} />
      </div>
    </div>
  );
};
