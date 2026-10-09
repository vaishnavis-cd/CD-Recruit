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
    <div className="flex border-b border-[#e8ecf4] space-x-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition -mb-px ${
              isActive
                ? 'border-[#2f68ff] text-[#2f68ff]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
