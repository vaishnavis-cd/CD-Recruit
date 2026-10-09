import React from 'react';
import { Database } from 'lucide-react';

export const MockBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  const isMock = import.meta.env.VITE_USE_MOCKS === 'true';

  if (!isMock) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs ${className}`}
      title="Running in local mock data preview mode (VITE_USE_MOCKS=true)"
    >
      <Database className="w-2.5 h-2.5" /> MOCK DATA
    </span>
  );
};
