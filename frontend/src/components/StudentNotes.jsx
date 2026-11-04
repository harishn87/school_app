import { useCallback, useEffect, useState } from "react";
import { AlertCircle, MessageSquareText, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";

/** Private notes from teachers to one child's parents. Teachers and admins can write; parents read. */
export default function StudentNotes({ studentId, canWrite, asParent, myId, isAdmin, title, testid = "student-notes" }) {
  const [notes, setNotes] = useState(null);
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/students/${studentId}/notes`).then((r) => setNotes(r.data)).catch(() => setNotes([]));
  }, [studentId]);
  useEffect(() => { setNotes(null); load(); }, [load]);

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post(`/students/${studentId}/notes`, { body: body.trim(), urgent });
      setBody(""); setUrgent(false); load(); toast.success(asParent ? "Sent to the teacher" : "Sent to the parents");
    } catch (err) { toast.error(errorMessage(err)); }
    setBusy(false);
  };
  const remove = async (id) => {
    if (!confirm("Delete this note? The parents will no longer see it.")) return;
    try { await api.delete(`/student-notes/${id}`); load(); } catch (err) { toast.error(errorMessage(err)); }
  };

  const writes = canWrite || asParent;
  return (
    <section className="ui-card p-5 sm:p-6" data-testid={testid}>
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-5 w-5 text-[#2B4BFF]" aria-hidden="true" />
        <h2 className="font-heading text-lg font-semibold">{title || (asParent ? "Messages with the teacher" : "Notes and questions")}</h2>
      </div>
      {writes && (
        <form onSubmit={send} className="mt-3 space-y-2" data-testid={`${testid}-form`}>
          <p className="text-xs text-slate-500">{asParent ? "Ask a question or tell the class teacher something. Only the teachers of this class can see it." : "Only this child's parents can see what you write here. Use it for anything they should know or act on."}</p>
          <textarea className="ui-input w-full min-h-[84px]" maxLength={1000} placeholder={asParent ? "e.g. Can you share the plan for the science project?" : "e.g. He forgot his project file twice this week. Please check his bag."} value={body}
            onChange={(e) => setBody(e.target.value)} data-testid={`${testid}-body`} aria-label={asParent ? "Message to the teacher" : "Note to parents"} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {!asParent ? <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} data-testid={`${testid}-urgent`} /> Mark as important
            </label> : <span />}
            <button type="submit" disabled={busy || !body.trim()} className="ui-btn btn-primary" data-testid={`${testid}-send`}>
              <Send className="h-4 w-4" aria-hidden="true" /> {asParent ? "Ask teacher" : "Send to parents"}
            </button>
          </div>
        </form>
      )}
      <div className="mt-4 space-y-2">
        {notes && notes.length === 0 && <div className="text-sm text-slate-500">No messages yet.</div>}
        {(notes || []).map((n) => (
          <div key={n.id} className={`rounded-xl p-3 text-sm ${n.urgent ? "bg-rose-50 border border-rose-100" : n.from_role === "parent" ? "bg-amber-50 border border-amber-100" : "bg-[#F1F4FF]"}`} data-testid={`note-${n.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {n.from_role === "parent" && <span className="pill bg-amber-100 text-amber-800 mr-2">{asParent ? "You" : "Parent"}</span>}
                {n.urgent && <span className="pill bg-rose-100 text-rose-700 mr-2"><AlertCircle className="h-3 w-3" aria-hidden="true" /> Important</span>}
                <span className="whitespace-pre-wrap break-words">{n.body}</span>
              </div>
              {writes && (isAdmin || n.created_by === myId) && (
                <button type="button" onClick={() => remove(n.id)} className="text-slate-400 hover:text-rose-600 shrink-0" aria-label="Delete note" data-testid={`note-del-${n.id}`}><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-1.5">{n.created_by === myId ? "You" : n.created_by_name} · {formatDate(n.created_at.slice(0, 10))}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
