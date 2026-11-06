import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCheck, MessageCircleQuestion } from "lucide-react";
import { api } from "@/lib/api";
import { useLive } from "@/lib/live";
import { formatDate } from "@/lib/utils";

/** Messages from parents that still need the teacher. A reply, or "Mark read", takes a message off the list. */
export default function ParentQuestions() {
  const [rows, setRows] = useState(null);
  const live = useLive(30000);
  const load = useCallback(() => api.get("/student-notes/inbox").then((r) => setRows(r.data)).catch(() => setRows([])), []);
  useEffect(() => { load(); }, [live, load]);
  const markRead = async (id) => {
    setRows((cur) => (cur || []).filter((r) => r.id !== id));
    try { await api.post(`/student-notes/${id}/read`); } catch (_e) { load(); }
  };
  if (!rows || rows.length === 0) return null;
  return (
    <section className="ui-card p-5 sm:p-6" data-testid="parent-questions">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageCircleQuestion className="h-5 w-5 text-[#2B4BFF]" aria-hidden="true" />
          <h2 className="font-heading text-lg font-semibold">Messages from parents</h2>
        </div>
        <span className="pill bg-amber-100 text-amber-800">{rows.length} waiting for a reply</span>
      </div>
      <div className="mt-3 divide-y divide-[#E7E9F1]">
        {rows.slice(0, 6).map((r) => (
          <div key={r.id} className="flex items-start gap-3 py-2.5" data-testid={`pq-${r.id}`}>
            <Link to={`/app/students/${r.student_id}`} className="min-w-0 flex-1 rounded-lg -mx-2 px-2 py-0.5 hover:bg-[#F8FAFC]">
              <div className="text-sm font-medium truncate">{r.student_name}{r.class_name ? <span className="font-normal text-slate-500"> · {r.class_name}</span> : null}</div>
              <div className="text-sm text-slate-600 truncate">{r.body}</div>
              <div className="text-xs text-slate-400 mt-0.5">{formatDate(r.created_at.slice(0, 10))}</div>
            </Link>
            <button type="button" onClick={() => markRead(r.id)} data-testid={`pq-read-${r.id}`}
              className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[#2B4BFF]/25 bg-[#EEF1FF] px-3 py-1 text-xs font-semibold text-[#2B4BFF] hover:bg-[#E0E6FF]">
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Mark read
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
