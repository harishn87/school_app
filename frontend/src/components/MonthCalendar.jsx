import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LOOK = {
  present: { code: "P", label: "Present", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  late: { code: "L", label: "Late", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  absent: { code: "A", label: "Absent", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** One child's month: attendance per day plus school holidays. Props: studentId. */
export default function MonthCalendar({ studentId }) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const month = ym(cursor);

  useEffect(() => {
    let live = true;
    setData(null); setError(false);
    api.get("/calendar", { params: { student_id: studentId, month } })
      .then((r) => live && setData(r.data)).catch(() => live && setError(true));
    return () => { live = false; };
  }, [studentId, month]);

  const shift = (n) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const title = cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const lead = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay());
  const todayIso = new Date().toLocaleDateString("en-CA");
  const c = data?.counts;

  return (
    <div className="mt-3 rounded-xl border border-[#E7E9F1] p-4" data-testid={`calendar-${studentId}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold" data-testid="cal-title">{title}</h3>
        <div className="flex gap-1">
          <button type="button" onClick={() => shift(-1)} className="ui-btn !px-2.5 !py-1.5" aria-label="Previous month" data-testid="cal-prev"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="ui-btn text-xs !px-3 !py-1.5">Today</button>
          <button type="button" onClick={() => shift(1)} className="ui-btn !px-2.5 !py-1.5" aria-label="Next month" data-testid="cal-next"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
        {DOW.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" data-testid="cal-grid">
        {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
        {(data?.days || Array.from({ length: 30 }).map(() => null)).map((d, i) => {
          if (!d) return <div key={i} className="aspect-square rounded-lg bg-slate-50 animate-pulse" />;
          const st = LOOK[d.status];
          const day = Number(d.date.slice(8));
          const tone = st ? st.cls : d.holiday ? "bg-[#E8ECFF] text-[#2340F0] border-[#C9D2FF]" : d.weekend ? "bg-slate-50 text-slate-400 border-transparent" : "bg-white text-slate-600 border-[#EEF0F6]";
          return (
            <div key={d.date} data-testid={`day-${d.date}`} data-status={d.status || (d.holiday ? "holiday" : "")}
              title={d.holiday ? `${d.holiday} (holiday)` : st ? st.label : d.weekend ? "Sunday" : "Not marked"}
              className={`aspect-square rounded-lg border flex flex-col items-center justify-center text-sm leading-none ${tone} ${d.date === todayIso ? "ring-2 ring-[#2B4BFF] ring-offset-1" : ""}`}>
              <span className="font-medium">{day}</span>
              <span className="mt-1 text-[10px] font-semibold h-3">{st ? st.code : d.holiday ? "H" : ""}</span>
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">Couldn&apos;t load the calendar. Please try again.</p>}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600" data-testid="cal-counts">
        <span><b className="text-emerald-700">P</b> Present {c ? c.present : "-"}</span>
        <span><b className="text-amber-700">L</b> Late {c ? c.late : "-"}</span>
        <span><b className="text-rose-700">A</b> Absent {c ? c.absent : "-"}</span>
        <span><b className="text-[#2340F0]">H</b> Holiday {c ? c.holiday : "-"}</span>
        {data?.percent != null && <span className="ml-auto font-medium text-slate-800">{data.percent}% attendance this month</span>}
      </div>

      {data?.holidays?.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-[#EEF0F6] pt-3 text-sm" data-testid="cal-holidays">
          {data.holidays.map((h) => (
            <li key={h.date} className="flex gap-3"><span className="w-14 shrink-0 text-slate-500">{new Date(h.date + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span><span>{h.name}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
}
