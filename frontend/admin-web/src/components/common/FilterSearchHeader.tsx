import React from "react";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterSearchHeaderProps {
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  filterValue?: string;
  onFilterChange?: (val: string) => void;
  filterOptions?: FilterOption[];
  filterLabel?: string;
  actions?: React.ReactNode;
}

export function FilterSearchHeader({
  searchQuery = "",
  onSearchChange,
  searchPlaceholder = "Search...",
  filterValue = "",
  onFilterChange,
  filterOptions = [],
  filterLabel = "Filter",
  actions,
}: FilterSearchHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div className="flex flex-1 items-center gap-3">
        {onSearchChange && (
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full sm:w-64 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}

        {onFilterChange && filterOptions.length > 0 && (
          <select
            value={filterValue}
            onChange={(e) => onFilterChange(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">All {filterLabel}s</option>
            {filterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
