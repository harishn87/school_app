import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Save, CalendarCheck, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function AttendancePage() {
  const { user } = useAuth();
  const canMark = user?.role === "admin" || user?.role === "teacher";

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [classId, setClassId] = useState("");
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [marks, setMarks] = useState({}); // {student_id: status}
  const [saving, setSaving] = useState(false);

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

  const setStatus = (sid, status) => setMarks((m) => ({ ...m, [sid]: status }));

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
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  };

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

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="attendance-page">
      <div>
        <h1 className="font-heading text-2xl sm:text-[28px] font-semibold tracking-tight">Daily attendance</h1>
      </div>

      <div className="ui-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Mini label="Present" value={stats.present} color="bg-[#E6F8EE]" />
        <Mini label="Absent" value={stats.absent} color="bg-red-200" />
        <Mini label="Late" value={stats.late} color="bg-[#FEF3C7]" />
        <Mini label="Unmarked" value={stats.unmarked} color="bg-white" />
      </div>

      <div className="ui-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-3 font-heading font-semibold">Student</th>
                <th className="px-4 py-3 font-heading font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={2} className="px-4 py-10 text-center text-slate-500">No students for this filter.</td></tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-slate-100" data-testid={`attendance-row-${s.id}`}>
                  <td className="px-4 py-3">
                    <div className="font-bold">{s.first_name} {s.last_name}</div>
                    <div className="text-xs text-slate-500">Roll {s.roll_number || "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <StatusBtn current={marks[s.id]} value="present" onClick={() => canMark && setStatus(s.id, "present")} icon={CheckCircle2} bg="bg-[#E6F8EE]" />
                      <StatusBtn current={marks[s.id]} value="absent" onClick={() => canMark && setStatus(s.id, "absent")} icon={XCircle} bg="bg-red-200" />
                      <StatusBtn current={marks[s.id]} value="late" onClick={() => canMark && setStatus(s.id, "late")} icon={Clock} bg="bg-[#FEF3C7]" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, color }) {
  return (
    <div className={`ui-card p-4 ${color}`}>
      <div className="text-xs font-medium">{label}</div>
      <div className="font-heading text-3xl font-semibold tracking-tight mt-1">{value}</div>
    </div>
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
