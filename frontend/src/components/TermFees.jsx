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
  paid: { bar: "bg-emerald-500", stroke: "#10B981", pill: "bg-emerald-50 text-emerald-700", label: "Paid" },
  partial: { bar: "bg-[#E9C46A]", stroke: "#E9C46A", pill: "bg-amber-50 text-amber-700", label: "Part paid" },
  unpaid: { bar: "bg-rose-400", stroke: "#FB7185", pill: "bg-rose-50 text-rose-700", label: "Unpaid" },
  none: { bar: "bg-slate-300", stroke: "#CBD5E1", pill: "bg-slate-100 text-slate-600", label: "Not billed" },
};

/** Round progress dial with the percentage in the middle. */
function Dial({ percent, stroke, size = 64, track = "#EEF0F7", ink = "text-slate-900", label }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r, p = Math.min(Math.max(percent || 0, 0), 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth="7" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} style={{ transition: "stroke-dashoffset .7s ease" }} />
      </svg>
      <span className={`absolute inset-0 grid place-items-center text-[13px] font-semibold tabular-nums ${ink}`}>{p}%</span>
    </div>
  );
}

function Card({ t, tone, mine, testid, active, onPick, wide }) {
  const empty = t.status === "none";
  const verb = mine ? "paid" : "collected";
  const body = wide ? (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <div className="flex items-center gap-4">
        <Dial percent={t.percent} stroke={t.status === "paid" ? "#34D399" : "#E9C46A"} size={72} track="rgba(255,255,255,.16)" ink="text-white" label={`${t.term} ${t.percent}% ${verb}`} />
        <div>
          <div className="flex items-center gap-2"><span className="font-heading font-semibold text-white/90">{t.term}</span><span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium text-white">{tone.label}</span></div>
          <div className="mt-1 font-heading text-3xl font-semibold tabular-nums text-white" data-testid={`${testid}-collected-${t.term}`}>{formatMoney(t.collected)}</div>
          <div className="text-xs text-white/60">{verb} so far</div>
        </div>
      </div>
      <div className="grid flex-1 min-w-[260px] grid-cols-2 gap-3 sm:max-w-md sm:ml-auto">
        <div className="min-w-0 rounded-xl bg-white/10 px-3 py-3"><div className="text-xs text-white/60">Billed</div><div className="whitespace-nowrap font-heading text-lg font-semibold tabular-nums text-white">{formatMoney(t.billed)}</div></div>
        <div className="min-w-0 rounded-xl bg-white/10 px-3 py-3"><div className="text-xs text-white/60">Pending</div><div className="whitespace-nowrap font-heading text-lg font-semibold tabular-nums text-rose-300" data-testid={`${testid}-pending-${t.term}`}>{formatMoney(t.pending)}</div></div>
      </div>
    </div>
  ) : (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="whitespace-nowrap font-heading font-semibold">{t.term}</span>
        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tone.pill}`}>{tone.label}</span>
      </div>
      {empty ? (
        <div className="mt-3">
          <div className="whitespace-nowrap font-heading text-xl font-semibold leading-tight tabular-nums text-slate-300" data-testid={`${testid}-collected-${t.term}`}>{formatMoney(0)}</div>
          <div className="text-xs text-slate-400">Nothing billed yet</div>
          <div className="mt-3 h-2 rounded-full bg-slate-100" aria-hidden="true" />
          <span className="hidden" data-testid={`${testid}-pending-${t.term}`}>{formatMoney(0)}</span>
        </div>
      ) : (
        <>
          <div className="mt-3">
            <div className="whitespace-nowrap font-heading text-xl font-semibold leading-tight tabular-nums" data-testid={`${testid}-collected-${t.term}`}>{formatMoney(t.collected)}</div>
            <div className="text-xs text-slate-500">{verb} of <span className="whitespace-nowrap">{formatMoney(t.billed)}</span></div>
          </div>
          <div className="mt-3 flex items-center gap-2" role="progressbar" aria-valuenow={t.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${t.term} ${t.percent}% ${verb}`}>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEF0F7]"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(Math.max(t.percent, 0), 100)}%`, transition: "width .7s ease" }} /></div>
            <span className="text-xs font-semibold tabular-nums text-slate-700">{t.percent}%</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[#EEF0F6] pt-3 text-xs">
            <span className="whitespace-nowrap text-slate-500">Pending <b className={`font-semibold tabular-nums ${t.pending > 0 ? "text-rose-600" : "text-emerald-600"}`} data-testid={`${testid}-pending-${t.term}`}>{formatMoney(t.pending)}</b></span>
            {t.due_date && t.pending > 0 && <span className="whitespace-nowrap text-slate-500">Due {formatDate(t.due_date)}</span>}
          </div>
        </>
      )}
    </>
  );
  const base = wide
    ? "sm:col-span-full rounded-2xl p-5 text-left bg-gradient-to-br from-[#0B1020] via-[#141C4A] to-[#1B2A7A] shadow-[0_10px_30px_-12px_rgba(11,16,32,.6)]"
    : `ui-card p-4 text-left ${empty ? "!border-dashed bg-[#FAFBFE]" : ""}`;
  const cls = `${base} ${active ? (wide ? "ring-2 ring-[#E9C46A] ring-offset-2" : "ring-2 ring-[#2B4BFF]") : ""}`;
  return onPick
    ? <button type="button" onClick={() => onPick(wide ? "" : t.term)} aria-pressed={!!active} className={`${cls} hoverable w-full`} data-testid={`${testid}-${t.term}`}>{body}</button>
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
