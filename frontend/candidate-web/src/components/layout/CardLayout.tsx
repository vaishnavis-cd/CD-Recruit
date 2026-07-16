import React from "react";
import { Header } from "./Header";

interface CardLayoutProps {
  children: React.ReactNode;
  maxWidthClass?: string;
  showProctorStatus?: boolean;
}

export function CardLayout({ children, maxWidthClass = "max-w-xl", showProctorStatus = false }: CardLayoutProps) {
  return (
    <div className="min-h-screen bg-bg text-text-primary flex flex-col transition-colors duration-200">
      <Header showProctorStatus={showProctorStatus} />
      <main className="flex-1 flex items-center justify-center p-6 bg-surface/30">
        <div className={`w-full ${maxWidthClass} bg-bg border border-border-token rounded-2xl shadow-xl p-8 sm:p-10 transition-colors duration-200`}>
          {children}
        </div>
      </main>
    </div>
  );
}
