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
          <div className="overflow-x-auto" data-testid="year-classes">
            <table className="w-full text-sm">
              <thead><tr className="table-head">
                <th scope="col" className="px-3 py-2 text-left">Class</th>
                <th scope="col" className="px-3 py-2 text-right">Present</th>
                <th scope="col" className="px-3 py-2 text-right">Late</th>
                <th scope="col" className="px-3 py-2 text-right">Absent</th>
                <th scope="col" className="px-3 py-2 text-right">Attendance</th>
              </tr></thead>
              <tbody>
                {d.classes.map((c) => (
                  <tr key={c.class_id || "none"} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium">{c.class_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.present}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.late}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.absent}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{c.percent == null ? "—" : `${c.percent}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>)}
    </section>
  );
}
