import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, PartyPopper } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/utils";

export default function HolidaysPage() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [year, setYear] = useState(new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: "", date: "", end_date: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await api.get("/holidays", { params: { year } })).data); } catch (_e) { setRows([]); }
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/holidays", { name: form.name, date: form.date, end_date: form.end_date || null });
      setForm({ name: "", date: "", end_date: "" });
      toast.success("Holiday added");
      load();
    } catch (err) { toast.error(errorMessage(err) || "Couldn't add the holiday"); }
    setBusy(false);
  };
  const remove = async (h) => {
    if (!window.confirm(`Remove "${h.name}"?`)) return;
    try { await api.delete(`/holidays/${h.id}`); load(); } catch (err) { toast.error(errorMessage(err) || "Couldn't remove it"); }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-up" data-testid="holidays-page">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-[28px] font-semibold">Holidays</h1>
          <p className="text-slate-500 mt-1">Parents see these on their child&apos;s attendance calendar. Sundays are shown as off automatically.</p>
        </div>
        <select className="ui-input !w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year" data-testid="holiday-year">
          {[year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </header>

      {admin && (
        <form onSubmit={add} className="ui-card p-5 grid sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end" data-testid="holiday-form">
          <div><label className="field-label" htmlFor="h-name">Name</label><input id="h-name" className="ui-input" required maxLength={120} placeholder="Diwali break" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="holiday-name" /></div>
          <div><label className="field-label" htmlFor="h-date">From</label><input id="h-date" type="date" className="ui-input" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="holiday-date" /></div>
          <div><label className="field-label" htmlFor="h-end">To (optional)</label><input id="h-end" type="date" className="ui-input" min={form.date} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} data-testid="holiday-end" /></div>
          <button className="ui-btn btn-primary" disabled={busy} data-testid="holiday-add"><Plus className="h-4 w-4" aria-hidden="true" /> Add</button>
        </form>
      )}

      <div className="ui-card divide-y divide-[#EEF0F6]" data-testid="holiday-list">
        {rows.length === 0 && (
          <div className="p-8 text-center text-slate-500"><PartyPopper className="h-6 w-6 mx-auto mb-2 text-[#2B4BFF]" aria-hidden="true" />No holidays added for {year} yet.</div>
        )}
        {rows.map((h) => (
          <div key={h.id} className="flex items-center gap-4 px-5 py-3.5" data-testid={`holiday-${h.id}`}>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{h.name}</div>
              <div className="text-sm text-slate-500">{formatDate(h.date)}{h.end_date ? ` to ${formatDate(h.end_date)}` : ""}</div>
            </div>
            {admin && <button className="ui-btn !px-2.5 !py-2 text-red-600" onClick={() => remove(h)} aria-label={`Remove ${h.name}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}
