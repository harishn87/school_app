import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import WagonWheel from "@/components/WagonWheel";
import CountUp from "@/components/CountUp";
import { api } from "@/lib/api";

const MON = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
const MET = [["joined", "Joined"], ["left", "Left"], ["net", "Net change"]];

/** Management card: students joining and leaving, year against year. Wings of the wheel are academic years. */
export default function AdmissionsExits() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [metric, setMetric] = useState("joined");
  const [pick, setPick] = useState("");

  useEffect(() => { api.get("/students/movement").then((r) => setData(r.data)).catch(() => setErr(true)); }, []);
  const years = useMemo(() => data?.years || [], [data]);
  const sel = years.find((y) => y.year === pick) || years[years.length - 1];
  const prev = sel ? years[years.findIndex((y) => y.year === sel.year) - 1] : null;
  if (err) return null;
  if (!data) return <div className="ui-card p-5 text-sm text-slate-500">Loading admissions…</div>;
  const items = years.map((y) => ({ label: y.year, id: y.year, value: y[metric] }));
  const maxM = Math.max(1, ...sel.months.flatMap((m) => [m.joined, m.left]));
  const delta = (a, b) => (b == null ? null : a - b);
  const chip = (label, v, goodWhenUp) => v == null ? null : (
    <span className={`pill text-xs font-medium px-2.5 py-1 inline-flex items-center gap-1 ${v === 0 ? "bg-slate-100 text-slate-600" : (v > 0) === goodWhenUp ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
      {v > 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : v < 0 ? <ArrowDownRight className="h-3 w-3" aria-hidden="true" /> : null}{v > 0 ? "+" : ""}{v} {label} vs {prev.year}
    </span>
  );

  return (
    <section className="ui-card p-5 space-y-5" data-testid="admissions-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">Admissions and exits</h2>
          <p className="text-xs text-slate-500 mt-0.5">Students who joined and left the school each academic year. Click a wing to compare that year month by month.</p>
        </div>
        <div className="flex gap-2" role="group" aria-label="Measure">
          {MET.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMetric(k)} aria-pressed={metric === k} data-testid={`adm-metric-${k}`}
              className={`pill ${metric === k ? "bg-[#2B4BFF] text-white" : "bg-[#F1F4FF] text-[#3A4160]"} px-3 py-1 text-xs font-medium rounded-full`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
        <WagonWheel items={items} unit="" title="Admissions by year" testid="adm-wheel" activeLabel={sel.year} onSelect={(it) => setPick(it.id)}
          hint="Click a year to compare it." />
        <div data-testid="adm-detail" key={sel.year} style={{ animation: "slide-in .4s ease-out" }} className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h3 className="font-heading text-lg font-semibold">{sel.year}</h3>
            <span className="text-xs text-slate-500">{sel.year === data.current ? "This year so far" : "Whole year"}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[["Joined", sel.joined, "text-emerald-600"], ["Left", sel.left, "text-rose-600"], ["Net", sel.net, sel.net >= 0 ? "text-emerald-600" : "text-rose-600"]].map(([k, v, c]) => (
              <div key={k} className="rounded-xl border border-[#E7E9F1] p-3">
                <div className="text-xs text-slate-500">{k}</div>
                <div className={`font-heading text-2xl font-semibold tabular-nums ${c}`}><CountUp value={v} format={(x) => `${k === "Net" && x > 0 ? "+" : ""}${Math.round(x)}`} /></div>
              </div>
            ))}
          </div>
          {prev && <div className="flex flex-wrap gap-2" data-testid="adm-compare">{chip("joined", delta(sel.joined, prev.joined), true)}{chip("left", delta(sel.left, prev.left), false)}</div>}
          <div>
            <div className="flex items-end gap-1 h-28" data-testid="adm-months">
              {sel.months.map((m, i) => (
                <div key={i} className="flex-1 flex items-end justify-center gap-0.5 h-full" title={`${MON[i]}: ${m.joined} joined, ${m.left} left`}>
                  <div className="w-1/2 rounded-t bg-emerald-500" style={{ height: `${(m.joined / maxM) * 100}%`, minHeight: m.joined ? 3 : 0, animation: "rise-y .7s both", transformOrigin: "bottom" }} />
                  <div className="w-1/2 rounded-t bg-rose-500" style={{ height: `${(m.left / maxM) * 100}%`, minHeight: m.left ? 3 : 0, animation: "rise-y .7s both", transformOrigin: "bottom" }} />
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-1">{MON.map((m) => <div key={m} className="flex-1 text-center text-[10px] text-slate-500">{m}</div>)}</div>
            <div className="flex gap-4 mt-2 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Joined</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-rose-500" />Left</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link className="font-medium text-[#2B4BFF] hover:underline" to={`/app/students?move=joined&year=${sel.year}`} data-testid="adm-link-joined">See the {sel.joined} who joined</Link>
            <Link className="font-medium text-[#2B4BFF] hover:underline" to={`/app/students?move=left&year=${sel.year}`} data-testid="adm-link-left">See the {sel.left} who left</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
