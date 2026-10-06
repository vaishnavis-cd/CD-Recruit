import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { DataTable } from '@/components/ui/DataTable';
import { RequestRow } from './RequestRow';
import type { ManualBillingRequestItem } from '@/lib/api/billing/types';

interface RequestTableProps {
  requests: ManualBillingRequestItem[];
  isLoading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  currentUserId?: string;
  userRole?: string;
  onApprove: (request: ManualBillingRequestItem) => void;
  onReject: (request: ManualBillingRequestItem) => void;
  onRetry?: (requestId: string) => void;
}

const HEADERS = [
  'Request ID',
  'Account ID',
  'Action',
  'Amount',
  'Status',
  'Requester',
  'Created At',
  'Justification',
  'Authorize',
];

export const RequestTable: React.FC<RequestTableProps> = ({
  requests,
  isLoading,
  total,
  page,
  pageSize,
  onPageChange,
  currentUserId,
  userRole,
  onApprove,
  onReject,
  onRetry,
}) => {
  return (
    <DataTable
      headers={HEADERS}
      isLoading={isLoading}
      isEmpty={!isLoading && requests.length === 0}
      emptyTitle="No Authorization Requests in Queue"
      emptyDescription="The dual-approval pipeline is clear. New requests will appear here for verification."
      emptyIcon={ShieldCheck}
      pagination={{
        page,
        pageSize,
        total,
        onPageChange,
      }}
    >
      {requests.map((request) => (
        <RequestRow
          key={request.id}
          request={request}
          currentUserId={currentUserId}
          userRole={userRole}
          onApprove={onApprove}
          onReject={onReject}
          onRetry={onRetry}
        />
      ))}
    </DataTable>
  );
};
