import React from 'react';
import { X } from 'lucide-react';

export interface BulkAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  disabled?: boolean;
}

interface BulkActionBarProps {
  selectedCount: number;
  itemLabel?: string;
  actions: BulkAction[];
  onClearSelection?: () => void;
  className?: string;
}

export function BulkActionBar({
  selectedCount,
  itemLabel = 'candidate(s)',
  actions,
  onClearSelection,
  className = '',
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={`mb-4 p-3 bg-brand-subtle border border-brand-border rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-1 duration-150 text-sm shadow-xs ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold text-brand-ink">
          {selectedCount} {itemLabel} selected
        </span>
        {onClearSelection && (
          <button
            type="button"
            onClick={onClearSelection}
            className="text-xs text-brand hover:text-brand-hover underline cursor-pointer ml-1"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {actions.map((action, i) => {
          let btnStyle =
            'bg-white text-brand-ink border border-brand-border hover:bg-blue-50';

          if (action.variant === 'primary') {
            btnStyle = 'bg-brand text-white border-transparent hover:bg-brand-hover';
          } else if (action.variant === 'danger') {
            btnStyle =
              'bg-white text-danger border border-line hover:bg-danger-subtle hover:border-danger-border';
          }

          return (
            <button
              key={i}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs ${btnStyle}`}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          );
        })}

        {onClearSelection && (
          <button
            type="button"
            onClick={onClearSelection}
            className="p-1.5 text-brand-ink hover:text-ink hover:bg-blue-100/50 rounded-lg transition-colors cursor-pointer"
            title="Deselect all"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
