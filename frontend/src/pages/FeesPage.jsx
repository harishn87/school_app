import Modal from "@/components/Modal";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function FeesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [fees, setFees] = useState([]);
  const [students, setStudents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ student_id: "", term: "", amount: 0, paid_amount: 0, due_date: "", paid_date: "", note: "" });

  const load = async () => {
    const [{ data: f }, { data: s }] = await Promise.all([api.get("/fees"), api.get("/students")]);
    setFees(f);
    setStudents(s);
  };
  useEffect(() => { load(); }, []);

  const sMap = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  const totals = useMemo(() => {
    let due = 0, paid = 0;
    for (const f of fees) { due += Number(f.amount || 0); paid += Number(f.paid_amount || 0); }
    return { due, paid, pending: Math.max(due - paid, 0) };
  }, [fees]);

  const openCreate = () => {
    setEditing(null);
    setForm({ student_id: students[0]?.id || "", term: `Term 1 ${new Date().getFullYear()}`, amount: 0, paid_amount: 0, due_date: "", paid_date: "", note: "" });
    setShowForm(true);
  };
  const openEdit = (f) => { setEditing(f); setForm({ ...f, note: f.note || "" }); setShowForm(true); };

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, amount: Number(form.amount), paid_amount: Number(form.paid_amount) };
      if (!payload.due_date) payload.due_date = null;
      if (!payload.paid_date) payload.paid_date = null;
      if (editing) await api.put(`/fees/${editing.id}`, payload);
      else await api.post("/fees", payload);
      toast.success("Saved"); setShowForm(false); load();
    } catch (err) { toast.error(errorMessage(err)); }
  };
  const remove = async (f) => {
    if (!confirm("Delete this fee record?")) return;
    try { await api.delete(`/fees/${f.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="fees-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-[28px] font-semibold tracking-tight">Fee management</h1>
        </div>
        {isAdmin && (
          <button onClick={openCreate} data-testid="add-fee-btn" className="ui-btn btn-primary"><Plus className="h-4 w-4" aria-hidden="true" /> New record</button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <SummaryCard label="Total billed" value={totals.due} color="bg-[#E8ECFF]" />
        <SummaryCard label="Collected" value={totals.paid} color="bg-[#E6F8EE]" />
        <SummaryCard label="Pending" value={totals.pending} color="bg-[#FEF3C7]" />
      </div>

      <div className="ui-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-3 font-heading font-semibold">Student</th>
                <th className="px-4 py-3 font-heading font-semibold">Term</th>
                <th className="px-4 py-3 font-heading font-semibold">Amount</th>
                <th className="px-4 py-3 font-heading font-semibold">Paid</th>
                <th className="px-4 py-3 font-heading font-semibold">Status</th>
                <th className="px-4 py-3 font-heading font-semibold">Due</th>
                {isAdmin && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {fees.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No fee records yet.</td></tr>
              )}
              {fees.map((f) => (
                <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`fee-row-${f.id}`}>
                  <td className="px-4 py-3 font-bold">{sMap[f.student_id] ? `${sMap[f.student_id].first_name} ${sMap[f.student_id].last_name}` : "(deleted)"}</td>
                  <td className="px-4 py-3">{f.term}</td>
                  <td className="px-4 py-3">{formatMoney(f.amount)}</td>
                  <td className="px-4 py-3">{formatMoney(f.paid_amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={f.status} />
                  </td>
                  <td className="px-4 py-3">{f.due_date || "—"}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(f)} className="ui-btn !p-2 bg-white">Edit</button>
                        <button onClick={() => remove(f)} className="ui-btn !p-2 bg-white"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <Modal title={editing ? "Edit fee" : "New fee"} onClose={() => setShowForm(false)} onSubmit={save} testid="fee-form"
          footer={<>
            <button type="button" onClick={() => setShowForm(false)} className="ui-btn">Cancel</button>
            <button type="submit" data-testid="fee-save-btn" className="ui-btn btn-primary">Save fee</button>
          </>}>
          <div className="space-y-4">
            <Field label="Student *">
              <select required className="ui-input" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
                <option value="">Select…</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
              </select>
            </Field>
            <Field label="Term *">
              <input required className="ui-input" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <input type="number" min={0} step="0.01" className="ui-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
              <Field label="Paid">
                <input type="number" min={0} step="0.01" className="ui-input" value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: e.target.value })} />
              </Field>
              <Field label="Due date">
                <input type="date" className="ui-input" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </Field>
              <Field label="Paid date">
                <input type="date" className="ui-input" value={form.paid_date || ""} onChange={(e) => setForm({ ...form, paid_date: e.target.value })} />
              </Field>
            </div>
            <Field label="Note">
              <textarea rows={2} className="ui-input" value={form.note || ""} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    paid: "bg-[#E6F8EE]",
    partial: "bg-[#FEF3C7]",
    unpaid: "bg-red-200",
  };
  return (
    <span className={`inline-block px-2 py-1 rounded-full font-medium text-xs capitalize ${map[status] || "bg-slate-100"}`}>
      {status}
    </span>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className={`ui-card p-5 ${color}`}>
      <div className="text-xs font-medium">{label}</div>
      <div className="font-heading text-3xl font-semibold tracking-tight mt-1">{formatMoney(value)}</div>
    </div>
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
