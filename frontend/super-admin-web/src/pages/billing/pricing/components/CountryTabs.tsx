import React from 'react';
import { Globe } from 'lucide-react';

export type CountryCode = 'IN' | 'US' | 'MY';

interface CountryTabsProps {
  country: CountryCode;
  onCountryChange: (country: CountryCode) => void;
}

export const CountryTabs: React.FC<CountryTabsProps> = ({ country, onCountryChange }) => {
  const countries: { code: CountryCode; label: string; currency: string }[] = [
    { code: 'IN', label: 'India (Domestic)', currency: 'INR (₹)' },
    { code: 'US', label: 'United States & Global', currency: 'USD ($)' },
    { code: 'MY', label: 'Malaysia (ASEAN)', currency: 'MYR (RM)' },
  ];

  return (
    <div className="flex border-b border-slate-800/80 space-x-1">
      {countries.map((c) => {
        const isActive = country === c.code;
        return (
          <button
            key={c.code}
            onClick={() => onCountryChange(c.code)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
              isActive
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{c.label}</span>
            <span className="font-mono text-[10px] text-slate-500 font-normal">
              {c.currency}
            </span>
          </button>
        );
      })}
    </div>
  );
};
