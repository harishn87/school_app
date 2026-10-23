import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowDown, ArrowUp, Search } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";

const FEE = {
  paid: ["Paid", "bg-emerald-50 text-emerald-700"],
  partial: ["Part paid", "bg-amber-50 text-amber-700"],
  unpaid: ["Unpaid", "bg-rose-50 text-rose-700"],
  none: ["No fees", "bg-slate-100 text-slate-600"],
};

function Bar({ value, low }) {
  if (value == null) return <span className="text-slate-400">-</span>;
  return (
    <div className="flex items-center gap-2 min-w-[96px]">
      <div className="h-1.5 flex-1 rounded-full bg-[#E8ECFF] overflow-hidden"><div className="h-full rounded-full bg-[#2B4BFF]" style={{ width: `${Math.min(value, 100)}%` }} /></div>
      <span className="w-10 text-right text-sm font-medium tabular-nums">{value}%</span>
      {low && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-label="Low" />}
    </div>
  );
}

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  grade: (a, b) => (a.grade_avg ?? -1) - (b.grade_avg ?? -1),
  attendance: (a, b) => (a.attendance_pct ?? -1) - (b.attendance_pct ?? -1),
  pending: (a, b) => a.fees_pending - b.fees_pending,
};

/** Staff dashboard: every student's grades, attendance and fees in one place. */
export default function ProgressBoard() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [sort, setSort] = useState({ key: "pending", dir: -1 });
  const [only, setOnly] = useState("");   // "" | "fees" | "attendance"

  useEffect(() => { api.get("/dashboard/overview").then((r) => setData(r.data)).catch(() => setData({ students: [], classes: [], totals: {} })); }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.students.filter((s) => (!cls || s.class_id === cls) && s.name.toLowerCase().includes(q.trim().toLowerCase()));
    if (only === "fees") r = r.filter((s) => s.fees_pending > 0);
    if (only === "attendance") r = r.filter((s) => s.attendance_pct != null && s.attendance_pct < 75);
    return [...r].sort((a, b) => SORTS[sort.key](a, b) * sort.dir);
  }, [data, q, cls, sort, only]);

  if (!data || data.students.length === 0) return null;
  const t = data.totals;
  const head = (key, label, right) => (
    <th scope="col" className={`table-head px-4 py-2.5 ${right ? "text-right" : "text-left"}`}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-[#2B4BFF]" onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
        {label}{sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
      </button>
    </th>
  );

  return (
    <section className="space-y-4" data-testid="progress-board">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-heading text-xl font-semibold">Student progress and fees</h2>
          <p className="text-sm text-slate-500">Grades from academic records, attendance for the last 30 days, and fees.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <button type="button" onClick={() => setOnly(only === "fees" ? "" : "fees")} aria-pressed={only === "fees"} data-testid="filter-fees"
            className={`pill ${only === "fees" ? "bg-[#2B4BFF] text-white" : "bg-amber-50 text-amber-700"}`}>{t.defaulters} with fees pending</button>
          <button type="button" onClick={() => setOnly(only === "attendance" ? "" : "attendance")} aria-pressed={only === "attendance"} data-testid="filter-attendance"
            className={`pill ${only === "attendance" ? "bg-[#2B4BFF] text-white" : "bg-rose-50 text-rose-700"}`}>{t.low_attendance} below 75% attendance</button>
        </div>
      </div>

      <div className="ui-card overflow-x-auto" data-testid="class-summary">
        <table className="w-full text-sm">
          <thead><tr><th scope="col" className="table-head px-4 py-2.5 text-left">Class</th><th scope="col" className="table-head px-4 py-2.5 text-right">Students</th><th scope="col" className="table-head px-4 py-2.5 text-left">Average grade</th><th scope="col" className="table-head px-4 py-2.5 text-left">Attendance</th><th scope="col" className="table-head px-4 py-2.5 text-right">Fees pending</th></tr></thead>
          <tbody className="divide-y divide-[#EEF0F6]">
            {data.classes.map((c) => (
              <tr key={c.class_id || "none"}>
                <td className="px-4 py-3 font-medium">{c.class_name}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.students}</td>
                <td className="px-4 py-3"><Bar value={c.grade_avg} /></td>
                <td className="px-4 py-3"><Bar value={c.attendance_pct} low={c.attendance_pct != null && c.attendance_pct < 75} /></td>
                <td className="px-4 py-3 text-right tabular-nums">{c.fees_pending > 0 ? formatMoney(c.fees_pending) : "Nil"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ui-card">
        <div className="flex flex-wrap gap-3 p-4 border-b border-[#EEF0F6]">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className="ui-input !pl-9" placeholder="Search students" aria-label="Search students" value={q} onChange={(e) => setQ(e.target.value)} data-testid="board-search" />
          </div>
          <select className="ui-input !w-auto" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class" data-testid="board-class">
            <option value="">All classes</option>
            {data.classes.filter((c) => c.class_id).map((c) => <option key={c.class_id} value={c.class_id}>{c.class_name}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="board-table">
            <thead><tr>{head("name", "Student")}{head("grade", "Grade avg")}{head("attendance", "Attendance")}{head("pending", "Fees", true)}</tr></thead>
            <tbody className="divide-y divide-[#EEF0F6]">
              {rows.map((s) => {
                const [fl, fc] = FEE[s.fee_status];
                return (
                  <tr key={s.id} data-testid={`board-row-${s.id}`} className="hover:bg-[#F7F8FF]">
                    <td className="px-4 py-3">
                      <Link to={`/app/students/${s.id}`} className="font-medium hover:text-[#2B4BFF]">{s.name}</Link>
                      <div className="text-xs text-slate-500">{s.class_name || "No class"}{s.roll_number ? ` · Roll ${s.roll_number}` : ""}</div>
                    </td>
                    <td className="px-4 py-3"><Bar value={s.grade_avg} /></td>
                    <td className="px-4 py-3"><Bar value={s.attendance_pct} low={s.attendance_pct != null && s.attendance_pct < 75} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="tabular-nums font-medium">{s.fees_pending > 0 ? formatMoney(s.fees_pending) : s.fees_total ? "Nil" : "-"}</div>
                      <span className={`pill ${fc} mt-0.5`}>{fl}</span>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No students match.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
