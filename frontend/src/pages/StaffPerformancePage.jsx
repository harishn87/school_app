import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, Info, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
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
  { key: "syllabus", label: "Syllabus coverage", note: "Share of the year's syllabus covered in the subjects this teacher takes (three terms averaged; a term with no syllabus counts as nothing covered). Subjects without a named teacher belong to the class teacher." },
];
const DOT = { green: "bg-emerald-500", amber: "bg-amber-400", red: "bg-rose-500", none: "bg-slate-300" };
const WORD = { green: "On track", amber: "Slightly behind", red: "Behind", none: "Not set up" };
const val = (t, k) => (k === "overall" ? t.overall : t.metrics[k]);
const tone = (v) => (v == null ? "text-slate-400" : v >= 80 ? "text-emerald-600" : v >= 60 ? "text-amber-600" : "text-rose-600");
const barTone = (v) => (v == null ? "bg-slate-200" : v >= 80 ? "bg-emerald-500" : v >= 60 ? "bg-amber-400" : "bg-rose-500");
const chipTone = (v) => (v == null ? "bg-slate-100 text-slate-400" : v >= 80 ? "bg-emerald-50 text-emerald-700" : v >= 60 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700");
const MEDAL = ["bg-gradient-to-br from-amber-300 to-amber-500 text-white", "bg-gradient-to-br from-slate-300 to-slate-400 text-white", "bg-gradient-to-br from-orange-300 to-orange-500 text-white"];
const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

export default function StaffPerformancePage() {
  const ys = useAcademicYears();
  const [year, setYear] = useState("");
  const yr = year || ys.current;
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState("overall");
  const [pick, setPick] = useState(null);
  const [sort, setSort] = useState({ key: "overall", dir: "desc" });
  const [showSubj, setShowSubj] = useState(false);

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
  const selId = sel?.id;
  useEffect(() => { setShowSubj(false); }, [selId]);
  // a teacher's own classes are the ones allotted to them as class or second teacher; classes where they only take a subject are shown on request
  const own = sel ? sel.classes.filter((c) => c.role !== "Subject teacher") : [];
  const extra = sel ? sel.classes.length - own.length : 0;
  const shownClasses = !sel ? [] : showSubj || own.length === 0 ? sel.classes : own;
  const items = teachers.map((t) => ({ label: t.name.split(" ").length > 1 ? `${t.name.split(" ")[0]} ${t.name.split(" ")[1][0]}.` : t.name, id: t.id, value: val(t, metric) }));
  const rank = useMemo(() => { const o = [...teachers].sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1)); return Object.fromEntries(o.map((t, i) => [t.id, i + 1])); }, [teachers]);
  const rows = useMemo(() => {
    const f = sort.dir === "desc" ? -1 : 1;
    return [...teachers].sort((a, b) => {
      if (sort.key === "name") return f * a.name.localeCompare(b.name);
      const x = val(a, sort.key), y = val(b, sort.key);
      return f * ((x ?? -1) - (y ?? -1)) || a.name.localeCompare(b.name);
    });
  }, [teachers, sort]);
  const sortBy = (key) => setSort((c) => (c.key === key ? { key, dir: c.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const avg = (k) => { const v = teachers.map((t) => val(t, k)).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-up" data-testid="staff-performance-page">
      <PageHero title="Staff performance" subtitle="How each teacher's classes are doing: results, attendance, marks entry, diary and syllabus coverage. Click a wing of the wheel to see that teacher's detail." />
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

        <div className="ui-card overflow-hidden" data-testid="sp-table">
          <div className="px-5 py-4 border-b border-[#EEF0F6] flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-heading text-xl font-semibold">Teacher scorecard</h2>
              <p className="text-xs text-slate-500 mt-0.5">Click a column title to sort. Click a row to open that teacher below.</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />80% and above</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-400" />60 to 79%</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-rose-500" />below 60%</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead><tr className="table-head">
                <th className="px-4 py-3 text-left w-12">Rank</th>
                {[["name", "Teacher", "text-left"], ...METRICS.map((x) => [x.key, x.label, "text-center"])].map(([k, l, al]) => (
                  <th key={k} scope="col" className={`px-3 py-3 ${al}`} aria-sort={sort.key === k ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}>
                    <button type="button" onClick={() => sortBy(k)} className={`inline-flex items-center gap-1 font-semibold hover:text-[#2B4BFF] ${sort.key === k ? "text-[#2B4BFF]" : ""}`} data-testid={`sp-sort-${k}`}>
                      {l}{sort.key === k ? (sort.dir === "desc" ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : <ArrowUp className="h-3 w-3" aria-hidden="true" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />}
                    </button>
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map((t) => {
                  const on = sel?.id === t.id; const r = rank[t.id];
                  return (
                    <tr key={t.id} className={`border-b border-slate-100 cursor-pointer transition-colors ${on ? "bg-[#F1F4FF]" : "hover:bg-[#F8FAFF]"}`} onClick={() => setPick(t.id)} data-testid={`sp-row-${t.id}`}>
                      <td className={`px-4 py-3 ${on ? "shadow-[inset_3px_0_0_#2B4BFF]" : ""}`}>
                        <span className={`h-7 w-7 rounded-full grid place-items-center text-xs font-semibold tabular-nums ${r <= 3 ? MEDAL[r - 1] : "bg-slate-100 text-slate-500"}`}>{r}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3">
                          <span className="h-9 w-9 rounded-xl grid place-items-center bg-gradient-to-br from-[#0B1020] to-[#2B4BFF] text-white text-xs font-semibold shrink-0">{initials(t.name)}</span>
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{t.name}</div>
                            <div className="text-xs text-slate-500 truncate" title={t.classes.map((c) => c.name).join(", ")}>{t.classes.length} {t.classes.length === 1 ? "class" : "classes"} · {t.students} students</div>
                          </div>
                        </div>
                      </td>
                      {METRICS.map((x) => {
                        const v = val(t, x.key);
                        return x.key === "overall" ? (
                          <td key={x.key} className="px-3 py-3 text-center"><span className={`inline-block min-w-[3.25rem] rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${chipTone(v)}`}>{v == null ? "—" : `${v}%`}</span></td>
                        ) : (
                          <td key={x.key} className="px-3 py-3">
                            <div className="mx-auto w-20">
                              <div className={`text-center text-xs font-semibold tabular-nums ${tone(v)}`}>{v == null ? "—" : `${v}%`}</div>
                              <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${barTone(v)}`} style={{ width: `${v || 0}%` }} /></div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Measure shown on the wheel" data-testid="sp-metrics">
          {METRICS.map((x) => (
            <button key={x.key} type="button" onClick={() => setMetric(x.key)} aria-pressed={metric === x.key} data-testid={`sp-metric-${x.key}`}
              className={`pill text-sm font-medium px-3.5 py-1.5 transition ${metric === x.key ? "bg-[#2B4BFF] text-white shadow" : "bg-[#E8ECFF] text-[#2B4BFF] hover:bg-[#DCE3FF]"}`}>{x.label}</button>
          ))}
        </div>

        <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 items-stretch">
          <div className="ui-card p-5 flex flex-col" data-testid="sp-wheel-card">
            <h2 className="font-heading text-xl font-semibold">{m.label} by teacher</h2>
            <p className="text-xs text-slate-500 mt-0.5 mb-3">{m.note}</p>
            <div className="flex-1 flex flex-col justify-center">
              <WagonWheel items={items} title="Teacher wheel" testid="sp-wheel" activeLabel={sel ? items.find((i) => i.id === sel.id)?.label : undefined}
                onSelect={(it) => setPick(it.id)} hint="Click a wing to open that teacher." />
            </div>
          </div>

          {sel && (
            <div className="ui-card p-5 flex flex-col gap-6" data-testid="sp-detail" key={sel.id} style={{ animation: "slide-in .4s ease-out" }}>
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl grid place-items-center bg-gradient-to-br from-[#0B1020] to-[#2B4BFF] text-white font-heading text-lg font-semibold shrink-0">{initials(sel.name)}</div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-heading text-xl font-semibold truncate" data-testid="sp-detail-name">{sel.name}</h3>
                  <div className="text-sm text-slate-500">{sel.students} students · {own.length || sel.classes.length} {(own.length || sel.classes.length) === 1 ? "class" : "classes"}{own.length > 0 && extra > 0 ? <span className="text-slate-400"> · +{extra} as subject teacher</span> : null}</div>
                </div>
                <div className="text-right">
                  <div className={`font-heading text-4xl font-semibold tabular-nums ${tone(sel.overall)}`}>{sel.overall == null ? "—" : <CountUp value={sel.overall} format={(x) => `${Math.round(x)}`} />}</div>
                  <div className="text-[11px] text-slate-500">overall</div>
                  {sel.trend != null && (
                    <div className={`mt-1 inline-flex items-center gap-1 text-[11px] font-medium ${sel.trend > 0 ? "text-emerald-600" : sel.trend < 0 ? "text-rose-600" : "text-slate-500"}`} data-testid="sp-trend" title="First to latest term">
                      {sel.trend > 0 ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : sel.trend < 0 ? <TrendingDown className="h-3 w-3" aria-hidden="true" /> : <Minus className="h-3 w-3" aria-hidden="true" />}
                      {sel.trend > 0 ? "+" : ""}{sel.trend} pts
                    </div>)}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap gap-1.5" data-testid="sp-classes">
                  {shownClasses.map((c) => (
                    <Link key={c.id} to={`/app/classes/${c.id}`} title={c.role} className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${c.role === "Class teacher" ? "bg-[#E8ECFF] text-[#2B4BFF] hover:bg-[#DCE3FF]" : "bg-[#F1F3FA] text-slate-600 hover:bg-[#E8ECFF]"}`}>{c.name}</Link>
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-slate-400">
                  <span>{own.length > 0 ? "Classes allotted to this teacher. Blue = class teacher." : "No class allotted: showing the classes where this teacher takes a subject."}</span>
                  {own.length > 0 && extra > 0 && <button type="button" className="font-medium text-[#2B4BFF] hover:underline" onClick={() => setShowSubj((v) => !v)} data-testid="sp-toggle-subject">{showSubj ? "Hide" : "Also show"} {extra} subject-only {extra === 1 ? "class" : "classes"}</button>}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
                {METRICS.slice(1).map((x) => {
                  const v = sel.metrics[x.key];
                  return (
                    <div key={x.key} title={x.note}>
                      <div className="flex justify-between text-sm"><span>{x.label} <span className="text-[11px] text-slate-400">· weight {data.weights[x.key]}%</span></span><span className={`font-semibold tabular-nums ${tone(v)}`}>{v == null ? "No data" : `${v}%`}</span></div>
                      <div className="relative mt-1 h-2.5 rounded-full bg-slate-100">
                        <div className="h-full rounded-full anim-grow bg-gradient-to-r from-[#2B4BFF] to-[#6C86FF]" style={{ width: `${v || 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {(() => {
                const have = METRICS.slice(1).filter((x) => sel.metrics[x.key] != null).sort((a, b) => sel.metrics[b.key] - sel.metrics[a.key]);
                if (have.length < 2) return null;
                const hi = have[0], lo = have[have.length - 1];
                return (
                  <div className="grid sm:grid-cols-2 gap-3" data-testid="sp-highlights">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-3"><div className="text-xs text-emerald-700 font-medium">Strongest</div><div className="font-medium mt-0.5">{hi.label} <span className="font-semibold tabular-nums text-emerald-700">{sel.metrics[hi.key]}%</span></div></div>
                    <div className="rounded-xl border border-rose-100 bg-rose-50/60 px-3.5 py-3"><div className="text-xs text-rose-700 font-medium">Needs attention</div><div className="font-medium mt-0.5">{lo.label} <span className="font-semibold tabular-nums text-rose-700">{sel.metrics[lo.key]}%</span></div></div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-3 gap-3" data-testid="sp-facts">
                {[["Rank", `#${[...teachers].sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1)).findIndex((t) => t.id === sel.id) + 1} of ${teachers.length}`],
                  ["Report cards entered", sel.reports],
                  ["Diary days", sel.diary_days]].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-[#F6F7FB] px-3 py-2.5"><div className="text-xs text-slate-500">{k}</div><div className="font-heading text-xl font-semibold tabular-nums">{v}</div></div>
                ))}
              </div>
            </div>
          )}
        </div>

        {sel && (
          <section className="ui-card p-5" data-testid="sp-syllabus" key={`syl-${sel.id}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-heading text-xl font-semibold">Syllabus covered, class by class <span className="text-base font-normal text-slate-500">· {sel.name}</span></h2>
              <span className="text-[11px] text-slate-500">blue = this teacher&apos;s subjects</span>
            </div>
            <div className="mt-3 grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {shownClasses.map((c) => {
                const y = c.syllabus?.year || {}; const st = y.percent == null ? "none" : y.status;
                return (
                  <Link key={c.id} to={`/app/syllabus?class=${c.id}&term=Whole%20year`} className="block rounded-xl border border-[#E8EBF3] p-3.5 hover:shadow-md hover:border-slate-300 transition" data-testid={`sp-syl-${c.id}`}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium inline-flex items-center gap-2"><i className={`h-2.5 w-2.5 rounded-full ${DOT[st]}`} aria-hidden="true" />{c.name} <span className="text-[11px] font-normal text-slate-400">· {c.role}</span></span>
                      <span className="tabular-nums"><b className={{ green: "text-emerald-600", amber: "text-amber-600", red: "text-rose-600", none: "text-slate-400" }[st]}>{y.percent == null ? "—" : `${y.percent}%`}</b> <span className="text-[11px] text-slate-500">{WORD[st]}</span></span>
                    </div>
                    <div className="relative mt-1.5 h-2.5 rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${st === "none" ? "bg-slate-300" : st === "green" ? "bg-emerald-500" : st === "amber" ? "bg-amber-400" : "bg-rose-500"}`} style={{ width: `${y.percent || 0}%` }} />
                      {y.target != null && <i className="absolute -top-0.5 h-3.5 w-0.5 bg-slate-900" style={{ left: `${y.target}%` }} aria-hidden="true" />}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      {(c.syllabus?.terms || []).map((t) => (
                        <div key={t.term} className="rounded-lg bg-[#F6F7FB] px-2 py-1.5">
                          <div className="text-slate-500 inline-flex items-center gap-1.5"><i className={`h-2 w-2 rounded-full ${DOT[t.status]}`} aria-hidden="true" />{t.term}</div>
                          <div className="font-semibold tabular-nums">{t.percent == null ? "Not set up" : `${t.percent}%`}</div>
                        </div>
                      ))}
                    </div>
                    {(c.syllabus?.subjects || []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`sp-subjects-${c.id}`}>
                        {c.syllabus.subjects.map((x) => {
                          const mine = (c.syllabus.mine || []).some((m) => m.name === x.name);
                          return <span key={x.name} className={`rounded-lg px-2 py-1 text-xs ${mine ? "bg-[#E8ECFF] text-[#2B4BFF] font-medium" : "bg-slate-100 text-slate-600"}`} title={mine ? "Taught by this teacher" : `Taught by ${x.teacher || "another teacher"}`}>{x.name} {x.percent}%{!mine && x.teacher ? <span className="text-slate-400"> · {x.teacher.split(" ")[0]}</span> : null}</span>;
                        })}
                      </div>)}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <p className="flex gap-2 text-xs text-slate-500 max-w-3xl" data-testid="sp-caveat"><Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          Treat this as a conversation starter, not a verdict. Student results also depend on class size, subject mix and where students started. Weights: results {data.weights.results}%, register {data.weights.register}%, student attendance {data.weights.attendance}%, marks entry {data.weights.marks}%, diary {data.weights.diary}%. Measures with no data yet are left out of the overall score.</p>
      </>)}
    </div>
  );
}
