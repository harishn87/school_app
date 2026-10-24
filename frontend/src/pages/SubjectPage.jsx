import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import YearSelect, { useAcademicYears } from "@/components/YearSelect";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import PageHero from "@/components/PageHero";
import WagonWheel from "@/components/WagonWheel";

const TERM_ORDER = ["Term 1", "Term 2", "Term 3", "Annual"];

/** One subject for one student across every term. Opened by clicking a wing on an academics wheel. */
export default function SubjectPage() {
  const { sid, subject: rawSubject } = useParams();
  const subject = decodeURIComponent(rawSubject || "");
  const navigate = useNavigate();
  const [qs, setQs] = useSearchParams();
  const ys = useAcademicYears();
  const year = qs.get("year") || "";
  const yq = year ? `?year=${year}` : "";
  const [student, setStudent] = useState(null);
  const [reports, setReports] = useState(null);
  useEffect(() => {
    api.get(`/students/${sid}`).then((r) => setStudent(r.data)).catch(() => setStudent(false));
    setReports(null);
    api.get("/reports", { params: { student_id: sid, academic_year: year || undefined } }).then((r) => setReports(r.data)).catch(() => setReports([]));
  }, [sid, year]);

  const rows = useMemo(() => TERM_ORDER.map((t) => {
    const r = (reports || []).find((x) => x.term === t);
    const m = r?.marks?.find((x) => x.subject === subject && x.score != null);
    return { term: t, m, pct: m ? Math.round((m.score / m.max_score) * 100) : null, overall: r?.percent ?? null };
  }), [reports, subject]);
  const subjects = useMemo(() => [...new Set((reports || []).flatMap((r) => (r.marks || []).filter((m) => m.score != null).map((m) => m.subject)))], [reports]);
  const have = rows.filter((r) => r.pct != null);
  const first = have[0], last = have[have.length - 1];
  const name = student ? `${student.first_name} ${student.last_name}` : "";

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-up" data-testid="subject-page">
      <PageHero title={subject} subtitle={name ? `${name}: ${subject} across every term.` : "Loading"}>
        <Link to="/app/progress" className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white mt-2"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to academics</Link>
      </PageHero>

      <YearSelect chips years={ys.years} current={ys.current} value={year || ys.current} onChange={(y) => setQs(y === ys.current ? {} : { year: y })} />

      {reports && !have.length && <div className="ui-card p-8 text-center text-slate-500" data-testid="subject-none">No marks for {subject} in {year || ys.current || "this year"}.</div>}

      {have.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-5 items-start">
          <div className="ui-card p-5">
            <h3 className="font-heading text-lg font-semibold">{subject} by term</h3>
            <p className="text-xs text-slate-500 mb-2">Shaded by mark. Striped wings have no marks yet.</p>
            <WagonWheel items={rows.map((r) => ({ label: r.term, value: r.pct }))} title={`${subject} marks`} testid="subject-wheel" />
          </div>
          <div className="space-y-4">
            <div className="ui-card overflow-hidden">
              <table className="w-full text-sm" data-testid="subject-table">
                <thead><tr>
                  <th scope="col" className="table-head px-4 py-2.5 text-left">Term</th>
                  <th scope="col" className="table-head px-4 py-2.5 text-right">Marks</th>
                  <th scope="col" className="table-head px-4 py-2.5 text-right">Percent</th>
                  <th scope="col" className="table-head px-4 py-2.5 text-right">Overall that term</th>
                </tr></thead>
                <tbody className="divide-y divide-[#EEF0F6]">
                  {rows.map((r) => (
                    <tr key={r.term}>
                      <th scope="row" className="px-4 py-2 text-left font-medium">{r.term}</th>
                      <td className="px-4 py-2 text-right tabular-nums">{r.m ? `${r.m.score}/${r.m.max_score}` : "-"}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-semibold">{r.pct != null ? `${r.pct}%` : "-"}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{r.overall != null ? `${r.overall}%` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {have.length > 1 && (
              <p className="ui-card p-4 text-sm text-slate-700" data-testid="subject-note">
                {last.pct === first.pct ? "No change" : last.pct > first.pct ? `Up ${last.pct - first.pct} points` : `Down ${first.pct - last.pct} points`} from {first.term} to {last.term}.
              </p>
            )}
          </div>
        </div>
      )}

      {subjects.length > 1 && (
        <div className="ui-card p-4" data-testid="subject-others">
          <div className="text-xs text-slate-500 mb-2">Other subjects</div>
          <div className="flex flex-wrap gap-2">
            {subjects.filter((s) => s !== subject).map((s) => (
              <button key={s} type="button" className="pill bg-[#F1F4FF] text-slate-700 hover:bg-[#E8ECFF] px-3 py-1.5" onClick={() => navigate(`/app/progress/subject/${sid}/${encodeURIComponent(s)}${yq}`)}>{s}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
