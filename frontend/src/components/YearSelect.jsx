import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { api } from "@/lib/api";

// Indian school years run April to March, e.g. "2026-27". Used only if the server can't tell us.
const guessYear = () => { const d = new Date(); const s = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${s}-${String(s + 1).slice(2)}`; };

/** Academic years that have data, newest first. The current year is always included. */
export function useAcademicYears() {
  const [info, setInfo] = useState({ current: "", years: [], loaded: false });
  useEffect(() => {
    api.get("/academic-years").then((r) => setInfo({ ...r.data, loaded: true }))
      .catch(() => { const y = guessYear(); setInfo({ current: y, years: [y], loaded: true }); });
  }, []);
  return info;
}

/** Year picker as a dropdown list, newest first, defaulting to the current year. (`chips` is accepted but no longer changes the look.) */
export default function YearSelect({ years, current, value, onChange, id = "year-select", label = "Academic year", className = "", compact = false }) {
  if (!years || years.length < 1) return null;
  const v = value || current;
  const list = years.includes(v) ? years : [v, ...years];
  const isCurrent = v === current;
  return (
    <div className={`inline-flex flex-col ${className}`} data-testid="year-chips">
      <div className="inline-flex items-center gap-3 rounded-2xl border border-[#2B4BFF]/20 bg-gradient-to-r from-[#EEF1FF] via-white to-[#FFF7E0] pl-3 pr-4 py-2.5 max-w-full shadow-[0_6px_20px_-10px_rgba(43,75,255,0.45)]">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#2B4BFF] to-[#1B2A7A] text-white shadow-md" aria-hidden="true"><CalendarDays className="h-5 w-5" /></span>
        <div className="flex flex-col">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[#2B4BFF]" htmlFor={id}>{label}</label>
          <select id={id} className={`-ml-1 mt-0.5 ${compact ? "min-w-[96px]" : "min-w-[170px]"} cursor-pointer rounded-lg border-0 bg-transparent py-0.5 pl-1 pr-6 font-heading text-lg font-semibold text-[#0B1020] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2B4BFF]/40`} value={v} onChange={(e) => onChange(e.target.value)} data-testid={id}>
            {list.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {!compact && <span className={`ml-1 hidden sm:inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${isCurrent ? "bg-emerald-50 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{isCurrent ? "Current year" : "Past year"}</span>}
      </div>
      {years.length < 2 && <span className="mt-1 text-xs text-slate-500" data-testid="year-hint">Earlier years appear here once their data is added.</span>}
    </div>
  );
}
