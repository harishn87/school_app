import PageHero from "@/components/PageHero";
import Modal from "@/components/Modal";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import FeeInsights from "@/components/FeeInsights";
import CountUp from "@/components/CountUp";
import YearSelect, { useAcademicYears } from "@/components/YearSelect";

export default function FeesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [params, setParams] = useSearchParams();
  const studentId = params.get("student") || "";
  const view = params.get("view") || "";
  const setView = (v) => { const n = new URLSearchParams(params); if (!v || v === view) n.delete("view"); else n.set("view", v); setParams(n); };
  const autoOpened = useRef(false);
  const ys = useAcademicYears();
  const [year, setYear] = useState("");
  const activeYear = year || ys.current;
  const [fees, setFees] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [students, setStudents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ student_id: "", term: "", amount: 0, paid_amount: 0, due_date: "", paid_date: "", note: "" });

  const load = async () => {
    const [{ data: f }, { data: s }] = await Promise.all([api.get("/fees", { params: activeYear ? { academic_year: activeYear } : {} }), api.get("/students")]);
    setFees(f);
    setStudents(s);
    setLoaded(true);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ys.loaded) load(); }, [activeYear, ys.loaded]);

  const sMap = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  const base = useMemo(() => (studentId ? fees.filter((f) => f.student_id === studentId) : fees), [fees, studentId]);
  const owed = (f) => Math.max(Number(f.amount || 0) - Number(f.paid_amount || 0), 0);
  const shown = useMemo(() => {
    const keep = { pending: (f) => f.status !== "paid" && owed(f) > 0, unpaid: (f) => f.status === "unpaid", partial: (f) => f.status === "partial", paid: (f) => f.status === "paid", collected: (f) => Number(f.paid_amount || 0) > 0 }[view];
    const rows = keep ? base.filter(keep) : base;
    return ["pending", "unpaid", "partial"].includes(view) ? [...rows].sort((a, b) => owed(b) - owed(a)) : rows;
  }, [base, view]);
  const VIEW_LABEL = { pending: "everything still owed (unpaid and part paid)", unpaid: "unpaid records", partial: "part paid records", paid: "fully paid records", collected: "records with any payment received" };
  const totals = useMemo(() => {
    let due = 0, paid = 0;
    for (const f of base) { due += Number(f.amount || 0); paid += Number(f.paid_amount || 0); }
    return { due, paid, pending: Math.max(due - paid, 0) };
  }, [base]);

  const openCreate = () => {
    setEditing(null);
    setForm({ student_id: studentId || students[0]?.id || "", term: `Term 1 ${new Date().getFullYear()}`, amount: 0, paid_amount: 0, due_date: "", paid_date: "", note: "" });
    setShowForm(true);
  };
  const openEdit = (f) => { setEditing(f); setForm({ ...f, note: f.note || "" }); setShowForm(true); };

  // Arriving from a student's row: one fee record opens straight in the edit form, none opens a new record for that student.
  useEffect(() => {
    if (!loaded || !studentId || autoOpened.current || !isAdmin || !sMap[studentId]) return;
    autoOpened.current = true;
    const mine = fees.filter((f) => f.student_id === studentId);
    if (mine.length === 1) openEdit(mine[0]);
    else if (mine.length === 0) openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, studentId, fees, sMap, isAdmin]);

  const save = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, amount: Number(form.amount), paid_amount: Number(form.paid_amount) };
      if (!payload.due_date) payload.due_date = null;
      if (!payload.paid_date) payload.paid_date = null;
      if (editing) await api.put(`/fees/${editing.id}`, payload);
      else await api.post("/fees", { ...payload, academic_year: activeYear || undefined });
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
      <PageHero title="Fee management" subtitle={isAdmin ? "Term-wise fees for every student: who has paid, who is part paid and who is overdue." : "Your children's fees, what is paid and what is due."}
        actions={isAdmin && (
          <button onClick={openCreate} data-testid="add-fee-btn" className="ui-btn btn-primary"><Plus className="h-4 w-4" aria-hidden="true" /> New record</button>
        )} />

      {studentId && sMap[studentId] && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#E8ECFF] px-5 py-3 text-sm" data-testid="fees-student-filter">
          <span>Showing fees for <b>{sMap[studentId].first_name} {sMap[studentId].last_name}</b></span>
          <span className="flex gap-3">
            {isAdmin && <button type="button" className="font-medium text-[#2B4BFF] hover:underline" onClick={openCreate} data-testid="add-fee-for-student">Add a fee record</button>}
            <button type="button" className="font-medium text-[#2B4BFF] hover:underline" onClick={() => setParams({})} data-testid="fees-show-all">Show all students</button>
          </span>
        </div>
      )}

      <YearSelect chips years={ys.years} current={ys.current} value={activeYear} onChange={setYear} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <SummaryCard label="Total billed" value={totals.due} color="bg-[#2B4BFF]" active={!view} onClick={() => setView("")} testid="sum-billed" hint="All records" />
        <SummaryCard label="Collected" value={totals.paid} color="bg-emerald-500" active={view === "collected"} onClick={() => setView("collected")} testid="sum-collected" hint="Who has paid" />
        <SummaryCard label="Pending" value={totals.pending} color="bg-[#E9C46A]" active={view === "pending"} onClick={() => setView("pending")} testid="sum-pending" hint="All unpaid dues" />
      </div>

      <FeeInsights fees={base} view={view} onPick={setView} />

      {view && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#E8ECFF] px-5 py-3 text-sm" data-testid="fees-view-banner">
          <span>Showing <b>{shown.length}</b> {VIEW_LABEL[view]}{["pending", "unpaid", "partial"].includes(view) ? ", biggest balance first" : ""}.</span>
          <button type="button" className="font-medium text-[#2B4BFF] hover:underline" onClick={() => setView("")} data-testid="fees-view-clear">Show all records</button>
        </div>
      )}

      <div className="ui-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-3 font-heading font-semibold">Student</th>
                <th className="px-4 py-3 font-heading font-semibold">Term</th>
                <th className="px-4 py-3 font-heading font-semibold">Amount</th>
                <th className="px-4 py-3 font-heading font-semibold">Paid</th>
                <th className="px-4 py-3 font-heading font-semibold">Balance</th>
                <th className="px-4 py-3 font-heading font-semibold">Status</th>
                <th className="px-4 py-3 font-heading font-semibold">Due</th>
                {isAdmin && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">{view ? "Nothing here. No records match this view." : `No fee records for ${activeYear || "this year"}.`}</td></tr>
              )}
              {shown.map((f) => (
                <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`fee-row-${f.id}`}>
                  <td className="px-4 py-3 font-bold">{sMap[f.student_id] ? `${sMap[f.student_id].first_name} ${sMap[f.student_id].last_name}` : "(deleted)"}</td>
                  <td className="px-4 py-3">{f.term}</td>
                  <td className="px-4 py-3">{formatMoney(f.amount)}</td>
                  <td className="px-4 py-3">{formatMoney(f.paid_amount)}</td>
                  <td className={`px-4 py-3 font-medium ${owed(f) > 0 ? "text-rose-600" : "text-slate-400"}`}>{formatMoney(owed(f))}</td>
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

function SummaryCard({ label, value, color, active, onClick, testid, hint }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} data-testid={testid}
      className={`ui-card hoverable p-5 flex gap-4 text-left w-full ${active ? "ring-2 ring-[#2B4BFF]" : ""}`}>
      <span className={`w-1.5 rounded-full shrink-0 ${color}`} aria-hidden="true" />
      <div><div className="text-sm text-slate-500">{label} <span className="text-[11px] text-[#2B4BFF]">· {hint}</span></div>
      <div className="font-heading text-3xl font-semibold tracking-tight mt-0.5 tabular-nums"><CountUp value={value} format={formatMoney} /></div></div>
    </button>
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
