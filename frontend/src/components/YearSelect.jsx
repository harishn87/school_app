import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/** Academic years that have data, newest first. The current year is always included. */
export function useAcademicYears() {
  const [info, setInfo] = useState({ current: "", years: [], loaded: false });
  useEffect(() => { api.get("/academic-years").then((r) => setInfo({ ...r.data, loaded: true })).catch(() => setInfo((i) => ({ ...i, loaded: true }))); }, []);
  return info;
}

/** A compact year picker. Renders nothing while there is only one year to choose from. */
export default function YearSelect({ years, current, value, onChange, id = "year-select", chips = false }) {
  if (!years || years.length < 2) return null;
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
