import React from 'react';
import { Timer } from '../Timer';

interface AssessmentTopBarProps {
  showTimer?: boolean;
  rightContent?: React.ReactNode;
}

export function AssessmentTopBar({ showTimer = false, rightContent }: AssessmentTopBarProps) {
  return (
    <header className="w-full h-[67px] bg-white border-b border-[#E2E8F0] px-6 sm:px-12 flex items-center justify-between shrink-0 z-20">
      <div className="font-extrabold text-[20px] text-[#0F172A] tracking-tight flex items-center select-none">
        Proctora
      </div>
      {showTimer ? (
        <Timer />
      ) : rightContent ? (
        rightContent
      ) : null}
    </header>
  );
}
