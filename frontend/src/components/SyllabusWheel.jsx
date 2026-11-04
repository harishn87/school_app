import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RAG } from "@/components/Syllabus";
import RagRing from "@/components/RagRing";

export default function SyllabusWheel({ data, title = "Syllabus", sub, linkFor, showTeacher, testid = "syllabus-wheel" }) {
  const nav = useNavigate();
  const [period, setPeriod] = useState("");
  const all = useMemo(() => data?.classes || [], [data]);
  const currentTerm = useMemo(() => { const t = all.find((r) => r.has_syllabus && /^Term [123]$/.test((r.term || "").replace(/\s*\d{4}.*$/, "")))?.term; return t ? t.replace(/\s*\d{4}.*$/, "") : "Whole year"; }, [all]);
  const per = period || currentTerm;
  // One entry per class for the chosen period: a single term, or the whole year (the three terms averaged)
  const rows = useMemo(() => all.map((r) => {
    const v = per === "Whole year" ? { ...r.year, has_syllabus: r.year?.percent != null, term: "Whole year" } : r.terms?.find((t) => t.term === per) || { has_syllabus: false, status: "none" };
    return { ...r, percent: v.percent, target: v.target, gap: v.gap, status: v.has_syllabus ? v.status : "none", has_syllabus: !!v.has_syllabus, term: per };
  }), [all, per]);
  if (rows.length === 0) return null;
  const c = { green: 0, amber: 0, red: 0, none: 0 };
  rows.forEach((r) => { c[r.status] += 1; });
  const items = rows.map((r) => ({ key: r.class_id, label: r.class_name, percent: r.percent, target: r.target, status: r.status, has: r.has_syllabus, note: showTeacher ? r.teacher : "", row: r }));
  return (
    <section className="ui-card p-5" data-testid={testid}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
        </div>
        <div role="group" aria-label="Syllabus period" className="inline-flex rounded-xl bg-slate-100 p-1 text-sm" data-testid={`${testid}-period`}>
          {["Term 1", "Term 2", "Term 3", "Whole year"].map((p) => (
            <button key={p} type="button" aria-pressed={per === p} onClick={() => { setPeriod(p); }} data-testid={`${testid}-p-${p.replace(" ", "")}`}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${per === p ? "bg-white text-[#2B4BFF] shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{p}</button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium min-h-[30px]" data-testid={`${testid}-counts`}>
        {["green", "amber", "red", "none"].map((k) => <span key={k} className={`pill border px-2.5 py-1 ${RAG[k].soft} ${c[k] === 0 ? "opacity-60" : ""}`}>{c[k]} {k === "none" ? "not set up" : RAG[k].label.toLowerCase()}</span>)}
      </div>
      <div className="mt-2">
        <RagRing testid={testid} items={items} period={per} centreLabel={`${per} average`} noun="classes" onSelect={linkFor ? (r) => nav(`${linkFor(r.row)}&term=${encodeURIComponent(per)}`) : undefined}
          hint="Hover a segment for details. Click one to open that class's syllabus." />
      </div>
      <p className="text-[11px] text-slate-500 text-center">Green: on target or within {-data.rules.green_gap} points. Amber: up to {-data.rules.amber_gap} points behind. Red: further behind. Grey: not set up. Whole year averages the three terms, a term with no syllabus yet counting as nothing covered.</p>
    </section>
  );
}
