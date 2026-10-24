import { formatDate } from "@/lib/utils";

/** One term's progress report: overall percentage, a bar per subject, and the teacher's remark. */
export default function ReportCard({ report, compact = false }) {
  const marks = report.marks || [];
  return (
    <article className="rounded-xl border border-[#E7E9F1] bg-white p-4 sm:p-5" data-testid={`report-${report.term}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading font-semibold text-lg">{report.term}</h3>
          <p className="text-xs text-slate-500">
            {report.updated_by_name ? `${report.updated_by_name}, ` : ""}{formatDate(report.updated_at?.slice(0, 10))}
          </p>
        </div>
        {report.percent != null && (
          <div className="text-right">
            <div className="font-heading text-3xl font-semibold text-[#2340F0] leading-none">{report.percent}%</div>
            <div className="text-xs text-slate-500 mt-1">overall</div>
          </div>
        )}
      </div>
      {marks.length > 0 && (
        <ul className={`mt-4 space-y-2.5 ${compact ? "" : "sm:columns-2 sm:gap-8 sm:space-y-0 [&>li]:break-inside-avoid [&>li]:mb-2.5"}`}>
          {marks.map((m) => {
            const pct = Math.round((m.score / m.max_score) * 100);
            return (
              <li key={m.subject}>
                <div className="flex justify-between text-sm"><span className="font-medium">{m.subject}</span><span className="tabular-nums text-slate-600">{m.score}/{m.max_score}</span></div>
                <div className="mt-1 h-2 rounded-full bg-[#E8ECFF] overflow-hidden"><div className="h-full rounded-full bg-[#2B4BFF]" style={{ width: `${Math.min(pct, 100)}%` }} /></div>
              </li>
            );
          })}
        </ul>
      )}
      {report.remark && (
        <blockquote className="mt-4 rounded-lg bg-[#F1F4FF] px-4 py-3 text-sm text-slate-700"><span className="block text-xs font-medium text-slate-500 mb-0.5">Teacher&apos;s remark</span>{report.remark}</blockquote>
      )}
    </article>
  );
}
