import { formatDate, formatMoney } from "@/lib/utils";

// Same tidy-up the server does, so "Term 1 2026" and "term 1" count as one term.
export const normTerm = (t) => {
  const m = /term\s*(\d+)/i.exec(t || "");
  return m ? `Term ${m[1]}` : String(t || "").trim() || "Other";
};
const termOrder = (t) => { const m = /^Term (\d+)$/.exec(t); return m ? [0, Number(m[1])] : [1, 0]; };

export function termRows(fees) {
  const by = {};
  for (const f of fees || []) {
    const k = normTerm(f.term);
    const r = (by[k] ||= { term: k, billed: 0, collected: 0, records: 0, paid: 0, due_date: null });
    r.billed += Number(f.amount || 0); r.collected += Number(f.paid_amount || 0); r.records += 1;
    if (f.status === "paid") r.paid += 1;
    if (f.due_date && (!r.due_date || f.due_date < r.due_date)) r.due_date = f.due_date;
  }
  return Object.values(by).map((r) => {
    const pending = Math.max(r.billed - r.collected, 0);
    return { ...r, pending, percent: r.billed ? Math.round((r.collected / r.billed) * 100) : 0, status: !r.billed || pending === 0 ? "paid" : r.collected > 0 ? "partial" : "unpaid" };
  }).sort((a, b) => { const x = termOrder(a.term), y = termOrder(b.term); return x[0] - y[0] || x[1] - y[1] || a.term.localeCompare(b.term); });
}

const blank = (term) => ({ term, billed: 0, collected: 0, records: 0, paid: 0, pending: 0, percent: 0, due_date: null, status: "none" });

/** Term 1, 2 and 3 always appear (zeros when nothing is billed yet), then any other terms such as "Annual". */
export function fillTerms(rows) {
  const by = Object.fromEntries((rows || []).map((r) => [r.term, r]));
  const base = ["Term 1", "Term 2", "Term 3"].map((t) => by[t] || blank(t));
  return [...base, ...(rows || []).filter((r) => !["Term 1", "Term 2", "Term 3"].includes(r.term))];
}

export function yearTotals(rows) {
  const billed = rows.reduce((a, r) => a + r.billed, 0), collected = rows.reduce((a, r) => a + r.collected, 0);
  const pending = Math.max(billed - collected, 0);
  return { term: "Whole year", billed, collected, pending, records: rows.reduce((a, r) => a + (r.records || 0), 0), percent: billed ? Math.round((collected / billed) * 100) : 0, status: !billed ? "none" : pending === 0 ? "paid" : collected > 0 ? "partial" : "unpaid" };
}

const TONE = {
  paid: { bar: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700", label: "Paid" },
  partial: { bar: "bg-[#E9C46A]", pill: "bg-amber-50 text-amber-700", label: "Part paid" },
  unpaid: { bar: "bg-rose-400", pill: "bg-rose-50 text-rose-700", label: "Unpaid" },
  none: { bar: "bg-slate-300", pill: "bg-slate-100 text-slate-600", label: "Nothing billed" },
};

function Card({ t, tone, mine, testid, active, onPick, wide }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading font-semibold">{t.term}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone.pill}`}>{tone.label}</span>
      </div>
      <div className={wide ? "mt-3 grid gap-4 sm:grid-cols-3" : ""}>
        <div>
          <div className="mt-3 font-heading text-2xl font-semibold tabular-nums" data-testid={`${testid}-collected-${t.term}`}>{formatMoney(t.collected)}</div>
          <div className="text-xs text-slate-500">{mine ? "paid" : "collected"} of {formatMoney(t.billed)}</div>
        </div>
        {wide && <div><div className="mt-3 text-xs text-slate-500">Billed</div><div className="font-heading text-2xl font-semibold tabular-nums">{formatMoney(t.billed)}</div></div>}
        {wide && <div><div className="mt-3 text-xs text-slate-500">Pending</div><div className="font-heading text-2xl font-semibold tabular-nums text-rose-600" data-testid={`${testid}-pending-${t.term}`}>{formatMoney(t.pending)}</div></div>}
      </div>
      <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={t.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${t.term} ${t.percent}% ${mine ? "paid" : "collected"}`}>
        <div className={`h-full rounded-full transition-all duration-700 ${tone.bar}`} style={{ width: `${t.percent}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
        <span>{t.percent}%</span>
        {!wide && <span>Pending <b className="font-semibold text-slate-800" data-testid={`${testid}-pending-${t.term}`}>{formatMoney(t.pending)}</b></span>}
      </div>
      {t.due_date && t.pending > 0 && <div className="mt-1 text-xs text-slate-500">Due {formatDate(t.due_date)}</div>}
    </>
  );
  const cls = `ui-card p-4 text-left ${wide ? "sm:col-span-full bg-[#F1F4FF]" : ""} ${active ? "ring-2 ring-[#2B4BFF]" : ""}`;
  return onPick
    ? <button type="button" onClick={() => onPick(wide ? "" : t.term)} aria-pressed={!!active} className={`${cls} hoverable`} data-testid={`${testid}-${t.term}`}>{body}</button>
    : <div className={cls} data-testid={`${testid}-${t.term}`}>{body}</div>;
}

export default function TermFeeCards({ terms, active, onPick, mine = false, testid = "term-fees" }) {
  const all = fillTerms(terms);
  const year = yearTotals(all);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 stagger" data-testid={testid}>
      {all.map((t) => <Card key={t.term} t={t} tone={TONE[t.status] || TONE.unpaid} mine={mine} testid={testid} active={active === t.term} onPick={onPick} />)}
      <Card t={year} tone={TONE[year.status]} mine={mine} testid={testid} active={onPick && !active} onPick={onPick} wide />
    </div>
  );
}
