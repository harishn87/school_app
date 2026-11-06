import { useState } from "react";
import { RAG } from "@/components/Syllabus";

/**
 * Wheel of red / amber / green segments, one per item (a class, or a subject within a class).
 * items: [{ key, label, percent, target, status, has, note }]. Shared by the whole-school syllabus wheel and the per-class one.
 */
const SIZE = 560, C = SIZE / 2, R_IN = 92, R_OUT = 232, GAP = 2.2;
const rad = (d) => (d * Math.PI) / 180;
function sector(a0, a1, r0, r1) {
  const p = (a, r) => [C + r * Math.cos(rad(a)), C + r * Math.sin(rad(a))];
  const [x0, y0] = p(a0, r1), [x1, y1] = p(a1, r1), [x2, y2] = p(a1, r0), [x3, y3] = p(a0, r0);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${x0},${y0} A${r1},${r1} 0 ${big} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${big} 0 ${x3},${y3} Z`;
}
export const FILL = { green: "#10B981", amber: "#F59E0B", red: "#F43F5E", none: "#CBD5E1" };
const INK = { green: "#fff", amber: "#0B1020", red: "#fff", none: "#334155" };

export default function RagRing({ items, centreLabel, centreValue, noun = "classes", period = "", onSelect, hint, testid, maxWidth = 520 }) {
  const [hover, setHover] = useState(null);
  const n = items.length;
  if (n === 0) return null;
  const step = 360 / n;
  const done = items.filter((r) => r.has && r.percent != null);
  const avg = centreValue !== undefined ? centreValue : done.length ? Math.round(done.reduce((a, r) => a + r.percent, 0) / done.length) : null;
  const h = hover != null ? items[hover] : null;
  const fs = n > 9 ? 12 : n > 6 ? 13 : 14, fsv = n > 9 ? 15 : 18;
  const when = period ? `${period.toLowerCase()} ` : "";
  const line = (r) => (r.has ? `${r.percent}% ${when ? `of ${when}` : ""}covered against a target of ${r.target}%, ${RAG[r.status].label.toLowerCase()}` : `no syllabus for ${period ? period.toLowerCase() : "this"} yet`);
  return (
    <div data-testid={testid}>
      <div className="mx-auto" style={{ maxWidth }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto" role="img"
          aria-label={`${items.map((r) => `${r.label} ${r.has ? `${r.percent}% covered, ${RAG[r.status]?.label}` : "not set up"}`).join(", ")}`} onMouseLeave={() => setHover(null)}>
          {items.map((r, i) => {
            const a0 = -90 + step * i - step / 2 + GAP / 2, a1 = a0 + step - GAP, mid = (a0 + a1) / 2, on = hover === i;
            const st = r.has ? r.status : "none";
            const rr = (R_IN + R_OUT) / 2 + 4, tx = C + rr * Math.cos(rad(mid)), ty = C + rr * Math.sin(rad(mid));
            const dx = 0, dy = 0;
            return (
              <g key={r.key} transform={`translate(${dx},${dy})`} style={{ cursor: onSelect ? "pointer" : "default" }} opacity={1}
                tabIndex={0} role={onSelect ? "button" : undefined} data-testid={`${testid}-seg-${r.key}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                onClick={() => onSelect?.(r)} onKeyDown={(e) => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(r); } }}
                aria-label={`${r.label}: ${r.has ? `${r.percent}% covered, ${RAG[st].label}` : "syllabus not set up"}`}>
                <path d={sector(a0, a1, R_IN, R_OUT)} fill={FILL[st]} stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
                <text x={tx} y={ty - (r.has ? 9 : 0)} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight="600" fill={INK[st]} style={{ pointerEvents: "none" }}>{r.label}</text>
                {r.has
                  ? <text x={tx} y={ty + 10} textAnchor="middle" dominantBaseline="middle" fontSize={fsv} fontWeight="700" fill={INK[st]} style={{ pointerEvents: "none" }}>{r.percent}%</text>
                  : <text x={tx} y={ty + 14} textAnchor="middle" fontSize="11" fill={INK[st]} style={{ pointerEvents: "none" }}>not set up</text>}
              </g>
            );
          })}
          <circle cx={C} cy={C} r={R_IN - 8} fill="#0B1020" />
          <circle cx={C} cy={C} r={R_IN - 8} fill="none" stroke="#E9C46A" strokeWidth="2" opacity=".9" />
          <text x={C} y={C - 20} textAnchor="middle" fontSize="12" fill="#AEB7DC">{h ? h.label : centreLabel}</text>
          <text x={C} y={C + 12} textAnchor="middle" fontSize="34" fontWeight="700" fill="#fff">{h ? (h.has ? `${h.percent}%` : "-") : avg == null ? "-" : `${avg}%`}</text>
          <text x={C} y={C + 32} textAnchor="middle" fontSize="11" fill="#E9C46A">{h ? (h.has ? `target ${h.target}%` : "no syllabus") : `${done.length} of ${n} ${noun} set up`}</text>
        </svg>
      </div>
      <p className="text-center text-sm text-slate-600 min-h-[2.75rem]" aria-live="polite" data-testid={`${testid}-summary`}>
        {h ? <><b className="text-slate-900">{h.label}</b>: {line(h)}{h.note ? ` · ${h.note}` : ""}{onSelect ? <span className="text-[#2B4BFF]"> · click to open</span> : null}</> : hint}
      </p>
    </div>
  );
}
