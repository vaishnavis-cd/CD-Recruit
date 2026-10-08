import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export const Card: React.FC<CardProps> = ({ className, glow, children, ...props }) => {
  return (
    <div
      className={cn(
        'bg-white rounded-2xl border transition-all duration-200 shadow-[0_4px_16px_rgba(0,0,0,0.02)]',
        glow
          ? 'border-[#bfdbfe] shadow-[0_4px_20px_rgba(47,92,255,0.08)]'
          : 'border-[#e8ecf4] hover:border-[#cbd5e1]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div className={cn('p-5 pb-3.5 border-b border-[#f1f5f9]', className)} {...props}>
      {children}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <h3 className={cn('text-sm font-bold text-[#0d1424] tracking-tight', className)} {...props}>
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <p className={cn('text-xs text-[#64748b] mt-0.5', className)} {...props}>
      {children}
    </p>
  );
};

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div className={cn('p-5', className)} {...props}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn('p-4 px-5 bg-[#f8fafc] border-t border-[#f1f5f9] rounded-b-2xl', className)}
      {...props}
    >
      {children}
    </div>
  );
};
