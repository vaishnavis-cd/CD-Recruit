import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  badge?: string;
  sublabel?: string;
}

export interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  disabled?: boolean;
  align?: "left" | "right";
  rounded?: "full" | "lg" | "xl" | "2xl" | "16px";
  size?: "sm" | "md" | "lg";
  maxHeight?: string;
  id?: string;
  chevronSize?: number;
}

export function CustomDropdown({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  className = "",
  buttonClassName = "",
  menuClassName = "",
  disabled = false,
  align = "left",
  rounded = "16px",
  size = "md",
  maxHeight = "280px",
  id,
  chevronSize = 12,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const roundedClasses = {
    full: "rounded-full",
    "16px": "rounded-[16px]",
    "2xl": "rounded-2xl",
    xl: "rounded-xl",
    lg: "rounded-lg",
  }[rounded] || "rounded-[16px]";

  const menuRoundedClasses = {
    full: "rounded-2xl",
    "16px": "rounded-[16px]",
    "2xl": "rounded-2xl",
    xl: "rounded-xl",
    lg: "rounded-lg",
  }[rounded] || "rounded-[16px]";

  const sizeClasses = {
    sm: "h-[30px] px-3 text-xs",
    md: "h-[34px] px-3.5 text-xs-plus",
    lg: "h-[42px] px-4 text-sm-minus",
  }[size] || "h-[34px] px-3.5 text-xs-plus";

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${className}`}
      id={id}
      style={{ fontFamily: "Instrument Sans, -apple-system, BlinkMacSystemFont, sans-serif" }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 border border-[#D5DAEC] bg-white transition-all cursor-pointer select-none focus:outline-none focus:border-[#2E5DE0] focus:ring-2 focus:ring-[#2E5DE0]/10 ${
          roundedClasses
        } ${sizeClasses} ${
          disabled ? "opacity-50 cursor-not-allowed bg-slate-50" : "hover:border-[#2E5DE0]"
        } ${buttonClassName}`}
      >
        <span
          className={`truncate font-normal ${
            selectedOption ? "text-[#0F172A]" : "text-[#94A3B8]"
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          size={chevronSize}
          className={`text-[#6B7280] transition-transform duration-150 shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute ${
            align === "right" ? "right-0" : "left-0"
          } top-[calc(100%+4px)] z-[100] min-w-full w-max max-w-[340px] bg-white border border-[#D5DAEC] ${
            menuRoundedClasses
          } shadow-[0_10px_30px_rgba(0,0,0,0.12)] p-1 overflow-y-auto animate-in fade-in zoom-in-95 duration-100 ${menuClassName}`}
          style={{ maxHeight }}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[#94A3B8] italic text-center">
              No options available
            </div>
          ) : (
            options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                    menuRoundedClasses === "rounded-2xl" || menuRoundedClasses === "rounded-[16px]"
                      ? "rounded-[10px]"
                      : "rounded-md"
                  } ${
                    isSelected
                      ? "bg-[#EFF6FF] text-[#2563EB] font-semibold"
                      : "text-[#475569] hover:bg-slate-50 hover:text-[#0F172A] font-medium"
                  }`}
                >
                  <div className="truncate flex-1">
                    <div className="truncate">{opt.label}</div>
                    {opt.sublabel && (
                      <div className="text-[10px] text-[#94A3B8] font-normal truncate mt-0.5">
                        {opt.sublabel}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <Check size={13} className="text-[#2563EB] shrink-0 stroke-[2.5]" />
                  )}
                  {opt.badge && !isSelected && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-mono shrink-0">
                      {opt.badge}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
