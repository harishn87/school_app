import PageHero from "@/components/PageHero";
import DateField from "@/components/DateField";
import Modal from "@/components/Modal";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CalendarClock, MapPin, Clock } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate, fmtTime } from "@/lib/utils";
import useClassScope from "@/lib/useClassScope";

const TERMS = ["Term 1", "Term 2", "Term 3", "Annual"];
const BLANK = { term: "Term 1", subject: "", date: "", start_time: "", duration_min: "", room: "", note: "" };
const roomLabel = (r) => (/^room\b/i.test(r.trim()) ? r.trim() : `Room ${r.trim()}`);
const dayDiff = (iso) => { const t = new Date(); t.setHours(0, 0, 0, 0); return Math.round((new Date(`${iso}T00:00:00`) - t) / 86400000); };
const when = (n) => (n < 0 ? ["Done", "bg-slate-100 text-slate-500"] : n === 0 ? ["Today", "bg-rose-50 text-rose-700 animate-pulse"] : n === 1 ? ["Tomorrow", "bg-amber-50 text-amber-800"] : n <= 7 ? [`In ${n} days`, "bg-amber-50 text-amber-800"] : [`In ${n} days`, "bg-[#E8ECFF] text-[#2B4BFF]"]);

export default function ExamsPage() {
  const { user } = useAuth();
  const scope = useClassScope();
  const canEdit = user?.role === "admin" || user?.role === "teacher";
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!scope.classId) { setRows([]); setLoaded(scope.ready); return; }
    try { setRows((await api.get("/exams", { params: { class_id: scope.classId } })).data); } catch (_e) { setRows([]); }
    setLoaded(true);
  }, [scope.classId, scope.ready]);
  useEffect(() => { load(); }, [load]);

  const open = (ex) => { setEditingId(ex?.id || null); setForm(ex ? { ...BLANK, ...ex, duration_min: ex.duration_min ?? "", start_time: ex.start_time || "", room: ex.room || "", note: ex.note || "" } : { ...BLANK }); };
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = { class_id: scope.classId, term: form.term, subject: form.subject.trim(), date: form.date, start_time: form.start_time || null,
        duration_min: form.duration_min ? Number(form.duration_min) : null, room: form.room.trim() || null, note: form.note.trim() || null };
      if (editingId) await api.put(`/exams/${editingId}`, body); else await api.post("/exams", body);
      toast.success(editingId ? "Exam updated" : "Exam added"); setForm(null); load();
    } catch (err) { toast.error(errorMessage(err)); }
    setBusy(false);
  };
  const remove = async (ex) => {
    if (!window.confirm(`Remove the ${ex.subject} exam?`)) return;
    try { await api.delete(`/exams/${ex.id}`); load(); } catch (err) { toast.error(errorMessage(err)); }
  };

  const next = useMemo(() => rows.find((r) => dayDiff(r.date) >= 0), [rows]);
  const groups = useMemo(() => TERMS.map((t) => [t, rows.filter((r) => r.term === t)]).filter(([, r]) => r.length), [rows]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-up" data-testid="exams-page">
      <PageHero title="Exam schedule" subtitle={canEdit ? "Dates, timings and rooms for every exam. Parents see their child's class schedule." : "Your child's upcoming exams, with date, time and room."}
        actions={canEdit && scope.classId && <button type="button" className="ui-btn btn-primary" onClick={() => open(null)} data-testid="exam-add"><Plus className="h-4 w-4" aria-hidden="true" />Add exam</button>} />

      {scope.picker && <div>{scope.picker}</div>}

      {scope.empty && <div className="ui-card p-8 text-center text-slate-500">{user?.role === "parent" ? "No class is linked to your children yet." : "No classes to show yet. Classes assigned to you appear here."}</div>}

      {next && (
        <section className="surface-midnight relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white" data-testid="exam-next">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#E9C46A]">Next exam</div>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-heading text-2xl font-semibold">{next.subject}</h2>
              <p className="mt-0.5 text-sm text-white/70">{formatDate(next.date)}{next.start_time ? ` · ${fmtTime(next.start_time)}` : ""}{next.room ? ` · ${roomLabel(next.room)}` : ""}</p></div>
            <span className="rounded-full bg-white/10 px-3.5 py-1.5 font-heading text-sm font-semibold">{when(dayDiff(next.date))[0]}</span>
          </div>
        </section>
      )}

      {scope.classId && loaded && rows.length === 0 && (
        <div className="ui-card p-10 text-center" data-testid="exam-empty"><CalendarClock className="mx-auto mb-3 h-7 w-7 text-[#2B4BFF]" aria-hidden="true" />
          <p className="font-heading text-lg font-semibold">No exams scheduled for {scope.className}</p>
          <p className="mt-1 text-sm text-slate-500">{canEdit ? "Add the first exam and parents will see it straight away." : "Exam dates appear here once the school adds them."}</p></div>
      )}

      {groups.map(([term, list]) => (
        <section key={term} aria-label={term} data-testid={`exam-group-${term.replace(" ", "")}`}>
          <h2 className="mb-3 font-heading text-lg font-semibold">{term}</h2>
          <ol className="space-y-3">
            {list.map((ex) => {
              const d = new Date(`${ex.date}T00:00:00`), n = dayDiff(ex.date), b = when(n);
              return (
                <li key={ex.id} className={`ui-card hoverable flex items-center gap-4 p-3.5 pr-4 ${n < 0 ? "opacity-60" : ""}`} data-testid={`exam-${ex.id}`}>
                  <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl text-center leading-none ${n < 0 ? "bg-slate-100 text-slate-500" : "bg-gradient-to-br from-[#0B1020] to-[#1B2A7A] text-white"}`}>
                    <div><div className="font-heading text-xl font-semibold">{d.getDate()}</div><div className="mt-0.5 text-[10px] uppercase tracking-wider opacity-80">{d.toLocaleDateString("en-IN", { month: "short" })}</div></div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-heading font-semibold">{ex.subject}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-500">
                      <span>{d.toLocaleDateString("en-IN", { weekday: "long" })}</span>
                      {ex.start_time && <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{fmtTime(ex.start_time)}{ex.duration_min ? ` · ${ex.duration_min} min` : ""}</span>}
                      {ex.room && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{roomLabel(ex.room)}</span>}
                    </div>
                    {ex.note && <p className="mt-1 text-xs text-slate-500">{ex.note}</p>}
                  </div>
                  <span className={`pill text-xs font-medium ${b[1]}`}>{b[0]}</span>
                  {canEdit && <span className="flex gap-1.5">
                    <button type="button" className="ui-btn !px-2.5 !py-2 bg-white" onClick={() => open(ex)} aria-label={`Edit ${ex.subject}`}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                    <button type="button" className="ui-btn !px-2.5 !py-2 bg-white text-red-600" onClick={() => remove(ex)} aria-label={`Remove ${ex.subject}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button></span>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {form && (
        <Modal title={editingId ? "Edit exam" : "Add exam"} subtitle={scope.className} onClose={() => setForm(null)} onSubmit={save} testid="exam-form"
          footer={<><button type="button" className="ui-btn" onClick={() => setForm(null)}>Cancel</button><button type="submit" className="ui-btn btn-primary" disabled={busy} data-testid="exam-save">{busy ? "Saving…" : "Save exam"}</button></>}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="field-label">Term</span><select className="ui-input mt-1" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>{TERMS.map((t) => <option key={t}>{t}</option>)}</select></label>
              <label className="block"><span className="field-label">Subject *</span><input className="ui-input mt-1" required maxLength={80} list="exam-subjects" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} data-testid="exam-subject" />
                <datalist id="exam-subjects">{scope.subjects.map((s) => <option key={s} value={s} />)}</datalist></label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="block"><span className="field-label">Date *</span><div className="mt-1"><DateField className="ui-input" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div></label>
              <label className="block"><span className="field-label">Start time</span><input type="time" className="ui-input mt-1" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></label>
              <label className="block"><span className="field-label">Minutes</span><input type="number" min={10} max={600} className="ui-input mt-1" placeholder="90" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })} /></label>
            </div>
            <label className="block"><span className="field-label">Room</span><input className="ui-input mt-1" maxLength={40} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} /></label>
            <label className="block"><span className="field-label">Note for parents</span><textarea rows={2} maxLength={300} className="ui-input mt-1" placeholder="Syllabus: chapters 1 to 4. Bring a geometry box." value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          </div>
        </Modal>
      )}
    </div>
  );
}
