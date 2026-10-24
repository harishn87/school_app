import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { formatMoney } from "@/lib/utils";

const band = (v, cuts, labels) => { if (v == null) return "No data"; for (let i = 0; i < cuts.length; i++) if (v < cuts[i]) return labels[i]; return labels[labels.length - 1]; };
const rank = (n = "") => { const m = n.match(/\d+/); return (/^(pp|nursery|lkg|ukg|kg)/i.test(n.trim()) ? 0 : 100) + (m ? Number(m[0]) : 0); };
const FEE_LABEL = { paid: "Paid", partial: "Part paid", unpaid: "Unpaid", none: "No fees" };

export const DIMENSIONS = {
  class: { label: "Class", get: (s) => s.class_name, order: (a, b) => rank(a) - rank(b) || a.localeCompare(b) },
  teacher: { label: "Class teacher", get: (s) => s.teacher || "Not assigned" },
  gender: { label: "Gender", get: (s) => ({ male: "Boys", female: "Girls", other: "Other", unspecified: "Not stated" }[s.gender] || "Not stated") },
  fee: { label: "Fee status", get: (s) => FEE_LABEL[s.fee_status], order: (a, b) => Object.values(FEE_LABEL).indexOf(a) - Object.values(FEE_LABEL).indexOf(b) },
  attendance: { label: "Attendance band", get: (s) => band(s.attendance_pct, [75, 90], ["Below 75%", "75 to 89%", "90% and above"]), order: (a, b) => ["Below 75%", "75 to 89%", "90% and above", "No data"].indexOf(a) - ["Below 75%", "75 to 89%", "90% and above", "No data"].indexOf(b) },
  grade: { label: "Grade band", get: (s) => band(s.grade_avg, [40, 55, 70, 85], ["Below 40%", "40 to 54%", "55 to 69%", "70 to 84%", "85% and above"]), order: (a, b) => ["Below 40%", "40 to 54%", "55 to 69%", "70 to 84%", "85% and above", "No data"].indexOf(a) - ["Below 40%", "40 to 54%", "55 to 69%", "70 to 84%", "85% and above", "No data"].indexOf(b) },
  bus: { label: "School bus", get: (s) => (s.bus ? "Uses bus" : "No bus") },
};
const mean = (rows, f) => { const v = rows.map(f).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
const sum = (rows, f) => rows.reduce((a, s) => a + (f(s) || 0), 0);
export const MEASURES = {
  count: { label: "Students", calc: (r) => r.length, fmt: (v) => v, heat: true },
  grade: { label: "Average grade", calc: (r) => mean(r, (s) => s.grade_avg), fmt: (v) => (v == null ? "-" : `${v}%`), heat: true },
  attendance: { label: "Average attendance", calc: (r) => mean(r, (s) => s.attendance_pct), fmt: (v) => (v == null ? "-" : `${v}%`), heat: true },
  billed: { label: "Fees billed", calc: (r) => sum(r, (s) => s.fees_total), fmt: (v) => formatMoney(v), heat: true },
  collected: { label: "Fees collected", calc: (r) => sum(r, (s) => s.fees_paid), fmt: (v) => formatMoney(v), heat: true },
  pending: { label: "Fees pending", calc: (r) => sum(r, (s) => s.fees_pending), fmt: (v) => formatMoney(v), heat: true },
  collection: { label: "Fee collection rate", calc: (r) => { const b = sum(r, (s) => s.fees_total); return b ? Math.round((sum(r, (s) => s.fees_paid) / b) * 100) : null; }, fmt: (v) => (v == null ? "-" : `${v}%`), heat: true },
};

/** Interactive pivot: choose what goes down the side, across the top, and what to measure. */
export default function PivotTable({ students }) {
  const [rowDim, setRowDim] = useState("class");
  const [colDim, setColDim] = useState("fee");
  const [measure, setMeasure] = useState("count");

  const model = useMemo(() => {
    const R = DIMENSIONS[rowDim], Cd = colDim ? DIMENSIONS[colDim] : null, M = MEASURES[measure];
    const uniq = (get, order) => [...new Set(students.map(get))].sort(order || ((a, b) => a.localeCompare(b)));
    const rows = uniq(R.get, R.order), cols = Cd ? uniq(Cd.get, Cd.order) : [];
    const cell = (rv, cv) => M.calc(students.filter((s) => (rv == null || R.get(s) === rv) && (cv == null || !Cd || Cd.get(s) === cv)));
    const body = rows.map((rv) => ({ rv, cells: Cd ? cols.map((cv) => cell(rv, cv)) : [], total: cell(rv, null) }));
    const totals = { cells: Cd ? cols.map((cv) => cell(null, cv)) : [], total: cell(null, null) };
    const nums = body.flatMap((b) => (Cd ? b.cells : [b.total])).filter((v) => typeof v === "number");
    return { R, Cd, M, rows, cols, body, totals, max: Math.max(1, ...nums) };
  }, [students, rowDim, colDim, measure]);

  const heat = (v) => (model.M.heat && typeof v === "number" && v > 0 ? { background: `rgba(43,75,255,${0.06 + 0.3 * (v / model.max)})` } : undefined);
  const exportCsv = () => {
    const head = [model.R.label, ...model.cols, "Total"];
    const lines = [head, ...model.body.map((b) => [b.rv, ...b.cells.map((v) => model.M.fmt(v)), model.M.fmt(b.total)]), ["Total", ...model.totals.cells.map((v) => model.M.fmt(v)), model.M.fmt(model.totals.total)]];
    const csv = lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""').replace(/₹/g, "Rs ")}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `pivot-${rowDim}-${colDim || "total"}-${measure}.csv`;
    a.click();
  };

  const Sel = ({ label, value, onChange, children, testid }) => (
    <label className="block min-w-[150px]"><span className="field-label">{label}</span>
      <select className="ui-input mt-1" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid}>{children}</select></label>
  );

  return (
    <div data-testid="pivot">
      <div className="flex flex-wrap items-end gap-3">
        <Sel label="Rows" value={rowDim} onChange={setRowDim} testid="pivot-rows">{Object.entries(DIMENSIONS).filter(([k]) => k !== colDim).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}</Sel>
        <Sel label="Columns" value={colDim} onChange={setColDim} testid="pivot-cols"><option value="">None</option>{Object.entries(DIMENSIONS).filter(([k]) => k !== rowDim).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}</Sel>
        <Sel label="Measure" value={measure} onChange={setMeasure} testid="pivot-measure">{Object.entries(MEASURES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</Sel>
        <button type="button" onClick={exportCsv} className="ui-btn text-sm ml-auto" data-testid="pivot-export"><Download className="h-4 w-4" aria-hidden="true" /> Download CSV</button>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-[#E7E9F1]">
        <table className="w-full text-sm" data-testid="pivot-table">
          <thead>
            <tr>
              <th scope="col" className="table-head px-4 py-2.5 text-left sticky left-0 bg-[#F8F9FD]">{model.R.label}</th>
              {model.cols.map((c) => <th key={c} scope="col" className="table-head px-4 py-2.5 text-right whitespace-nowrap">{c}</th>)}
              <th scope="col" className="table-head px-4 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEF0F6]">
            {model.body.map((b) => (
              <tr key={b.rv} data-testid={`pivot-row-${b.rv}`}>
                <th scope="row" className="px-4 py-2 text-left font-medium whitespace-nowrap sticky left-0 bg-white">{b.rv}</th>
                {b.cells.map((v, i) => <td key={i} className="px-4 py-2 text-right tabular-nums" style={heat(v)}>{model.M.fmt(v)}</td>)}
                <td className="px-4 py-2 text-right tabular-nums font-semibold bg-[#F8F9FD]">{model.M.fmt(b.total)}</td>
              </tr>
            ))}
            <tr className="bg-[#F8F9FD] font-semibold" data-testid="pivot-total">
              <th scope="row" className="px-4 py-2 text-left sticky left-0 bg-[#F8F9FD]">Total</th>
              {model.totals.cells.map((v, i) => <td key={i} className="px-4 py-2 text-right tabular-nums">{model.M.fmt(v)}</td>)}
              <td className="px-4 py-2 text-right tabular-nums">{model.M.fmt(model.totals.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">Attendance is for the last 30 days. Grades are the average of each student&apos;s progress report marks. Darker cells are higher values.</p>
    </div>
  );
}
