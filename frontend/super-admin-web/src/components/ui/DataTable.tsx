import React from 'react';
import { ChevronLeft, ChevronRight, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './Skeleton';
import { EmptyState } from '../common/EmptyState';

export interface Column<T = any> {
  key: string;
  header: React.ReactNode;
  render?: (item: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T = any> {
  columns?: Column<T>[];
  data?: T[];
  headers?: string[];
  children?: React.ReactNode;
  loading?: boolean;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon | React.ComponentType<{ className?: string }>;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (newPage: number) => void;
  pagination?: {
    page?: number;
    pageSize?: number;
    total?: number;
    onPageChange?: (newPage: number) => void;
  };
  className?: string;
}

export function DataTable<T extends { id?: string | number } = any>({
  columns,
  data,
  headers,
  children,
  loading = false,
  isLoading = false,
  isEmpty,
  emptyTitle = 'No records found',
  emptyDescription = 'There are no items matching the current filter criteria.',
  emptyIcon,
  page: pageProp,
  pageSize: pageSizeProp,
  total: totalProp,
  onPageChange: onPageChangeProp,
  pagination,
  className,
}: DataTableProps<T>) {
  const isBusy = loading || isLoading;
  const page = pagination?.page ?? pageProp;
  const pageSize = pagination?.pageSize ?? pageSizeProp;
  const total = pagination?.total ?? totalProp;
  const onPageChange = pagination?.onPageChange ?? onPageChangeProp;

  const totalPages = page && pageSize && total ? Math.ceil(total / pageSize) : 1;
  const effectiveColCount = columns ? columns.length : headers ? headers.length : 6;

  const isDataEmpty =
    isEmpty !== undefined
      ? isEmpty
      : data
      ? data.length === 0
      : React.Children.count(children) === 0;

  return (
    <div className={cn('glass-panel rounded-2xl border border-slate-800/80 overflow-hidden shadow-xl flex flex-col', className)}>
      <div className="overflow-x-auto w-full">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-mono text-[10px]">
              {columns
                ? columns.map((col) => (
                    <th key={col.key} className={cn('py-3.5 px-4 font-semibold whitespace-nowrap', col.headerClassName)}>
                      {col.header}
                    </th>
                  ))
                : headers?.map((h, i) => (
                    <th key={i} className="py-3.5 px-4 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-medium">
            {isBusy ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <tr key={`skeleton-${idx}`}>
                  {Array.from({ length: effectiveColCount }).map((_, cIdx) => (
                    <td key={`sk-${cIdx}`} className="py-4 px-4">
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : isDataEmpty ? (
              <tr>
                <td colSpan={effectiveColCount} className="py-12 px-4 text-center">
                  <EmptyState title={emptyTitle} description={emptyDescription} icon={emptyIcon} />
                </td>
              </tr>
            ) : columns && data ? (
              data.map((item, idx) => (
                <tr
                  key={item.id ? String(item.id) : `row-${idx}`}
                  className="hover:bg-slate-900/50 transition-colors duration-150"
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn('py-3.5 px-4 text-slate-200', col.className)}>
                      {col.render ? col.render(item) : (item as any)[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {typeof total === 'number' && typeof page === 'number' && typeof pageSize === 'number' && total > 0 && (
        <div className="p-3.5 px-4 bg-slate-950/60 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
          <div className="font-mono text-[11px]">
            Showing <span className="font-bold text-slate-200">{(page - 1) * pageSize + 1}</span> to{' '}
            <span className="font-bold text-slate-200">{Math.min(page * pageSize, total)}</span> of{' '}
            <span className="font-bold text-slate-200">{total}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-[11px] px-2 text-slate-300">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange?.(page + 1)}
              className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
