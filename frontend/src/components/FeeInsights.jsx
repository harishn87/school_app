import { useMemo } from "react";
import CountUp from "@/components/CountUp";

/** Collection ring, paid / part paid / unpaid split, . Props: fees (already filtered to what is shown). */
export default function FeeInsights({ fees, view, onPick }) {
  const d = useMemo(() => {
    let due = 0, paid = 0;
    const st = { paid: 0, partial: 0, unpaid: 0 };
    for (const f of fees) {
      const a = Number(f.amount || 0), p = Number(f.paid_amount || 0);
      due += a; paid += p;
      const k = f.status === "paid" ? "paid" : f.status === "partial" ? "partial" : "unpaid";
      st[k]++;
    }
    return { due, paid, st, pct: due ? Math.round((paid / due) * 100) : 0 };
  }, [fees]);
  if (fees.length === 0) return null;
  const n = fees.length;
  const R = 52, C = 2 * Math.PI * R;
  const rows = [["Paid", d.st.paid, "bg-emerald-500", "paid"], ["Part paid", d.st.partial, "bg-amber-400", "partial"], ["Unpaid", d.st.unpaid, "bg-rose-500", "unpaid"]];
  return (
    <div className="w-full" data-testid="fee-insights">
      <div className="ui-card p-5 flex items-center gap-5">
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" role="img" aria-label={`${d.pct}% of fees collected`}>
            <circle cx="64" cy="64" r={R} fill="none" stroke="#EEF0F6" strokeWidth="14" />
            <circle cx="64" cy="64" r={R} fill="none" stroke="#2B4BFF" strokeWidth="14" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - d.pct / 100)} style={{ animation: "ring-draw 1.1s cubic-bezier(.2,.8,.2,1) both", "--ring-from": C }} />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div><div className="font-heading text-2xl font-semibold tabular-nums"><CountUp value={d.pct} format={(v) => `${Math.round(v)}%`} /></div><div className="text-[11px] text-slate-500">collected</div></div>
          </div>
        </div>
        <div className="flex-1 space-y-2.5 min-w-0">
          {rows.map(([k, v, c, key]) => (
            <button type="button" key={k} onClick={() => onPick?.(key)} aria-pressed={view === key} data-testid={`fee-split-${key}`}
              className={`block w-full text-left rounded-lg px-2 py-1 -mx-2 transition hover:bg-[#F1F4FF] ${view === key ? "bg-[#E8ECFF]" : ""}`}>
              <div className="flex justify-between text-xs text-slate-600"><span>{k}</span><span className="tabular-nums font-semibold">{v}</span></div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full anim-grow ${c}`} style={{ width: `${(v / n) * 100}%` }} /></div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
