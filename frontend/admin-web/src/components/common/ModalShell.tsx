import React from "react";

export interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

export function ModalShell({
  isOpen,
  onClose,
  title,
  children,
  footer,
  maxWidth = "max-w-lg",
}: ModalShellProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className={`w-full ${maxWidth} bg-white rounded-lg shadow-xl overflow-hidden`}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none"
            >
              ✕
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
        {footer && <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
