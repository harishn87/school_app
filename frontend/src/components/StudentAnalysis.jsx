import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import WagonWheel from "@/components/WagonWheel";
import ClassSyllabusRing from "@/components/ClassSyllabusRing";

const pctOf = (m) => (m.max_score ? Math.round((m.score / m.max_score) * 100) : null);

/** Wheel with one wing per term; clicking a wing opens that term. */
export function TermsWheel({ items, term, onTerm, title, sub, testid = "terms-wheel" }) {
  return (
    <div className="ui-card p-5 h-full">
      <div className="min-h-[5rem]">
        <h3 className="font-heading text-lg font-semibold">{title}</h3>
        <p className="text-xs text-slate-500 mb-2">{sub}</p>
      </div>
      <WagonWheel items={items} title="Mark by term" testid={testid} activeLabel={term} onSelect={(it) => onTerm(it.label)} hint="Click a term to open it." />
    </div>
  );
}

/** Subject wheel for one report, with an optional class-average comparison. */
export function AcademicWheel({ report, classAvg, testid = "academic-wheel", name, history, studentId, year }) {
  const [pick, setPick] = useState(null);
  const navigate = useNavigate();
  const marks = (report?.marks || []).filter((m) => m.score != null);
  const items = marks.map((m) => ({ label: m.subject, value: pctOf(m) }));
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  const overall = report?.percent;
  const classOverall = classAvg && Object.keys(classAvg).length ? Math.round(Object.values(classAvg).reduce((a, b) => a + b, 0) / Object.keys(classAvg).length) : null;

  if (!marks.length) return <div className="ui-card p-6 text-sm text-slate-500" data-testid={`${testid}-empty`}>No marks entered for this term yet.</div>;
  return (
    <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6 items-start" data-testid={testid}>
      <div className="ui-card p-5">
        <h3 className="font-heading text-lg font-semibold">{name ? `${name}: ` : ""}subject wheel</h3>
        <p className="text-xs text-slate-500 mb-2">Marks as a percentage of the maximum, for {report.term}.</p>
        <WagonWheel items={items} title="Subject marks" testid={`${testid}-chart`} activeLabel={pick}
          onSelect={(it) => (studentId ? navigate(`/app/progress/subject/${studentId}/${encodeURIComponent(it.label)}${year ? `?year=${year}` : ""}`) : setPick((p) => (p === it.label ? null : it.label)))} hint="Click a subject to open it across every term." />
        {pick && (() => {
          const terms = [...(history || [report])].sort((a, b) => TERM_ORDER.indexOf(a.term) - TERM_ORDER.indexOf(b.term))
            .map((r) => { const m = (r.marks || []).find((x) => x.subject === pick && x.score != null); return m ? { t: r.term, v: pctOf(m), m } : null; }).filter(Boolean);
          const cur = items.find((i) => i.label === pick); const c = classAvg?.[pick];
          return (
            <div className="mt-3 rounded-xl bg-[#F1F4FF] p-4 text-sm" data-testid={`${testid}-detail`}>
              <div className="flex items-center justify-between"><b className="font-heading text-base">{pick}</b>
                <button type="button" className="text-xs text-[#2B4BFF] hover:underline" onClick={() => setPick(null)}>Clear</button></div>
              <p className="mt-1 text-slate-700">{report.term}: <b>{cur?.value}%</b>{c != null && <> (class average {c}%, {cur.value >= c ? `${cur.value - c} above` : `${c - cur.value} below`})</>}.</p>
              {terms.length > 1 && <p className="mt-1 text-slate-600">{terms.map((x) => `${x.t} ${x.v}%`).join("  →  ")}</p>}
            </div>
          );
        })()}
      </div>
      <div className="space-y-4">
        <div className="ui-card p-5">
          <h3 className="font-heading text-lg font-semibold">What the marks say</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700" data-testid={`${testid}-insights`}>
            <li>Overall <b className="text-slate-900">{overall}%</b>{classOverall != null && <> ({overall === classOverall ? "same as" : `${Math.abs(overall - classOverall)} points ${overall > classOverall ? "above" : "below"}`} the class average of {classOverall}%)</>}.</li>
            {best && worst && best.value !== worst.value && (<>
              <li>Strongest subject: <b className="text-slate-900">{best.label}</b> at {best.value}%.</li>
              <li>Needs the most attention: <b className="text-slate-900">{worst.label}</b> at {worst.value}%.</li>
            </>)}
            {items.filter((i) => i.value < 40).length > 0 && <li className="text-rose-700">Below 40%: {items.filter((i) => i.value < 40).map((i) => i.label).join(", ")}.</li>}
          </ul>
        </div>
        {classAvg && (
          <div className="ui-card overflow-hidden">
            <table className="w-full text-sm" data-testid={`${testid}-compare`}>
              <thead><tr>
                <th scope="col" className="table-head px-4 py-2.5 text-left">Subject</th>
                <th scope="col" className="table-head px-4 py-2.5 text-right">Student</th>
                <th scope="col" className="table-head px-4 py-2.5 text-right">Class average</th>
                <th scope="col" className="table-head px-4 py-2.5 text-right">Difference</th>
              </tr></thead>
              <tbody className="divide-y divide-[#EEF0F6]">
                {items.map((i) => {
                  const c = classAvg[i.label]; const d = c == null ? null : i.value - c;
                  return (
                    <tr key={i.label} className={pick === i.label ? "bg-[#E8ECFF]" : ""}>
                      <th scope="row" className="px-4 py-2 text-left font-medium">{i.label}</th>
                      <td className="px-4 py-2 text-right tabular-nums">{i.value}%</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{c == null ? "-" : `${c}%`}</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-medium ${d == null ? "text-slate-400" : d >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{d == null ? "-" : `${d > 0 ? "+" : ""}${d}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const TERM_ORDER = ["Term 1", "Term 2", "Term 3", "Annual"];
const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
const delta = (d) => (d == null ? null : <span className={d >= 0 ? "text-emerald-700" : "text-rose-700"}>{d > 0 ? "+" : ""}{d}</span>);

function Tile({ label, value, note, testid }) {
  return (
    <div className="ui-card p-4"><div className="text-sm text-slate-500">{label}</div>
      <div className="font-heading text-2xl font-semibold mt-1 tabular-nums" data-testid={testid}>{value}</div>
      {note && <div className="text-xs text-slate-500 mt-0.5">{note}</div>}</div>
  );
}

function ClassAnalysis({ students, termReports, term, allReports, onPick, onTerm, canEnter, classId, year }) {
  const [subject, setSubject] = useState(null);
  const byStudent = Object.fromEntries(termReports.map((r) => [r.student_id, r]));
  const subjPct = (r) => { const m = (r.marks || []).find((x) => x.subject === subject && x.score != null); return m ? pctOf(m) : null; };
  const ranked = students.filter((s) => byStudent[s.id]?.percent != null)
    .map((s) => ({ s, r: byStudent[s.id], pct: byStudent[s.id].percent }))
    .sort((a, b) => (subject ? (subjPct(b.r) ?? -1) - (subjPct(a.r) ?? -1) : b.pct - a.pct));
  const pending = students.filter((s) => byStudent[s.id]?.percent == null);
  const subjAvg = useMemo(() => {
    const acc = {};
    for (const r of termReports) for (const m of r.marks || []) { if (m.score != null) (acc[m.subject] ||= []).push(pctOf(m)); }
    return Object.entries(acc).map(([label, v]) => ({ label, value: avg(v) }));
  }, [termReports]);
  const studentWheel = students.map((s) => ({ label: `${s.first_name}${s.last_name ? " " + s.last_name[0] + "." : ""}`, value: byStudent[s.id]?.percent ?? null, id: s.id }));
  const StudentWheelCard = (
    <div className="ui-card p-5">
      <h3 className="font-heading text-lg font-semibold">Class wheel</h3>
      <p className="text-xs text-slate-500 mb-2">Each wing is a student, shaded by overall mark for {term}. Striped wings have no marks yet. Click a wing to open that student.</p>
      <WagonWheel items={studentWheel} title="Overall mark" testid="student-wheel" onSelect={(it) => onPick(it.id)} hint="Click a student to open their analysis." />
    </div>
  );
  const TermsCard = (
    <div data-testid="ca-trend" className="h-full"><TermsWheel items={TERM_ORDER.map((t) => ({ label: t, value: avg(allReports.filter((r) => r.term === t && r.percent != null).map((r) => r.percent)) }))}
      term={term} onTerm={onTerm} title="Class average by term" sub="Each wing is a term. Click one to open it. Striped wings have no marks yet." testid="class-terms-wheel" /></div>
  );
  const classAvg = avg(ranked.map((x) => x.pct));
  const passRate = ranked.length ? Math.round((ranked.filter((x) => x.pct >= 40).length / ranked.length) * 100) : null;
  const trend = TERM_ORDER.map((t) => ({ t, v: avg(allReports.filter((r) => r.term === t && r.percent != null).map((r) => r.percent)) })).filter((x) => x.v != null);
  const strongest = (r) => { const m = (r.marks || []).filter((x) => x.score != null).map((x) => ({ n: x.subject, v: pctOf(x) })).sort((a, b) => b.v - a.v); return m.length ? [m[0], m[m.length - 1]] : [null, null]; };

  if (!ranked.length) return (
    <div className="space-y-5" data-testid="class-analysis-empty">
      <div className="ui-card p-5 text-center text-slate-600">
        No marks have been entered for {term} yet.{canEnter ? "" : " The class teacher enters them, and this page updates by itself."}
        {trend.length > 0 && <div className="mt-2 text-sm">Other terms with marks: {trend.map((x) => `${x.t} (${x.v}%)`).join(", ")}.</div>}
      </div>
      <div className="grid xl:grid-cols-2 gap-6 items-start">{students.length >= 3 && StudentWheelCard}{TermsCard}<ClassSyllabusRing classId={classId} term={term} year={year} /></div>
    </div>
  );
  return (
    <div className="space-y-5" data-testid="class-analysis">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Class average" value={`${classAvg}%`} note={term} testid="ca-avg" />
        <Tile label="Students with marks" value={`${ranked.length} of ${students.length}`} note={pending.length ? `${pending.length} still to enter` : "All entered"} testid="ca-count" />
        <Tile label="Pass rate (40% and above)" value={`${passRate}%`} note={`${ranked.filter((x) => x.pct < 40).length} below 40%`} testid="ca-pass" />
        <Tile label="Top score" value={`${ranked[0].pct}%`} note={`${ranked[0].s.first_name} ${ranked[0].s.last_name}`} testid="ca-top" />
      </div>

      <div className="grid xl:grid-cols-2 gap-6 items-start">
        {StudentWheelCard}
        <div className="ui-card p-5">
          <h3 className="font-heading text-lg font-semibold">Class subject wheel</h3>
          <p className="text-xs text-slate-500 mb-2">Average mark in each subject, {term}.</p>
          <WagonWheel items={subjAvg} title="Subject averages" testid="class-wheel" activeLabel={subject}
            onSelect={(it) => setSubject((p) => (p === it.label ? null : it.label))} hint="Click a subject to rank the class by it." />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-stretch">
        <ClassSyllabusRing classId={classId} term={term} year={year} />
        {TermsCard}
      </div>

      <div className="ui-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEF0F6]"><h3 className="font-heading text-lg font-semibold">Students ranked{subject ? ` by ${subject}` : ""}, {term}</h3>
          <p className="text-xs text-slate-500">Click a student to see their own wheel.{subject && <> <button type="button" className="font-medium text-[#2B4BFF] hover:underline" onClick={() => setSubject(null)} data-testid="ca-clear-subject">Show overall ranking</button></>}</p></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="ca-ranking">
            <thead><tr className="surface-midnight text-white">
              {[["Rank", "left", "w-20"], ["Student", "left", ""], ...(subject ? [[subject, "right", "text-[#E9C46A]"]] : []), ["Overall", "left", "min-w-[190px]"], ["Vs class", "center", ""], ["Strongest", "left", ""], ["Needs attention", "left", ""]].map(([h, al, cl]) => (
                <th key={h} scope="col" className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-white/80 text-${al} ${cl}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-[#EEF0F6]">
              {ranked.map(({ s, r, pct }, i) => {
                const [best, worst] = strongest(r);
                const flag = pct < 40 || pct <= classAvg - 15;
                const d = pct - classAvg;
                const medal = ["from-[#F4D27A] to-[#D9A21B] text-[#5A3E00]", "from-[#E4E8F2] to-[#AEB7CC] text-[#2F3A52]", "from-[#F1C6A0] to-[#C58650] text-[#5A2F0B]"][i];
                const bar = pct >= 75 ? "from-emerald-400 to-emerald-600" : pct >= 50 ? "from-[#6B86FF] to-[#2B4BFF]" : pct >= 35 ? "from-amber-300 to-amber-500" : "from-rose-400 to-rose-600";
                const chip = (x, tone) => x ? <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${tone}`}>{x.n}<b className="font-heading font-semibold tabular-nums">{x.v}%</b></span> : <span className="text-slate-300">-</span>;
                return (
                  <tr key={s.id} className="group cursor-pointer transition-colors hover:bg-[#F7F8FF]" onClick={() => onPick(s.id)} data-testid={`ca-row-${s.id}`}>
                    <td className="px-4 py-2.5"><span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-heading font-semibold tabular-nums ${medal ? `bg-gradient-to-br shadow-sm ${medal}` : "bg-[#F1F3FA] text-slate-500"}`}>{i + 1}</span></td>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2B4BFF] to-[#1B2A7A] text-[11px] font-semibold text-white" aria-hidden="true">{(s.first_name?.[0] || "") + (s.last_name?.[0] || "")}</span>
                        <button type="button" className="text-left font-heading font-semibold text-[#0B1020] group-hover:text-[#2B4BFF]" onClick={() => onPick(s.id)}>{s.first_name} {s.last_name}</button>
                        {flag && <span className="pill bg-rose-50 text-rose-700">Needs support</span>}
                      </div>
                    </th>
                    {subject && <td className="px-4 py-2.5 text-right tabular-nums font-heading font-semibold text-[#2B4BFF]" data-testid={`ca-subj-${s.id}`}>{subjPct(r) != null ? `${subjPct(r)}%` : "-"}</td>}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="w-11 font-heading text-base font-semibold tabular-nums text-[#0B1020]">{pct}%</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEF0F6]" aria-hidden="true"><span className={`block h-full rounded-full bg-gradient-to-r ${bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center"><span className={`inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${d >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}><span aria-hidden="true">{d >= 0 ? "▲" : "▼"}</span>{d > 0 ? "+" : ""}{d}</span></td>
                    <td className="px-4 py-2.5">{chip(best, "bg-emerald-50 text-emerald-800")}</td>
                    <td className="px-4 py-2.5">{chip(worst && worst !== best ? worst : null, "bg-amber-50 text-amber-800")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pending.length > 0 && <p className="px-5 py-3 text-xs text-slate-500 border-t border-[#EEF0F6]" data-testid="ca-pending">No marks yet for {term}: {pending.map((s) => s.first_name).join(", ")}.</p>}
      </div>
    </div>
  );
}

function StudentTerms({ reports, term }) {
  const sorted = [...reports].sort((a, b) => TERM_ORDER.indexOf(a.term) - TERM_ORDER.indexOf(b.term));
  if (sorted.length < 2) return null;
  const subjects = [...new Set(sorted.flatMap((r) => (r.marks || []).filter((m) => m.score != null).map((m) => m.subject)))];
  const val = (r, sub) => { const m = (r.marks || []).find((x) => x.subject === sub && x.score != null); return m ? pctOf(m) : null; };
  return (
    <div className="ui-card overflow-x-auto" data-testid="student-terms">
      <div className="px-5 py-4 border-b border-[#EEF0F6]"><h3 className="font-heading text-lg font-semibold">Progress across terms</h3></div>
      <table className="w-full text-sm">
        <thead><tr><th scope="col" className="table-head px-4 py-2.5 text-left">Subject</th>
          {sorted.map((r) => <th key={r.term} scope="col" className={`table-head px-4 py-2.5 text-right ${r.term === term ? "text-[#2B4BFF]" : ""}`}>{r.term}</th>)}</tr></thead>
        <tbody className="divide-y divide-[#EEF0F6]">
          {subjects.map((sub) => (
            <tr key={sub}><th scope="row" className="px-4 py-2 text-left font-medium">{sub}</th>
              {sorted.map((r, i) => { const v = val(r, sub); const prev = i > 0 ? val(sorted[i - 1], sub) : null;
                return <td key={r.term} className="px-4 py-2 text-right tabular-nums">{v == null ? "-" : `${v}%`} {v != null && prev != null && <span className="text-xs">{delta(v - prev)}</span>}</td>; })}</tr>
          ))}
          <tr className="bg-[#F8F9FD] font-semibold"><th scope="row" className="px-4 py-2 text-left">Overall</th>
            {sorted.map((r, i) => <td key={r.term} className="px-4 py-2 text-right tabular-nums">{r.percent}% {i > 0 && <span className="text-xs">{delta(r.percent - sorted[i - 1].percent)}</span>}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}

/** Staff view: whole-class analysis by default, with a drill-down to one student. Refreshes by itself. */
export function StaffAnalysis({ classId, students, term, onTerm, canEnter, lead, year, cols = 3 }) {
  const [sid, setSid] = useState("");           // "" = whole class
  const [allReports, setAllReports] = useState([]);
  const [tick, setTick] = useState(0);
  const [updated, setUpdated] = useState(null);

  useEffect(() => { setSid(""); }, [classId]);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const id = setInterval(bump, 30000);
    window.addEventListener("focus", bump);
    return () => { clearInterval(id); window.removeEventListener("focus", bump); };
  }, []);
  useEffect(() => {
    if (!classId) return;
    api.get("/reports", { params: { class_id: classId, academic_year: year || undefined } }).then((r) => { setAllReports(r.data); setUpdated(new Date()); }).catch(() => setAllReports([]));
  }, [classId, tick, year]);

  const termReports = useMemo(() => allReports.filter((r) => r.term === term), [allReports, term]);
  const availTerms = TERM_ORDER.filter((t) => allReports.some((r) => r.term === t));
  const student = students.find((s) => s.id === sid);
  const studentReports = allReports.filter((r) => r.student_id === sid);
  const rep = studentReports.find((r) => r.term === term);
  const classAvg = useMemo(() => {
    const acc = {};
    for (const r of termReports) for (const m of r.marks || []) { if (m.score != null) (acc[m.subject] ||= []).push(pctOf(m)); }
    return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, avg(v)]));
  }, [termReports]);

  if (!students.length) return <div className="ui-card p-8 text-center text-slate-500">No students in this class yet.</div>;
  return (
    <div className="space-y-5" data-testid="analysis-view">
      <div className="ui-card p-4" data-testid="analysis-filters">
        <div className={`grid gap-3 items-end ${cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
          {lead}
          <div><label className="field-label" htmlFor="an-student">View</label>
            <select id="an-student" className="ui-input" value={sid} onChange={(e) => setSid(e.target.value)} data-testid="analysis-student">
              <option value="">Whole class</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.roll_number ? `${s.roll_number}. ` : ""}{s.first_name} {s.last_name}</option>)}
            </select></div>
        </div>
        <div className="mt-2 text-right text-xs text-slate-500" data-testid="analysis-updated">{updated ? `Updated ${updated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}. Refreshes by itself.` : "Loading"}</div>
      </div>

      {!sid && <ClassAnalysis classId={classId} year={year} students={students} termReports={termReports} term={term} allReports={allReports} onPick={setSid} onTerm={onTerm} canEnter={canEnter} />}
      {sid && (
        <>
          <button type="button" className="text-sm font-medium text-[#2B4BFF] hover:underline" onClick={() => setSid("")} data-testid="analysis-back">Back to whole class</button>
          {rep ? <AcademicWheel report={rep} classAvg={classAvg} name={student ? student.first_name : ""} testid="academic-wheel" history={studentReports} studentId={sid} year={year} />
            : <div className="ui-card p-8 text-center text-slate-500" data-testid="analysis-none">
                {student?.first_name} has no marks for {term}.
                {studentReports.length > 0 && <> Marks exist for {studentReports.map((r) => (
                  <button key={r.term} type="button" onClick={() => onTerm(r.term)} className="mx-1 font-medium text-[#2B4BFF] hover:underline">{r.term}</button>))}.</>}
                {canEnter && studentReports.length === 0 && " Add them on the Enter marks tab."}
              </div>}
          <TermsWheel items={TERM_ORDER.map((t) => ({ label: t, value: studentReports.find((r) => r.term === t)?.percent ?? null }))} term={term} onTerm={onTerm}
            title={`${student ? student.first_name + ": " : ""}overall by term`} sub="Click a term to open it." testid="student-terms-wheel" />
          <StudentTerms reports={studentReports} term={term} />
        </>
      )}
    </div>
  );
}
