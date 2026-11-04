import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, XCircle, Clock, Save, Search, Users, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import PageHero from "@/components/PageHero";
import SchoolMonthCalendar from "@/components/SchoolMonthCalendar";
import YearAttendance from "@/components/YearAttendance";

const OPTS = [
  { v: "present", label: "Present", icon: CheckCircle2, on: "bg-emerald-500 text-white border-emerald-500 shadow-sm", off: "hover:bg-emerald-50 hover:border-emerald-300" },
  { v: "absent", label: "Absent", icon: XCircle, on: "bg-rose-500 text-white border-rose-500 shadow-sm", off: "hover:bg-rose-50 hover:border-rose-300" },
  { v: "late", label: "Late", icon: Clock, on: "bg-amber-400 text-amber-950 border-amber-400 shadow-sm", off: "hover:bg-amber-50 hover:border-amber-300" },
];
const rollKey = (s) => (/^\d+$/.test(String(s.roll_number || "")) ? Number(s.roll_number) : 9999);

/** Teacher's attendance: your classes first, then every student in the chosen class to mark present, absent or late. */
export default function TeacherAttendance() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const today = new Date().toLocaleDateString("en-CA");
  const date = params.get("date") || today;
  const classId = params.get("class") || "";
  const setParam = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n); };

  const [day, setDay] = useState(null);          // /attendance/day: my classes with marking progress for the date
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({});
  const [saved, setSaved] = useState({});
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const loadDay = useCallback(async () => {
    try { setDay((await api.get("/attendance/day", { params: { date } })).data); } catch (_e) { setDay({ classes: [], holiday: null }); }
  }, [date]);
  useEffect(() => { loadDay(); }, [loadDay, refresh]);

  useEffect(() => {
    if (!classId) return;
    let live = true;
    setStudents([]); setMarks({}); setSaved({});
    (async () => {
      try {
        const [{ data: s }, { data: a }] = await Promise.all([
          api.get("/students", { params: { class_id: classId, status: "active" } }),
          api.get("/attendance", { params: { date, class_id: classId } }),
        ]);
        if (!live) return;
        const m = {};
        for (const r of a) m[r.student_id] = r.status;
        setStudents([...s].sort((x, y) => rollKey(x) - rollKey(y) || x.first_name.localeCompare(y.first_name)));
        setMarks(m); setSaved(m);
      } catch (_e) { toast.error("Could not load this class"); }
    })();
    return () => { live = false; };
  }, [classId, date, refresh]);

  const cls = day?.classes?.find((c) => c.class_id === classId);
  const counts = useMemo(() => {
    const o = { present: 0, absent: 0, late: 0, unmarked: 0 };
    for (const s of students) o[marks[s.id] || "unmarked"]++;
    return o;
  }, [students, marks]);
  const dirty = students.some((s) => (marks[s.id] || null) !== (saved[s.id] || null));
  const shown = students.filter((s) => !q.trim() || `${s.first_name} ${s.last_name} ${s.roll_number || ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const isSunday = new Date(`${date}T00:00:00`).getDay() === 0;

  const save = async () => {
    const list = students.filter((s) => marks[s.id]).map((s) => ({ student_id: s.id, status: marks[s.id] }));
    if (list.length === 0) { toast.error("Mark at least one student"); return; }
    setSaving(true);
    try {
      await api.post("/attendance/batch", { date, class_id: classId, marks: list });
      toast.success(counts.unmarked ? `Saved for ${list.length} students. ${counts.unmarked} still not marked.` : `Attendance saved for ${cls?.class_name || "the class"}`);
      setRefresh((n) => n + 1);
    } catch (e) { toast.error(errorMessage(e) || "Could not save"); }
    setSaving(false);
  };

  const dateField = (
    <label className="block"><span className="field-label">Date</span>
      <input type="date" className="ui-input mt-1" max={today} value={date} onChange={(e) => setParam("date", e.target.value === today ? "" : e.target.value)} data-testid="ta-date" /></label>
  );

  // ---------- step 1: pick one of my classes ----------
  if (!classId) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="attendance-page">
        <PageHero title="Daily attendance" subtitle="Pick one of your classes to mark who is present, absent or late." />
        <div className="ui-card p-4 flex flex-wrap items-end gap-4">
          {dateField}
          {day?.holiday && <span className="pill bg-slate-100 text-slate-700 text-sm px-3 py-1.5">Holiday: {day.holiday}</span>}
          {isSunday && <span className="pill bg-slate-100 text-slate-700 text-sm px-3 py-1.5">Sunday</span>}
        </div>

        {!day ? <div className="ui-card p-6 text-slate-500">Loading your classes…</div>
          : day.classes.length === 0 ? <div className="ui-card p-8 text-center text-slate-500" data-testid="ta-no-classes">You have no class assigned yet. Ask the principal to assign you a class.</div>
          : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger" data-testid="ta-classes">
              {day.classes.map((c) => {
                const marked = c.present + c.late + c.absent;
                const done = c.total > 0 && c.unmarked === 0;
                return (
                  <button key={c.class_id} type="button" onClick={() => setParam("class", c.class_id)} data-testid={`ta-class-${c.class_id}`}
                    className={`ui-card hoverable text-left p-5 border-t-4 ${done ? "border-t-emerald-500" : marked ? "border-t-amber-400" : "border-t-slate-300"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div><h3 className="font-heading text-xl font-semibold">{c.class_name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5 inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true" />{c.total} students</p></div>
                      <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden="true" />
                    </div>
                    {done ? (
                      <div className="mt-4">
                        <span className="pill bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-medium px-2.5 py-1">Marked</span>
                        <div className="mt-2 text-sm text-slate-600"><b className="text-emerald-600">{c.present}</b> present · <b className="text-rose-600">{c.absent}</b> absent · <b className="text-amber-600">{c.late}</b> late</div>
                      </div>
                    ) : (
                      <div className="mt-4">
                        <span className="pill bg-amber-50 text-amber-800 border border-amber-200 text-xs font-medium px-2.5 py-1">{marked ? `${c.unmarked} not marked` : "Not marked yet"}</span>
                        <div className="mt-2 text-sm font-medium text-[#2B4BFF]">{marked ? "Finish marking" : "Mark attendance"}</div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

        <SchoolMonthCalendar classId="" selected={date} onPick={(d) => navigate(`/app/attendance/day/${d}`)} refreshKey={refresh} />
        <YearAttendance />
      </div>
    );
  }

  // ---------- step 2: every student in the chosen class ----------
  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-up pb-24" data-testid="attendance-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="ui-btn bg-white text-sm" onClick={() => setParam("class", "")} data-testid="ta-back"><ArrowLeft className="h-4 w-4" aria-hidden="true" />My classes</button>
        <div className="flex flex-wrap items-end gap-3">{dateField}</div>
      </div>

      <section className="surface-midnight rounded-3xl px-6 py-6 text-white">
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold" data-testid="ta-class-title">{cls?.class_name || "Class"}</h1>
        <p className="text-sm text-slate-300 mt-1">{new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{day?.holiday ? ` · Holiday: ${day.holiday}` : isSunday ? " · Sunday" : ""}</p>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center" data-testid="ta-counts">
          {[["Present", counts.present, "bg-emerald-500"], ["Absent", counts.absent, "bg-rose-500"], ["Late", counts.late, "bg-amber-400"], ["Not marked", counts.unmarked, "bg-slate-400"]].map(([l, n, c]) => (
            <div key={l} className="rounded-xl bg-white/10 px-2 py-2.5"><div className="font-heading text-2xl font-semibold tabular-nums">{n}</div><div className="text-[11px] text-slate-300 inline-flex items-center gap-1.5"><i className={`h-2 w-2 rounded-full ${c}`} />{l}</div></div>
          ))}
        </div>
      </section>

      <div className="ui-card p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]"><Search className="h-4 w-4 absolute left-3 top-3.5 text-slate-400" aria-hidden="true" />
          <input className="ui-input pl-9" placeholder="Find a student" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a student" data-testid="ta-search" /></div>
        <button type="button" className="ui-btn btn-soft-green" onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.id, "present"])))} data-testid="ta-all-present"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Mark all present</button>
      </div>

      <ul className="ui-card divide-y divide-[#EEF0F6] overflow-hidden" data-testid="ta-students">
        {students.length === 0 && <li className="p-8 text-center text-slate-500">No students in this class yet.</li>}
        {shown.map((s) => {
          const cur = marks[s.id];
          return (
            <li key={s.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2" data-testid={`ta-row-${s.id}`}>
              <div className="h-10 w-10 shrink-0 grid place-items-center rounded-full bg-[#E8ECFF] text-[#2B4BFF] font-heading font-semibold text-sm">{s.first_name?.[0]}{s.last_name?.[0]}</div>
              <div className="min-w-0 flex-1 basis-40"><div className="font-bold truncate">{s.first_name} {s.last_name}</div><div className="text-xs text-slate-500">Roll {s.roll_number || "—"}</div></div>
              <div className="flex gap-2" role="group" aria-label={`Attendance for ${s.first_name}`}>
                {OPTS.map((o) => (
                  <button key={o.v} type="button" aria-pressed={cur === o.v} data-testid={`ta-mark-${s.id}-${o.v}`}
                    onClick={() => setMarks((m) => ({ ...m, [s.id]: o.v }))}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-all active:scale-95 ${cur === o.v ? o.on : `bg-white border-slate-200 text-slate-600 ${o.off}`}`}>
                    <o.icon className="h-4 w-4" aria-hidden="true" />{o.label}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="fixed bottom-20 lg:bottom-4 left-0 right-0 z-30 pointer-events-none">
        <div className="max-w-4xl mx-auto px-4 lg:pl-[17rem] flex justify-end pointer-events-none">
          <button type="button" onClick={save} disabled={saving || !dirty} className="ui-btn btn-primary shadow-xl pointer-events-auto" data-testid="ta-save">
            <Save className="h-4 w-4" aria-hidden="true" />{saving ? "Saving…" : dirty ? `Save attendance${counts.unmarked ? ` (${counts.unmarked} not marked)` : ""}` : "All saved"}
          </button>
        </div>
      </div>
    </div>
  );
}
