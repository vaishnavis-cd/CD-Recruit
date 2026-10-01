import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No Records Found',
  description = 'There are no items matching your criteria or database is currently empty.',
  action,
  icon: Icon = Inbox,
}) => {
  return (
    <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-8 text-center max-w-md mx-auto my-8">
      <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-bold text-slate-200 mb-1">{title}</h3>
      <p className="text-xs text-slate-400 mb-4">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
