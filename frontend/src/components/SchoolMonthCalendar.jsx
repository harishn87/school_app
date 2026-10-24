import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function tone(d, todayIso) {
  if (d.holiday) return "bg-[#0B1020] text-white border-[#0B1020]";
  if (d.weekend) return "bg-slate-50 text-slate-400 border-transparent";
  if (!d.marked) return `bg-white text-slate-500 ${d.date <= todayIso ? "border-dashed border-slate-300" : "border-[#EEF0F6]"}`;
  const share = d.absent / d.marked;
  if (d.absent === 0) return "bg-emerald-500 text-white border-emerald-500";
  if (share <= 0.2) return "bg-amber-400 text-amber-950 border-amber-400";
  return "bg-rose-500 text-white border-rose-500";
}

/** Whole-school (or one class) month view for staff. Click a day to open it in the marking list below. */
export default function SchoolMonthCalendar({ classId, selected, onPick, refreshKey }) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [data, setData] = useState(null);
  const month = ym(cursor);

  // jump to the month of the date picked in the form above
  useEffect(() => {
    if (selected && selected.slice(0, 7) !== month) {
      const [y, m] = selected.split("-").map(Number);
      setCursor(new Date(y, m - 1, 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    let live = true;
    api.get("/attendance/month", { params: { month, class_id: classId || undefined } })
      .then((r) => live && setData(r.data)).catch(() => live && setData({ days: [], students: 0 }));
    return () => { live = false; };
  }, [month, classId, refreshKey]);

  const shift = (n) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const lead = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const todayIso = new Date().toLocaleDateString("en-CA");

  return (
    <section className="ui-card p-4 sm:p-5" data-testid="school-calendar">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold" data-testid="scal-title">{cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2>
          <p className="text-xs text-slate-500">{data ? `${data.students} students` : ""}. Click a date for details.</p>
        </div>
        <div className="flex gap-1">
          <button type="button" className="ui-btn !px-2.5 !py-1.5" onClick={() => shift(-1)} aria-label="Previous month" data-testid="scal-prev"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" className="ui-btn text-xs !px-3 !py-1.5" onClick={() => { const n = new Date(); setCursor(new Date(n.getFullYear(), n.getMonth(), 1)); onPick(todayIso); }}>Today</button>
          <button type="button" className="ui-btn !px-2.5 !py-1.5" onClick={() => shift(1)} aria-label="Next month" data-testid="scal-next"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-slate-500">{DOW.map((d) => <div key={d}>{d}</div>)}</div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5" data-testid="scal-grid">
        {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
        {(data?.days || Array.from({ length: 30 }).map(() => null)).map((d, i) => {
          if (!d) return <div key={i} className="h-14 sm:h-16 rounded-lg bg-slate-50 animate-pulse" />;
          return (
            <button key={d.date} type="button" onClick={() => onPick(d.date)} data-testid={`sday-${d.date}`}
              title={d.holiday ? `${d.holiday} (holiday)` : d.marked ? `${d.present} present, ${d.late} late, ${d.absent} absent` : d.weekend ? "Sunday" : "Not marked"}
              className={`h-14 sm:h-16 rounded-lg border flex flex-col items-center justify-center leading-none transition-transform hover:scale-[1.04] ${tone(d, todayIso)} ${d.date === selected ? "ring-2 ring-[#2B4BFF] ring-offset-2" : ""} ${d.date === todayIso && d.date !== selected ? "ring-1 ring-[#2B4BFF]" : ""}`}>
              <span className="text-sm font-semibold">{Number(d.date.slice(8))}</span>
              <span className="mt-1 text-[10px] font-medium h-3 max-w-full truncate px-0.5">
                {d.holiday ? "Holiday" : d.marked ? `${d.present + d.late}P ${d.absent}A` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
        <span><i className="inline-block h-3 w-3 rounded bg-emerald-500 align-[-1px] mr-1" />Everyone present</span>
        <span><i className="inline-block h-3 w-3 rounded bg-amber-400 align-[-1px] mr-1" />Up to 20% absent</span>
        <span><i className="inline-block h-3 w-3 rounded bg-rose-500 align-[-1px] mr-1" />More than 20% absent</span>
        <span><i className="inline-block h-3 w-3 rounded bg-[#0B1020] align-[-1px] mr-1" />Holiday</span>
        <span><i className="inline-block h-3 w-3 rounded border border-dashed border-slate-400 align-[-1px] mr-1" />Not marked</span>
      </div>
    </section>
  );
}
