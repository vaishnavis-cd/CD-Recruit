import React, { useState } from 'react';
import { Radio, RotateCw } from 'lucide-react';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { ReplayWebhookDialog } from './ReplayWebhookDialog';
import { formatDateTime, truncateId } from '@/lib/utils';
import { useWebhookEvents } from '@/hooks/billing/useBilling';

export const WebhookInboxTab: React.FC = () => {
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);

  const { data, isLoading } = useWebhookEvents({ page, pageSize });

  const headers = [
    'Event ID',
    'Gateway',
    'Event Type',
    'Status',
    'Received At',
    'Payload Key',
    'Actions',
  ];

  return (
    <div className="space-y-4">
      <DataTable
        headers={headers}
        isLoading={isLoading}
        isEmpty={!isLoading && (!data || data.items.length === 0)}
        emptyTitle="No Webhook Events Logged"
        emptyDescription="Inbound gateway notification webhooks will be registered here."
        emptyIcon={Radio}
        pagination={{
          page,
          pageSize,
          total: data?.total || 0,
          onPageChange: setPage,
        }}
      >
        {data?.items.map((item) => (
          <tr key={item.id} className="hover:bg-slate-50/80 border-b border-[#e8ecf4] transition">
            <td className="py-3.5 px-4 font-mono text-xs text-slate-700 font-medium">
              {truncateId(item.id, 8, 4)}
            </td>

            <td className="py-3.5 px-4 font-semibold text-xs text-[#2f68ff]">
              {item.gateway}
            </td>

            <td className="py-3.5 px-4 font-mono text-xs text-slate-800 font-medium">
              {item.eventType}
            </td>

            <td className="py-3.5 px-4">
              <StatusBadge status={item.status} />
            </td>

            <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
              {formatDateTime(item.createdAt)}
            </td>

            <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
              {item.idempotencyKey ? truncateId(item.idempotencyKey, 8, 4) : '—'}
            </td>

            <td className="py-3.5 px-4 text-right">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedWebhookId(item.id)}
                className="h-7 text-xs px-2.5"
                icon={RotateCw}
              >
                Replay
              </Button>
            </td>
          </tr>
        ))}
      </DataTable>

      <ReplayWebhookDialog
        webhookId={selectedWebhookId}
        isOpen={!!selectedWebhookId}
        onClose={() => setSelectedWebhookId(null)}
      />
    </div>
  );
};
