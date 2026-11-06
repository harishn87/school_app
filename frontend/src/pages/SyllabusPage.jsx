import DateField from "@/components/DateField";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Trash2, Save, Check, Info, BookOpenCheck, CalendarClock, Target, ListChecks, Sparkles, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import PageHero from "@/components/PageHero";
import CountUp from "@/components/CountUp";
import YearSelect, { useAcademicYears } from "@/components/YearSelect";
import { RAG, RagPill, PaceBar, useSyllabusSummary } from "@/components/Syllabus";
import { useAuth } from "@/context/AuthContext";
import { api, errorMessage } from "@/lib/api";
import RagRing from "@/components/RagRing";
import { useLive } from "@/lib/live";

const TERMS = ["Term 1", "Term 2", "Term 3"];
const subjPct = (s) => (s.chapters?.length ? Math.round(s.chapters.reduce((a, c) => a + c.percent, 0) / s.chapters.length) : s.percent || 0);
const iso = (d) => d.toLocaleDateString("en-CA");
function targetFor(start, end) {
  const t = new Date(`${iso(new Date())}T00:00:00`), a = new Date(`${start}T00:00:00`), b = new Date(`${end}T00:00:00`);
  if (t <= a) return 0;
  if (t >= b) return 100;
  return Math.round(((t - a) / Math.max(b - a, 86400000)) * 100);
}
const gradeOf = (pct, target) => (pct == null ? "none" : pct - target >= -5 ? "green" : pct - target >= -15 ? "amber" : "red");
const guessTerm = () => { const m = new Date().getMonth() + 1; return m >= 10 && m <= 12 ? "Term 2" : m >= 1 && m <= 3 ? "Term 3" : "Term 1"; };

function Slider({ value, onChange, label, disabled }) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min="0" max="100" step="5" value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} aria-label={label}
        className="flex-1 h-2 rounded-full cursor-pointer disabled:cursor-default" style={{ accentColor: "#2B4BFF" }} />
      <span className="w-11 text-right text-sm font-semibold tabular-nums">{value}%</span>
    </div>
  );
}

function TrendChart({ log, start, end, target }) {
  const days = log?.days || [];
  if (days.length === 0) return <p className="text-sm text-slate-500">The daily history appears here after the first update.</p>;
  const W = 560, H = 170, P = 28;
  const a = new Date(`${start}T00:00:00`).getTime(), b = new Date(`${end}T00:00:00`).getTime();
  const x = (d) => P + ((new Date(`${d}T00:00:00`).getTime() - a) / Math.max(b - a, 1)) * (W - P * 2);
  const y = (v) => H - P - (v / 100) * (H - P * 2);
  const pts = days.map((d) => [x(d.date), y(d.overall ?? 0)]);
  const last = days[days.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Syllabus coverage by day against the target line" data-testid="syl-trend">
      {[0, 50, 100].map((v) => <g key={v}><line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="#EEF0F6" /><text x={4} y={y(v) + 4} fontSize="10" fill="#64748B">{v}%</text></g>)}
      <line x1={x(start)} y1={y(0)} x2={x(end)} y2={y(100)} stroke="#0B1020" strokeDasharray="5 4" strokeWidth="1.5" />
      <text x={W - P} y={y(100) - 6} textAnchor="end" fontSize="10" fill="#0B1020">Target pace</text>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={(RAG[gradeOf(last.overall, last.target)] || RAG.none).hex} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => <circle key={days[i].date} cx={p[0]} cy={p[1]} r="3.5" fill="#fff" stroke={(RAG[gradeOf(days[i].overall, days[i].target)] || RAG.none).hex} strokeWidth="2"><title>{`${days[i].date}: ${days[i].overall}% (target ${days[i].target}%)`}</title></circle>)}
      <text x={P} y={H - 6} fontSize="10" fill="#64748B">{start}</text><text x={W - P} y={H - 6} textAnchor="end" fontSize="10" fill="#64748B">{end}</text>
    </svg>
  );
}


const PERIODS = ["Term 1", "Term 2", "Term 3", "Whole year"];
const DOT = { green: "bg-emerald-500", amber: "bg-amber-400", red: "bg-rose-500", none: "bg-slate-300" };
const TINT = { green: "border-l-emerald-500 bg-emerald-50/40", amber: "border-l-amber-400 bg-amber-50/40", red: "border-l-rose-500 bg-rose-50/40", none: "border-l-slate-300" };
const daysLeft = (end) => Math.max(0, Math.ceil((new Date(`${end}T00:00:00`) - new Date(`${iso(new Date())}T00:00:00`)) / 86400000));

/** Donut showing how much is covered, with a tick where the term's pace says it should be. */
function Gauge({ pct, target, status }) {
  const R = 74, C2 = 2 * Math.PI * R, v = Math.max(0, Math.min(100, pct ?? 0));
  const ang = (target / 100) * 2 * Math.PI - Math.PI / 2;
  const tx = (r) => 100 + r * Math.cos(ang), ty = (r) => 100 + r * Math.sin(ang);
  return (
    <svg viewBox="0 0 200 200" className="w-44 h-44 shrink-0" role="img" aria-label={`${pct ?? 0}% covered, target ${target}%`} data-testid="syl-gauge">
      <circle cx="100" cy="100" r={R} fill="none" stroke="#EEF0F6" strokeWidth="18" />
      <circle cx="100" cy="100" r={R} fill="none" stroke={(RAG[status] || RAG.none).hex} strokeWidth="18" strokeLinecap="round" strokeDasharray={`${(v / 100) * C2} ${C2}`} transform="rotate(-90 100 100)" style={{ transition: "stroke-dasharray .8s ease" }} />
      <line x1={tx(R - 14)} y1={ty(R - 14)} x2={tx(R + 14)} y2={ty(R + 14)} stroke="#0B1020" strokeWidth="3" strokeLinecap="round" />
      <text x="100" y="98" textAnchor="middle" fontSize="38" fontWeight="700" fill="#0B1020">{pct == null ? "-" : `${pct}%`}</text>
      <text x="100" y="122" textAnchor="middle" fontSize="12" fill="#64748B">covered</text>
    </svg>
  );
}

function Kpi({ icon: Icon, label, value, note, tone = "" }) {
  return (
    <div className="rounded-xl bg-[#F7F8FC] p-3.5">
      <div className="flex items-center gap-1.5 text-xs text-slate-500"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</div>
      <div className={`font-heading text-2xl font-semibold mt-1 tabular-nums ${tone}`}>{value}</div>
      {note && <div className="text-xs text-slate-500">{note}</div>}
    </div>
  );
}

/** Class and term pickers: plain dropdown lists, each option shows its coverage for the period. */
function ClassSelect({ classes, value, onPick, period }) {
  const view = (c) => (period === "Whole year" ? c.year : c.terms?.find((t) => t.term === period)) || {};
  return (
    <label className="block min-w-[200px]">
      <span className="field-label">Class</span>
      <select className="ui-input mt-1 w-full" value={value} onChange={(e) => onPick(e.target.value)} data-testid="syl-class-select">
        {classes.map((c) => { const v = view(c); return <option key={c.class_id} value={c.class_id}>{c.class_name}{v.percent == null ? " - not set up" : ` - ${v.percent}%`}</option>; })}
      </select>
    </label>
  );
}

function PeriodSelect({ row, value, onPick }) {
  return (
    <label className="block min-w-[200px]">
      <span className="field-label">Term</span>
      <select className="ui-input mt-1 w-full" value={value} onChange={(e) => onPick(e.target.value)} data-testid="syl-period-select">
        {PERIODS.map((p) => { const v = p === "Whole year" ? row?.year : row?.terms?.find((t) => t.term === p); return <option key={p} value={p}>{p}{v?.percent == null ? " - not set up" : ` - ${v.percent}%`}</option>; })}
      </select>
    </label>
  );
}

/** Whole-year view: the three terms side by side, with a subject by term grid. */
function YearView({ row, classId, onOpenTerm, teacher, tick, year }) {
  const [docs, setDocs] = useState(null);
  useEffect(() => {
    if (!classId) return undefined;
    let live = true;
    Promise.all(["Term 1", "Term 2", "Term 3"].map((t) => api.get("/syllabus", { params: { class_id: classId, term: t, academic_year: year } }).then((r) => r.data))).then((d) => live && setDocs(d)).catch(() => live && setDocs([]));
    return () => { live = false; };
  }, [classId, tick, year]);
  if (!docs) return <div className="ui-card p-6 text-slate-500">Loading…</div>;
  const items = docs.map((d) => ({ key: d.term, label: d.term, percent: d.exists ? d.percent : null, target: d.target, status: d.status, has: !!d.exists && d.subjects.length > 0 }));
  const names = [...new Set(docs.flatMap((d) => d.subjects.map((s) => s.name)))];
  const tName = (n) => docs.flatMap((d) => d.subjects).find((x) => x.name === n)?.teacher?.name;
  const y = row?.year || {};
  return (
    <div className="space-y-5" data-testid="syl-year">
      <section className="ui-card p-5 sm:p-6 grid md:grid-cols-[auto_1fr] gap-6 items-center">
        <Gauge pct={y.percent} target={y.target ?? 0} status={y.status || "none"} />
        <div>
          <h2 className="font-heading text-xl font-semibold">Whole year at a glance</h2>
          <p className="text-sm text-slate-500 mt-1">The three terms averaged. A term with no syllabus yet counts as nothing covered, so the year only reaches target when every term is set up and on pace.</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {docs.map((d) => {
              const on = d.exists && d.subjects.length > 0;
              return (
                <button key={d.term} type="button" onClick={() => onOpenTerm(d.term)} className={`text-left rounded-xl border-l-4 p-3 hover:shadow-md transition-shadow ${TINT[on ? d.status : "none"]}`} data-testid={`syl-yearterm-${d.term.replace(" ", "")}`}>
                  <div className="text-xs text-slate-500">{d.term}</div>
                  <div className="font-heading text-2xl font-semibold tabular-nums">{on ? `${d.percent}%` : "-"}</div>
                  <div className="text-xs text-slate-500">{on ? `target ${d.target}%` : teacher ? "Set up" : "Not set up"}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <section className="ui-card p-5">
          <h3 className="font-heading text-lg font-semibold">Terms compared</h3>
          <p className="text-xs text-slate-500 mb-2">Each wing is a term, coloured against its own target.</p>
          <RagRing testid="syl-year-wheel" items={items} centreLabel="Year coverage" centreValue={y.percent ?? null} noun="terms" maxWidth={380} hint="Hover a term for details." />
        </section>
        <section className="ui-card p-5 overflow-x-auto" data-testid="syl-matrix">
          <h3 className="font-heading text-lg font-semibold">Subject by term</h3>
          <p className="text-xs text-slate-500 mb-3">How much of each subject has been covered in each term.</p>
          {names.length === 0 ? <p className="text-sm text-slate-500">No subjects set up in any term yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr><th className="text-left font-medium text-slate-500 py-1.5">Subject</th>{docs.map((d) => <th key={d.term} className="text-center font-medium text-slate-500 py-1.5">{d.term}</th>)}</tr></thead>
              <tbody>{names.map((n) => (
                <tr key={n}><td className="py-1.5 font-medium">{n}{tName(n) && <div className="text-[11px] font-normal text-slate-500">{tName(n)}</div>}</td>
                  {docs.map((d) => { const sub = d.subjects.find((x) => x.name === n); return (
                    <td key={d.term} className="p-1"><div className={`rounded-lg py-1.5 text-center font-semibold tabular-nums ${sub ? { green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-900", red: "bg-rose-100 text-rose-800", none: "bg-slate-100 text-slate-500" }[sub.status] : "bg-slate-50 text-slate-300"}`}>{sub ? `${sub.percent}%` : "-"}</div></td>); })}
                </tr>))}</tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

export default function SyllabusPage() {
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher";
  const [params0] = useSearchParams();
  const ys = useAcademicYears();
  const yr = params0.get("year") || ys.current;
  const past = !!ys.current && yr !== ys.current;
  const yq = past ? yr : undefined;
  const teacher = isTeacher && !past;
  const [params, setParams] = useSearchParams();
  const tick = useLive(30000);
  const { data: sum, error } = useSyllabusSummary(tick, yq);
  const classes = sum?.classes || [];
  const classId = params.get("class") || classes[0]?.class_id || "";
  const row = classes.find((c) => c.class_id === classId);
  const period = params.get("term") || "Whole year";
  const yearView = period === "Whole year";
  const term = yearView ? guessTerm() : period;
  const set = (k, v) => { const n = new URLSearchParams(params); n.set(k, v); setParams(n, { replace: true }); };

  const [doc, setDoc] = useState(null);
  const [draft, setDraft] = useState(null);
  const [log, setLog] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSubject, setNewSubject] = useState("");

  const load = async () => {
    if (!classId || yearView) return;
    const [{ data: d }, { data: l }] = await Promise.all([api.get("/syllabus", { params: { class_id: classId, term, academic_year: yq } }), api.get("/syllabus/log", { params: { class_id: classId, term, academic_year: yq } })]);
    setDoc(d); setLog(l); setDirty(false);
    setDraft({ start_date: d.start_date, end_date: d.end_date, subjects: d.subjects.map((s) => ({ name: s.name, percent: s.chapters?.length ? 0 : s.percent, note: s.note || "", chapters: (s.chapters || []).map((c) => ({ title: c.title, percent: c.percent })) })) });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setDoc(null); load().catch(() => toast.error("Could not load the syllabus")); }, [classId, term, yearView, yq]);
  // Teachers are mid-edit, so only readers pick up other people's changes automatically
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!teacher && tick > 0) load().catch(() => {}); }, [tick]);

  const edit = (fn) => { setDraft((d) => { const n = structuredClone(d); fn(n); return n; }); setDirty(true); };
  const who = (name) => (doc?.subjects || []).find((x) => x.name === name)?.teacher?.name || (doc?.class_subjects || []).find((x) => x.name === name)?.teacher?.name || doc?.class_teacher || null;
  const canEdit = (name) => !doc?.my_subjects || doc.my_subjects.includes(name);
  const live = useMemo(() => {
    if (!draft) return null;
    const tgt = targetFor(draft.start_date, draft.end_date);
    const subs = draft.subjects.map((s) => ({ ...s, pct: subjPct(s) }));
    const pct = subs.length ? Math.round(subs.reduce((a, s) => a + s.pct, 0) / subs.length) : null;
    const chs = subs.flatMap((x) => x.chapters || []);
    return { tgt, subs, pct, status: gradeOf(pct, tgt), chapters: chs.length, done: chs.filter((c) => c.percent >= 100).length };
  }, [draft]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/syllabus/${classId}`, { term, academic_year: doc.academic_year, start_date: draft.start_date, end_date: draft.end_date,
        subjects: draft.subjects.map((s) => ({ name: s.name, percent: s.percent, note: s.note || null, chapters: s.chapters })) });
      toast.success("Syllabus updated");
      await load();
    } catch (e) { toast.error(errorMessage(e) || "Could not save"); }
    setSaving(false);
  };
  const addSubject = () => {
    const n = newSubject.trim();
    if (!n) return;
    if (draft.subjects.some((s) => s.name.toLowerCase() === n.toLowerCase())) { toast.error("That subject is already there"); return; }
    edit((d) => d.subjects.push({ name: n, percent: 0, note: "", chapters: [] }));
    setNewSubject("");
  };

  if (error) return <div className="ui-card p-6 max-w-3xl mx-auto text-rose-600">Could not load the syllabus.</div>;
  if (sum && classes.length === 0) return <div className="max-w-3xl mx-auto space-y-6"><PageHero title="Syllabus" subtitle="Term-by-term syllabus coverage for each class." /><div className="ui-card p-8 text-center text-slate-500" data-testid="syl-empty">{teacher ? "You have no class assigned yet. Ask the principal to assign you a class." : "No classes to show yet."}</div></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-up" data-testid="syllabus-page">
      <PageHero title="Syllabus" subtitle={teacher ? "Set out each term's syllabus, then update how much you have covered every day. The page grades your class against the term's pace." : "How much of each term's syllabus has been covered, against where it should be today."} />

      <div className="ui-card p-4 space-y-3" data-testid="syl-filters">
        <div className="flex flex-wrap items-end gap-3">
          <YearSelect years={ys.years} current={ys.current} value={yr} onChange={(y) => set("year", y)} id="syl-year" label="Year" compact />
          <ClassSelect classes={classes} value={classId} onPick={(id) => set("class", id)} period={period} />
          <PeriodSelect row={row} value={period} onPick={(p) => set("term", p)} />
          {!yearView && teacher && draft && <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="field-label">Term starts</span><DateField className="ui-input mt-1" value={draft.start_date} onChange={(e) => edit((d) => { d.start_date = e.target.value; })} data-testid="syl-start" /></label>
            <label className="block"><span className="field-label">Term ends</span><DateField className="ui-input mt-1" value={draft.end_date} onChange={(e) => edit((d) => { d.end_date = e.target.value; })} data-testid="syl-end" /></label>
          </div>}
          {!yearView && !teacher && draft && <div className="text-sm text-slate-500"><CalendarClock className="inline h-4 w-4 mr-1" aria-hidden="true" />Term runs {draft.start_date} to {draft.end_date}</div>}
        </div>
      </div>

      {past && <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm px-4 py-2.5" data-testid="syl-past-note">You are looking at {yr}. Earlier years are read only.</div>}
      {yearView ? <YearView row={row} classId={classId} year={yq} teacher={teacher} tick={tick} onOpenTerm={(t) => set("term", t)} /> :
      !doc || !draft ? <div className="ui-card p-6 text-slate-500">Loading…</div> : (<>
        {doc.update_due && teacher && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 px-5 py-3 text-sm flex items-center gap-2" data-testid="syl-due-banner">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />{doc.stale ? "This syllabus has not been updated for a few days. " : ""}Update today&apos;s coverage and press Save.
          </div>
        )}

        {live.subs.length === 0 ? (
          <section className="ui-card p-8 sm:p-10 text-center" data-testid="syl-empty-state">
            <div className="mx-auto h-16 w-16 grid place-items-center rounded-2xl bg-[#EEF1FF] text-[#2B4BFF]"><BookOpenCheck className="h-8 w-8" aria-hidden="true" /></div>
            <h2 className="font-heading text-xl font-semibold mt-4">{doc.class_name} has no {term} syllabus yet</h2>
            {teacher ? (<>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Add the subjects you teach this term, and chapters under each one. Then update the percentage covered every day and this page grades the class against the term&apos;s pace.</p>
              <button type="button" onClick={() => edit((d) => { (doc.class_subjects?.length ? doc.class_subjects.map((x) => x.name).filter(canEdit) : ["English", "Mathematics", "Science", "Social Studies", "Hindi"]).forEach((n) => { if (!d.subjects.some((x) => x.name === n)) d.subjects.push({ name: n, percent: 0, note: "", chapters: [] }); }); })} className="ui-btn btn-primary mt-5" data-testid="syl-starter">
                <Sparkles className="h-4 w-4" aria-hidden="true" /> {doc.class_subjects?.length ? "Start with this class's subjects" : "Start with the usual five subjects"}
              </button>
              <p className="text-xs text-slate-400 mt-2">or add your own subject below</p>
            </>) : (<>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">The class teacher adds this and updates it daily. When they do, you&apos;ll see coverage, pace and a red, amber or green grade here straight away.</p>
              {classes.some((c) => c.has_syllabus && c.class_id !== classId) && (
                <div className="mt-5 flex flex-wrap justify-center gap-2"><span className="text-xs text-slate-500 w-full">Classes with a syllabus</span>
                  {classes.filter((c) => c.has_syllabus && c.class_id !== classId).map((c) => <button key={c.class_id} type="button" onClick={() => set("class", c.class_id)} className="ui-btn bg-white text-sm"><i className={`h-2.5 w-2.5 rounded-full ${DOT[c.status]}`} aria-hidden="true" />{c.class_name}</button>)}
                </div>)}
            </>)}
          </section>
        ) : (<>
        <section className={`ui-card p-5 sm:p-6 border-l-4 ${TINT[live.status]}`} data-testid="syl-summary">
          <div className="flex flex-wrap items-center gap-6">
            <Gauge pct={live.pct} target={live.tgt} status={live.status} />
            <div className="flex-1 min-w-[16rem]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><div className="text-sm text-slate-500">{doc.class_name} · {term}</div>
                  <div className={`font-heading text-4xl font-semibold tabular-nums ${(RAG[live.status] || RAG.none).text}`} data-testid="syl-percent">{live.pct == null ? "—" : <CountUp value={live.pct} format={(v) => `${Math.round(v)}%`} />}</div></div>
                <div className="text-right space-y-1.5"><RagPill status={live.status} testid="syl-status" />
                  <div className="text-xs text-slate-500">{doc.last_update_date ? `Updated ${doc.last_update_date}${doc.updated_by_name ? ` by ${doc.updated_by_name}` : ""}` : "Not updated yet"}</div></div>
              </div>
              <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi icon={Target} label="Target today" value={`${live.tgt}%`} note="share of term passed" />
                <Kpi icon={live.pct - live.tgt >= 0 ? TrendingUp : TrendingDown} label={live.pct - live.tgt >= 0 ? "Ahead by" : "Behind by"} value={`${Math.abs(live.pct - live.tgt)} pts`} tone={(RAG[live.status] || RAG.none).text} note={(RAG[live.status] || RAG.none).label} />
                <Kpi icon={ListChecks} label="Chapters done" value={`${live.done}/${live.chapters}`} note={live.chapters ? "fully covered" : "no chapters listed"} />
                <Kpi icon={CalendarClock} label="Days left" value={daysLeft(draft.end_date)} note={`term ends ${draft.end_date}`} />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-4">The black tick on the ring is today&apos;s target. Green is on target or within 5 points, amber is 5 to 15 behind, red is more than 15 behind.</p>
        </section>

        <div className="grid lg:grid-cols-2 gap-5 items-start">
          <section className="ui-card p-5" data-testid="syl-wheel-card">
            <h3 className="font-heading text-lg font-semibold">Subjects at a glance</h3>
            <p className="text-xs text-slate-500 mb-2">{teacher ? "Moves as you change the sliders below." : "Each wing is a subject, coloured against today's target."}</p>
            {live.subs.length >= 3
              ? <RagRing testid="syl-wheel" items={live.subs.map((x) => ({ key: x.name, label: x.name, percent: x.pct, target: live.tgt, status: gradeOf(x.pct, live.tgt), has: true }))} period={term} centreLabel="Covered" noun="subjects" maxWidth={380} hint="Hover a subject for details." />
              : <ul className="space-y-3">{live.subs.map((x) => <li key={x.name}><div className="flex justify-between text-sm"><span className="font-medium">{x.name}</span><span className="tabular-nums">{x.pct}%</span></div><PaceBar percent={x.pct} target={live.tgt} status={gradeOf(x.pct, live.tgt)} thin /></li>)}</ul>}
          </section>
          <section className="ui-card p-5" data-testid="syl-attention">
            <h3 className="font-heading text-lg font-semibold">Needs attention first</h3>
            <p className="text-xs text-slate-500 mb-3">Subjects ordered by how far they are from today&apos;s target.</p>
            <ul className="space-y-2.5">
              {[...live.subs].sort((a, b) => (a.pct - live.tgt) - (b.pct - live.tgt)).map((x) => {
                const g = x.pct - live.tgt, st = gradeOf(x.pct, live.tgt);
                return (
                  <li key={x.name} className={`rounded-xl border-l-4 px-3.5 py-2.5 ${TINT[st]}`}>
                    <div className="flex items-center justify-between gap-2"><span className="font-medium">{x.name}{who(x.name) && <span className="font-normal text-xs text-slate-500"> · {who(x.name)}</span>}</span>
                      <span className={`text-sm font-semibold tabular-nums ${(RAG[st] || RAG.none).text}`}>{g >= 0 ? `${g} pts ahead` : `${-g} pts behind`}</span></div>
                    <div className="mt-1.5"><PaceBar percent={x.pct} target={live.tgt} status={st} thin /></div>
                  </li>);
              })}
            </ul>
          </section>
        </div>

        <section className="ui-card p-5" data-testid="syl-history">
          <h2 className="font-heading text-lg font-semibold">Coverage day by day</h2>
          <p className="text-xs text-slate-500 mb-3">Each save adds that day to the line. The dashed line is the pace the term needs.</p>
          <TrendChart log={log} start={draft.start_date} end={draft.end_date} target={live.tgt} />
        </section>
        </>)}

        <div className="space-y-4" data-testid="syl-subjects">
                    {live.subs.map((s, i) => {
            const st = gradeOf(s.pct, live.tgt);
            const teacherRole = isTeacher, teacher = isTeacher && canEdit(s.name);
            return (
              <article key={s.name} className={`ui-card p-5 border-l-4 ${TINT[st]}`} data-testid={`syl-subject-${s.name}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h3 className="font-heading text-lg font-semibold">{s.name}</h3>
                    {who(s.name) && <div className="text-xs text-slate-500" data-testid={`syl-teacher-${s.name}`}>Taught by {who(s.name)}{teacherRole && !teacher ? " · view only" : ""}</div>}</div>
                  <div className="flex items-center gap-3"><span className={`font-heading text-2xl font-semibold tabular-nums ${(RAG[st] || RAG.none).text}`} data-testid={`syl-subject-pct-${s.name}`}>{s.pct}%</span><RagPill status={st} />
                    {teacher && <button type="button" className="ui-btn !px-2.5 !py-2 text-red-600" aria-label={`Remove ${s.name}`} onClick={() => { if (window.confirm(`Remove ${s.name} from this term's syllabus?`)) edit((d) => d.subjects.splice(i, 1)); }}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}</div>
                </div>
                <div className="mt-3"><PaceBar percent={s.pct} target={live.tgt} status={st} thin /></div>

                {s.chapters.length === 0 ? (
                  <div className="mt-4"><div className="text-xs text-slate-500 mb-1">{teacher ? "Drag to set how much of this subject is covered, or add chapters to track them one by one." : ""}</div>
                    {teacher && <Slider value={s.percent} label={`${s.name} covered`} onChange={(v) => edit((d) => { d.subjects[i].percent = v; })} />}</div>
                ) : !teacher ? (
                  <ul className="mt-4 flex flex-wrap gap-2" data-testid={`syl-chips-${s.name}`}>
                    {s.chapters.map((c, j) => (
                      <li key={j} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${c.percent >= 100 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : c.percent > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-500"}`} data-testid={`syl-chapter-${s.name}-${j}`}>
                        {c.percent >= 100 ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <span className="tabular-nums">{c.percent}%</span>}{c.title}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="mt-4 divide-y divide-[#EEF0F6]">
                    {s.chapters.map((c, j) => (
                      <li key={j} className="py-2.5 grid sm:grid-cols-[minmax(0,1fr)_minmax(0,260px)_auto] gap-x-4 gap-y-1 items-center" data-testid={`syl-chapter-${s.name}-${j}`}>
                        <span className={`text-sm ${c.percent >= 100 ? "text-slate-500 line-through decoration-slate-300" : ""}`}>{c.title}</span>
                        {teacher ? <Slider value={c.percent} label={`${c.title} covered`} onChange={(v) => edit((d) => { d.subjects[i].chapters[j].percent = v; })} /> : <span className="text-sm font-semibold tabular-nums">{c.percent}%</span>}
                        {teacher ? (
                          <span className="flex gap-1.5 justify-end">
                            <button type="button" className={`ui-btn !px-2.5 !py-1.5 text-xs ${c.percent >= 100 ? "bg-emerald-50 text-emerald-700" : "bg-white"}`} onClick={() => edit((d) => { d.subjects[i].chapters[j].percent = c.percent >= 100 ? 0 : 100; })} data-testid={`syl-done-${s.name}-${j}`}><Check className="h-3.5 w-3.5" aria-hidden="true" />Done</button>
                            <button type="button" className="ui-btn !px-2 !py-1.5 text-red-600" aria-label={`Remove chapter ${c.title}`} onClick={() => edit((d) => d.subjects[i].chapters.splice(j, 1))}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                          </span>
                        ) : <span />}
                      </li>
                    ))}
                  </ul>
                )}
                {teacher && <AddChapter onAdd={(t) => edit((d) => d.subjects[i].chapters.push({ title: t, percent: 0 }))} testid={`syl-addchapter-${s.name}`} />}
                {teacher ? <input className="ui-input mt-3 text-sm" placeholder="Note for this subject (optional), e.g. revision test on Friday" maxLength={300} value={s.note} onChange={(e) => edit((d) => { d.subjects[i].note = e.target.value; })} />
                  : s.note && <p className="mt-3 text-sm text-slate-600 bg-[#F7F8FC] rounded-lg px-3 py-2">{s.note}</p>}
              </article>
            );
          })}
        </div>

        {teacher && (
          <div className="ui-card p-4 flex flex-wrap gap-3 items-end" data-testid="syl-add-subject">
            <label className="block flex-1 min-w-[200px]"><span className="field-label">Add a subject</span>
              <input className="ui-input mt-1" placeholder="Maths" maxLength={80} value={newSubject} onChange={(e) => setNewSubject(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubject(); } }} data-testid="syl-subject-name" /></label>
            <button type="button" className="ui-btn bg-white" onClick={addSubject} data-testid="syl-subject-add"><Plus className="h-4 w-4" aria-hidden="true" />Add subject</button>
          </div>
        )}

        {teacher && (
          <div className="sticky bottom-4 z-20 flex justify-end">
            <button type="button" onClick={save} disabled={saving || (!dirty && !doc.update_due && doc.exists)} className="ui-btn btn-primary shadow-lg" data-testid="syl-save">
              <Save className="h-4 w-4" aria-hidden="true" />{saving ? "Saving…" : dirty ? "Save today's update" : doc.exists ? (doc.update_due ? "Confirm today's update" : "Saved") : "Save syllabus"}
            </button>
          </div>
        )}
      </>)}
    </div>
  );
}

function AddChapter({ onAdd, testid }) {
  const [t, setT] = useState("");
  const go = () => { if (t.trim()) { onAdd(t.trim()); setT(""); } };
  return (
    <div className="mt-3 flex gap-2" data-testid={testid}>
      <input className="ui-input text-sm flex-1" placeholder="Add a chapter or topic" maxLength={150} value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go(); } }} aria-label="New chapter" />
      <button type="button" className="ui-btn bg-white text-sm" onClick={go}><Plus className="h-4 w-4" aria-hidden="true" />Chapter</button>
    </div>
  );
}
