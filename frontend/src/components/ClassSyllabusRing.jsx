import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useLive } from "@/lib/live";
import { PaceBar, RAG, RagPill } from "@/components/Syllabus";
import RagRing from "@/components/RagRing";

/** The class's syllabus for one term as a red / amber / green wheel, one segment per subject. Sits beside the marks analysis. */
export default function ClassSyllabusRing({ classId, term, year }) {
  const [doc, setDoc] = useState(null);
  const [failed, setFailed] = useState(false);
  const live = useLive(30000);
  useEffect(() => {
    if (!classId) return;
    api.get("/syllabus", { params: { class_id: classId, term, academic_year: year || undefined } }).then((r) => { setDoc(r.data); setFailed(false); }).catch(() => setFailed(true));
  }, [classId, term, year, live]);

  const subjects = doc?.subjects || [];
  const items = subjects.map((s) => ({ key: s.name, label: s.name, percent: s.percent, target: doc.target, status: s.status, has: true }));
  return (
    <div className="ui-card p-5 flex h-full flex-col" data-testid="class-syllabus-ring">
      <div className="flex flex-wrap items-start justify-between gap-2 min-h-[5rem]">
        <div>
          <h3 className="font-heading text-lg font-semibold">Syllabus coverage</h3>
          <p className="text-xs text-slate-500">Share of each subject covered, {term}. Target today is {doc?.target ?? "-"}%.</p>
        </div>
        {doc?.exists && <RagPill status={doc.status} testid="csr-status" />}
      </div>
      <div className="mt-6 flex flex-1 flex-col">
        {failed ? <p className="text-sm text-slate-500">Syllabus isn&apos;t available for this class.</p>
          : !doc ? <p className="text-sm text-slate-500">Loading…</p>
          : !doc.exists || subjects.length === 0 ? (
            <p className="text-sm text-slate-500" data-testid="csr-empty">No syllabus has been set for {term} yet. <Link className="font-medium text-[#2B4BFF] hover:underline" to={`/app/syllabus?class=${classId}`}>Open syllabus</Link></p>
          ) : subjects.length < 3 ? (
            <ul className="space-y-3">{subjects.map((s) => <li key={s.name}><div className="flex justify-between text-sm"><span className="font-medium">{s.name}</span><span className="tabular-nums">{s.percent}%</span></div><PaceBar percent={s.percent} target={doc.target} status={s.status} thin /></li>)}</ul>
          ) : (
            <RagRing testid="csr-wheel" items={items} period={term} centreLabel="Covered" noun="subjects" maxWidth={522}
              hint={`Overall ${doc.percent}% against a target of ${doc.target}%, ${RAG[doc.status].label.toLowerCase()}.`} />
          )}
      </div>
      {doc?.exists && <Link className="mt-1 inline-block text-sm font-medium text-[#2B4BFF] hover:underline" to={`/app/syllabus?class=${classId}`} data-testid="csr-open">Open full syllabus</Link>}
    </div>
  );
}
