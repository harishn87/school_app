import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import CountUp from "@/components/CountUp";
import YearSelect, { useAcademicYears } from "@/components/YearSelect";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (m) => `${MON[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;

/** Whole-year attendance: totals, month by month, and class by class. Props: classId (optional), studentId (optional). */
export default function YearAttendance({ classId = "", studentId = "" }) {
  const ys = useAcademicYears();
  const [year, setYear] = useState("");
  const yr = year || ys.current;
  const [d, setD] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!yr) return;
    let live = true;
    setD(null); setError(false);
    api.get("/attendance/year", { params: { academic_year: yr, class_id: classId || undefined, student_id: studentId || undefined } })
      .then((r) => live && setD(r.data)).catch(() => live && setError(true));
    return () => { live = false; };
  }, [yr, classId, studentId]);

  const tiles = d ? [
    ["Attendance", d.percent == null ? "—" : `${d.percent}%`, "bg-[#2B4BFF]"],
    ["Present", d.present, "bg-emerald-500"],
    ["Late", d.late, "bg-amber-400"],
    ["Absent", d.absent, "bg-rose-500"],
    ["School days", d.school_days, "bg-slate-300"],
  ] : [];

  return (
    <section className="ui-card p-5 space-y-5" data-testid="year-attendance">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">Attendance for the whole year</h2>
          <p className="text-xs text-slate-500 mt-0.5">April to March{studentId ? "" : classId ? ", this class" : ", all students"}. Each mark counts once; late counts as attended.</p>
        </div>
        <YearSelect chips years={ys.years} current={ys.current} value={yr} onChange={setYear} id="ya-year" />
      </div>

      {error && <p className="text-sm text-rose-600">Could not load the year summary.</p>}
      {!d && !error && <p className="text-sm text-slate-500">Loading…</p>}
      {d && (<>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" data-testid="year-tiles">
          {tiles.map(([k, v, c]) => (
            <div key={k} className="rounded-xl border border-[#E7E9F1] p-3 flex gap-3">
              <span className={`w-1.5 rounded-full shrink-0 ${c}`} aria-hidden="true" />
              <div><div className="text-xs text-slate-500">{k}</div><div className="font-heading text-2xl font-semibold tabular-nums">{typeof v === "number" ? <CountUp value={v} /> : v}</div></div>
            </div>
          ))}
        </div>

        {d.school_days === 0 ? (
          <p className="text-sm text-slate-500" data-testid="year-empty">No attendance has been marked for {d.academic_year}.</p>
        ) : (
          <div data-testid="year-months">
            <div className="flex items-end gap-1.5 sm:gap-2 h-40">
              {d.months.map((m) => {
                const n = m.present + m.late + m.absent;
                const h = (v) => (n ? `${(v / n) * 100}%` : "0%");
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center h-full" title={`${label(m.month)}: ${m.percent ?? "no data"}${m.percent == null ? "" : "%"} attended · ${m.school_days} school days · ${m.absent} absent`}>
                    <div className="text-[11px] font-semibold tabular-nums text-slate-600 h-4">{m.percent == null ? "" : `${m.percent}%`}</div>
                    <div className="w-full flex-1 flex flex-col-reverse rounded-md overflow-hidden bg-slate-100 gap-px" data-testid={`ya-bar-${m.month}`} style={{ animation: "rise-y .8s cubic-bezier(.2,.8,.2,1) both", transformOrigin: "bottom" }}>
                      <div className="bg-emerald-500" style={{ height: h(m.present) }} />
                      <div className="bg-amber-400" style={{ height: h(m.late) }} />
                      <div className="bg-rose-500" style={{ height: h(m.absent) }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1.5 sm:gap-2 mt-1.5">
              {d.months.map((m) => <div key={m.month} className="flex-1 text-center text-[11px] text-slate-500">{label(m.month).split(" ")[0]}</div>)}
            </div>
            <div className="flex gap-4 mt-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Present</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400" />Late</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-rose-500" />Absent</span>
            </div>
          </div>
        )}

        {d.school_days > 0 && !studentId && !classId && d.classes.length > 1 && (
          <div data-testid="year-classes">
            <div className="flex items-end justify-between gap-2 mb-3">
              <h3 className="font-heading text-base font-semibold">Class by class</h3>
              <span className="text-xs text-slate-500">Ranked by attendance</span>
            </div>
            <ul className="space-y-2">
              {[...d.classes].sort((x, y) => (y.percent ?? -1) - (x.percent ?? -1) || String(x.class_name).localeCompare(String(y.class_name), undefined, { numeric: true })).map((c, i) => {
                const n = c.present + c.late + c.absent;
                const w = (v) => (n ? `${(v / n) * 100}%` : "0%");
                const pc = c.percent;
                const tone = pc == null ? "bg-slate-100 text-slate-500" : pc >= 94 ? "bg-emerald-50 text-emerald-700" : pc >= 90 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700";
                return (
                  <li key={c.class_id || "none"} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-xl border border-[#E7E9F1] bg-gradient-to-r from-white to-[#F7F8FF] px-3.5 py-3 transition-colors hover:border-[#2B4BFF]/30 sm:grid-cols-[auto_minmax(110px,1fr)_minmax(140px,2fr)_auto_auto]">
                    <span className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-bold ${i === 0 ? "bg-[#E9C46A] text-[#0B1020]" : i === 1 ? "bg-slate-200 text-slate-700" : i === 2 ? "bg-amber-100 text-amber-800" : "bg-[#EEF1FF] text-[#2B4BFF]"}`}>{i + 1}</span>
                    <span className="min-w-0 truncate font-heading font-semibold text-[#0B1020]">{c.class_name}</span>
                    <div className="order-last col-span-3 sm:order-none sm:col-span-1" aria-hidden="true">
                      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 gap-px">
                        <div className="bg-emerald-500" style={{ width: w(c.present) }} />
                        <div className="bg-amber-400" style={{ width: w(c.late) }} />
                        <div className="bg-rose-500" style={{ width: w(c.absent) }} />
                      </div>
                    </div>
                    <div className="hidden items-center gap-1.5 text-xs font-semibold tabular-nums sm:flex">
                      <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700" title="Present">{c.present}<span className="ml-0.5 font-normal opacity-70">P</span></span>
                      <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700" title="Late">{c.late}<span className="ml-0.5 font-normal opacity-70">L</span></span>
                      <span className="rounded-md bg-rose-50 px-2 py-1 text-rose-700" title="Absent">{c.absent}<span className="ml-0.5 font-normal opacity-70">A</span></span>
                    </div>
                    <span className={`min-w-[3.75rem] rounded-full px-3 py-1 text-center font-heading text-sm font-semibold tabular-nums ${tone}`}>{pc == null ? "—" : `${pc}%`}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </>)}
    </section>
  );
}
