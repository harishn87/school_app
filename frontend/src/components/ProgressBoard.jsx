import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import WagonWheel from "@/components/WagonWheel";
import YearSelect, { useAcademicYears } from "@/components/YearSelect";
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
  pending: (a, b) => (a.fees_pending || 0) - (b.fees_pending || 0),
};

const PAGE = 10;

/** One short "needs attention" list. */
function Watch({ title, tone, rows, total, value, onAll, testid }) {
  return (
    <div data-testid={testid}>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <button type="button" onClick={onAll} className="text-xs font-medium text-[#2B4BFF] hover:underline">{total > rows.length ? `See all ${total}` : "See in list"}</button>
      </div>
      {rows.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nobody right now.</p> : (
        <ul className="mt-2 divide-y divide-[#EEF0F6]">
          {rows.map((s) => (
            <li key={s.id}>
              <Link to={`/app/students/${s.id}`} className="flex items-center justify-between gap-3 py-2 hover:text-[#2B4BFF]">
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{s.name}</span><span className="block text-xs text-slate-500">{s.class_name || "No class"}</span></span>
                <span className={`pill ${tone} shrink-0 tabular-nums`}>{value(s)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Staff overview: a clickable wheel of classes, who needs attention, and a compact student list. */
export default function ProgressBoard() {
  const navigate = useNavigate();
  const listRef = useRef(null);
  const [data, setData] = useState(null);
  const [metric, setMetric] = useState("attendance");
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [sort, setSort] = useState({ key: "pending", dir: -1 });
  const [only, setOnly] = useState("");   // "" | "fees" | "attendance" | "grades"
  const [shown, setShown] = useState(PAGE);
  const ys = useAcademicYears();
  const [year, setYear] = useState("");

  useEffect(() => {
    api.get("/dashboard/overview", { params: { academic_year: year || undefined } }).then((r) => {
      setData(r.data);
      // open on a metric that actually has data
      if (!r.data.classes.some((c) => c.attendance_pct != null) && r.data.classes.some((c) => c.grade_avg != null)) setMetric("grade");
    }).catch(() => setData({ students: [], classes: [], totals: {} }));
  }, [year]);

  const showFees = !data || data.totals.fees_pending != null;
  const filterTo = (k) => { setOnly(k); setShown(PAGE); setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const low = useMemo(() => {
    if (!data) return { fees: [], att: [], grades: [] };
    const st = data.students;
    return {
      fees: st.filter((s) => s.fees_pending > 0).sort((a, b) => b.fees_pending - a.fees_pending),
      att: st.filter((s) => s.attendance_pct != null && s.attendance_pct < 75).sort((a, b) => a.attendance_pct - b.attendance_pct),
      grades: st.filter((s) => s.grade_avg != null && s.grade_avg < 50).sort((a, b) => a.grade_avg - b.grade_avg),
    };
  }, [data]);
  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.students.filter((s) => (!cls || s.class_id === cls) && s.name.toLowerCase().includes(q.trim().toLowerCase()));
    if (only === "fees") r = r.filter((s) => s.fees_pending > 0);
    if (only === "attendance") r = r.filter((s) => s.attendance_pct != null && s.attendance_pct < 75);
    if (only === "grades") r = r.filter((s) => s.grade_avg != null && s.grade_avg < 50);
    const key = data.totals.fees_pending == null && sort.key === "pending" ? "name" : sort.key;
    return [...r].sort((a, b) => SORTS[key](a, b) * (key === sort.key ? sort.dir : 1));
  }, [data, q, cls, sort, only]);

  if (!data || data.students.length === 0) return null;
  const t = data.totals;
  const wheel = data.classes.filter((c) => c.class_id).map((c) => ({
    label: c.class_name, id: c.class_id,
    value: metric === "attendance" ? c.attendance_pct : metric === "grade" ? c.grade_avg : (c.fees_total ? Math.round((c.fees_paid / c.fees_total) * 100) : null),
  }));
  const metrics = [["attendance", "Attendance"], ["grade", "Grades"], ...(showFees ? [["fees", "Fees collected"]] : [])];
  const sub = { attendance: year ? `Attendance across ${year}.` : "Attendance over the last 30 days.", grade: "Average mark from academics.", fees: "Share of billed fees already collected." }[metric];
  const head = (key, label, right) => (
    <th scope="col" className={`table-head px-4 py-2.5 ${right ? "text-right" : "text-left"}`}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-[#2B4BFF]" onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
        {label}{sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
      </button>
    </th>
  );
  const pills = [["fees", showFees ? `${t.defaulters} with fees pending` : null, "bg-amber-50 text-amber-700", "filter-fees"],
    ["attendance", `${t.low_attendance} below 75% attendance`, "bg-rose-50 text-rose-700", "filter-attendance"],
    ["grades", `${low.grades.length} below 50% in grades`, "bg-violet-50 text-violet-700", "filter-grades"]].filter((x) => x[1]);

  return (
    <section className="space-y-5" data-testid="progress-board">
      <YearSelect chips years={ys.years} current={ys.current} value={year || ys.current} onChange={(y) => { setYear(y === ys.current ? "" : y); setShown(PAGE); }} />
      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-5 items-start">
        <div className="ui-card p-5" data-testid="class-summary">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl font-semibold">Classes at a glance</h2>
              <p className="text-xs text-slate-500 mt-0.5">{sub} Click a class to open it.</p>
            </div>
            <div className="flex gap-1.5" role="group" aria-label="Wheel metric">
              {metrics.map(([k, l]) => (
                <button key={k} type="button" onClick={() => setMetric(k)} aria-pressed={metric === k} data-testid={`ov-metric-${k}`}
                  className={`pill px-3 py-1 text-xs font-medium ${metric === k ? "bg-[#2B4BFF] text-white" : "bg-[#F1F4FF] text-[#3A4160]"}`}>{l}</button>
              ))}
            </div>
          </div>
          {wheel.length >= 3
            ? <WagonWheel items={wheel} title={metrics.find((m) => m[0] === metric)[1]} testid="overview-wheel" onSelect={(it) => navigate(`/app/classes/${it.id}`)} hint="Click a class to open it." />
            : <p className="py-10 text-center text-sm text-slate-500">Add at least three classes to see the wheel.</p>}
        </div>

        <div className="ui-card p-5 space-y-5" data-testid="watchlist">
          <div><h2 className="font-heading text-xl font-semibold">Needs attention</h2><p className="text-xs text-slate-500 mt-0.5">The students to look at first.</p></div>
          {showFees && <Watch testid="watch-fees" title="Fees pending" tone="bg-amber-50 text-amber-700" rows={low.fees.slice(0, 4)} total={low.fees.length} value={(s) => formatMoney(s.fees_pending)} onAll={() => filterTo("fees")} />}
          <Watch testid="watch-attendance" title="Low attendance" tone="bg-rose-50 text-rose-700" rows={low.att.slice(0, 4)} total={low.att.length} value={(s) => `${s.attendance_pct}%`} onAll={() => filterTo("attendance")} />
          <Watch testid="watch-grades" title="Low grades" tone="bg-violet-50 text-violet-700" rows={low.grades.slice(0, 4)} total={low.grades.length} value={(s) => `${s.grade_avg}%`} onAll={() => filterTo("grades")} />
        </div>
      </div>

      <div className="ui-card" ref={listRef}>
        <div className="p-4 border-b border-[#EEF0F6] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">Students <span className="text-slate-400 font-normal text-base">({rows.length})</span></h2>
            <div className="flex flex-wrap gap-2 text-sm">
              {pills.map(([k, label, tone, tid]) => (
                <button key={k} type="button" onClick={() => { setOnly(only === k ? "" : k); setShown(PAGE); }} aria-pressed={only === k} data-testid={tid}
                  className={`pill ${only === k ? "bg-[#2B4BFF] text-white" : tone}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input className="ui-input !pl-9" placeholder="Search students" aria-label="Search students" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} data-testid="board-search" />
            </div>
            <select className="ui-input !w-auto" value={cls} onChange={(e) => { setCls(e.target.value); setShown(PAGE); }} aria-label="Class" data-testid="board-class">
              <option value="">All classes</option>
              {data.classes.filter((c) => c.class_id).map((c) => <option key={c.class_id} value={c.class_id}>{c.class_name}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="board-table">
            <thead><tr>{head("name", "Student")}{head("grade", "Grade avg")}{head("attendance", "Attendance")}{showFees && head("pending", "Fees", true)}</tr></thead>
            <tbody className="divide-y divide-[#EEF0F6]">
              {rows.slice(0, shown).map((s) => {
                const [fl, fc] = FEE[s.fee_status || "none"];
                return (
                  <tr key={s.id} data-testid={`board-row-${s.id}`} className="hover:bg-[#F7F8FF]">
                    <td className="px-4 py-2.5">
                      <Link to={`/app/students/${s.id}`} className="font-medium hover:text-[#2B4BFF]">{s.name}</Link>
                      <div className="text-xs text-slate-500">{s.class_name || "No class"}{s.roll_number ? ` · Roll ${s.roll_number}` : ""}</div>
                    </td>
                    <td className="px-4 py-2.5"><Bar value={s.grade_avg} /></td>
                    <td className="px-4 py-2.5"><Bar value={s.attendance_pct} low={s.attendance_pct != null && s.attendance_pct < 75} /></td>
                    {showFees && <td className="px-4 py-2.5 text-right">
                      <Link to={`/app/fees?student=${s.id}`} className="block rounded-lg px-1.5 py-0.5 -mr-1.5 hover:bg-[#E8ECFF] transition-colors" title="Open this student's fees" data-testid={`board-fee-${s.id}`}>
                        <div className="tabular-nums font-medium">{s.fees_pending > 0 ? formatMoney(s.fees_pending) : s.fees_total ? "Nil" : "-"}</div>
                        <span className={`pill ${fc} mt-0.5`}>{fl}</span>
                      </Link>
                    </td>}
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={showFees ? 4 : 3} className="px-4 py-8 text-center text-slate-500">No students match.</td></tr>}
            </tbody>
          </table>
        </div>
        {rows.length > PAGE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#EEF0F6] text-sm" data-testid="board-more">
            <span className="text-slate-500">Showing {Math.min(shown, rows.length)} of {rows.length}</span>
            <div className="flex gap-3">
              {shown < rows.length && <button type="button" className="font-medium text-[#2B4BFF] hover:underline" onClick={() => setShown((n) => n + 20)}>Show 20 more</button>}
              {shown > PAGE && <button type="button" className="font-medium text-slate-600 hover:underline" onClick={() => setShown(PAGE)}>Show fewer</button>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
