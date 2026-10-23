import Modal from "@/components/Modal";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function ClassesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [classes, setClasses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", section: "", academic_year: "", teacher_id: "" });
  const [teachers, setTeachers] = useState([]);

  const load = async () => {
    const { data } = await api.get("/classes");
    setClasses(data);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!isAdmin) return;
    api.get("/users").then((r) => setTeachers(r.data.filter((u) => u.role !== "parent" && u.active))).catch(() => {});
  }, [isAdmin]);
  const teacherName = (id) => teachers.find((t) => t.id === id)?.name;

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", section: "", academic_year: new Date().getFullYear().toString(), teacher_id: "" });
    setShowForm(true);
  };
  const openEdit = (c) => {
    setEditing(c);
    setForm({ name: c.name || "", section: c.section || "", academic_year: c.academic_year || "", teacher_id: c.teacher_id || "" });
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      const body = { ...form, teacher_id: form.teacher_id || null };
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-[28px] font-semibold tracking-tight">All classes</h1>
        </div>
        {isAdmin && (
          <button data-testid="add-class-btn" onClick={openCreate} className="ui-btn btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" /> New class
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {classes.length === 0 && (
          <div className="ui-card p-8 col-span-full text-center text-slate-600">
            No classes yet. {isAdmin && "Click \"New class\" to create one."}
          </div>
        )}
        {classes.map((c) => (
          <div key={c.id} className="ui-card p-5" data-testid={`class-card-${c.id}`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-heading text-xl font-semibold">{c.name}</h3>
                <div className="text-sm text-slate-600">Section {c.section || "—"}</div>
                {c.teacher_id && teacherName(c.teacher_id) && (
                  <div className="text-sm text-slate-600">Teacher: {teacherName(c.teacher_id)}</div>
                )}
                {c.academic_year && (
                  <span className="inline-block mt-3 px-2 py-1 bg-[#E8ECFF] text-[#2B4BFF] rounded-full font-medium text-xs capitalize">
                    {c.academic_year}
                  </span>
                )}
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <button onClick={() => openEdit(c)} className="ui-btn !p-2 bg-white" data-testid={`edit-class-${c.id}`}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button onClick={() => remove(c)} className="ui-btn !p-2 bg-white" data-testid={`delete-class-${c.id}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
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
              <label className="field-label">Class teacher</label>
              <select className="ui-input mt-1" value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })}>
                <option value="">Not assigned</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
