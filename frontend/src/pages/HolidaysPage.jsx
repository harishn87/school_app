import PageHero from "@/components/PageHero";
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
      <PageHero title="Holidays" subtitle="Parents see these on their child's attendance calendar. Sundays are shown as off automatically."
        actions={<select className="ui-input !w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Year" data-testid="holiday-year">
          {[year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>} />

      {admin && (
        <form onSubmit={add} className="ui-card p-5 grid sm:grid-cols-[1fr_auto_auto_auto] gap-3 items-end" data-testid="holiday-form">
          <div><label className="field-label" htmlFor="h-name">Name</label><input id="h-name" className="ui-input" required maxLength={120} placeholder="Diwali break" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="holiday-name" /></div>
          <div><label className="field-label" htmlFor="h-date">From</label><input id="h-date" type="date" className="ui-input" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="holiday-date" /></div>
          <div><label className="field-label" htmlFor="h-end">To (optional)</label><input id="h-end" type="date" className="ui-input" min={form.date} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} data-testid="holiday-end" /></div>
          <button className="ui-btn btn-primary" disabled={busy} data-testid="holiday-add"><Plus className="h-4 w-4" aria-hidden="true" /> Add</button>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="ui-card p-8 text-center text-slate-500" data-testid="holiday-list"><PartyPopper className="h-6 w-6 mx-auto mb-2 text-[#2B4BFF]" aria-hidden="true" />No holidays added for {year} yet.</div>
      ) : (
        <ol className="relative space-y-3 stagger pl-1" data-testid="holiday-list">
          {rows.map((h) => {
            const start = new Date(`${h.date}T00:00:00`), end = new Date(`${(h.end_date || h.date)}T00:00:00`);
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const days = Math.round((end - start) / 86400000) + 1;
            const away = Math.round((start - today) / 86400000);
            const state = today > end ? "past" : today >= start ? "now" : "next";
            const badge = state === "now" ? ["On now", "bg-emerald-50 text-emerald-700"] : state === "next" ? [away === 1 ? "Tomorrow" : `In ${away} days`, "bg-[#E8ECFF] text-[#2B4BFF]"] : ["Done", "bg-slate-100 text-slate-500"];
            return (
              <li key={h.id} data-testid={`holiday-${h.id}`}
                className={`ui-card hoverable flex items-center gap-4 p-3.5 pr-4 ${state === "past" ? "opacity-60" : ""}`}>
                <div className={`h-14 w-14 shrink-0 rounded-xl grid place-items-center text-center leading-none ${state === "past" ? "bg-slate-100 text-slate-500" : "bg-gradient-to-br from-[#0B1020] to-[#2B4BFF] text-white"}`}>
                  <div><div className="font-heading text-xl font-semibold">{start.getDate()}</div><div className="text-[10px] uppercase tracking-wider opacity-80 mt-0.5">{start.toLocaleDateString("en-IN", { month: "short" })}</div></div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{h.name}</div>
                  <div className="text-sm text-slate-500">{formatDate(h.date)}{h.end_date ? ` to ${formatDate(h.end_date)}` : ""} · {days} {days === 1 ? "day" : "days"}</div>
                </div>
                <span className={`pill text-xs font-medium ${badge[1]} ${state === "now" ? "animate-pulse" : ""}`}>{badge[0]}</span>
                {admin && <button className="ui-btn !px-2.5 !py-2 text-red-600" onClick={() => remove(h)} aria-label={`Remove ${h.name}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
