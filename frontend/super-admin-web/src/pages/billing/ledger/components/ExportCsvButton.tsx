import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { downloadLedgerCsv } from '@/lib/api/billing/billing.api';
import { toast } from 'sonner';

interface ExportCsvButtonProps {
  params: {
    accountId?: string;
    entryType?: string;
    startDate?: string;
    endDate?: string;
    shadowMode?: boolean;
  };
}

export const ExportCsvButton: React.FC<ExportCsvButtonProps> = ({ params }) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      await downloadLedgerCsv(params);
      toast.success('Authoritative ledger export downloaded successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download ledger CSV');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
      icon={Download}
      isLoading={isExporting}
    >
      Export CSV
    </Button>
  );
};
