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

/** Year picker as a dropdown list, newest first, defaulting to the current year. (`chips` is accepted but no longer changes the look.) */
export default function YearSelect({ years, current, value, onChange, id = "year-select", label = "Academic year", className = "" }) {
  if (!years || years.length < 1) return null;
  const v = value || current;
  const list = years.includes(v) ? years : [v, ...years];
  return (
    <div className={`inline-flex flex-col ${className}`} data-testid="year-chips">
      <label className="field-label" htmlFor={id}>{label}</label>
      <select id={id} className="ui-input mt-1 min-w-[200px]" value={v} onChange={(e) => onChange(e.target.value)} data-testid={id}>
        {list.map((y) => <option key={y} value={y}>{y}{y === current ? " (this year)" : ""}</option>)}
      </select>
      {years.length < 2 && <span className="mt-1 text-xs text-slate-500" data-testid="year-hint">Earlier years appear here once their data is added.</span>}
    </div>
  );
}
