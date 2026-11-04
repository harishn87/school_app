import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircleQuestion } from "lucide-react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/live";
import { formatDate } from "@/lib/utils";

/** Latest messages parents have sent to the teacher, with the unanswered ones first. */
export default function ParentQuestions({ teacher }) {
  const [rows, setRows] = useState(null);
  const live = useLive(30000);
  useEffect(() => { api.get("/student-notes/inbox").then((r) => setRows(r.data)).catch(() => setRows([])); }, [live]);
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => Number(a.answered) - Number(b.answered));
  const open = rows.filter((r) => !r.answered).length;
  return (
    <section className="ui-card p-5 sm:p-6" data-testid="parent-questions">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="h-5 w-5 text-[#2B4BFF]" aria-hidden="true" />
          <h2 className="font-heading text-lg font-semibold">Messages from parents</h2>
        </div>
        <span className={`pill ${open ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{open ? `${open} waiting for a reply` : "All answered"}</span>
      </div>
      <div className="mt-3 divide-y divide-[#E7E9F1]">
        {sorted.slice(0, 6).map((r) => (
          <Link key={r.id} to={`/app/students/${r.student_id}`} className="block py-2.5 hover:bg-[#F8FAFC] -mx-2 px-2 rounded-lg" data-testid={`pq-${r.id}`}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium truncate">{r.student_name}{r.class_name ? <span className="font-normal text-slate-500"> · {r.class_name}</span> : null}</span>
              <span className={`text-xs shrink-0 ${r.answered ? "text-emerald-700" : "text-amber-700"}`}>{r.answered ? "Replied" : "Needs reply"}</span>
            </div>
            <div className="text-sm text-slate-600 truncate">{r.body}</div>
            <div className="text-xs text-slate-400 mt-0.5">{formatDate(r.created_at.slice(0, 10))}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
