import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useLive } from "@/lib/live";
import { formatDate, formatMoney } from "@/lib/utils";
import ReportCard from "@/components/ReportCard";
import TermFeeCards, { normTerm, termRows } from "@/components/TermFees";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mlabel = (m) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;
const STATUS = { absent: "bg-rose-50 text-rose-700", late: "bg-amber-50 text-amber-700", present: "bg-emerald-50 text-emerald-700" };

function Kpi({ label, value, note, tone, testid }) {
  return (
    <div className="ui-card !shadow-sm p-4" data-testid={testid}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`font-heading text-2xl font-semibold mt-1 tabular-nums ${tone || ""}`}>{value}</div>
      {note && <div className="text-xs text-slate-500 mt-0.5">{note}</div>}
    </div>
  );
}

function MonthBars({ months }) {
  const any = months.some((m) => m.percent != null);
  if (!any) return <p className="text-sm text-slate-500">No attendance marked this year.</p>;
  return (
    <div className="flex items-end gap-2 h-40" data-testid="stu-att-months" role="img" aria-label={`Attendance by month: ${months.map((m) => `${mlabel(m.month)} ${m.percent ?? "none"}%`).join(", ")}`}>
      {months.map((m) => (
        <div key={m.month} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full" title={m.percent == null ? "No data" : `${m.present} present, ${m.late} late, ${m.absent} absent`}>
          <span className="text-[10px] tabular-nums text-slate-600 mb-1">{m.percent ?? ""}</span>
          <div className={`w-full rounded-t-md ${m.percent == null ? "bg-slate-100" : m.percent >= 90 ? "bg-emerald-500" : m.percent >= 75 ? "bg-amber-400" : "bg-rose-500"}`} style={{ height: `${m.percent == null ? 4 : Math.max(m.percent, 4) * 0.8}%` }} />
          <span className="text-[10px] text-slate-500 mt-1">{mlabel(m.month).slice(0, 3)}</span>
        </div>
      ))}
    </div>
  );
}

export default function StudentProfileTabs({ student, year, role }) {
  const id = student.id;
  const [tab, setTab] = useState("overview");
  const [att, setAtt] = useState(null);
  const [fees, setFees] = useState([]);
  const [reports, setReports] = useState([]);
  const [tr, setTr] = useState(undefined);
  const live = useLive(30000);
  useEffect(() => {
    if (!year) return;
    api.get(`/students/${id}/attendance`, { params: { academic_year: year } }).then((r) => setAtt(r.data)).catch(() => setAtt(null));
    if (role !== "teacher") api.get("/fees", { params: { student_id: id, academic_year: year } }).then((r) => setFees(r.data)).catch(() => setFees([]));
    api.get("/reports", { params: { student_id: id, academic_year: year } }).then((r) => setReports(r.data)).catch(() => setReports([]));
  }, [id, year, role, live]);
  useEffect(() => { if (role === "admin") api.get(`/students/${id}/transport`).then((r) => setTr(r.data)).catch(() => setTr(null)); }, [id, role]);

  const terms = useMemo(() => termRows(fees), [fees]);
  const billed = fees.reduce((a, f) => a + Number(f.amount || 0), 0), paid = fees.reduce((a, f) => a + Number(f.paid_amount || 0), 0);
  const withPct = reports.filter((r) => r.percent != null);
  const grade = withPct.length ? Math.round(withPct.reduce((a, r) => a + r.percent, 0) / withPct.length) : null;
  const noFees = role === "teacher";
  const tabs = [["overview", "Overview"], ...(noFees ? [] : [["fees", "Fees"]]), ["academics", "Academics"], ["attendance", "Attendance"], ...(role === "admin" ? [["transport", "Transport"]] : [])];

  return (
    <div className="space-y-5" data-testid="student-profile">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 stagger">
        <Kpi label="Attendance" value={att?.percent == null ? "—" : `${att.percent}%`} note={att?.marked ? `${att.present + att.late} of ${att.marked} days` : "Nothing marked"} tone={att?.percent == null ? "" : att.percent >= 90 ? "text-emerald-600" : att.percent >= 75 ? "text-amber-600" : "text-rose-600"} testid="stu-kpi-att" />
        {!noFees && <Kpi label="Fees pending" value={fees.length ? formatMoney(Math.max(billed - paid, 0)) : "—"} note={fees.length ? `${formatMoney(paid)} paid of ${formatMoney(billed)}` : "No fees this year"} tone={billed - paid > 0 ? "text-rose-600" : ""} testid="stu-kpi-fees" />}
        <Kpi label="Average grade" value={grade == null ? "—" : `${grade}%`} note={withPct.length ? `${withPct.length} report${withPct.length > 1 ? "s" : ""}` : "No reports yet"} testid="stu-kpi-grade" />
      </div>

      <div className="ui-card p-5" data-testid="academics">
        <div role="tablist" aria-label="Student record" className="flex gap-1 overflow-x-auto border-b border-slate-200 -mx-1 px-1">
          {tabs.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`stu-tab-${k}`}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === k ? "border-[#2B4BFF] text-[#2B4BFF]" : "border-transparent text-slate-600 hover:text-slate-900"}`}>{l}</button>
          ))}
        </div>

        <div className="pt-5" role="tabpanel">
          {tab === "overview" && (
            <div className="space-y-6" data-testid="stu-pane-overview">
              {!noFees && <div><h3 className="font-heading font-semibold mb-3">Fees by term</h3><TermFeeCards mine terms={terms} testid="stu-ov-terms" /></div>}
              <div><h3 className="font-heading font-semibold mb-3">Attendance by month</h3><MonthBars months={att?.months || []} /></div>
              {reports.length > 0 && <div><h3 className="font-heading font-semibold mb-3">Latest report</h3><ReportCard report={reports[reports.length - 1]} compact /></div>}
            </div>
          )}

          {tab === "fees" && (
            <div className="space-y-5" data-testid="stu-pane-fees">
              <TermFeeCards mine terms={terms} testid="stu-terms" />
              {fees.length > 0 && (
                <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="table-head text-left">
                  {["Term", "Amount", "Paid", "Balance", "Status", "Due", "Paid on"].map((h) => <th key={h} className="px-3 py-2 font-heading font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{fees.map((f) => (
                    <tr key={f.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{normTerm(f.term)}</td><td className="px-3 py-2">{formatMoney(f.amount)}</td><td className="px-3 py-2">{formatMoney(f.paid_amount)}</td>
                      <td className="px-3 py-2 font-medium">{formatMoney(Math.max(f.amount - f.paid_amount, 0))}</td><td className="px-3 py-2 capitalize">{f.status}</td>
                      <td className="px-3 py-2">{f.due_date ? formatDate(f.due_date) : "—"}</td><td className="px-3 py-2">{f.paid_date ? formatDate(f.paid_date) : "—"}</td></tr>))}</tbody></table></div>
              )}
              <Link to={`/app/fees?student=${id}`} className="ui-btn text-sm inline-flex" data-testid="stu-open-fees">{role === "admin" ? "Manage fees" : "Open fees"}</Link>
            </div>
          )}

          {tab === "academics" && (
            <div data-testid="stu-pane-academics">
              {reports.length ? <div className="grid lg:grid-cols-2 gap-4" data-testid="academics-reports">{reports.map((r) => <ReportCard key={r.id} report={r} compact />)}</div>
                : <p className="text-sm text-slate-500">No progress report for {year} yet.</p>}
              {student.class_id && <Link to={`/app/progress?class=${student.class_id}`} className="ui-btn text-sm inline-flex mt-4" data-testid="update-progress-link">{role === "teacher" ? "Update progress report" : "View class analysis"}</Link>}
            </div>
          )}

          {tab === "attendance" && (
            <div className="space-y-5" data-testid="stu-pane-attendance">
              {att && (
                <div className="flex flex-wrap gap-2 text-xs font-medium">
                  <span className={`pill px-2.5 py-1 ${STATUS.present}`}>{att.present} present</span>
                  <span className={`pill px-2.5 py-1 ${STATUS.late}`}>{att.late} late</span>
                  <span className={`pill px-2.5 py-1 ${STATUS.absent}`}>{att.absent} absent</span>
                </div>
              )}
              <MonthBars months={att?.months || []} />
              <div>
                <h3 className="font-heading font-semibold mb-2">Days missed or late</h3>
                {att?.missed?.length ? (
                  <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2" data-testid="stu-missed">
                    {att.missed.map((d) => <li key={d.date} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"><span>{formatDate(d.date)}</span><span className={`pill px-2 py-0.5 text-xs capitalize ${STATUS[d.status]}`}>{d.status}</span></li>)}
                  </ul>
                ) : <p className="text-sm text-slate-500">No absences or late marks this year.</p>}
              </div>
            </div>
          )}

          {tab === "transport" && (
            <div data-testid="stu-pane-transport">
              {tr === undefined ? <p className="text-sm text-slate-500">Loading…</p> : tr ? (
                <dl className="grid sm:grid-cols-2 gap-3 max-w-xl text-sm">
                  {[["Route", tr.route], ["Stop", tr.stop], ["Bus", tr.bus], ["Uses", tr.mode]].map(([k, v]) => <div key={k} className="ui-card !shadow-sm p-3"><dt className="field-label">{k}</dt><dd className="mt-1 capitalize">{v || "—"}</dd></div>)}
                </dl>
              ) : <p className="text-sm text-slate-500">Not on a school bus. <Link to="/app/transport" className="text-[#2B4BFF] font-medium hover:underline">Open Transport</Link></p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
