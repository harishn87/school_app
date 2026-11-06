import PageHero from "@/components/PageHero";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Save, X, Clock } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { fmtTime } from "@/lib/utils";
import useClassScope from "@/lib/useClassScope";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };
const TINTS = ["bg-[#EEF1FF] text-[#1B2A7A] border-[#CBD3FF]", "bg-emerald-50 text-emerald-800 border-emerald-200", "bg-amber-50 text-amber-900 border-amber-200", "bg-rose-50 text-rose-800 border-rose-200", "bg-violet-50 text-violet-800 border-violet-200", "bg-sky-50 text-sky-800 border-sky-200", "bg-teal-50 text-teal-800 border-teal-200"];
const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const isBreak = (s) => /^(break|lunch|recess|assembly|interval)/i.test(s.trim());
const tint = (s) => (isBreak(s) ? "bg-slate-100 text-slate-500 border-slate-200" : TINTS[hash(s.trim().toLowerCase()) % TINTS.length]);

const STANDARD = () => {
  const starts = ["09:00", "09:45", "10:30", "11:00", "11:45", "12:30", "13:15", "14:00"];
  const ends = ["09:45", "10:30", "11:00", "11:45", "12:30", "13:15", "14:00", "14:45"];
  return starts.map((s, i) => ({ start: s, end: ends[i] }));
};

export default function TimetablePage() {
  const { user } = useAuth();
  const scope = useClassScope();
  const canEdit = user?.role === "admin" || user?.role === "teacher";
  const [tt, setTt] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!scope.classId) { setTt(null); return; }
    try { setTt((await api.get("/timetable", { params: { class_id: scope.classId } })).data); } catch (_e) { setTt(null); }
  }, [scope.classId]);
  useEffect(() => { setDraft(null); load(); }, [load]);

  const edit = () => {
    const base = tt?.periods?.length ? tt : { periods: STANDARD(), days: Object.fromEntries(DAYS.map((d) => [d, []])) };
    setDraft({ periods: base.periods.map((p) => ({ ...p })), days: Object.fromEntries(DAYS.map((d) => [d, [...(base.days[d] || [])]])) });
  };
  const setCell = (d, i, v) => setDraft((x) => { const row = [...x.days[d]]; row[i] = v; return { ...x, days: { ...x.days, [d]: row } }; });
  const setPeriod = (i, k, v) => setDraft((x) => ({ ...x, periods: x.periods.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));
  const addPeriod = () => setDraft((x) => {
    const last = x.periods[x.periods.length - 1];
    const [h, m] = (last?.end || "09:00").split(":").map(Number);
    const end = h * 60 + m + 45, f = (n) => `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
    return { periods: [...x.periods, { start: last?.end || "09:00", end: f(end) }], days: Object.fromEntries(DAYS.map((d) => [d, [...x.days[d], ""]])) };
  });
  const dropPeriod = (i) => setDraft((x) => ({ periods: x.periods.filter((_, j) => j !== i), days: Object.fromEntries(DAYS.map((d) => [d, x.days[d].filter((_, j) => j !== i)])) }));
  const save = async () => {
    setSaving(true);
    try {
      const days = Object.fromEntries(DAYS.map((d) => [d, (draft.days[d] || []).slice(0, draft.periods.length)]));
      setTt((await api.put(`/timetable/${scope.classId}`, { periods: draft.periods, days })).data);
      setDraft(null); toast.success("Timetable saved");
    } catch (e) { toast.error(errorMessage(e)); }
    setSaving(false);
  };

  const todayIdx = new Date().getDay() - 1; // Mon = 0
  const today = DAYS[todayIdx] || null;
  const view = draft || tt;
  const hasData = !!view?.periods?.length;
  const listId = "tt-subjects";
  const suggestions = useMemo(() => [...new Set([...scope.subjects, "Break", "Lunch"])], [scope.subjects]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="timetable-page">
      <PageHero title="Timetable" subtitle={canEdit ? "The weekly period plan for each class. Parents see their child's class timetable." : "Your child's weekly period plan."}
        actions={canEdit && scope.classId && !draft && <button type="button" className="ui-btn btn-primary" onClick={edit} data-testid="tt-edit"><Pencil className="h-4 w-4" aria-hidden="true" />{hasData ? "Edit timetable" : "Set up timetable"}</button>} />

      {scope.picker && <div>{scope.picker}</div>}

      {scope.empty && <div className="ui-card p-8 text-center text-slate-500" data-testid="tt-none">{user?.role === "parent" ? "No class is linked to your children yet." : "No classes to show yet. Classes assigned to you appear here."}</div>}

      {scope.classId && !hasData && !draft && (
        <div className="ui-card p-10 text-center" data-testid="tt-empty"><Clock className="mx-auto mb-3 h-7 w-7 text-[#2B4BFF]" aria-hidden="true" />
          <p className="font-heading text-lg font-semibold">No timetable for {scope.className} yet</p>
          <p className="mt-1 text-sm text-slate-500">{canEdit ? "Set up the periods and subjects and parents will see them straight away." : "The school hasn't published it yet."}</p></div>
      )}

      {draft && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#E8ECFF] px-5 py-3 text-sm" data-testid="tt-editbar">
          <span>Editing <b>{scope.className}</b>. Type a subject in each box, or leave it empty for a free period.</span>
          <span className="flex gap-2">
            <button type="button" className="ui-btn bg-white" onClick={() => setDraft(null)}><X className="h-4 w-4" aria-hidden="true" />Cancel</button>
            <button type="button" className="ui-btn btn-primary" onClick={save} disabled={saving} data-testid="tt-save"><Save className="h-4 w-4" aria-hidden="true" />{saving ? "Saving…" : "Save timetable"}</button>
          </span>
        </div>
      )}

      {hasData && (
        <div className="ui-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm" data-testid="tt-table">
              <thead>
                <tr className="surface-midnight text-white">
                  <th scope="col" className="w-36 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/80">Period</th>
                  {DAYS.map((d) => (
                    <th key={d} scope="col" className={`px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider ${d === today ? "text-[#E9C46A]" : "text-white/80"}`}>
                      {FULL[d]}{d === today && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#E9C46A] align-middle" title="Today" />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.periods.map((p, i) => (
                  <tr key={i} className="[&>td]:border-b [&>td]:border-[#EEF0F6]">
                    <td className="bg-[#FAFBFE] px-4 py-2.5 align-middle">
                      {draft ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1"><input type="time" className="ui-input !w-[104px] !px-2 !py-1 text-xs" value={p.start} onChange={(e) => setPeriod(i, "start", e.target.value)} aria-label={`Period ${i + 1} start`} />
                            <button type="button" className="ml-auto text-slate-400 hover:text-rose-600" onClick={() => dropPeriod(i)} aria-label={`Remove period ${i + 1}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button></div>
                          <input type="time" className="ui-input !w-[104px] !px-2 !py-1 text-xs" value={p.end} onChange={(e) => setPeriod(i, "end", e.target.value)} aria-label={`Period ${i + 1} end`} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#EEF1FF] font-heading text-xs font-semibold text-[#2B4BFF]">{i + 1}</span>
                          <div className="leading-tight"><div className="font-medium tabular-nums">{fmtTime(p.start)}</div><div className="text-[11px] text-slate-400 tabular-nums">{fmtTime(p.end)}</div></div></div>
                      )}
                    </td>
                    {DAYS.map((d) => {
                      const v = (view.days[d] || [])[i] || "";
                      return (
                        <td key={d} className={`px-1.5 py-1.5 text-center ${d === today && !draft ? "bg-[#FFFBEF]" : ""}`}>
                          {draft
                            ? <input list={listId} className="ui-input !px-2 !py-1.5 text-center text-sm" value={v} maxLength={60} onChange={(e) => setCell(d, i, e.target.value)} aria-label={`${FULL[d]} period ${i + 1}`} />
                            : v ? <span className={`inline-block w-full rounded-xl border px-2 py-2 text-[13px] font-semibold ${tint(v)}`}>{v}</span> : <span className="text-slate-300">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {draft && (
            <div className="flex flex-wrap gap-2 border-t border-[#EEF0F6] p-3">
              <button type="button" className="ui-btn bg-white" onClick={addPeriod} disabled={draft.periods.length >= 12} data-testid="tt-add-period"><Plus className="h-4 w-4" aria-hidden="true" />Add period</button>
              <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
          )}
          {!draft && tt?.updated_at && <p className="border-t border-[#EEF0F6] px-4 py-2.5 text-xs text-slate-500">Last updated {new Date(tt.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}{tt.updated_by ? ` by ${tt.updated_by}` : ""}.</p>}
        </div>
      )}
    </div>
  );
}
