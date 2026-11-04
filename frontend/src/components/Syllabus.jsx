import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, XCircle, CircleDashed, BookOpenCheck, Clock } from "lucide-react";
import { api } from "@/lib/api";
import CountUp from "@/components/CountUp";

export const RAG = {
  green: { label: "On track", bar: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "text-emerald-600", hex: "#10B981", icon: CheckCircle2 },
  amber: { label: "Slightly behind", bar: "bg-amber-400", soft: "bg-amber-50 text-amber-800 border-amber-200", text: "text-amber-600", hex: "#F59E0B", icon: AlertTriangle },
  red: { label: "Behind", bar: "bg-rose-500", soft: "bg-rose-50 text-rose-700 border-rose-200", text: "text-rose-600", hex: "#F43F5E", icon: XCircle },
  none: { label: "Not set up", bar: "bg-slate-300", soft: "bg-slate-100 text-slate-600 border-slate-200", text: "text-slate-500", hex: "#94A3B8", icon: CircleDashed },
};

export function useSyllabusSummary(tick = 0, year = "") {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => { api.get("/syllabus/summary", { params: year ? { academic_year: year } : {} }).then((r) => setData(r.data)).catch(() => setError(true)); }, [tick, year]);
  return { data, error };
}

export function RagPill({ status, testid }) {
  const r = RAG[status] || RAG.none;
  const Icon = r.icon;
  return <span className={`pill border text-xs font-medium px-2.5 py-1 inline-flex items-center gap-1 ${r.soft}`} data-testid={testid}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{r.label}</span>;
}

/** Progress bar with the pacing target marked on it. Bar colour is the red / amber / green grade. */
export function PaceBar({ percent, target, status, thin = false }) {
  const r = RAG[status] || RAG.none;
  return (
    <div className="relative" role="img" aria-label={`${percent ?? 0}% covered, target ${target ?? 0}%`}>
      <div className={`${thin ? "h-2" : "h-3"} rounded-full bg-slate-100 overflow-hidden`}>
        <div className={`h-full rounded-full anim-grow ${r.bar}`} style={{ width: `${percent ?? 0}%` }} />
      </div>
      {target != null && <div className={`absolute -top-1 ${thin ? "-bottom-1" : "-bottom-1"} w-0.5 bg-[#0B1020] rounded`} style={{ left: `calc(${target}% - 1px)` }} title={`Target ${target}%`} />}
    </div>
  );
}

const when = (d) => (d == null ? "never" : d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`);

/** One class: grade, bar against target, subject by subject. `to` makes the whole card a link. */
export function ClassSyllabusCard({ row, to, cta, showTeacher }) {
  const r = RAG[row.status] || RAG.none;
  return (
    <article className={`ui-card hoverable relative p-4 sm:p-5 border-t-4 ${row.status === "green" ? "border-t-emerald-500" : row.status === "amber" ? "border-t-amber-400" : row.status === "red" ? "border-t-rose-500" : "border-t-slate-300"}`} data-testid={`syl-card-${row.class_id}`} data-status={row.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading font-semibold text-lg">
            {to ? <Link to={to} className="after:absolute after:inset-0 after:content-[''] focus:outline-none" data-testid={`syl-open-${row.class_id}`}>{row.class_name}</Link> : row.class_name}
          </h3>
          <p className="text-xs text-slate-500 truncate">{row.term || "No syllabus yet"}{showTeacher && row.teacher ? ` · ${row.teacher}` : ""}{row.children?.length ? ` · ${row.children.join(", ")}` : ""}</p>
        </div>
        <RagPill status={row.status} testid={`syl-pill-${row.class_id}`} />
      </div>

      {!row.has_syllabus ? (
        <p className="mt-4 text-sm text-slate-500">The class teacher hasn&apos;t added this term&apos;s syllabus yet.</p>
      ) : (<>
        <div className="mt-4 flex items-end justify-between">
          <div className={`font-heading text-3xl font-semibold tabular-nums ${r.text}`}><CountUp value={row.percent} format={(v) => `${Math.round(v)}%`} /></div>
          <div className="text-xs text-slate-500 text-right">target today <b className="text-slate-800 tabular-nums">{row.target}%</b><br />{row.gap >= 0 ? `${row.gap} points ahead` : `${-row.gap} points behind`}</div>
        </div>
        <div className="mt-2"><PaceBar percent={row.percent} target={row.target} status={row.status} /></div>
        <ul className="mt-4 space-y-2">
          {row.subjects.slice(0, 6).map((s) => (
            <li key={s.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <span className="text-sm truncate">{s.name}</span><span className={`text-xs font-semibold tabular-nums ${(RAG[s.status] || RAG.none).text}`}>{s.percent}%</span>
              <div className="col-span-2"><PaceBar percent={s.percent} target={row.target} status={s.status} thin /></div>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />Updated {when(row.days_since_update)}</span>
          {row.update_due && <span className="pill bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 font-medium" data-testid={`syl-due-${row.class_id}`}>{row.stale ? "Update overdue" : "Update due today"}</span>}
        </div>
      </>)}
      {cta && <div className="mt-4 relative z-10"><Link to={cta.to} className="ui-btn btn-primary text-sm w-full justify-center" data-testid={`syl-cta-${row.class_id}`}><BookOpenCheck className="h-4 w-4" aria-hidden="true" />{cta.label}</Link></div>}
    </article>
  );
}

/** Dashboard block shared by the teacher, principal and parent screens. */
export function SyllabusBoard({ data, title = "Syllabus against target", sub, linkFor, ctaFor, showTeacher, testid = "syllabus-board", legend = true }) {
  if (!data || data.classes.length === 0) return null;
  const c = data.counts;
  return (
    <section className="space-y-4" data-testid={testid}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{sub || "How much of each term's syllabus is covered, against where the term says it should be today."}</p>
        </div>
        {legend && (
          <div className="flex flex-wrap gap-2 text-xs font-medium" data-testid={`${testid}-counts`}>
            {["green", "amber", "red"].map((k) => <span key={k} className={`pill border px-2.5 py-1 ${RAG[k].soft}`}>{c[k]} {RAG[k].label.toLowerCase()}</span>)}
            {c.none > 0 && <span className={`pill border px-2.5 py-1 ${RAG.none.soft}`}>{c.none} not set up</span>}
          </div>
        )}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        {data.classes.map((row) => <ClassSyllabusCard key={row.class_id} row={row} showTeacher={showTeacher} to={linkFor?.(row)} cta={ctaFor?.(row)} />)}
      </div>
      {legend && <p className="text-[11px] text-slate-500">Green: on target or within {-data.rules.green_gap} points. Amber: {-data.rules.green_gap} to {-data.rules.amber_gap} points behind. Red: more than {-data.rules.amber_gap} points behind. The black tick on each bar is today&apos;s target.</p>}
    </section>
  );
}
