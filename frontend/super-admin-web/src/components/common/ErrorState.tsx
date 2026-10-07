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
    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center max-w-lg mx-auto my-8">
      <div className="w-12 h-12 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-3">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-bold text-white mb-1">{title}</h3>
      <p className="text-xs text-red-300 mb-2">{message}</p>
      {status && (
        <span className="inline-block text-[10px] font-mono text-red-400 bg-red-950/40 px-2 py-0.5 rounded border border-red-500/20 mb-4">
          HTTP {status}
        </span>
      )}
      {onRetry && (
        <div className="mt-2">
          <button
            onClick={onRetry}
            className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition inline-flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry Request
          </button>
        </div>
      )}
    </div>
  );
};
