import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Save, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PageHero from "@/components/PageHero";
import ReportCard from "@/components/ReportCard";
import { AcademicWheel, StaffAnalysis, TermsWheel } from "@/components/StudentAnalysis";
import ChildPicker, { useChildPick } from "@/components/ChildPicker";
import YearSelect, { useAcademicYears } from "@/components/YearSelect";

const TERMS = ["Term 1", "Term 2", "Term 3", "Annual"];
const defaultSubjects = (name = "") => (/^(pp|nursery|lkg|ukg)/i.test(name.trim()) ? ["English", "Numbers", "Drawing"] : ["Maths", "English", "Science", "Social"]);

/* ---------------- parents: reports for their children ---------------- */
function ParentProgress() {
  const [kids, setKids] = useState(null);
  const [kid, pickKid] = useChildPick(kids);
  const [reports, setReports] = useState([]);
  const ys = useAcademicYears();
  const [year, setYear] = useState("");
  useEffect(() => {
    api.get("/students", { params: { status: "active" } }).then((r) => setKids(r.data)).catch(() => setKids([]));
  }, []);
  useEffect(() => {
    api.get("/reports", { params: { academic_year: year || undefined } }).then((r) => setReports(r.data)).catch(() => {});
  }, [year]);
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-up" data-testid="progress-parent">
      <PageHero title="Academics" subtitle="Marks and teacher remarks, updated by your child's class teacher." />
      <YearSelect chips years={ys.years} current={ys.current} value={year || ys.current} onChange={(y) => setYear(y === ys.current ? "" : y)} />
      {kids && kids.length === 0 && <div className="ui-card p-8 text-center text-slate-500">No students are linked to your account yet.</div>}
      <ChildPicker kids={kids} value={kid} onPick={pickKid} />
      {kids?.filter((k) => k.id === kid).map((k) => {
        const mine = reports.filter((r) => r.student_id === k.id);
        return (
          <section key={k.id} className="space-y-3" data-testid={`progress-child-${k.id}`}>
            <h2 className="font-heading text-lg font-semibold">{k.first_name} {k.last_name}</h2>
            {mine.length === 0
              ? <div className="ui-card p-6 text-sm text-slate-500">{year && year !== ys.current ? `No report for ${year}.` : "No progress report yet. It will appear here as soon as the teacher saves it."}</div>
              : <>
                  <TermsWheel items={["Term 1", "Term 2", "Term 3", "Annual"].map((t) => ({ label: t, value: mine.find((r) => r.term === t)?.percent ?? null }))} term={mine[0]?.term}
                    onTerm={(t) => document.getElementById(`rc-${k.id}-${t.replace(/\s/g, "")}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                    title={`${k.first_name}: overall by term`} sub="Click a term to jump to its report." testid={`terms-wheel-${k.id}`} />
                  <AcademicWheel report={mine[0]} history={mine} studentId={k.id} year={year} name={k.first_name} testid={`academic-wheel-${k.id}`} />
                  <div className="max-w-3xl space-y-3">{mine.map((r) => <ReportCard key={r.id} report={r} />)}</div>
                </>}
          </section>
        );
      })}
    </div>
  );
}

/* ---------------- staff: enter marks for a whole class ---------------- */
function StaffProgress() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [classes, setClasses] = useState(null);
  const [classId, setClassId] = useState(params.get("class") || "");
  const [term, setTerm] = useState("Term 1");
  const ys = useAcademicYears();
  const [year, setYear] = useState("");
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [maxes, setMaxes] = useState({});
  const [scores, setScores] = useState({});   // { studentId: { subject: "45" } }
  const [remarks, setRemarks] = useState({});
  const [newSubject, setNewSubject] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const canEnter = user?.role === "teacher";   // marks are entered in the teacher app; admins review
  const [view, setView] = useState(canEnter ? "marks" : "analysis");

  useEffect(() => {
    api.get("/classes").then((r) => {
      setClasses(r.data);
      setClassId((cur) => (r.data.some((c) => c.id === cur) ? cur : r.data[0]?.id || ""));
    }).catch(() => setClasses([]));
  }, []);

  const load = useCallback(async () => {
    if (!classId) return;
    const [s, r] = await Promise.all([
      api.get("/students", { params: { class_id: classId, status: "active" } }),
      api.get("/reports", { params: { class_id: classId, term } }),
    ]);
    const list = [...s.data].sort((a, b) => Number(a.roll_number || 9999) - Number(b.roll_number || 9999) || a.first_name.localeCompare(b.first_name));
    const subs = []; const mx = {}; const sc = {}; const rm = {};
    for (const rep of r.data) {
      sc[rep.student_id] = {};
      rm[rep.student_id] = rep.remark || "";
      for (const m of rep.marks) {
        if (!subs.includes(m.subject)) subs.push(m.subject);
        mx[m.subject] = m.max_score;
        sc[rep.student_id][m.subject] = String(m.score);
      }
    }
    const cname = classes?.find((c) => c.id === classId)?.name;
    setStudents(list);
    setSubjects(subs.length ? subs : defaultSubjects(cname));
    setMaxes(mx); setScores(sc); setRemarks(rm); setDirty(false);
  }, [classId, term, classes]);
  useEffect(() => { load().catch(() => toast.error("Could not load this class")); }, [load]);

  const setScore = (sid, sub, v) => { setScores((p) => ({ ...p, [sid]: { ...(p[sid] || {}), [sub]: v } })); setDirty(true); };
  const maxOf = (sub) => (maxes[sub] === undefined || maxes[sub] === "" ? 100 : Number(maxes[sub]));
  const addSubject = () => {
    const n = newSubject.trim();
    if (!n || subjects.some((s) => s.toLowerCase() === n.toLowerCase())) return;
    setSubjects([...subjects, n]); setNewSubject(""); setDirty(true);
  };
  const removeSubject = (sub) => { setSubjects(subjects.filter((s) => s !== sub)); setDirty(true); };

  const rowPct = (sid) => {
    let got = 0, out = 0;
    for (const sub of subjects) { const v = scores[sid]?.[sub]; if (v !== undefined && v !== "") { got += Number(v); out += maxOf(sub); } }
    return out ? Math.round((got / out) * 100) : null;
  };
  const invalid = useMemo(() => {
    const bad = new Set();
    for (const s of students) for (const sub of subjects) { const v = scores[s.id]?.[sub]; if (v !== undefined && v !== "" && (Number(v) < 0 || Number(v) > maxOf(sub) || Number.isNaN(Number(v)))) bad.add(`${s.id}|${sub}`); }
    return bad;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, subjects, scores, maxes]);

  const save = async () => {
    if (invalid.size) { toast.error("Some marks are higher than the maximum. Please correct the red boxes."); return; }
    setSaving(true);
    try {
      const entries = students.map((s) => ({
        student_id: s.id, remark: remarks[s.id] || null,
        marks: subjects.map((sub) => { const v = scores[s.id]?.[sub]; return { subject: sub, score: v === undefined || v === "" ? null : Number(v), max_score: maxOf(sub) }; }),
      }));
      const { data } = await api.post("/reports/batch", { class_id: classId, term, entries });
      toast.success(`Saved ${data.saved} report${data.saved === 1 ? "" : "s"}. Parents can see them now.`);
      setDirty(false);
    } catch (e) { toast.error(errorMessage(e) || "Could not save"); }
    setSaving(false);
  };

  if (classes && classes.length === 0) {
    return <div className="max-w-3xl mx-auto ui-card p-8 text-center text-slate-500" data-testid="progress-none">
      {user?.role === "teacher" ? "No class is assigned to you yet. Ask your school admin to set you as a class teacher." : "No classes yet."}</div>;
  }

  const classField = (
    <div><label className="field-label" htmlFor="pr-class">Class</label>
          <select id="pr-class" className="ui-input" value={classId} onChange={(e) => { setClassId(e.target.value); setParams({ class: e.target.value }); }} data-testid="progress-class">
            {classes?.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
          </select></div>
  );
  const termField = (
    <div><label className="field-label" htmlFor="pr-term">Term</label>
          <select id="pr-term" className="ui-input" value={term} onChange={(e) => setTerm(e.target.value)} data-testid="progress-term">
            {TERMS.map((t) => <option key={t}>{t}</option>)}
          </select></div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-up" data-testid="progress-page">
      <PageHero title="Academics" subtitle={view === "marks" ? "Enter marks and remarks for the class. Parents see them as soon as you save." : (canEnter ? "See how each student is doing, subject by subject, against the class." : "Review how each student is doing, subject by subject, against the class. Class teachers enter the marks.")}
        actions={view === "marks" && <button type="button" onClick={save} disabled={saving || !students.length} className="ui-btn btn-primary" data-testid="progress-save">
          <Save className="h-4 w-4" aria-hidden="true" /> {saving ? "Saving…" : dirty ? "Save and publish" : "Save"}
        </button>} />

      {view === "analysis" && <YearSelect chips years={ys.years} current={ys.current} value={year || ys.current} onChange={(y) => setYear(y === ys.current ? "" : y)} id="pr-year" />}

      {canEnter && <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Academics views">
        {[["marks", "Enter marks"], ["analysis", "Student analysis"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} data-testid={`pr-tab-${k}`} onClick={() => setView(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === k ? "bg-white text-[#2B4BFF] shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{l}</button>
        ))}
      </div>}

      {view === "marks" && <div className="ui-card p-4 grid gap-3 items-end sm:grid-cols-[1fr_1fr_auto]">
        {classField}
        {termField}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addSubject(); }}>
          <input className="ui-input !w-40" placeholder="Add subject" aria-label="New subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} data-testid="subject-add-input" />
          <button type="submit" className="ui-btn" data-testid="subject-add-btn"><Plus className="h-4 w-4" aria-hidden="true" /> Add</button>
        </form>
      </div>}

      {view === "analysis" && <StaffAnalysis classId={classId} students={students} term={term} onTerm={setTerm} canEnter={canEnter} lead={<>{classField}{termField}</>} year={year} cols={4} />}

      {view === "marks" && <div className="ui-card overflow-x-auto !rounded-2xl">
        <table className="w-full text-sm" data-testid="progress-table">
          <thead>
            <tr className="surface-midnight text-white">
              <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/80 sticky left-0 z-10 bg-[#0B1020]">Student</th>
              {subjects.map((sub) => (
                <th key={sub} scope="col" className="px-2 py-3 text-left min-w-[104px]">
                  <div className="flex items-center gap-1 font-heading text-sm font-semibold text-white">{sub}
                    <button type="button" onClick={() => removeSubject(sub)} className="text-white/50 hover:text-rose-300" aria-label={`Remove ${sub}`}><X className="h-3 w-3" aria-hidden="true" /></button></div>
                  <label className="mt-1 flex items-center gap-1 text-[11px] font-normal text-white/60">out of
                    <input type="number" min="1" className="w-12 rounded-md border border-white/20 bg-white/10 px-1 py-0.5 text-xs text-white focus:outline-none focus:border-[#E9C46A]" value={maxes[sub] ?? 100} aria-label={`${sub} maximum marks`}
                      onChange={(e) => { setMaxes({ ...maxes, [sub]: e.target.value }); setDirty(true); }} /></label>
                </th>
              ))}
              <th scope="col" className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white/80">Overall</th>
              <th scope="col" className="px-3 py-3 text-left min-w-[220px] text-xs font-semibold uppercase tracking-wider text-white/80">Teacher&apos;s remark</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEF0F6]">
            {students.length === 0 && <tr><td colSpan={subjects.length + 3} className="px-4 py-8 text-center text-slate-500">No students in this class yet.</td></tr>}
            {students.map((s) => {
              const pct = rowPct(s.id);
              return (
                <tr key={s.id} data-testid={`progress-row-${s.id}`} className="group hover:bg-[#F7F8FF]">
                  <td className="px-4 py-2 sticky left-0 bg-white group-hover:bg-[#F7F8FF] z-10 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-[#2B4BFF] to-[#1B2A7A] text-[11px] font-semibold text-white" aria-hidden="true">{(s.first_name?.[0] || "") + (s.last_name?.[0] || "")}</span>
                      <div className="leading-tight"><div className="font-heading font-semibold text-[#0B1020]">{s.first_name} {s.last_name}</div><div className="text-[11px] text-slate-400 tabular-nums">Roll {s.roll_number}</div></div>
                    </div>
                  </td>
                  {subjects.map((sub, i) => {
                    const bad = invalid.has(`${s.id}|${sub}`);
                    const raw = scores[s.id]?.[sub], mx = Number(maxes[sub] ?? 100) || 100;
                    const mp = raw === "" || raw == null || Number.isNaN(Number(raw)) ? null : (Number(raw) / mx) * 100;
                    const tint = mp == null ? "border-[#DDE1EE] bg-white" : mp >= 75 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : mp >= 50 ? "border-[#CBD3FF] bg-[#EEF1FF] text-[#1B2A7A]" : mp >= 35 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-rose-200 bg-rose-50 text-rose-700";
                    return (
                      <td key={sub} className="px-2 py-1.5">
                        <input type="number" inputMode="decimal" min="0" step="any" value={scores[s.id]?.[sub] ?? ""} onChange={(e) => setScore(s.id, sub, e.target.value)}
                          aria-label={`${s.first_name} ${sub} marks`} data-testid={`score-${s.id}-${i}`}
                          className={`w-20 rounded-xl border px-2 py-1.5 text-center font-heading font-semibold tabular-nums transition-colors focus:outline-none focus:ring-4 focus:ring-[#2B4BFF]/15 focus:border-[#2B4BFF] ${bad ? "border-red-400 bg-red-50 text-red-700" : tint}`} />
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right">
                    {pct == null ? <span className="text-slate-300">-</span> : (
                      <span className={`inline-block min-w-[3.5rem] rounded-full px-3 py-1 text-center font-heading text-sm font-semibold tabular-nums ${pct >= 75 ? "bg-emerald-50 text-emerald-700" : pct >= 50 ? "bg-[#EEF1FF] text-[#2B4BFF]" : pct >= 35 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{pct}%</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <input className="ui-input !rounded-xl !bg-[#F8F9FF] !py-1.5" maxLength={500} placeholder="Optional" value={remarks[s.id] ?? ""} aria-label={`${s.first_name} remark`} data-testid={`remark-${s.id}`}
                      onChange={(e) => { setRemarks({ ...remarks, [s.id]: e.target.value }); setDirty(true); }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
      {view === "marks" && <p className="text-xs text-slate-500">Leave a mark empty if the student didn&apos;t take that subject. Clearing a student&apos;s marks and remark removes their report for this term. {user?.role === "admin" && <Link className="text-[#2B4BFF]" to="/app/students">Students</Link>}</p>}
    </div>
  );
}

export default function ProgressPage() {
  const { user } = useAuth();
  return user?.role === "parent" ? <ParentProgress /> : <StaffProgress />;
}
