import React from 'react';
import { Link } from 'react-router-dom';
import { Check, X, RotateCw, ShieldAlert } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { formatNumber, formatDateTime, truncateId } from '@/lib/utils';
import type { ManualBillingRequestItem } from '@/lib/api/billing/types';

interface RequestRowProps {
  request: ManualBillingRequestItem;
  currentUserId?: string;
  userRole?: string;
  onApprove: (request: ManualBillingRequestItem) => void;
  onReject: (request: ManualBillingRequestItem) => void;
  onRetry?: (requestId: string) => void;
}

export const RequestRow: React.FC<RequestRowProps> = ({
  request,
  currentUserId,
  userRole,
  onApprove,
  onReject,
  onRetry,
}) => {
  const isPending = request.status === 'PENDING';
  const requesterId = request.requestedBy || request.requestedById;
  const isSelfRequest = Boolean(currentUserId && requesterId === currentUserId);
  const canApprove = (userRole === 'OWNER' || userRole === 'FINANCE') && isPending && !isSelfRequest;
  const reqType = request.requestType || request.kind || 'GRANT';
  const amountVal = request.amount ?? (request.payload as any)?.amount;

  return (
    <tr className="hover:bg-slate-50/80 border-b border-[#e8ecf4] transition">
      <td className="py-3.5 px-4 font-mono text-xs text-slate-700 font-medium">
        {truncateId(request.id, 8, 4)}
      </td>

      <td className="py-3.5 px-4 font-mono text-xs text-[#2f68ff]">
        <Link to={`/billing/accounts/${request.billingAccountId}`} className="hover:underline font-medium">
          {truncateId(request.billingAccountId, 8, 4)}
        </Link>
      </td>

      <td className="py-3.5 px-4">
        <StatusBadge status={reqType} />
      </td>

      <td className="py-3.5 px-4 font-mono text-xs text-slate-900 font-semibold">
        {amountVal !== undefined ? `${formatNumber(amountVal)} cr` : '—'}
      </td>

      <td className="py-3.5 px-4">
        <StatusBadge status={request.status} />
      </td>

      <td className="py-3.5 px-4 text-xs">
        <div className="flex flex-col">
          <span className="text-slate-700 font-mono text-[11px]">
            {truncateId(requesterId, 8, 4)}
          </span>
          {isSelfRequest && (
            <span className="text-[10px] text-amber-600 font-semibold">(You)</span>
          )}
        </div>
      </td>

      <td className="py-3.5 px-4 text-slate-500 text-[11px] whitespace-nowrap">
        {formatDateTime(request.createdAt)}
      </td>

      <td className="py-3.5 px-4 text-slate-600 text-xs max-w-xs truncate" title={request.reason}>
        {request.reason}
      </td>

      <td className="py-3.5 px-4 text-right">
        {isPending ? (
          <div className="flex items-center justify-end gap-1.5">
            {isSelfRequest ? (
              <span
                className="text-[10px] font-mono text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full flex items-center gap-1 font-medium"
                title="Maker-Checker Rule R8: Requester cannot self-approve"
              >
                <ShieldAlert className="w-3 h-3 text-amber-600" /> Maker
              </span>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="success"
                  onClick={() => onApprove(request)}
                  disabled={!canApprove}
                  className="h-7 text-xs px-2.5"
                  icon={Check}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => onReject(request)}
                  className="h-7 text-xs px-2.5"
                  icon={X}
                >
                  Reject
                </Button>
              </>
            )}
          </div>
        ) : request.status === 'APPROVED' && onRetry ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRetry(request.id)}
            className="h-7 text-xs px-2.5"
            icon={RotateCw}
          >
            Retry Exec
          </Button>
        ) : (
          <span className="text-[11px] text-slate-400 font-mono">Resolved</span>
        )}
      </td>
    </tr>
  );
};
