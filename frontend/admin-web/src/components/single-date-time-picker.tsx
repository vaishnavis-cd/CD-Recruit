import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Clock } from "lucide-react";

interface SingleDateTimePickerProps {
  selectedDate: string; // ISO date string "YYYY-MM-DD"
  startHour: string;   // "09"
  startMinute: string; // "00"
  startSecond?: string; // "00"
  startAmPm: string;   // "AM" | "PM"
  endHour: string;     // "05"
  endMinute: string;   // "00"
  endSecond?: string;  // "00"
  endAmPm: string;     // "AM" | "PM"
  onChange: (data: {
    date: string;
    startHour: string;
    startMinute: string;
    startSecond: string;
    startAmPm: string;
    endHour: string;
    endMinute: string;
    endSecond: string;
    endAmPm: string;
  }) => void;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function SingleDateTimePicker({
  selectedDate,
  startHour,
  startMinute,
  startSecond = "00",
  startAmPm,
  endHour,
  endMinute,
  endSecond = "00",
  endAmPm,
  onChange,
}: SingleDateTimePickerProps) {
  // Parse initial selected date or default to today
  const initialDateObj = useMemo(() => {
    if (!selectedDate) return new Date();
    const d = new Date(selectedDate);
    return isNaN(d.getTime()) ? new Date() : d;
  }, [selectedDate]);

  const [currentMonth, setCurrentMonth] = useState<number>(initialDateObj.getMonth());
  const [currentYear, setCurrentYear] = useState<number>(initialDateObj.getFullYear());

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  const selectedYear = initialDateObj.getFullYear();
  const selectedMonth = initialDateObj.getMonth();
  const selectedDayNum = initialDateObj.getDate();

  // Navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // Generate calendar grid dates (Monday-start format matching spec Image 1)
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

    // Get day of week (0 = Sun, 1 = Mon ... 6 = Sat)
    let firstDayIndex = firstDayOfMonth.getDay() - 1;
    if (firstDayIndex === -1) firstDayIndex = 6; // Sunday becomes 6

    const daysInMonth = lastDayOfMonth.getDate();

    // Previous month padding days
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    const prevDays: { day: number; currentMonth: boolean; dateStr: string }[] = [];
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const m = currentMonth === 0 ? 11 : currentMonth - 1;
      const y = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      prevDays.push({ day: d, currentMonth: false, dateStr });
    }

    // Current month days
    const currDays: { day: number; currentMonth: boolean; dateStr: string }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      currDays.push({ day: d, currentMonth: true, dateStr });
    }

    // Next month padding days to complete 35 or 42 grid cells
    const totalSoFar = prevDays.length + currDays.length;
    const totalGrid = totalSoFar > 35 ? 42 : 35;
    const nextDays: { day: number; currentMonth: boolean; dateStr: string }[] = [];
    for (let d = 1; d <= totalGrid - totalSoFar; d++) {
      const m = currentMonth === 11 ? 0 : currentMonth + 1;
      const y = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      nextDays.push({ day: d, currentMonth: false, dateStr });
    }

    return [...prevDays, ...currDays, ...nextDays];
  }, [currentMonth, currentYear]);

  const handleSelectDate = (dateStr: string) => {
    onChange({
      date: dateStr,
      startHour,
      startMinute,
      startSecond,
      startAmPm,
      endHour,
      endMinute,
      endSecond,
      endAmPm,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT COLUMN: Calendar Card (Image 1 Exact Style) */}
      <div className="lg:col-span-7 bg-white border border-[#E6E6EA] rounded-[20px] p-6 shadow-sm">
        {/* Month Header Navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="w-9 h-9 flex items-center justify-center border border-[#E6E6EA] rounded-[10px] text-[#5B5B64] hover:bg-[#F7F7F9] transition-colors cursor-pointer"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex items-center gap-1.5 text-[16px] font-semibold text-[#0B0B0D] cursor-pointer hover:opacity-80">
            <span>{MONTH_NAMES[currentMonth]} {currentYear}</span>
            <ChevronDown size={16} className="text-[#8B8B93]" />
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="w-9 h-9 flex items-center justify-center border border-[#E6E6EA] rounded-[10px] text-[#5B5B64] hover:bg-[#F7F7F9] transition-colors cursor-pointer"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Weekdays Header */}
        <div className="grid grid-cols-7 gap-1 text-center mb-3">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="text-[13px] font-medium text-[#8B8B93] py-1">
              {wd}
            </div>
          ))}
        </div>

        {/* Calendar Days Grid */}
        <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
          {calendarDays.map((cell, idx) => {
            const isSelected =
              cell.currentMonth &&
              currentYear === selectedYear &&
              currentMonth === selectedMonth &&
              cell.day === selectedDayNum;

            const isToday =
              cell.currentMonth &&
              currentYear === todayYear &&
              currentMonth === todayMonth &&
              cell.day === todayDay;

            return (
              <div key={idx} className="flex flex-col items-center justify-center relative py-0.5">
                <button
                  type="button"
                  onClick={() => handleSelectDate(cell.dateStr)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-medium transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#2F5CFF] text-white font-semibold shadow-md"
                      : isToday
                      ? "text-[#2F5CFF] font-semibold hover:bg-[#EAF0FF]"
                      : cell.currentMonth
                      ? "text-[#1C1C1E] hover:bg-[#F2F2F7]"
                      : "text-[#D1D1D6] hover:text-[#8B8B93]"
                  }`}
                >
                  {cell.day}
                </button>
                {/* Blue dot indicator for today when not selected */}
                {isToday && !isSelected && (
                  <span className="w-1.5 h-1.5 bg-[#2F5CFF] rounded-full absolute bottom-0"></span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT COLUMN: Start & End Time Scroll Pickers (Image 2 Exact Style) */}
      <div className="lg:col-span-5 bg-white border border-[#E6E6EA] rounded-[20px] p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-2 border-b border-[#EFF0F3] pb-3">
          <Clock size={18} className="text-[#2F5CFF]" />
          <h3 className="text-[15px] font-semibold text-[#0B0B0D]">Assessment Time Window</h3>
        </div>

        {/* START TIME FIELD */}
        <div className="space-y-2">
          <label className="block text-[14px] font-medium text-[#1C1C1E]">
            Start time
          </label>
          <div className="bg-white border border-[#E6E6EA] rounded-[12px] px-4 py-3 flex items-center justify-between focus-within:border-[#2F5CFF] focus-within:ring-2 focus-within:ring-[#2F5CFF]/10 transition-all">
            <div className="flex items-center gap-1 font-mono text-[16px] text-[#0B0B0D]">
              <input
                type="text"
                maxLength={2}
                value={startHour}
                onChange={(e) =>
                  onChange({
                    date: selectedDate,
                    startHour: e.target.value,
                    startMinute,
                    startSecond,
                    startAmPm,
                    endHour,
                    endMinute,
                    endSecond,
                    endAmPm,
                  })
                }
                className="w-7 text-center focus:outline-none bg-transparent"
              />
              <span className="text-[#8B8B93]">:</span>
              <input
                type="text"
                maxLength={2}
                value={startMinute}
                onChange={(e) =>
                  onChange({
                    date: selectedDate,
                    startHour,
                    startMinute: e.target.value,
                    startSecond,
                    startAmPm,
                    endHour,
                    endMinute,
                    endSecond,
                    endAmPm,
                  })
                }
                className="w-7 text-center focus:outline-none bg-transparent"
              />
              <span className="text-[#8B8B93]">:</span>
              <input
                type="text"
                maxLength={2}
                value={startSecond}
                onChange={(e) =>
                  onChange({
                    date: selectedDate,
                    startHour,
                    startMinute,
                    startSecond: e.target.value,
                    startAmPm,
                    endHour,
                    endMinute,
                    endSecond,
                    endAmPm,
                  })
                }
                className="w-7 text-center text-[#8B8B93] focus:outline-none bg-transparent text-[14px]"
              />
            </div>

            <div className="relative flex items-center gap-1">
              <select
                value={startAmPm}
                onChange={(e) =>
                  onChange({
                    date: selectedDate,
                    startHour,
                    startMinute,
                    startSecond,
                    startAmPm: e.target.value,
                    endHour,
                    endMinute,
                    endSecond,
                    endAmPm,
                  })
                }
                className="appearance-none bg-[#F7F7F9] border border-[#E6E6EA] rounded-md px-3 py-1 text-[13px] font-semibold text-[#0B0B0D] focus:outline-none cursor-pointer pr-7"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
              <ChevronDown size={14} className="text-[#8B8B93] absolute right-2.5 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* END TIME FIELD */}
        <div className="space-y-2">
          <label className="block text-[14px] font-medium text-[#1C1C1E]">
            End time
          </label>
          <div className="bg-white border border-[#E6E6EA] rounded-[12px] px-4 py-3 flex items-center justify-between focus-within:border-[#2F5CFF] focus-within:ring-2 focus-within:ring-[#2F5CFF]/10 transition-all">
            <div className="flex items-center gap-1 font-mono text-[16px] text-[#0B0B0D]">
              <input
                type="text"
                maxLength={2}
                value={endHour}
                onChange={(e) =>
                  onChange({
                    date: selectedDate,
                    startHour,
                    startMinute,
                    startSecond,
                    startAmPm,
                    endHour: e.target.value,
                    endMinute,
                    endSecond,
                    endAmPm,
                  })
                }
                className="w-7 text-center focus:outline-none bg-transparent"
              />
              <span className="text-[#8B8B93]">:</span>
              <input
                type="text"
                maxLength={2}
                value={endMinute}
                onChange={(e) =>
                  onChange({
                    date: selectedDate,
                    startHour,
                    startMinute,
                    startSecond,
                    startAmPm,
                    endHour,
                    endMinute: e.target.value,
                    endSecond,
                    endAmPm,
                  })
                }
                className="w-7 text-center focus:outline-none bg-transparent"
              />
              <span className="text-[#8B8B93]">:</span>
              <input
                type="text"
                maxLength={2}
                value={endSecond}
                onChange={(e) =>
                  onChange({
                    date: selectedDate,
                    startHour,
                    startMinute,
                    startSecond,
                    startAmPm,
                    endHour,
                    endMinute,
                    endSecond: e.target.value,
                    endAmPm,
                  })
                }
                className="w-7 text-center text-[#8B8B93] focus:outline-none bg-transparent text-[14px]"
              />
            </div>

            <div className="relative flex items-center gap-1">
              <select
                value={endAmPm}
                onChange={(e) =>
                  onChange({
                    date: selectedDate,
                    startHour,
                    startMinute,
                    startSecond,
                    startAmPm,
                    endHour,
                    endMinute,
                    endSecond,
                    endAmPm: e.target.value,
                  })
                }
                className="appearance-none bg-[#F7F7F9] border border-[#E6E6EA] rounded-md px-3 py-1 text-[13px] font-semibold text-[#0B0B0D] focus:outline-none cursor-pointer pr-7"
              >
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
              <ChevronDown size={14} className="text-[#8B8B93] absolute right-2.5 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Quick Time Window Preset Chips */}
        <div className="pt-2">
          <label className="block text-[11px] font-mono uppercase tracking-wider text-[#8B8B93] mb-2 font-semibold">
            Quick Duration Presets
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "2 Hrs (9 AM - 11 AM)", sH: "09", sM: "00", sAp: "AM", eH: "11", eM: "00", eAp: "AM" },
              { label: "3 Hrs (9 AM - 12 PM)", sH: "09", sM: "00", sAp: "AM", eH: "12", eM: "00", eAp: "PM" },
              { label: "Full Day (9 AM - 5 PM)", sH: "09", sM: "00", sAp: "AM", eH: "05", eM: "00", eAp: "PM" },
            ].map((preset, pIdx) => (
              <button
                key={pIdx}
                type="button"
                onClick={() =>
                  onChange({
                    date: selectedDate,
                    startHour: preset.sH,
                    startMinute: preset.sM,
                    startSecond: "00",
                    startAmPm: preset.sAp,
                    endHour: preset.eH,
                    endMinute: preset.eM,
                    endSecond: "00",
                    endAmPm: preset.eAp,
                  })
                }
                className="px-3 py-1.5 rounded-full text-[12px] font-medium border border-[#E6E6EA] bg-[#F7F7F9] hover:bg-[#EAF0FF] hover:border-[#2F5CFF] text-[#5B5B64] hover:text-[#2F5CFF] transition-all cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
