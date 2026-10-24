import PageHero from "@/components/PageHero";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Save, CalendarCheck, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import SchoolMonthCalendar from "@/components/SchoolMonthCalendar";
import MonthCalendar from "@/components/MonthCalendar";
import YearAttendance from "@/components/YearAttendance";

export default function AttendancePage() {
  const { user } = useAuth();
  const canMark = user?.role === "teacher"; // only class teachers mark; the principal views
  const isParent = user?.role === "parent";

  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [date, setDate] = useState(params.get("date") || new Date().toLocaleDateString("en-CA"));
  const [classId, setClassId] = useState(params.get("class") || "");
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({}); // {student_id: status}
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [kid, setKid] = useState("");
  const [tile, setTile] = useState(null); // null | present | absent | late | unmarked | all
  const [touched, setTouched] = useState({}); // rows edited since the tile was chosen stay visible
  const listRef = useRef(null);
  const pickTile = (k) => { setTile((t) => (t === k ? null : k)); setTouched({}); if (tile !== k) setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  const loadCore = async () => {
    const [{ data: c }, { data: s }] = await Promise.all([api.get("/classes"), api.get("/students", { params: { status: "active" } })]);
    setClasses(c);
    setStudents(s);
  };
  useEffect(() => { loadCore(); }, []);

  // Load existing attendance whenever date/class changes
  useEffect(() => {
    (async () => {
      try {
        const params = { date };
        if (classId) params.class_id = classId;
        const { data } = await api.get("/attendance", { params });
        const map = {};
        for (const r of data) map[r.student_id] = r.status;
        setMarks(map);
      } catch (_e) { /* ignore */ }
    })();
  }, [date, classId]);

  const filtered = useMemo(
    () => students.filter((s) => !classId || s.class_id === classId),
    [students, classId]
  );

  const setStatus = (sid, status) => { setTouched((t) => ({ ...t, [sid]: true })); setMarks((m) => ({ ...m, [sid]: status })); };

  const markAll = (status) => {
    const next = { ...marks };
    for (const s of filtered) next[s.id] = status;
    setMarks(next);
  };

  const save = async () => {
    const payload = {
      date,
      class_id: classId || null,
      marks: filtered.filter((s) => marks[s.id]).map((s) => ({ student_id: s.id, status: marks[s.id] })),
    };
    if (payload.marks.length === 0) { toast.error("Mark at least one student"); return; }
    setSaving(true);
    try {
      await api.post("/attendance/batch", payload);
      toast.success(`Saved attendance for ${payload.marks.length} students`);
      setRefresh((n) => n + 1);
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  };

  const visible = useMemo(() => {
    if (!tile) return [];
    if (tile === "all") return filtered;
    return filtered.filter((s) => touched[s.id] || (tile === "unmarked" ? !marks[s.id] : marks[s.id] === tile));
  }, [filtered, marks, tile, touched]);

  const stats = useMemo(() => {
    const out = { present: 0, absent: 0, late: 0, unmarked: 0 };
    for (const s of filtered) {
      const st = marks[s.id];
      if (st === "present") out.present++;
      else if (st === "absent") out.absent++;
      else if (st === "late") out.late++;
      else out.unmarked++;
    }
    return out;
  }, [filtered, marks]);

  if (isParent) {
    const mine = filtered;
    const cur = kid || mine[0]?.id || "";
    return (
      <div className="max-w-3xl mx-auto space-y-5 animate-fade-up" data-testid="attendance-page">
        <h1 className="font-heading text-2xl sm:text-[28px] font-semibold tracking-tight">Attendance</h1>
        {mine.length > 1 && (
          <select className="ui-input" value={cur} onChange={(e) => setKid(e.target.value)} aria-label="Child" data-testid="attendance-child">
            {mine.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
        )}
        {cur ? <><MonthCalendar key={cur} studentId={cur} /><YearAttendance key={`y${cur}`} studentId={cur} /></> : <div className="ui-card p-8 text-center text-slate-500">No students are linked to your account yet.</div>}
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="attendance-page">
      <PageHero title="Daily attendance" subtitle={canMark ? "Mark your class in a few taps, or click any date on the calendar to see every class for that day." : "See who is in school. Class teachers mark attendance; click any date on the calendar to see every class for that day."} />

      <div className="ui-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end" data-testid="attendance-filters">
        <div>
          <label className="field-label">Date</label>
          <input type="date" className="ui-input mt-1" value={date} onChange={(e) => setDate(e.target.value)} data-testid="attendance-date" />
        </div>
        <div>
          <label className="field-label">Class</label>
          <select className="ui-input mt-1" value={classId} onChange={(e) => setClassId(e.target.value)} data-testid="attendance-class">
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
          </select>
        </div>
        {canMark && (
          <>
            <button onClick={() => markAll("present")} className="ui-btn btn-soft-green"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Mark all present</button>
            <button onClick={save} disabled={saving} className="ui-btn btn-primary" data-testid="attendance-save-btn">
              <Save className="h-4 w-4" aria-hidden="true" /> {saving ? "Saving…" : "Save"}
            </button>
          </>
        )}
      </div>

      <SchoolMonthCalendar classId={classId} selected={date} onPick={(d) => navigate(`/app/attendance/day/${d}${classId ? `?class=${classId}` : ""}`)} refreshKey={refresh} />

      <YearAttendance classId={classId} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" role="group" aria-label="Filter students by attendance status">
        <Mini label="Present" value={stats.present} color="bg-emerald-500" active={tile === "present"} onClick={() => pickTile("present")} testid="tile-present" />
        <Mini label="Absent" value={stats.absent} color="bg-rose-500" active={tile === "absent"} onClick={() => pickTile("absent")} testid="tile-absent" />
        <Mini label="Late" value={stats.late} color="bg-amber-400" active={tile === "late"} onClick={() => pickTile("late")} testid="tile-late" />
        <Mini label="Unmarked" value={stats.unmarked} color="bg-slate-300" active={tile === "unmarked"} onClick={() => pickTile("unmarked")} testid="tile-unmarked" />
      </div>

      <div ref={listRef} />
      {!tile && (
        <div className="ui-card p-8 text-center text-slate-500" data-testid="attendance-prompt">
          Pick Present, Absent, Late or Unmarked above to see those students.
          <div className="mt-3"><button type="button" className="ui-btn btn-primary" onClick={() => pickTile("all")} data-testid="tile-all">Show every student</button></div>
        </div>
      )}
      {tile && <div className="ui-card overflow-hidden">
        <div className="px-5 py-3 border-b border-[#EEF0F6] flex items-center justify-between">
          <h3 className="font-heading font-semibold" data-testid="attendance-list-title">{tile === "all" ? "All students" : tile === "unmarked" ? "Not marked yet" : `Marked ${tile}`} <span className="text-slate-400 font-normal">({visible.length})</span></h3>
          <button type="button" className="text-sm font-medium text-[#2B4BFF] hover:underline" onClick={() => pickTile(tile)}>Hide list</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-3 font-heading font-semibold">Student</th>
                <th className="px-4 py-3 font-heading font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={2} className="px-4 py-10 text-center text-slate-500">No students in this group.</td></tr>
              )}
              {visible.map((s) => (
                <tr key={s.id} className="border-b border-slate-100" data-testid={`attendance-row-${s.id}`}>
                  <td className="px-4 py-3">
                    <div className="font-bold">{s.first_name} {s.last_name}</div>
                    <div className="text-xs text-slate-500">Roll {s.roll_number || "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {canMark ? (<>
                        <StatusBtn current={marks[s.id]} value="present" onClick={() => setStatus(s.id, "present")} icon={CheckCircle2} bg="bg-[#E6F8EE]" />
                        <StatusBtn current={marks[s.id]} value="absent" onClick={() => setStatus(s.id, "absent")} icon={XCircle} bg="bg-red-200" />
                        <StatusBtn current={marks[s.id]} value="late" onClick={() => setStatus(s.id, "late")} icon={Clock} bg="bg-[#FEF3C7]" />
                      </>) : (
                        <span className={`pill capitalize ${{ present: "bg-emerald-50 text-emerald-700", absent: "bg-rose-50 text-rose-700", late: "bg-amber-50 text-amber-700" }[marks[s.id]] || "bg-slate-100 text-slate-600"}`} data-testid={`status-${s.id}`}>{marks[s.id] || "Not marked"}</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  );
}

function Mini({ label, value, color, active, onClick, testid }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} data-testid={testid}
      className={`ui-card p-4 flex gap-3 text-left w-full transition hover:-translate-y-0.5 ${active ? "ring-2 ring-[#2B4BFF]" : ""}`}>
      <span className={`w-1.5 rounded-full shrink-0 ${color}`} aria-hidden="true" />
      <div><div className="text-sm text-slate-500">{label}</div>
      <div className="font-heading text-3xl font-semibold tracking-tight mt-0.5 tabular-nums">{value}</div></div>
    </button>
  );
}

function StatusBtn({ current, value, onClick, icon: Icon, bg }) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`mark-${value}`}
      className={`inline-flex items-center gap-1 px-3 py-1 border border-slate-200 rounded-full font-medium text-xs capitalize transition-all ${active ? `${bg} shadow-sm` : "bg-white hover:bg-slate-50"}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {value}
    </button>
  );
}
