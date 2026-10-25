import { useState } from "react";

const SEG = [
  { key: "joined", label: "Joined", color: "#10B981" },
  { key: "left", label: "Left", color: "#F43F5E" },
  { key: "continuing", label: "Continuing", color: "#2B4BFF" },
];
const S = 200, C = S / 2, R0 = 58, R1 = 92;
const rad = (d) => (d * Math.PI) / 180;
function arc(a0, a1, r0, r1) {
  const p = (a, r) => [C + r * Math.cos(rad(a)), C + r * Math.sin(rad(a))];
  const [x0, y0] = p(a0, r1), [x1, y1] = p(a1, r1), [x2, y2] = p(a1, r0), [x3, y3] = p(a0, r0);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${x0},${y0} A${r1},${r1} 0 ${big} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${big} 0 ${x3},${y3} Z`;
}

/** Small three-wing wheel: joined, left and continuing students. Click a wing (or the centre for both). */
export default function MovementWheel({ joined = 0, left = 0, continuing = 0, active, onSelect, testid = "movement-wheel" }) {
  const [hover, setHover] = useState(null);
  const vals = { joined, left, continuing };
  const total = joined + left + continuing;
  const net = joined - left;
  // wings are sized by count, but never thinner than 14 degrees so a small number stays clickable
  const MIN = 14;
  const nz = SEG.filter((s) => vals[s.key] > 0);
  const spare = 360 - MIN * nz.length;
  const sum = nz.reduce((a, s) => a + vals[s.key], 0) || 1;
  let a = -90;
  const wings = SEG.map((s) => {
    const span = vals[s.key] > 0 ? MIN + (vals[s.key] / sum) * spare : 0;
    const w = { ...s, a0: a + 1, a1: a + span - 1, span };
    a += span;
    return w;
  });
  const shown = hover || active;
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="h-44 w-44 shrink-0" role="group" aria-label="Students who joined, left and continued" data-testid={testid}>
      {total === 0 && <circle cx={C} cy={C} r={(R0 + R1) / 2} fill="none" stroke="#EEF0F6" strokeWidth={R1 - R0} />}
      {wings.filter((w) => w.span > 0).map((w) => (
        <path key={w.key} d={arc(w.a0, Math.max(w.a1, w.a0 + 1), R0, shown === w.key ? R1 + 5 : R1)} fill={w.color}
          opacity={shown && shown !== w.key ? 0.45 : 1} className="cursor-pointer transition-all duration-200 focus:outline-none" style={{ transformOrigin: "center", animation: "pop-in .6s both" }}
          tabIndex={0} role="button" aria-label={`${w.label}: ${vals[w.key]}`} aria-pressed={active === w.key} data-testid={`${testid}-${w.key}`}
          onMouseEnter={() => setHover(w.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(w.key)} onBlur={() => setHover(null)}
          onClick={() => onSelect?.(w.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(w.key); } }} />
      ))}
      <g className="cursor-pointer" onClick={() => onSelect?.("both")} role="button" tabIndex={0} aria-label="Show joiners and leavers" data-testid={`${testid}-both`}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.("both"); } }}>
        <circle cx={C} cy={C} r={R0 - 4} fill="#0B1020" />
        {shown && shown !== "both" ? (<>
          <text x={C} y={C + 2} textAnchor="middle" fill="#fff" fontSize="26" fontWeight="700">{vals[shown]}</text>
          <text x={C} y={C + 20} textAnchor="middle" fill="#E9C46A" fontSize="11">{SEG.find((s) => s.key === shown)?.label}</text>
        </>) : (<>
          <text x={C} y={C + 2} textAnchor="middle" fill="#fff" fontSize="26" fontWeight="700">{net > 0 ? `+${net}` : net}</text>
          <text x={C} y={C + 20} textAnchor="middle" fill="#E9C46A" fontSize="11">net change</text>
        </>)}
      </g>
    </svg>
  );
}
