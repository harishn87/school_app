import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";

const empty = {
  first_name: "", last_name: "",
  date_of_birth: "", gender: "",
  photo_base64: "",
  joining_date: new Date().toISOString().slice(0, 10),
  leaving_date: "",
  class_id: "", roll_number: "",
  guardian_name: "", guardian_phone: "", guardian_email: "",
  address: "", notes: "",
  grades: [],
  status: "active",
};

function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export default function StudentFormModal({ student, classes, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...empty, ...(student || {}), grades: student?.grades || [] }));
  const [saving, setSaving] = useState(false);

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2MB"); return; }
    const url = await fileToDataUrl(file);
    setForm({ ...form, photo_base64: url });
  };

  const addGrade = () => setForm({ ...form, grades: [...form.grades, { subject: "", term: "", score: 0, max_score: 100 }] });
  const updateGrade = (i, key, val) => {
    const grades = form.grades.map((g, idx) => idx === i ? { ...g, [key]: key === "score" || key === "max_score" ? Number(val) : val } : g);
    setForm({ ...form, grades });
  };
  const removeGrade = (i) => setForm({ ...form, grades: form.grades.filter((_, idx) => idx !== i) });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form };
      // Clean empty optional strings
      Object.keys(payload).forEach((k) => {
        if (payload[k] === "") payload[k] = null;
      });
      payload.first_name = form.first_name;
      payload.last_name = form.last_name;
      payload.joining_date = form.joining_date;
      payload.status = form.status;
      payload.grades = form.grades;
      if (student) await api.put(`/students/${student.id}`, payload);
      else await api.post("/students", payload);
      onSaved?.();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally { setSaving(false); }
  };

  return (
    <Modal
      title={student ? "Edit student" : "New student"}
      subtitle={student ? "Update this student's profile." : "Add a student to your school. Only name and joining date are required."}
      size="xl" onClose={onClose} onSubmit={submit} testid="student-form"
      footer={<>
        <button type="button" onClick={onClose} className="ui-btn">Cancel</button>
        <button type="submit" disabled={saving} data-testid="student-save-btn" className="ui-btn btn-primary min-w-[96px]">{saving ? "Saving…" : "Save student"}</button>
      </>}
    >
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          {form.photo_base64 ? (
            <img src={form.photo_base64} alt="" className="h-20 w-20 object-cover border border-slate-200 rounded-lg" />
          ) : (
            <div className="h-20 w-20 grid place-items-center bg-[#E8ECFF] text-[#2B4BFF] rounded-lg font-heading font-semibold text-2xl">
              {form.first_name?.[0]?.toUpperCase() || "?"}
            </div>
          )}
          <label className="ui-btn bg-white cursor-pointer">
            Upload photo
            <input data-testid="student-photo-input" type="file" accept="image/*" onChange={onPhoto} className="hidden" />
          </label>
          {form.photo_base64 && (
            <button type="button" onClick={() => setForm({ ...form, photo_base64: "" })} className="ui-btn bg-white">Remove</button>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="First name *">
            <input data-testid="student-first-name" required className="ui-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
          </Field>
          <Field label="Last name *">
            <input data-testid="student-last-name" required className="ui-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </Field>
          <Field label="Date of birth">
            <input type="date" className="ui-input" value={form.date_of_birth || ""} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          </Field>
          <Field label="Gender">
            <select className="ui-input" value={form.gender || ""} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Joining date *">
            <input data-testid="student-joining-date" type="date" required className="ui-input" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} />
          </Field>
          <Field label="Leaving date">
            <input data-testid="student-leaving-date" type="date" className="ui-input" value={form.leaving_date || ""} onChange={(e) => setForm({ ...form, leaving_date: e.target.value })} />
          </Field>
          <Field label="Class">
            <select className="ui-input" value={form.class_id || ""} onChange={(e) => setForm({ ...form, class_id: e.target.value })}>
              <option value="">—</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
            </select>
          </Field>
          <Field label="Roll number">
            <input className="ui-input" value={form.roll_number || ""} onChange={(e) => setForm({ ...form, roll_number: e.target.value })} />
          </Field>
          <Field label="Guardian name">
            <input className="ui-input" value={form.guardian_name || ""} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} />
          </Field>
          <Field label="Guardian phone">
            <input className="ui-input" value={form.guardian_phone || ""} onChange={(e) => setForm({ ...form, guardian_phone: e.target.value })} />
          </Field>
          <Field label="Guardian email">
            <input type="email" className="ui-input" value={form.guardian_email || ""} onChange={(e) => setForm({ ...form, guardian_email: e.target.value })} />
          </Field>
          <Field label="Status">
            <select className="ui-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="left">Left</option>
            </select>
          </Field>
        </div>

        <Field label="Address">
          <textarea rows={2} className="ui-input" value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>

        <Field label="Notes">
          <textarea rows={2} className="ui-input" value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>

        <div className="rounded-xl border border-[#E7E9F1] bg-slate-50/70 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-heading font-semibold text-lg">Academic records</div>
            <button type="button" onClick={addGrade} className="ui-btn btn-soft-green">
              <Plus className="h-4 w-4" aria-hidden="true" /> Add grade
            </button>
          </div>
          {form.grades.length === 0 && <p className="text-sm text-slate-500">No grades added.</p>}
          <div className="space-y-2">
            {form.grades.map((g, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input className="ui-input col-span-4" placeholder="Subject" value={g.subject} onChange={(e) => updateGrade(i, "subject", e.target.value)} />
                <input className="ui-input col-span-3" placeholder="Term" value={g.term} onChange={(e) => updateGrade(i, "term", e.target.value)} />
                <input className="ui-input col-span-2" type="number" placeholder="Score" value={g.score} onChange={(e) => updateGrade(i, "score", e.target.value)} />
                <input className="ui-input col-span-2" type="number" placeholder="Max" value={g.max_score} onChange={(e) => updateGrade(i, "max_score", e.target.value)} />
                <button type="button" onClick={() => removeGrade(i)} className="ui-btn !p-2 bg-white col-span-1"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
