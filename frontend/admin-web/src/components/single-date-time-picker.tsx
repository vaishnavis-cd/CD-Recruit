import React, { useState, useMemo, useRef } from "react";
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

interface TimeInputGroupProps {
  hourValue: string;
  minuteValue: string;
  onChangeHour: (h: string) => void;
  onChangeMinute: (m: string) => void;
}

function TimeInputGroup({
  hourValue,
  minuteValue,
  onChangeHour,
  onChangeMinute,
}: TimeInputGroupProps) {
  const minuteRef = useRef<HTMLInputElement>(null);
  const hourRef = useRef<HTMLInputElement>(null);

  const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 2) val = val.slice(0, 2);

    onChangeHour(val);

    if (val.length === 2) {
      setTimeout(() => {
        minuteRef.current?.focus();
        minuteRef.current?.select();
      }, 0);
    }
  };

  const handleHourBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      onChangeHour("09");
      return;
    }
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < 1) {
      onChangeHour("01");
    } else if (num > 12) {
      onChangeHour("12");
    } else {
      onChangeHour(String(num).padStart(2, "0"));
    }
  };

  const handleHourKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowRight" || e.key === ":" || e.key === "Enter") {
      e.preventDefault();
      minuteRef.current?.focus();
      minuteRef.current?.select();
    }
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 2) val = val.slice(0, 2);
    onChangeMinute(val);
  };

  const handleMinuteBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) {
      onChangeMinute("00");
      return;
    }
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < 0) {
      onChangeMinute("00");
    } else if (num > 59) {
      onChangeMinute("59");
    } else {
      onChangeMinute(String(num).padStart(2, "0"));
    }
  };

  const handleMinuteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowLeft" || (e.key === "Backspace" && !minuteValue)) {
      e.preventDefault();
      hourRef.current?.focus();
      hourRef.current?.select();
    }
  };

  return (
    <div className="flex items-center gap-1 font-mono text-[16px] text-[#0B0B0D]">
      <input
        ref={hourRef}
        type="text"
        maxLength={2}
        value={hourValue}
        onChange={handleHourChange}
        onBlur={handleHourBlur}
        onKeyDown={handleHourKeyDown}
        onFocus={(e) => e.target.select()}
        className="w-8 text-center focus:outline-none bg-[#F7F7F9] focus:bg-[#EAF0FF] focus:text-[#2F5CFF] rounded py-0.5 transition-colors font-semibold"
        placeholder="HH"
      />
      <span className="text-[#8B8B93] font-semibold">:</span>
      <input
        ref={minuteRef}
        type="text"
        maxLength={2}
        value={minuteValue}
        onChange={handleMinuteChange}
        onBlur={handleMinuteBlur}
        onKeyDown={handleMinuteKeyDown}
        onFocus={(e) => e.target.select()}
        className="w-8 text-center focus:outline-none bg-[#F7F7F9] focus:bg-[#EAF0FF] focus:text-[#2F5CFF] rounded py-0.5 transition-colors font-semibold"
        placeholder="MM"
      />
    </div>
  );
}

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

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

    let firstDayIndex = firstDayOfMonth.getDay() - 1;
    if (firstDayIndex === -1) firstDayIndex = 6;

    const daysInMonth = lastDayOfMonth.getDate();

    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    const prevDays: { day: number; currentMonth: boolean; dateStr: string }[] = [];
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const m = currentMonth === 0 ? 11 : currentMonth - 1;
      const y = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      prevDays.push({ day: d, currentMonth: false, dateStr });
    }

    const currDays: { day: number; currentMonth: boolean; dateStr: string }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      currDays.push({ day: d, currentMonth: true, dateStr });
    }

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
      startSecond: "00",
      startAmPm,
      endHour,
      endMinute,
      endSecond: "00",
      endAmPm,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* LEFT COLUMN: Calendar Card */}
      <div className="lg:col-span-7 bg-white border border-[#E6E6EA] rounded-[20px] p-6 shadow-sm">
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

        <div className="grid grid-cols-7 gap-1 text-center mb-3">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="text-[13px] font-medium text-[#8B8B93] py-1">
              {wd}
            </div>
          ))}
        </div>

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
                {isToday && !isSelected && (
                  <span className="w-1.5 h-1.5 bg-[#2F5CFF] rounded-full absolute bottom-0"></span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT COLUMN: Start & End Time (No seconds, smooth keyboard navigation & padding) */}
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
            <TimeInputGroup
              hourValue={startHour}
              minuteValue={startMinute}
              onChangeHour={(h) =>
                onChange({
                  date: selectedDate,
                  startHour: h,
                  startMinute,
                  startSecond: "00",
                  startAmPm,
                  endHour,
                  endMinute,
                  endSecond: "00",
                  endAmPm,
                })
              }
              onChangeMinute={(m) =>
                onChange({
                  date: selectedDate,
                  startHour,
                  startMinute: m,
                  startSecond: "00",
                  startAmPm,
                  endHour,
                  endMinute,
                  endSecond: "00",
                  endAmPm,
                })
              }
            />

            <div className="relative flex items-center gap-1">
              <select
                value={startAmPm}
                onChange={(e) =>
                  onChange({
                    date: selectedDate,
                    startHour,
                    startMinute,
                    startSecond: "00",
                    startAmPm: e.target.value,
                    endHour,
                    endMinute,
                    endSecond: "00",
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
            <TimeInputGroup
              hourValue={endHour}
              minuteValue={endMinute}
              onChangeHour={(h) =>
                onChange({
                  date: selectedDate,
                  startHour,
                  startMinute,
                  startSecond: "00",
                  startAmPm,
                  endHour: h,
                  endMinute,
                  endSecond: "00",
                  endAmPm,
                })
              }
              onChangeMinute={(m) =>
                onChange({
                  date: selectedDate,
                  startHour,
                  startMinute,
                  startSecond: "00",
                  startAmPm,
                  endHour,
                  endMinute: m,
                  endSecond: "00",
                  endAmPm,
                })
              }
            />

            <div className="relative flex items-center gap-1">
              <select
                value={endAmPm}
                onChange={(e) =>
                  onChange({
                    date: selectedDate,
                    startHour,
                    startMinute,
                    startSecond: "00",
                    startAmPm,
                    endHour,
                    endMinute,
                    endSecond: "00",
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

        {/* Quick Presets */}
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
