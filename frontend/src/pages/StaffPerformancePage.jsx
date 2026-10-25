import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import PageHero from "@/components/PageHero";
import WagonWheel from "@/components/WagonWheel";
import CountUp from "@/components/CountUp";
import YearSelect, { useAcademicYears } from "@/components/YearSelect";
import { api } from "@/lib/api";

const METRICS = [
  { key: "overall", label: "Overall", note: "Weighted blend of the five measures below." },
  { key: "results", label: "Student results", note: "Average report-card percentage of the teacher's students." },
  { key: "attendance", label: "Student attendance", note: "Share of marks that are present or late in the teacher's classes." },
  { key: "register", label: "Register regularity", note: "School days on which the teacher's classes have attendance marked." },
  { key: "marks", label: "Marks entry", note: "Report cards entered for the teacher's students, out of those expected for the terms in use." },
  { key: "diary", label: "Diary activity", note: "School days on which the teacher posted classwork, homework or a notice." },
];
const val = (t, k) => (k === "overall" ? t.overall : t.metrics[k]);
const tone = (v) => (v == null ? "text-slate-400" : v >= 80 ? "text-emerald-600" : v >= 60 ? "text-amber-600" : "text-rose-600");
const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default function StaffPerformancePage() {
  const ys = useAcademicYears();
  const [year, setYear] = useState("");
  const yr = year || ys.current;
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState("overall");
  const [pick, setPick] = useState(null);

  useEffect(() => {
    if (!yr) return;
    let live = true;
    setData(null); setError(false);
    api.get("/staff/performance", { params: { academic_year: yr } }).then((r) => live && setData(r.data)).catch(() => live && setError(true));
    return () => { live = false; };
  }, [yr]);

  const teachers = useMemo(() => data?.teachers || [], [data]);
  const sel = teachers.find((t) => t.id === pick) || teachers[0];
  const m = METRICS.find((x) => x.key === metric);
  const items = teachers.map((t) => ({ label: t.name.split(" ").length > 1 ? `${t.name.split(" ")[0]} ${t.name.split(" ")[1][0]}.` : t.name, id: t.id, value: val(t, metric) }));
  const avg = (k) => { const v = teachers.map((t) => val(t, k)).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="staff-performance-page">
      <PageHero title="Staff performance" subtitle="How each teacher's classes are doing: results, attendance, marks entry and diary. Click a wing of the wheel to see that teacher's detail." />
      <YearSelect chips years={ys.years} current={ys.current} value={yr} onChange={setYear} id="sp-year" />

      {error && <div className="ui-card p-6 text-rose-600">Could not load staff performance.</div>}
      {!data && !error && <div className="ui-card p-6 text-slate-500">Loading…</div>}
      {data && teachers.length === 0 && <div className="ui-card p-8 text-center text-slate-500" data-testid="sp-empty">No teachers have a class yet. Assign a class teacher on the Classes page and their performance will show here.</div>}

      {data && teachers.length > 0 && (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger" data-testid="sp-tiles">
          {[["Teachers", teachers.length, null], ["Average overall", avg("overall"), "%"], ["Average results", avg("results"), "%"], ["Student attendance", avg("attendance"), "%"]].map(([k, v, u]) => (
            <div key={k} className="ui-card p-4"><div className="text-sm text-slate-500">{k}</div>
              <div className="font-heading text-3xl font-semibold tabular-nums mt-0.5">{v == null ? "—" : <CountUp value={v} format={(x) => `${Math.round(x)}${u || ""}`} />}</div></div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Measure shown on the wheel" data-testid="sp-metrics">
          {METRICS.map((x) => (
            <button key={x.key} type="button" onClick={() => setMetric(x.key)} aria-pressed={metric === x.key} data-testid={`sp-metric-${x.key}`}
              className={`pill text-sm font-medium px-3.5 py-1.5 transition ${metric === x.key ? "bg-[#2B4BFF] text-white shadow" : "bg-[#E8ECFF] text-[#2B4BFF] hover:bg-[#DCE3FF]"}`}>{x.label}</button>
          ))}
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-5 items-start">
          <div className="ui-card p-5" data-testid="sp-wheel-card">
            <h2 className="font-heading text-xl font-semibold">{m.label} by teacher</h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-3">{m.note}</p>
            <WagonWheel items={items} title="Teacher wheel" testid="sp-wheel" activeLabel={sel ? items.find((i) => i.id === sel.id)?.label : undefined}
              onSelect={(it) => setPick(it.id)} hint="Click a wing to open that teacher." />
          </div>

          {sel && (
            <div className="ui-card p-5 space-y-5" data-testid="sp-detail" key={sel.id} style={{ animation: "slide-in .4s ease-out" }}>
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl grid place-items-center bg-gradient-to-br from-[#0B1020] to-[#2B4BFF] text-white font-heading text-lg font-semibold shrink-0">{initials(sel.name)}</div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-heading text-xl font-semibold truncate" data-testid="sp-detail-name">{sel.name}</h3>
                  <div className="text-sm text-slate-500">{sel.students} students · {sel.classes.length} {sel.classes.length === 1 ? "class" : "classes"}</div>
                </div>
                <div className="text-right">
                  <div className={`font-heading text-4xl font-semibold tabular-nums ${tone(sel.overall)}`}>{sel.overall == null ? "—" : <CountUp value={sel.overall} format={(x) => `${Math.round(x)}`} />}</div>
                  <div className="text-[11px] text-slate-500">overall</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {sel.classes.map((c) => (
                  <Link key={c.id} to={`/app/classes/${c.id}`} className="pill bg-[#F1F3FA] text-slate-700 text-xs font-medium px-3 py-1.5 hover:bg-[#E8ECFF]">{c.name} · {c.role}</Link>
                ))}
                {sel.trend != null && (
                  <span className={`pill text-xs font-medium px-3 py-1.5 inline-flex items-center gap-1 ${sel.trend > 0 ? "bg-emerald-50 text-emerald-700" : sel.trend < 0 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`} data-testid="sp-trend">
                    {sel.trend > 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" /> : sel.trend < 0 ? <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" /> : <Minus className="h-3.5 w-3.5" aria-hidden="true" />}
                    {sel.trend > 0 ? "+" : ""}{sel.trend} pts first to latest term
                  </span>
                )}
              </div>

              <div className="space-y-3.5">
                {METRICS.slice(1).map((x) => {
                  const v = sel.metrics[x.key];
                  return (
                    <div key={x.key} title={x.note}>
                      <div className="flex justify-between text-sm"><span>{x.label} <span className="text-[11px] text-slate-400">· weight {data.weights[x.key]}%</span></span><span className={`font-semibold tabular-nums ${tone(v)}`}>{v == null ? "No data" : `${v}%`}</span></div>
                      <div className="mt-1 h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full anim-grow bg-gradient-to-r from-[#2B4BFF] to-[#6C86FF]" style={{ width: `${v || 0}%` }} /></div>
                    </div>
                  );
                })}
              </div>
              <div className="text-xs text-slate-500">{sel.reports} report cards entered · diary posted on {sel.diary_days} {sel.diary_days === 1 ? "day" : "days"}</div>
            </div>
          )}
        </div>

        <div className="ui-card overflow-hidden" data-testid="sp-table">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="table-head">
                <th className="px-4 py-3 text-left">#</th><th className="px-4 py-3 text-left">Teacher</th><th className="px-4 py-3 text-left">Classes</th>
                {METRICS.map((x) => <th key={x.key} className="px-4 py-3 text-right">{x.label}</th>)}
              </tr></thead>
              <tbody>
                {teachers.map((t, i) => (
                  <tr key={t.id} className={`border-b border-slate-100 cursor-pointer ${sel?.id === t.id ? "bg-[#F1F4FF]" : ""}`} onClick={() => setPick(t.id)} data-testid={`sp-row-${t.id}`}>
                    <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3 font-bold">{t.name}</td>
                    <td className="px-4 py-3 text-slate-600">{t.classes.map((c) => c.name).join(", ")}</td>
                    {METRICS.map((x) => { const v = val(t, x.key); return <td key={x.key} className={`px-4 py-3 text-right tabular-nums ${x.key === "overall" ? "font-semibold" : ""} ${tone(v)}`}>{v == null ? "—" : `${v}%`}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="flex gap-2 text-xs text-slate-500 max-w-3xl" data-testid="sp-caveat"><Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          Treat this as a conversation starter, not a verdict. Student results also depend on class size, subject mix and where students started. Weights: results {data.weights.results}%, register {data.weights.register}%, student attendance {data.weights.attendance}%, marks entry {data.weights.marks}%, diary {data.weights.diary}%. Measures with no data yet are left out of the overall score.</p>
      </>)}
    </div>
  );
}
