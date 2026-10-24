import { useEffect, useState } from "react";
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

/** A compact year picker. Always shown, so it is clear where earlier years will appear. */
export default function YearSelect({ years, current, value, onChange, id = "year-select", chips = false }) {
  if (!years || years.length < 1) return null;
  const v = value || current;
  if (chips) {
    return (
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Academic year" data-testid="year-chips">
        {years.map((y) => (
          <button key={y} type="button" onClick={() => onChange(y)} aria-pressed={y === v} data-testid={`year-${y}`}
            className={`pill px-3 py-1.5 ${y === v ? "bg-[#2B4BFF] text-white" : "bg-[#F1F4FF] text-slate-700 hover:bg-[#E8ECFF]"}`}>
            {y}{y === current ? " (this year)" : ""}
          </button>
        ))}
        {years.length < 2 && <span className="text-xs text-slate-500" data-testid="year-hint">Earlier years appear here once their data is added.</span>}
      </div>
    );
  }
  return (
    <div>
      <label className="field-label" htmlFor={id}>Year</label>
      <select id={id} className="ui-input" value={v} onChange={(e) => onChange(e.target.value)} data-testid={id}>
        {years.map((y) => <option key={y} value={y}>{y}{y === current ? " (this year)" : ""}</option>)}
      </select>
    </div>
  );
}
