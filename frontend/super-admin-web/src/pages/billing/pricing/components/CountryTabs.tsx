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
    <div className="flex border-b border-[#e8ecf4] space-x-2">
      {countries.map((c) => {
        const isActive = country === c.code;
        return (
          <button
            key={c.code}
            onClick={() => onCountryChange(c.code)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition -mb-px ${
              isActive
                ? 'border-[#2f68ff] text-[#2f68ff]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>{c.label}</span>
            <span className="font-mono text-[11px] text-slate-400 font-normal">
              {c.currency}
            </span>
          </button>
        );
      })}
    </div>
  );
};
