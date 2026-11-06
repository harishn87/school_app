import DateField from "@/components/DateField";
import PageHero from "@/components/PageHero";
import Modal from "@/components/Modal";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "@/lib/api";
import { formatMoney, formatDate } from "@/lib/utils";
import Pager, { pageOf } from "@/components/Pager";
import { printReceipt, reminderLink } from "@/lib/receipt";
import { toast } from "sonner";
import { Plus, Trash2, Search, Printer, MessageCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import FeeInsights from "@/components/FeeInsights";
import CountUp from "@/components/CountUp";
import { useLive } from "@/lib/live";
import TermFeeCards, { normTerm, termRows } from "@/components/TermFees";
import ChildPicker, { useChildPick } from "@/components/ChildPicker";
import YearSelect, { useAcademicYears } from "@/components/YearSelect";

export default function FeesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [params, setParams] = useSearchParams();
  const studentId = params.get("student") || "";
  const view = params.get("view") || "";
  const term = params.get("term") || "";
  const setTerm = (t) => { const n = new URLSearchParams(params); if (!t || t === term) n.delete("term"); else n.set("term", t); setParams(n); };
  const setView = (v) => { const n = new URLSearchParams(params); if (!v || v === view) n.delete("view"); else n.set("view", v); setParams(n); };
  const autoOpened = useRef(false);
  const ys = useAcademicYears();
  const [year, setYear] = useState("");
  const activeYear = year || ys.current;
  const live = useLive(30000);
  const [fees, setFees] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ student_id: "", term: "", amount: 0, paid_amount: 0, due_date: "", paid_date: "", note: "" });

  const load = async () => {
    const [{ data: f }, { data: s }] = await Promise.all([api.get("/fees", { params: activeYear ? { academic_year: activeYear } : {} }), api.get("/students")]);
    setFees(f);
    setStudents(s);
    api.get("/classes").then((r) => setClasses(r.data)).catch(() => {});
    setLoaded(true);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (ys.loaded) load(); }, [activeYear, ys.loaded, live]);

  const sMap = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);

  const parentMulti = !isAdmin && students.length > 1;
  const [pickedKid, pickKid] = useChildPick(parentMulti ? students : []);
  const sid = studentId || (parentMulti ? pickedKid : "");
  const forStudent = useMemo(() => (sid ? fees.filter((f) => f.student_id === sid) : fees), [fees, sid]);
  const terms = useMemo(() => termRows(forStudent), [forStudent]);
  const base = useMemo(() => (term ? forStudent.filter((f) => normTerm(f.term) === term) : forStudent), [forStudent, term]);
  const owed = (f) => Math.max(Number(f.amount || 0) - Number(f.paid_amount || 0), 0);
  const shown = useMemo(() => {
    const keep = { pending: (f) => f.status !== "paid" && owed(f) > 0, unpaid: (f) => f.status === "unpaid", partial: (f) => f.status === "partial", paid: (f) => f.status === "paid", collected: (f) => Number(f.paid_amount || 0) > 0 }[view];
    const rows = keep ? base.filter(keep) : base;
    return ["pending", "unpaid", "partial"].includes(view) ? [...rows].sort((a, b) => owed(b) - owed(a)) : rows;
  }, [base, view]);
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => shown.filter((f) => {
    const s = sMap[f.student_id];
    if (cls && s?.class_id !== cls) return false;
    return !needle || `${s?.first_name || ""} ${s?.last_name || ""} ${s?.roll_number || ""} ${s?.guardian_name || ""}`.toLowerCase().includes(needle);
  }), [shown, sMap, cls, needle]);
  useEffect(() => { setPage(1); }, [q, cls, view, term, sid, activeYear]);
  const pg = pageOf(filtered, page);
  const classMap = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c])), [classes]);
  const className = (s) => { const c = classMap[s?.class_id]; return c ? `${c.name} ${c.section || ""}`.trim() : ""; };
  const schoolName = user?.school?.name || "";
  const receipt = (f) => { const s = sMap[f.student_id]; if (!printReceipt({ school: schoolName, fee: f, student: s, className: className(s) })) toast.error("Allow pop-ups for this site to print the receipt"); };
  const VIEW_LABEL = { pending: "everything still owed (unpaid and part paid)", unpaid: "unpaid records", partial: "part paid records", paid: "fully paid records", collected: "records with any payment received" };
  const totals = useMemo(() => {
    let due = 0, paid = 0;
    for (const f of base) { due += Number(f.amount || 0); paid += Number(f.paid_amount || 0); }
    return { due, paid, pending: Math.max(due - paid, 0) };
  }, [base]);

  const openCreate = () => {
    setEditing(null);
    setForm({ student_id: studentId || students[0]?.id || "", term: "Term 1", amount: 0, paid_amount: 0, due_date: "", paid_date: "", note: "" });
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
      <ChildPicker kids={parentMulti ? students : []} value={pickedKid} onPick={pickKid} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <SummaryCard label="Total billed" value={totals.due} color="bg-[#2B4BFF]" active={!view} onClick={() => setView("")} testid="sum-billed" hint="All records" plain={!isAdmin} />
        <SummaryCard label="Paid" value={totals.paid} color="bg-emerald-500" active={view === "collected"} onClick={() => setView("collected")} testid="sum-collected" hint="Who has paid" plain={!isAdmin} />
        <SummaryCard label="Pending" value={totals.pending} color="bg-[#E9C46A]" active={view === "pending"} onClick={() => setView("pending")} testid="sum-pending" hint="All unpaid dues" plain={!isAdmin} />
      </div>

      <section aria-label="Fees by term" data-testid="fees-by-term">
        <h2 className="font-heading font-semibold mb-3">Paid and pending by term</h2>
        {!isAdmin && students.length > 1 && !sid ? (
          <div className="space-y-5">
            {students.map((s) => {
              const rows = termRows(fees.filter((f) => f.student_id === s.id));
              return <div key={s.id} data-testid={`child-terms-${s.id}`}><div className="text-sm font-medium text-slate-700 mb-2">{s.first_name} {s.last_name}</div><TermFeeCards mine terms={rows} testid={`terms-${s.id}`} /></div>;
            })}
          </div>
        ) : <TermFeeCards mine={!isAdmin} terms={terms} active={term} onPick={setTerm} />}
        {term && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#E8ECFF] px-5 py-3 text-sm" data-testid="fees-term-banner">
            <span>Showing <b>{term}</b> only.</span>
            <button type="button" className="font-medium text-[#2B4BFF] hover:underline" onClick={() => setTerm("")} data-testid="fees-term-clear">All terms</button>
          </div>
        )}
      </section>

      <FeeInsights fees={base} view={view} onPick={setView} />

      {view && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#E8ECFF] px-5 py-3 text-sm" data-testid="fees-view-banner">
          <span>Showing <b>{shown.length}</b> {VIEW_LABEL[view]}{["pending", "unpaid", "partial"].includes(view) ? ", biggest balance first" : ""}.</span>
          <button type="button" className="font-medium text-[#2B4BFF] hover:underline" onClick={() => setView("")} data-testid="fees-view-clear">Show all records</button>
        </div>
      )}

      {isAdmin && (
        <div className="ui-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3" data-testid="fees-filters">
          <div className="relative md:col-span-2">
            <Search className="h-4 w-4 absolute left-3 top-3.5 text-slate-400" aria-hidden="true" />
            <input className="ui-input pl-9" placeholder="Search student, roll no or guardian…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search fee records" data-testid="fees-search" />
          </div>
          <select className="ui-input" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Class" data-testid="fees-class-filter">
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
          </select>
          <select className="ui-input" value={view} onChange={(e) => setView(e.target.value)} aria-label="Status" data-testid="fees-status-filter">
            <option value="">All statuses</option>
            <option value="pending">Pending (still owed)</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Part paid</option>
            <option value="paid">Paid</option>
            <option value="collected">Any payment received</option>
          </select>
        </div>
      )}

      <div className="ui-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="surface-midnight text-white [&_th]:text-left [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wider [&_th]:!text-white/80">
                <th className="px-4 py-3 font-heading font-semibold">Student</th>
                <th className="px-4 py-3 font-heading font-semibold">Term</th>
                <th className="px-4 py-3 font-heading font-semibold">Amount</th>
                <th className="px-4 py-3 font-heading font-semibold">Paid</th>
                <th className="px-4 py-3 font-heading font-semibold">Balance</th>
                <th className="px-4 py-3 font-heading font-semibold">Status</th>
                <th className="px-4 py-3 font-heading font-semibold">Due</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">{view || q || cls ? "Nothing here. No records match these filters." : `No fee records for ${activeYear || "this year"}.`}</td></tr>
              )}
              {pg.rows.map((f) => (
                <tr key={f.id} className="border-b border-slate-100 hover:bg-slate-50" data-testid={`fee-row-${f.id}`}>
                  <td className="px-4 py-3">{sMap[f.student_id] ? (<div className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2B4BFF] to-[#1B2A7A] text-[11px] font-semibold text-white" aria-hidden="true">{(sMap[f.student_id].first_name?.[0] || "") + (sMap[f.student_id].last_name?.[0] || "")}</span>
                    <div className="leading-tight"><div className="font-heading font-semibold text-[#0B1020]">{sMap[f.student_id].first_name} {sMap[f.student_id].last_name}</div><div className="text-[11px] text-slate-400">{className(sMap[f.student_id]) || "—"}</div></div></div>) : "(deleted)"}</td>
                  <td className="px-4 py-3">{normTerm(f.term)}</td>
                  <td className="px-4 py-3">{formatMoney(f.amount)}</td>
                  <td className="px-4 py-3">{formatMoney(f.paid_amount)}</td>
                  <td className={`px-4 py-3 font-medium ${owed(f) > 0 ? "text-rose-600" : "text-slate-400"}`}>{formatMoney(owed(f))}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={f.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(f.due_date)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      {Number(f.paid_amount || 0) > 0 && <button type="button" onClick={() => receipt(f)} className="ui-btn !p-2 bg-white" title="Print receipt" aria-label="Print receipt" data-testid={`receipt-${f.id}`}><Printer className="h-4 w-4" aria-hidden="true" /></button>}
                      {isAdmin && owed(f) > 0 && (() => { const href = reminderLink({ school: schoolName, fee: f, student: sMap[f.student_id] }); return href
                        ? <a href={href} target="_blank" rel="noopener noreferrer" className="ui-btn !p-2 bg-white text-emerald-700" title="Remind the parent on WhatsApp" aria-label="Send WhatsApp reminder" data-testid={`remind-${f.id}`}><MessageCircle className="h-4 w-4" aria-hidden="true" /></a>
                        : <span className="ui-btn !p-2 bg-white text-slate-300 cursor-not-allowed" title="No guardian phone number on file" aria-label="No phone number"><MessageCircle className="h-4 w-4" aria-hidden="true" /></span>; })()}
                      {isAdmin && <><button onClick={() => openEdit(f)} className="ui-btn !p-2 bg-white">Edit</button>
                      <button onClick={() => remove(f)} className="ui-btn !p-2 bg-white" aria-label="Delete record"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager total={filtered.length} page={pg.page} onPage={setPage} noun="records" />
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
              <select required className="ui-input" value={normTerm(form.term)} onChange={(e) => setForm({ ...form, term: e.target.value })} data-testid="fee-term-select">
                  {["Term 1", "Term 2", "Term 3", "Annual"].map((t) => <option key={t}>{t}</option>)}
                </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <input type="number" min={0} step="0.01" className="ui-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
              <Field label="Paid">
                <input type="number" min={0} step="0.01" className="ui-input" value={form.paid_amount} onChange={(e) => setForm({ ...form, paid_amount: e.target.value })} />
              </Field>
              <Field label="Due date">
                <DateField className="ui-input" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </Field>
              <Field label="Paid date">
                <DateField className="ui-input" value={form.paid_date || ""} onChange={(e) => setForm({ ...form, paid_date: e.target.value })} />
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
    paid: ["Paid", "bg-emerald-50 text-emerald-700 border-emerald-200"],
    partial: ["Part paid", "bg-amber-50 text-amber-800 border-amber-200"],
    unpaid: ["Unpaid", "bg-rose-50 text-rose-700 border-rose-200"],
  };
  const [label, cls] = map[status] || [status, "bg-slate-100 text-slate-600 border-slate-200"];
  return <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>;
}

function SummaryCard({ label, value, color, active, onClick, testid, hint, plain }) {
  const body = (<>
    <span className={`w-1.5 rounded-full shrink-0 ${color}`} aria-hidden="true" />
    <div><div className="text-sm text-slate-500">{label}</div>
    <div className="font-heading text-3xl font-semibold tracking-tight mt-0.5 tabular-nums"><CountUp value={value} format={formatMoney} /></div></div>
  </>);
  return plain
    ? <div data-testid={testid} className="ui-card p-5 flex gap-4 text-left w-full">{body}</div>
    : <button type="button" onClick={onClick} aria-pressed={active} data-testid={testid}
        className={`ui-card hoverable p-5 flex gap-4 text-left w-full ${active ? "ring-2 ring-[#2B4BFF]" : ""}`}>{body}</button>;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
