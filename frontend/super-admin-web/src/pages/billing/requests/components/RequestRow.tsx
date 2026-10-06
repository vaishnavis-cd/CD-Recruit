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
    <tr className="hover:bg-slate-900/40 transition">
      <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
        {truncateId(request.id, 8, 4)}
      </td>

      <td className="py-3.5 px-4 font-mono text-xs text-indigo-400">
        <Link to={`/billing/accounts/${request.billingAccountId}`} className="hover:underline">
          {truncateId(request.billingAccountId, 8, 4)}
        </Link>
      </td>

      <td className="py-3.5 px-4">
        <StatusBadge status={reqType} />
      </td>

      <td className="py-3.5 px-4 font-mono text-xs text-slate-200">
        {amountVal !== undefined ? `${formatNumber(amountVal)} cr` : '—'}
      </td>

      <td className="py-3.5 px-4">
        <StatusBadge status={request.status} />
      </td>

      <td className="py-3.5 px-4 text-xs">
        <div className="flex flex-col">
          <span className="text-slate-300 font-mono text-[11px]">
            {truncateId(requesterId, 8, 4)}
          </span>
          {isSelfRequest && (
            <span className="text-[10px] text-amber-400 font-semibold">(You)</span>
          )}
        </div>
      </td>

      <td className="py-3.5 px-4 text-slate-400 text-[11px] whitespace-nowrap">
        {formatDateTime(request.createdAt)}
      </td>

      <td className="py-3.5 px-4 text-slate-300 text-xs max-w-xs truncate" title={request.reason}>
        {request.reason}
      </td>

      <td className="py-3.5 px-4 text-right">
        {isPending ? (
          <div className="flex items-center justify-end gap-1.5">
            {isSelfRequest ? (
              <span
                className="text-[10px] font-mono text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded flex items-center gap-1"
                title="Maker-Checker Rule R8: Requester cannot self-approve"
              >
                <ShieldAlert className="w-3 h-3" /> Maker
              </span>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="success"
                  onClick={() => onApprove(request)}
                  disabled={!canApprove}
                  className="h-7 text-xs px-2"
                  icon={<Check className="w-3.5 h-3.5" />}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => onReject(request)}
                  className="h-7 text-xs px-2"
                  icon={<X className="w-3.5 h-3.5" />}
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
            className="h-7 text-xs px-2"
            icon={<RotateCw className="w-3.5 h-3.5" />}
          >
            Retry Exec
          </Button>
        ) : (
          <span className="text-[11px] text-slate-500 font-mono">Resolved</span>
        )}
      </td>
    </tr>
  );
};
