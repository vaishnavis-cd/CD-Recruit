import React, { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Clock, Calendar as CalendarIcon, X } from "lucide-react";

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
  /** When true the component is in "24-hour rolling window" mode and endDate/endTime = startDate/startTime + 24h */
  rollingWindow?: boolean;
  onRollingWindowChange?: (enabled: boolean) => void;
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
  is24h?: boolean;
}

function TimeInputGroup({
  hourValue,
  minuteValue,
  onChangeHour,
  onChangeMinute,
  is24h = false,
}: TimeInputGroupProps) {
  const minuteRef = useRef<HTMLInputElement>(null);
  const hourRef = useRef<HTMLInputElement>(null);

  const maxHour = is24h ? 23 : 12;
  const minHour = is24h ? 0 : 1;

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
    if (!raw) { onChangeHour(is24h ? "09" : "09"); return; }
    const num = parseInt(raw, 10);
    if (isNaN(num) || num < minHour) {
      onChangeHour(String(minHour).padStart(2, "0"));
    } else if (num > maxHour) {
      onChangeHour(String(maxHour).padStart(2, "0"));
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
    if (!raw) { onChangeMinute("00"); return; }
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
    <div className="flex items-center justify-center gap-1 font-mono text-[14px] text-[#1E1B4B]">
      <input
        ref={hourRef}
        type="text"
        maxLength={2}
        value={hourValue}
        onChange={handleHourChange}
        onBlur={handleHourBlur}
        onKeyDown={handleHourKeyDown}
        onFocus={(e) => e.target.select()}
        className="w-6 text-center focus:outline-none bg-transparent rounded py-0.5 transition-colors font-bold text-[#1E1B4B]"
        placeholder="09"
      />
      <span className="text-[#6B7280] font-bold">:</span>
      <input
        ref={minuteRef}
        type="text"
        maxLength={2}
        value={minuteValue}
        onChange={handleMinuteChange}
        onBlur={handleMinuteBlur}
        onKeyDown={handleMinuteKeyDown}
        onFocus={(e) => e.target.select()}
        className="w-6 text-center focus:outline-none bg-transparent rounded py-0.5 transition-colors font-bold text-[#1E1B4B]"
        placeholder="00"
      />
    </div>
  );
}

/** Compute end date string when rolling 24h from a start date + time */
function computeRollingEndDate(startDate: string, startHour: string, startMinute: string, startAmPm: string): string {
  if (!startDate) return startDate;
  let h = parseInt(startHour, 10) || 0;
  if (startAmPm === "PM" && h < 12) h += 12;
  if (startAmPm === "AM" && h === 12) h = 0;
  const m = parseInt(startMinute, 10) || 0;
  const start = new Date(`${startDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return end.toISOString();
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
  rollingWindow = false,
  onRollingWindowChange,
  onChange,
}: SingleDateTimePickerProps) {
  const initialDateObj = useMemo(() => {
    if (!selectedDate) return new Date();
    const [y, m, d] = selectedDate.split("-").map(Number);
    if (y && m && d) return new Date(y, m - 1, d);
    const parsed = new Date(selectedDate);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [selectedDate]);

  const [currentMonth, setCurrentMonth] = useState<number>(initialDateObj.getMonth());
  const [currentYear, setCurrentYear] = useState<number>(initialDateObj.getFullYear());
  const [showDatePickerOverlay, setShowDatePickerOverlay] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentMonth(initialDateObj.getMonth());
    setCurrentYear(initialDateObj.getFullYear());
  }, [initialDateObj]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setShowDatePickerOverlay(false);
      }
    };
    if (showDatePickerOverlay) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [showDatePickerOverlay]);

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();

  const selectedYear = initialDateObj.getFullYear();
  const selectedMonth = initialDateObj.getMonth();
  const selectedDayNum = initialDateObj.getDate();

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    setShowDatePickerOverlay(false);
  };

  const formattedDateDisplay = useMemo(() => {
    if (!selectedDate) return "Select date";
    try {
      const [y, m, d] = selectedDate.split("-").map(Number);
      if (y && m && d) {
        const dateObj = new Date(y, m - 1, d);
        return dateObj.toLocaleDateString("en-US", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      }
      return selectedDate;
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Preset Date Handlers
  const handleSetToday = () => {
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    handleSelectDate(dateStr);
  };

  const handleSetTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    handleSelectDate(dateStr);
  };

  const handleSetNextWeek = () => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    handleSelectDate(dateStr);
  };

  return (
    <div
      className="w-full max-w-[1263px] min-h-[281px] bg-white rounded-[16px] p-6 shadow-[-4px_4px_15px_0px_rgba(156,163,175,0.2)] border border-[#E9EEFE] flex flex-col gap-6 relative"
      style={{ fontFamily: "Instrument Sans, sans-serif" }}
    >
      {/* Header: Clock Icon + Assessment Date & Time Window */}
      <div className="flex items-center gap-2">
        <Clock size={18} className="text-[#2E5DE0] shrink-0" />
        <h2 className="text-[16px] font-bold text-[#1E1B4B] leading-none">
          Assessment Date &amp; Time Window
        </h2>
      </div>

      {/* Frame 11: 2 Boxes Container (Date Box + Start/End Time Box) */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Frame 9: Date Box (Left) */}
        <div className="w-full bg-[#FFFFFF] border border-[#E9EEFE] rounded-[16px] p-5 flex flex-col justify-between min-h-[189px] gap-4 relative">
          <div className="space-y-2 relative">
            <label className="block text-[14px] font-semibold text-[#1E1B4B]">Date</label>

            {/* Date Input Box with Calendar Icon & Chevron */}
            <div
              onClick={() => setShowDatePickerOverlay(!showDatePickerOverlay)}
              className="w-full h-[37px] px-4 rounded-[19px] border border-[#E9EEFE] bg-[#FFFFFF] flex items-center justify-between cursor-pointer hover:border-[#2E5DE0] transition-colors"
            >
              <div className="flex items-center gap-2 text-[#1E1B4B]">
                <CalendarIcon size={16} className="text-[#2E5DE0] shrink-0" />
                <span className="text-[13px] font-medium text-[#1E1B4B]">
                  {formattedDateDisplay}
                </span>
              </div>
              <ChevronDown size={16} className={`text-[#6B7280] transition-transform ${showDatePickerOverlay ? "rotate-180" : ""}`} />
            </div>

            {/* Calendar Overlay (Frame 7) */}
            {showDatePickerOverlay && (
              <div
                ref={calendarRef}
                className="absolute top-full left-0 mt-2 z-50 bg-white border border-[#E9EEFE] rounded-2xl p-4 shadow-2xl w-[320px] animate-fade-in"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Month/Year Navigation */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[#E9EEFE] text-[#6B7280] hover:bg-slate-50 cursor-pointer"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[14px] font-bold text-[#1E1B4B]">
                    {MONTH_NAMES[currentMonth]} {currentYear}
                  </span>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[#E9EEFE] text-[#6B7280] hover:bg-slate-50 cursor-pointer"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* Weekdays */}
                <div className="grid grid-cols-7 gap-1 text-center mb-2">
                  {WEEKDAYS.map((wd) => (
                    <div key={wd} className="text-[11px] font-semibold text-[#9CA3AF] py-1">
                      {wd}
                    </div>
                  ))}
                </div>

                {/* Day Matrix */}
                <div className="grid grid-cols-7 gap-1 text-center">
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
                      <div key={idx} className="flex flex-col items-center justify-center">
                        <button
                          type="button"
                          onClick={() => handleSelectDate(cell.dateStr)}
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-[#2E5DE0] text-white shadow-sm"
                              : isToday
                              ? "text-[#2E5DE0] bg-blue-50 font-bold"
                              : cell.currentMonth
                              ? "text-[#1E1B4B] hover:bg-slate-100"
                              : "text-[#D1D5DB] hover:text-[#9CA3AF]"
                          }`}
                        >
                          {cell.day}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Quick Date Presets */}
          <div className="space-y-2 pt-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">
              QUICK DATE PRESETS
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSetToday}
                className="h-[31px] px-[12px] py-[8px] rounded-[16px] bg-[#F3F4F6] text-[12px] font-semibold text-[#6B7280] hover:bg-[#E9EEFE] hover:text-[#2E5DE0] transition-colors cursor-pointer"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handleSetTomorrow}
                className="h-[31px] px-[12px] py-[8px] rounded-[16px] bg-[#F3F4F6] text-[12px] font-semibold text-[#6B7280] hover:bg-[#E9EEFE] hover:text-[#2E5DE0] transition-colors cursor-pointer"
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={handleSetNextWeek}
                className="h-[31px] px-[12px] py-[8px] rounded-[16px] bg-[#F3F4F6] text-[12px] font-semibold text-[#6B7280] hover:bg-[#E9EEFE] hover:text-[#2E5DE0] transition-colors cursor-pointer"
              >
                Next Week
              </button>
            </div>
          </div>
        </div>

        {/* Frame 10: Start Time / End Time Box (Right) */}
        <div className="w-full bg-[#FFFFFF] border border-[#E9EEFE] rounded-[16px] p-5 flex flex-col justify-between min-h-[189px] gap-4">
          {/* Start Time and End Time Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Start Time Column */}
            <div className="space-y-1.5">
              <label className="block text-[14px] font-semibold text-[#1E1B4B]">Start time</label>
              <div className="flex items-center gap-2">
                {/* Time Value Box (153.75 x 37) */}
                <div className="w-[153.75px] h-[37px] rounded-[19px] border border-[#E9EEFE] bg-white px-[16px] py-[10px] flex items-center justify-center focus-within:border-[#2E5DE0] transition-colors">
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
                </div>

                {/* AM/PM Dropdown Box (100 x 37) */}
                <div className="w-[100px] h-[37px] rounded-[19px] border border-[#E9EEFE] bg-white px-3.5 flex items-center justify-between relative cursor-pointer hover:border-[#2E5DE0] transition-colors">
                  <span className="text-[13px] font-bold text-[#1E1B4B] select-none">
                    {startAmPm}
                  </span>
                  <ChevronDown size={14} className="text-[#6B7280] pointer-events-none" />
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
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>
            </div>

            {/* End Time Column */}
            <div className="space-y-1.5">
              <label className="block text-[14px] font-semibold text-[#1E1B4B]">End time</label>
              <div className="flex items-center gap-2">
                {/* Time Value Box (153.75 x 37) */}
                <div className="w-[153.75px] h-[37px] rounded-[19px] border border-[#E9EEFE] bg-white px-[16px] py-[10px] flex items-center justify-center focus-within:border-[#2E5DE0] transition-colors">
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
                </div>

                {/* AM/PM Dropdown Box (100 x 37) */}
                <div className="w-[100px] h-[37px] rounded-[19px] border border-[#E9EEFE] bg-white px-3.5 flex items-center justify-between relative cursor-pointer hover:border-[#2E5DE0] transition-colors">
                  <span className="text-[13px] font-bold text-[#1E1B4B] select-none">
                    {endAmPm}
                  </span>
                  <ChevronDown size={14} className="text-[#6B7280] pointer-events-none" />
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
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Duration Presets */}
          <div className="space-y-2 pt-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">
              QUICK DURATION PRESETS
            </div>
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
                  className="h-[31px] px-[12px] py-[8px] rounded-[16px] bg-[#F3F4F6] text-[12px] font-semibold text-[#6B7280] hover:bg-[#E9EEFE] hover:text-[#2E5DE0] transition-colors cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Export helper so drives.$id.tsx can compute endIso in rolling mode */
export { computeRollingEndDate };
