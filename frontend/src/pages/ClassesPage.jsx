import PageHero from "@/components/PageHero";
import Modal from "@/components/Modal";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { Link, useNavigate } from "react-router-dom";
import WagonWheel from "@/components/WagonWheel";
import { Plus, Pencil, Trash2, Phone, UserRound, LayoutGrid, PieChart } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

// PP1, PP2, then Class 1 ... Class 10 in school order (plain alphabetical would put Class 10 before Class 2)
const rank = (n = "") => {
  const m = n.match(/\d+/); const num = m ? Number(m[0]) : 0;
  return (/^(pp|nursery|lkg|ukg|kg)/i.test(n.trim()) ? 0 : 100) + num;
};
const schoolOrder = (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name) || (a.section || "").localeCompare(b.section || "");

const initials = (n = "") => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const badge = (c) => { const m = (c.name || "").match(/\d+/); const pre = /^(pp|nursery|lkg|ukg|kg)/i.test((c.name || "").trim()) ? (c.name.match(/^[A-Za-z]+/)?.[0] || "").toUpperCase().slice(0, 2) : ""; return `${pre}${m ? m[0] : (c.name || "?")[0]}${(c.section || "").slice(0, 1)}`.toUpperCase(); };

/** A small progress ring with the value in the middle. */
function MiniRing({ value, label, warn, testid }) {
  const r = 22, c = 2 * Math.PI * r, v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const color = value == null ? "#D8DCEE" : warn ? "#D98E04" : "#2B4BFF";
  return (
    <div className="flex flex-col items-center gap-1" data-testid={testid}>
      <div className="relative h-14 w-14">
        <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90" role="img" aria-label={`${label} ${value == null ? "no data" : value + "%"}`}>
          <circle cx="28" cy="28" r={r} fill="none" stroke="#E8ECFF" strokeWidth="6" />
          {value != null && <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />}
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[13px] font-semibold tabular-nums">{value == null ? "-" : `${value}%`}</span>
      </div>
      <span className="text-[11px] text-slate-500">{label}</span>
    </div>
  );
}

export default function ClassesPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("cards");   // cards | wheel
  const [wm, setWm] = useState("attendance");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [classes, setClasses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", section: "", academic_year: "", teacher_id: "", secondary_teacher_id: "", attender_name: "", attender_phone: "" });
  const [teachers, setTeachers] = useState([]);
  const [stats, setStats] = useState({});

  const load = async () => {
    const { data } = await api.get("/classes");
    setClasses([...data].sort(schoolOrder));
    api.get("/dashboard/overview").then((r) => setStats(Object.fromEntries(r.data.classes.filter((c) => c.class_id).map((c) => [c.class_id, c])))).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (user?.role === "parent") return;
    api.get("/users").then((r) => setTeachers(r.data.filter((u) => u.role !== "parent" && u.active))).catch(() => {});
  }, [user?.role]);
  const teacherName = (id) => teachers.find((t) => t.id === id)?.name;
  const EMPTY = { name: "", section: "", academic_year: "", teacher_id: "", secondary_teacher_id: "", attender_name: "", attender_phone: "" };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, academic_year: new Date().getFullYear().toString() });
    setShowForm(true);
  };
  const openEdit = (c) => {
    setEditing(c);
    setForm({ name: c.name || "", section: c.section || "", academic_year: c.academic_year || "", teacher_id: c.teacher_id || "",
      secondary_teacher_id: c.secondary_teacher_id || "", attender_name: c.attender_name || "", attender_phone: c.attender_phone || "" });
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      if (!form.teacher_id) { toast.error("Please choose the primary class teacher"); return; }
      const body = { ...form, secondary_teacher_id: form.secondary_teacher_id || null,
        attender_name: form.attender_name.trim() || null, attender_phone: form.attender_phone.trim() || null };
      if (editing) await api.put(`/classes/${editing.id}`, body);
      else await api.post("/classes", body);
      toast.success(editing ? "Class updated" : "Class created");
      setShowForm(false);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.name}? Its students will become unassigned.`)) return;
    try {
      await api.delete(`/classes/${c.id}`);
      toast.success("Class deleted");
      load();
    } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="classes-page">
      <PageHero title={isAdmin ? "All classes" : "My classes"} subtitle="Class teachers, attenders and live attendance, grades and fee dues for every class. Click a class name to open it."
        actions={isAdmin && (
          <button data-testid="add-class-btn" onClick={openCreate} className="ui-btn btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" /> New class
          </button>
        )} />

      {classes.length > 0 && (() => {
        const all = Object.values(stats);
        const students = all.reduce((a, x) => a + (x.students || 0), 0);
        const wavg = (k) => { const w = all.filter((x) => x[k] != null && x.students); const n = w.reduce((a, x) => a + x.students, 0); return n ? Math.round(w.reduce((a, x) => a + x[k] * x.students, 0) / n) : null; };
        const noTeacher = classes.filter((c) => !c.teacher_id).length;
        const tiles = [["Classes", classes.length, isAdmin && noTeacher ? `${noTeacher} without a class teacher` : "All have a class teacher"], ["Students", students, "Across all classes"],
          ["Attendance", wavg("attendance_pct") == null ? "-" : `${wavg("attendance_pct")}%`, "Last 30 days"], ["Average grade", wavg("grade_avg") == null ? "-" : `${wavg("grade_avg")}%`, "From academics"]];
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger" data-testid="classes-summary">
            {tiles.map(([l, v, n]) => (
              <div key={l} className="ui-card p-5">
                <div className="text-sm text-slate-500">{l}</div>
                <div className="font-heading text-3xl font-semibold mt-1 tabular-nums">{v}</div>
                <div className="text-xs text-slate-500 mt-1">{n}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {classes.length > 2 && (
        <div className="flex justify-end">
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Classes view">
            {[["cards", "Cards", LayoutGrid], ["wheel", "Wheel", PieChart]].map(([k, l, Icon]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} data-testid={`classes-mode-${k}`}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium ${mode === k ? "bg-white text-[#2B4BFF] shadow-sm" : "text-slate-600"}`}><Icon className="h-4 w-4" aria-hidden="true" />{l}</button>
            ))}
          </div>
        </div>
      )}

      {mode === "wheel" && classes.length > 2 && (
        <div className="ui-card p-5" data-testid="classes-wheel-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-heading text-xl font-semibold">Every class on one wheel</h2><p className="text-xs text-slate-500 mt-0.5">Click a class to open it.</p></div>
            <div className="flex gap-1.5">
              {[["attendance", "Attendance"], ["grade", "Grades"], ...(isAdmin ? [["fees", "Fees collected"]] : [])].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setWm(k)} aria-pressed={wm === k}
                  className={`pill px-3 py-1 text-xs font-medium ${wm === k ? "bg-[#2B4BFF] text-white" : "bg-[#F1F4FF] text-[#3A4160]"}`}>{l}</button>
              ))}
            </div>
          </div>
          <div className="max-w-2xl mx-auto">
            <WagonWheel testid="classes-wheel" title={{ attendance: "Attendance", grade: "Grades", fees: "Fees collected" }[wm]}
              items={classes.map((c) => { const st = stats[c.id] || {}; return { label: `${c.name} ${c.section || ""}`.trim(), id: c.id,
                value: wm === "attendance" ? st.attendance_pct ?? null : wm === "grade" ? st.grade_avg ?? null : (st.fees_total ? Math.round((st.fees_paid / st.fees_total) * 100) : null) }; })}
              onSelect={(it) => navigate(`/app/classes/${it.id}`)} hint="Click a class to open it." />
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger ${mode === "wheel" ? "hidden" : ""}`}>
        {classes.length === 0 && (
          <div className="ui-card p-8 col-span-full text-center text-slate-600">
            No classes yet. {isAdmin && "Click \"New class\" to create one."}
          </div>
        )}
        {classes.map((c) => {
          const st = stats[c.id] || { students: 0 };
          const feePct = st.fees_total ? Math.round((st.fees_paid / st.fees_total) * 100) : null;
          const tName = teacherName(c.teacher_id);
          return (
            <article key={c.id} className="ui-card hoverable group overflow-hidden flex flex-col relative cursor-pointer focus-within:ring-2 focus-within:ring-[#2B4BFF]" data-testid={`class-card-${c.id}`}>
              <div className="surface-midnight ruled-light px-5 py-4 text-white">
                <div className="flex items-center gap-3">
                  <div className="h-12 min-w-[3rem] px-2 shrink-0 grid place-items-center rounded-xl bg-gradient-to-br from-[#2B4BFF] to-[#1B2FB8] font-heading font-semibold text-lg shadow-lg shadow-[#2B4BFF]/30">{badge(c)}</div>
                  <div className="min-w-0">
                    <h3 className="font-heading text-xl font-semibold leading-tight truncate">
                      <Link to={`/app/classes/${c.id}`} className="after:absolute after:inset-0 after:z-0 focus:outline-none" data-testid={`open-class-${c.id}`} aria-label={`Open ${c.name} section ${c.section || ""}`}>{c.name}</Link>
                    </h3>
                    <div className="text-sm text-white/70">Section {c.section || "-"}{c.academic_year ? ` · ${c.academic_year}` : ""}</div>
                  </div>
                </div>
                {isAdmin && (
                  <div className="absolute top-3 right-3 z-10 flex gap-1.5 opacity-70 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(c)} className="h-8 w-8 grid place-items-center rounded-lg bg-white/10 hover:bg-white/20" aria-label={`Edit ${c.name}`} data-testid={`edit-class-${c.id}`}><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                    <button onClick={() => remove(c)} className="h-8 w-8 grid place-items-center rounded-lg bg-white/10 hover:bg-rose-500/80" aria-label={`Delete ${c.name}`} data-testid={`delete-class-${c.id}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                )}
              </div>

              <div className="p-5 flex-1 flex flex-col gap-4">
                <div className="flex items-end justify-between" data-testid={`class-stats-${c.id}`}>
                  <div>
                    <div className="font-heading text-3xl font-semibold tabular-nums leading-none">{st.students}</div>
                    <div className="text-xs text-slate-500 mt-1">students</div>
                  </div>
                  <div className="flex gap-3">
                    <MiniRing label="Attend." value={st.attendance_pct ?? null} warn={st.attendance_pct != null && st.attendance_pct < 75} testid={`ring-att-${c.id}`} />
                    <MiniRing label="Grade" value={st.grade_avg ?? null} warn={st.grade_avg != null && st.grade_avg < 50} testid={`ring-grade-${c.id}`} />
                    {isAdmin && <MiniRing label="Fees paid" value={feePct} warn={feePct != null && feePct < 50} testid={`ring-fee-${c.id}`} />}
                  </div>
                </div>
                {isAdmin && <div className="text-xs text-slate-500">Fees due <b className="text-slate-800 tabular-nums">{st.fees_pending > 0 ? formatMoney(st.fees_pending) : "Nil"}</b></div>}

                <ul className="space-y-2 text-sm border-t border-[#EEF0F6] pt-3 mt-auto" data-testid={`class-team-${c.id}`}>
                  {c.teacher_id
                    ? <li className="flex items-center gap-2.5"><span className="h-7 w-7 grid place-items-center rounded-full bg-[#E8ECFF] text-[#2B4BFF] text-[11px] font-semibold">{initials(tName)}</span><span><span className="block text-[11px] text-slate-500 leading-none">Class teacher</span><b className="font-medium text-slate-800">{tName || "Assigned"}</b></span></li>
                    : isAdmin && <li className="rounded-lg bg-amber-50 text-amber-800 px-3 py-2 text-xs" data-testid={`no-teacher-${c.id}`}>No class teacher assigned. Edit to assign one.</li>}
                  {c.secondary_teacher_id && <li className="flex items-center gap-2.5"><span className="h-7 w-7 grid place-items-center rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">{initials(teacherName(c.secondary_teacher_id))}</span><span><span className="block text-[11px] text-slate-500 leading-none">Second teacher</span><b className="font-medium text-slate-800">{teacherName(c.secondary_teacher_id) || "Assigned"}</b></span></li>}
                  {c.attender_name && <li className="flex items-center gap-2.5"><span className="h-7 w-7 grid place-items-center rounded-full bg-slate-100 text-slate-500"><Phone className="h-3.5 w-3.5" aria-hidden="true" /></span><span><span className="block text-[11px] text-slate-500 leading-none">Attender</span><b className="font-medium text-slate-800">{c.attender_name}</b>{c.attender_phone && <a href={`tel:${c.attender_phone.replace(/\s/g, "")}`} className="relative z-10 ml-2 text-[#2B4BFF] hover:underline">{c.attender_phone}</a>}</span></li>}
                </ul>
              </div>
            </article>
          );
        })}
      </div>

      {showForm && (
        <Modal title={editing ? "Edit class" : "New class"} onClose={() => setShowForm(false)} onSubmit={save} testid="class-form"
          footer={<>
            <button type="button" onClick={() => setShowForm(false)} className="ui-btn">Cancel</button>
            <button type="submit" data-testid="class-save-btn" className="ui-btn btn-primary">Save class</button>
          </>}>
          <div className="space-y-4">
            <div>
              <label className="field-label">Name</label>
              <input data-testid="class-name-input" required className="ui-input mt-1" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Grade 5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Section</label>
                <input data-testid="class-section-input" className="ui-input mt-1" value={form.section}
                  onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="A" />
              </div>
              <div>
                <label className="field-label">Academic year</label>
                <input data-testid="class-year-input" className="ui-input mt-1" value={form.academic_year}
                  onChange={(e) => setForm({ ...form, academic_year: e.target.value })} placeholder="2025" />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="cf-primary">Primary class teacher <span className="text-red-600">*</span></label>
              <select id="cf-primary" required className="ui-input mt-1" value={form.teacher_id} data-testid="class-primary-teacher"
                onChange={(e) => setForm({ ...form, teacher_id: e.target.value, secondary_teacher_id: form.secondary_teacher_id === e.target.value ? "" : form.secondary_teacher_id })}>
                <option value="">Choose a teacher</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="cf-secondary">Secondary class teacher <span className="font-normal text-slate-400">(optional)</span></label>
              <select id="cf-secondary" className="ui-input mt-1" value={form.secondary_teacher_id} data-testid="class-secondary-teacher"
                onChange={(e) => setForm({ ...form, secondary_teacher_id: e.target.value })}>
                <option value="">None</option>
                {teachers.filter((t) => t.id !== form.teacher_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="cf-att">Attender name <span className="font-normal text-slate-400">(optional)</span></label>
                <input id="cf-att" className="ui-input mt-1" maxLength={120} value={form.attender_name} data-testid="class-attender-name" onChange={(e) => setForm({ ...form, attender_name: e.target.value })} />
              </div>
              <div>
                <label className="field-label" htmlFor="cf-attp">Attender phone</label>
                <input id="cf-attp" className="ui-input mt-1" inputMode="tel" maxLength={30} value={form.attender_phone} data-testid="class-attender-phone" onChange={(e) => setForm({ ...form, attender_phone: e.target.value })} />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
