import { useEffect, useState } from "react";
import { BookOpenCheck, CheckCircle2, Circle } from "lucide-react";
import { api } from "@/lib/api";

const TERMS = ["Term 1", "Term 2", "Term 3"];

/** What a child has to prepare for a term exam or the annual exam: every chapter, split into covered in class and still to come. */
export default function ExamSyllabus({ classId, testid = "exam-syllabus" }) {
  const [docs, setDocs] = useState(null);
  const [exam, setExam] = useState("");
  useEffect(() => {
    if (!classId) { setDocs([]); return undefined; }
    let live = true;
    setDocs(null);
    Promise.all(TERMS.map((t) => api.get("/syllabus", { params: { class_id: classId, term: t } }).then((r) => r.data).catch(() => null)))
      .then((r) => { if (live) setDocs(r.map((d, i) => (d && d.exists ? { ...d, term: TERMS[i] } : null))); });
    return () => { live = false; };
  }, [classId]);

  if (!docs) return null;
  const avail = docs.filter(Boolean);
  if (avail.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const running = avail.find((d) => d.start_date <= today && today <= d.end_date) || avail[avail.length - 1];
  const sel = exam || running.term;
  const chosen = sel === "Annual" ? avail : avail.filter((d) => d.term === sel);

  // subject -> chapters (with the term each belongs to)
  const subjects = [];
  chosen.forEach((d) => d.subjects.forEach((s) => {
    let row = subjects.find((x) => x.name === s.name);
    if (!row) { row = { name: s.name, chapters: [], plain: [] }; subjects.push(row); }
    if ((s.chapters || []).length) s.chapters.forEach((c) => row.chapters.push({ ...c, term: d.term }));
    else row.plain.push({ term: d.term, percent: s.percent });
  }));

  return (
    <section className="ui-card p-5 sm:p-6" data-testid={testid}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpenCheck className="h-5 w-5 text-[#2B4BFF]" aria-hidden="true" />
          <h2 className="font-heading text-lg font-semibold">Exam syllabus</h2>
        </div>
        <select className="ui-input !w-auto" value={sel} onChange={(e) => setExam(e.target.value)} aria-label="Exam" data-testid={`${testid}-select`}>
          {avail.map((d) => <option key={d.term} value={d.term}>{d.term} exam</option>)}
          <option value="Annual">Annual exam (all terms)</option>
        </select>
      </div>
      <p className="text-xs text-slate-500 mt-1">Everything to prepare for the {sel === "Annual" ? "annual exam" : `${sel} exam`}. A tick means the class has already covered it.</p>
      {subjects.length === 0 && <div className="text-sm text-slate-500 mt-3">No subjects set up for this exam yet.</div>}
      <div className="mt-3 grid sm:grid-cols-2 gap-3">
        {subjects.map((s) => {
          const done = s.chapters.filter((c) => c.percent >= 100).length;
          return (
            <div key={s.name} className="rounded-xl border border-[#E7E9F1] p-3" data-testid={`${testid}-sub-${s.name}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{s.name}</span>
                {s.chapters.length > 0 && <span className="text-xs text-slate-500">{done} of {s.chapters.length} chapters covered</span>}
              </div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {s.chapters.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    {c.percent >= 100 ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" aria-label="Covered" /> : <Circle className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" aria-label="Still to come" />}
                    <span className="min-w-0 flex-1">{c.title}{sel === "Annual" && <span className="text-xs text-slate-400"> · {c.term}</span>}</span>
                    {c.percent > 0 && c.percent < 100 && <span className="text-xs text-slate-500">{c.percent}%</span>}
                  </li>
                ))}
                {s.plain.map((p, i) => <li key={`p${i}`} className="text-slate-600">{sel === "Annual" ? `${p.term}: ` : ""}{p.percent}% of the syllabus covered so far</li>)}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
