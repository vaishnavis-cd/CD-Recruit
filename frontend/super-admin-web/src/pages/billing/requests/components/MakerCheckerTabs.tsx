import React from 'react';
import { Clock, UserCheck, ListFilter, CheckCircle2 } from 'lucide-react';

export type QueueTabType = 'pending' | 'my_requests' | 'all' | 'resolved';

interface MakerCheckerTabsProps {
  currentTab: QueueTabType;
  onTabChange: (tab: QueueTabType) => void;
  pendingCount?: number;
}

export const MakerCheckerTabs: React.FC<MakerCheckerTabsProps> = ({
  currentTab,
  onTabChange,
  pendingCount = 0,
}) => {
  const tabs = [
    {
      id: 'pending' as QueueTabType,
      label: 'Awaiting My Approval',
      icon: Clock,
      count: pendingCount,
    },
    {
      id: 'my_requests' as QueueTabType,
      label: 'My Filed Requests',
      icon: UserCheck,
    },
    {
      id: 'all' as QueueTabType,
      label: 'All Active Requests',
      icon: ListFilter,
    },
    {
      id: 'resolved' as QueueTabType,
      label: 'Executed & Rejected',
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="flex border-b border-slate-800/80 space-x-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
              isActive
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
