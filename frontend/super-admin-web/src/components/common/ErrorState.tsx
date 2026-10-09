import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  status?: number;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Failed to Load Data',
  message,
  status,
  onRetry,
}) => {
  return (
    <div className="bg-rose-50/60 border border-rose-200 rounded-2xl p-6 text-center max-w-lg mx-auto my-8 shadow-xs">
      <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-bold text-rose-900 mb-1">{title}</h3>
      <p className="text-xs text-rose-700 mb-2">{message}</p>
      {status && (
        <span className="inline-block text-[10px] font-mono text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded border border-rose-200 mb-4">
          HTTP {status}
        </span>
      )}
      {onRetry && (
        <div className="mt-2">
          <button
            onClick={onRetry}
            className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition inline-flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry Request
          </button>
        </div>
      )}
    </div>
  );
};
