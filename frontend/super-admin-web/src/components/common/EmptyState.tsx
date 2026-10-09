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
    <div className="bg-white border border-[#e8ecf4] rounded-2xl p-8 text-center max-w-md mx-auto my-8 shadow-[0_4px_16px_rgba(0,0,0,0.02)]">
      <div className="w-12 h-12 rounded-xl bg-[#eff6ff] text-[#2f68ff] flex items-center justify-center mx-auto mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-bold text-[#0d1424] mb-1">{title}</h3>
      <p className="text-xs text-[#64748b] mb-4">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
};
