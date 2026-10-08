import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DialogProps {
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  isOpen,
  onOpenChange,
  onClose,
  children,
  className,
  maxWidth = 'md',
}) => {
  const isModalOpen = Boolean(open ?? isOpen);

  const handleClose = () => {
    onClose?.();
    onOpenChange?.(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        handleClose();
      }
    };
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen]);

  if (!isModalOpen) return null;

  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={handleClose}
      />

      {/* Modal Content */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full rounded-2xl border border-[#e8ecf4] bg-white shadow-2xl p-6 text-[#0d1424] z-10 transition-all duration-200 animate-in fade-in-0 zoom-in-95',
          maxWidthStyles[maxWidth],
          className
        )}
      >
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-[#94a3b8] hover:text-[#0d1424] p-1.5 rounded-lg hover:bg-[#f1f5f9] transition cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="w-4 h-4" />
        </button>
        {children}
      </div>
    </div>
  );
};

export const DialogHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div className={cn('mb-4 pr-6', className)} {...props}>
      {children}
    </div>
  );
};

export const DialogTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <h3 className={cn('text-base font-bold text-[#0d1424] tracking-tight', className)} {...props}>
      {children}
    </h3>
  );
};

export const DialogDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <p className={cn('text-xs text-[#64748b] mt-1', className)} {...props}>
      {children}
    </p>
  );
};

export const DialogFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div className={cn('mt-6 pt-4 border-t border-[#f1f5f9] flex items-center justify-end gap-3', className)} {...props}>
      {children}
    </div>
  );
};
