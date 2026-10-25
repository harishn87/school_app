import PageHero from "@/components/PageHero";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Plus, Search, Eye } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import MovementWheel from "@/components/MovementWheel";
import YearSelect, { useAcademicYears } from "@/components/YearSelect";
import StudentFormModal from "@/components/StudentFormModal";

export default function StudentsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "teacher";

  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [q, setQ] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [params, setParams] = useSearchParams();
  const move = params.get("move") || "";
  const ys = useAcademicYears();
  const yr = params.get("year") || ys.current;
  const [mv, setMv] = useState(null);
  const [everyone, setEveryone] = useState([]);
  const setMove = (m) => {
    const n = new URLSearchParams(params);
    if (!m || m === move) n.delete("move"); else n.set("move", m);
    setParams(n);
  };
  const setYr = (y) => {
    const n = new URLSearchParams(params);
    if (y && y !== ys.current) n.set("year", y); else n.delete("year");
    setParams(n);
  };

  useEffect(() => {
    if (!canEdit || !yr) return;
    api.get("/students/movement", { params: { academic_year: yr } }).then((r) => setMv(r.data)).catch(() => setMv(null));
    api.get("/students").then((r) => setEveryone(r.data)).catch(() => {});
  }, [canEdit, yr, students.length]);

  const load = useCallback(async () => {
    const params = {};
    if (q) params.q = q;
    if (classFilter) params.class_id = classFilter;
    if (statusFilter) params.status = statusFilter;
    const { data } = await api.get("/students", { params });
    setStudents(data);
  }, [q, classFilter, statusFilter]);
  const loadClasses = async () => {
    const { data } = await api.get("/classes");
    setClasses(data);
  };

  useEffect(() => { loadClasses(); }, []);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const cy = mv?.years?.find((y) => y.year === yr);
  const continuing = Math.max((mv?.active || 0) - (mv?.joined_list || []).filter((j) => j.status === "active").length, 0);
  const moveRows = useMemo(() => {
    if (!move || !mv) return null;
    const ids = new Set([...(move !== "left" ? mv.joined_list : []), ...(move !== "joined" ? mv.left_list : [])].map((r) => r.id));
    const needle = q.trim().toLowerCase();
    return everyone.filter((s) => ids.has(s.id) && (!classFilter || s.class_id === classFilter)
      && (!needle || `${s.first_name} ${s.last_name} ${s.roll_number || ""} ${s.guardian_name || ""}`.toLowerCase().includes(needle)));
  }, [move, mv, everyone, q, classFilter]);
  const rows = moveRows || students;

  const classMap = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c])), [classes]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="students-page">
      <PageHero title="Student directory" subtitle="Search every student, see their class and guardian, and open a profile with grades, attendance and fees."
        actions={canEdit && (
          <button data-testid="add-student-btn" onClick={() => setShowForm(true)} className="ui-btn btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" /> New student
          </button>
        )} />

      {canEdit && mv && cy && (
        <section className="ui-card p-4 sm:p-5 flex flex-wrap items-center gap-5" data-testid="movement-card">
          <MovementWheel joined={cy.joined} left={cy.left} continuing={continuing} active={move === "both" ? undefined : move} onSelect={(k) => (k === "continuing" ? setMove("") : setMove(k))} />
          <div className="min-w-[200px] flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading font-semibold text-lg">Joined and left · {yr}</h2>
              <YearSelect chips years={ys.years} current={ys.current} value={yr} onChange={setYr} id="mv-year" />
            </div>
            {[["joined", "Joined", cy.joined, "bg-emerald-500"], ["left", "Left", cy.left, "bg-rose-500"], ["both", "Both lists", new Set([...mv.joined_list, ...mv.left_list].map((r) => r.id)).size, "bg-[#2B4BFF]"]].map(([k, l, v, c]) => (
              <button key={k} type="button" onClick={() => setMove(k)} aria-pressed={move === k} data-testid={`movement-${k}`}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition hover:bg-[#F1F4FF] ${move === k ? "bg-[#E8ECFF] ring-1 ring-[#2B4BFF]" : "bg-[#F7F8FC]"}`}>
                <span className="inline-flex items-center gap-2"><i className={`h-2.5 w-2.5 rounded-full ${c}`} />{l}</span><b className="tabular-nums">{v}</b>
              </button>
            ))}
            <p className="text-xs text-slate-500">Click the wheel or a row to list those students below.</p>
          </div>
        </section>
      )}

      {move && moveRows && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#E8ECFF] px-5 py-3 text-sm" data-testid="movement-banner">
          <span>Showing <b>{moveRows.length}</b> {move === "joined" ? "new joiners" : move === "left" ? "students who left" : "joiners and leavers"} in {yr}.</span>
          <button type="button" className="font-medium text-[#2B4BFF] hover:underline" onClick={() => setMove("")} data-testid="movement-clear">Show everyone</button>
        </div>
      )}

      <div className="ui-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative md:col-span-2">
          <Search className="h-4 w-4 absolute left-3 top-3.5 text-slate-400" aria-hidden="true" />
          <input
            data-testid="students-search-input"
            className="ui-input pl-9"
            placeholder="Search name, roll no, guardian…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select data-testid="students-class-filter" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="ui-input">
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name} {c.section}</option>
          ))}
        </select>
        <select data-testid="students-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="ui-input">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="left">Left</option>
        </select>
      </div>

      <div className="ui-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-3 font-heading font-semibold">Student</th>
                <th className="px-4 py-3 font-heading font-semibold">Class</th>
                <th className="px-4 py-3 font-heading font-semibold">Joining</th>
                <th className="px-4 py-3 font-heading font-semibold">Leaving</th>
                <th className="px-4 py-3 font-heading font-semibold">Guardian</th>
                <th className="px-4 py-3 font-heading font-semibold">Status</th>
                <th className="px-4 py-3 font-heading font-semibold"></th>
              </tr>
            </thead>
            <tbody data-testid="students-table-body">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">No students found.</td>
                </tr>
              )}
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`student-row-${s.id}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {s.photo_base64 ? (
                        <img src={s.photo_base64} alt="" className="h-10 w-10 rounded-lg border border-slate-200 object-cover" />
                      ) : (
                        <div className="h-10 w-10 grid place-items-center bg-[#E8ECFF] text-[#2B4BFF] rounded-lg font-heading font-semibold">
                          {s.first_name?.[0]}{s.last_name?.[0]}
                        </div>
                      )}
                      <div>
                        <div className="font-bold">{s.first_name} {s.last_name}</div>
                        <div className="text-xs text-slate-500">Roll {s.roll_number || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {classMap[s.class_id] ? `${classMap[s.class_id].name} ${classMap[s.class_id].section || ""}` : "—"}
                  </td>
                  <td className="px-4 py-3">{s.joining_date || "—"}</td>
                  <td className="px-4 py-3">{s.leaving_date || "—"}</td>
                  <td className="px-4 py-3">
                    <div>{s.guardian_name || "—"}</div>
                    <div className="text-xs text-slate-500">{s.guardian_phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full font-medium text-xs capitalize ${s.status === "active" ? "bg-[#E6F8EE] text-green-800" : "bg-slate-100 text-slate-600"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/app/students/${s.id}`} data-testid={`view-student-${s.id}`} className="ui-btn !p-2 bg-white">
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <StudentFormModal
          classes={classes}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); toast.success("Student added"); }}
        />
      )}
    </div>
  );
}
