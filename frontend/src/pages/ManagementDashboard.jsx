import PageHero from "@/components/PageHero";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import WagonWheel from "@/components/WagonWheel";
import PivotTable from "@/components/PivotTable";

const rank = (n = "") => { const m = n.match(/\d+/); return (/^(pp|nursery|lkg|ukg|kg)/i.test(n.trim()) ? 0 : 100) + (m ? Number(m[0]) : 0); };
const avg = (v) => { const x = v.filter((n) => n != null); return x.length ? Math.round(x.reduce((a, b) => a + b, 0) / x.length) : null; };
const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleString("en-IN", { month: "short" });
const BLUE = "#2B4BFF", GREEN = "#0E8F6E";

function Card({ title, sub, children, testid }) {
  return (
    <section className="ui-card p-5" data-testid={testid}>
      <h2 className="font-display text-lg font-semibold text-[#0B1020]">{title}</h2>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
const Tile = ({ label, value, note, testid }) => (
  <div className="ui-card p-4" data-testid={testid}>
    <p className="text-xs text-slate-500">{label}</p>
    <p className="mt-1 font-display text-2xl font-semibold text-[#0B1020] tabular-nums">{value}</p>
    {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
  </div>
);

function TrendChart({ data }) {
  const [hov, setHov] = useState(null);
  const W = 520, H = 220, L = 36, B = 28, T = 12, Rr = 16;
  const pts = data.map((d, i) => ({ ...d, x: L + (i * (W - L - Rr)) / Math.max(1, data.length - 1), y: d.pct == null ? null : T + (1 - d.pct / 100) * (H - T - B) }));
  const line = pts.filter((p) => p.y != null).map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Attendance by month: ${data.map((d) => `${monthLabel(d.month)} ${d.pct ?? "no data"}%`).join(", ")}`} onMouseLeave={() => setHov(null)}>
        {[0, 25, 50, 75, 100].map((v) => { const y = T + (1 - v / 100) * (H - T - B); return <g key={v}><line x1={L} x2={W - Rr} y1={y} y2={y} stroke="#E3E7F5" /><text x={L - 6} y={y} fontSize="10" textAnchor="end" dominantBaseline="middle" fill="#8A93AD">{v}%</text></g>; })}
        <polyline points={line} fill="none" stroke={BLUE} strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={p.month}>
            <text x={p.x} y={H - 8} fontSize="11" textAnchor="middle" fill="#3A4160">{monthLabel(p.month)}</text>
            {p.y != null && <circle cx={p.x} cy={p.y} r={hov === i ? 6 : 4.5} fill={BLUE} stroke="#fff" strokeWidth="2" />}
            {p.y != null && i === pts.length - 1 && <text x={p.x} y={p.y - 10} fontSize="11" fontWeight="600" textAnchor="end" fill="#0B1020">{p.pct}%</text>}
            <rect x={p.x - 24} y={T} width="48" height={H - T - B} fill="transparent" onMouseEnter={() => setHov(i)} tabIndex={0} onFocus={() => setHov(i)} onBlur={() => setHov(null)} aria-label={`${monthLabel(p.month)} ${p.pct ?? "no data"}%`} />
          </g>
        ))}
      </svg>
      {hov != null && <div className="pointer-events-none absolute right-2 top-0 rounded-lg bg-[#0B1020] px-3 py-1.5 text-xs text-white">{monthLabel(pts[hov].month)} · {pts[hov].pct == null ? "no data" : `${pts[hov].pct}% present`}{pts[hov].marked ? ` · ${pts[hov].marked} marks` : ""}</div>}
    </div>
  );
}

function FeeBars({ data }) {
  const [hov, setHov] = useState(null);
  if (!data.length) return <p className="text-sm text-slate-500">No fees recorded yet.</p>;
  const W = 520, H = 220, L = 70, B = 28, T = 12;
  const max = Math.max(...data.flatMap((d) => [d.billed, d.collected]), 1);
  const gw = (W - L) / data.length, bw = Math.min(34, gw / 3);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  return (
    <div className="relative">
      <div className="flex gap-4 text-xs text-slate-600 mb-2" data-testid="fee-legend">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: BLUE }} />Billed</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: GREEN }} />Collected</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Fees by term: ${data.map((d) => `${d.term} billed ${formatMoney(d.billed)}, collected ${formatMoney(d.collected)}`).join("; ")}`} onMouseLeave={() => setHov(null)}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="#E3E7F5" /><text x={L - 6} y={y(max * f)} fontSize="10" textAnchor="end" dominantBaseline="middle" fill="#8A93AD">{formatMoney(Math.round(max * f)).replace(/\.00$/, "")}</text></g>)}
        {data.map((d, i) => {
          const cx = L + gw * i + gw / 2;
          return (
            <g key={d.term} onMouseEnter={() => setHov(i)} tabIndex={0} onFocus={() => setHov(i)} onBlur={() => setHov(null)} aria-label={`${d.term} billed ${formatMoney(d.billed)} collected ${formatMoney(d.collected)}`}>
              <rect x={cx - bw - 1} y={y(d.billed)} width={bw} height={H - B - y(d.billed)} rx="3" fill={BLUE} />
              <rect x={cx + 1} y={y(d.collected)} width={bw} height={Math.max(0, H - B - y(d.collected))} rx="3" fill={GREEN} />
              <text x={cx} y={H - 8} fontSize="11" textAnchor="middle" fill="#3A4160">{d.term}</text>
              <rect x={cx - gw / 2} y={T} width={gw} height={H - T - B} fill="transparent" />
            </g>
          );
        })}
      </svg>
      {hov != null && <div className="pointer-events-none absolute right-2 top-6 rounded-lg bg-[#0B1020] px-3 py-1.5 text-xs text-white">{data[hov].term} · billed {formatMoney(data[hov].billed)} · collected {formatMoney(data[hov].collected)} ({data[hov].billed ? Math.round((data[hov].collected / data[hov].billed) * 100) : 0}%)</div>}
    </div>
  );
}

export default function ManagementDashboard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [metric, setMetric] = useState("attendance");
  const [subjClass, setSubjClass] = useState("");

  useEffect(() => { api.get("/dashboard/school").then((r) => setD(r.data)).catch((e) => setErr(errorMessage(e))); }, []);

  const classes = useMemo(() => (d ? [...d.classes].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)) : []), [d]);
  const wheel = useMemo(() => {
    if (!d) return [];
    return classes.map((c) => {
      const s = d.students.filter((x) => x.class_id === c.id);
      let value = null;
      if (metric === "attendance") value = avg(s.map((x) => x.attendance_pct));
      else if (metric === "grade") value = avg(s.map((x) => x.grade_avg));
      else { const b = s.reduce((a, x) => a + x.fees_total, 0); value = b ? Math.round((s.reduce((a, x) => a + x.fees_paid, 0) / b) * 100) : null; }
      return { label: c.name, value };
    });
  }, [d, classes, metric]);
  const subjWheel = useMemo(() => {
    if (!d) return [];
    if (subjClass) return Object.entries(d.subjects_by_class[subjClass] || {}).map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
    return d.subjects.map((s) => ({ label: s.subject, value: s.avg }));
  }, [d, subjClass]);

  if (err) return <p className="text-red-600" role="alert">{err}</p>;
  if (!d) return <p className="text-slate-500">Loading school data…</p>;

  const n = d.students.length;
  const t = d.today, marked = t.present + t.late + t.absent;
  const billed = d.students.reduce((a, s) => a + s.fees_total, 0), paid = d.students.reduce((a, s) => a + s.fees_paid, 0);
  const grade = avg(d.students.map((s) => s.grade_avg));
  const metricInfo = { attendance: ["Attendance, last 30 days", "Share of marked days present, averaged over each class's students."], grade: ["Average grade", "Average of progress report marks."], fees: ["Fee collection", "Fees collected as a share of fees billed."] }[metric];

  return (
    <div className="space-y-6" data-testid="management-dashboard">
      <PageHero title="School dashboard" subtitle={`The whole school at a glance, as of ${d.as_of}. Wheels, trends and a pivot table for any question.`} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Students" value={n} note={`${classes.length} classes`} testid="kpi-students" />
        <Tile label="Present today" value={marked ? `${Math.round(((t.present + t.late) / marked) * 100)}%` : "-"} note={marked ? `${t.absent} absent, ${t.unmarked} not marked` : "Attendance not marked yet"} testid="kpi-today" />
        <Tile label="Fees collected" value={billed ? `${Math.round((paid / billed) * 100)}%` : "-"} note={`${formatMoney(billed - paid)} pending`} testid="kpi-fees" />
        <Tile label="Average grade" value={grade == null ? "-" : `${grade}%`} note="All subjects" testid="kpi-grade" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Class wheel" sub={metricInfo[1]} testid="wheel-classes">
          <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Wheel metric">
            {[["attendance", "Attendance"], ["grade", "Grades"], ["fees", "Fee collection"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setMetric(k)} aria-pressed={metric === k} data-testid={`metric-${k}`}
                className={`pill ${metric === k ? "bg-[#2B4BFF] text-white" : "bg-[#F1F4FF] text-[#3A4160]"} px-3 py-1 text-xs font-medium rounded-full`}>{l}</button>
            ))}
          </div>
          <WagonWheel items={wheel} title={metricInfo[0]} zoom testid="wheel-class-chart" />
        </Card>
        <Card title="Subject wheel" sub="Average marks per subject." testid="wheel-subjects">
          <label className="block max-w-[220px] mb-2"><span className="field-label">Class</span>
            <select className="ui-input mt-1" value={subjClass} onChange={(e) => setSubjClass(e.target.value)} data-testid="subject-class">
              <option value="">Whole school</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
          <WagonWheel items={subjWheel} title="Subject averages" zoom testid="wheel-subject-chart" />
        </Card>
        <Card title="Attendance by month" sub="Share of marked student days present." testid="trend"><TrendChart data={d.monthly_attendance} /></Card>
        <Card title="Fees by term" sub="Billed against collected." testid="fees-terms"><FeeBars data={d.fees_by_term} /></Card>
      </div>

      <Card title="Pivot table" sub="Choose what goes down the side and across the top, then what to measure." testid="pivot-card"><PivotTable students={d.students} /></Card>
    </div>
  );
}
