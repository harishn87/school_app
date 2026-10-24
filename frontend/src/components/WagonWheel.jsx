import { useState } from "react";

/**
 * Stage wheel: the circle is cut into one segment per class or subject.
 * Darker blue = higher value (the scale runs from the lowest to the highest value shown).
 * Props: items [{ label, value }] (value 0-100 or null), unit, title, testid.
 * onSelect(item, index): makes every segment clickable (mouse and keyboard). activeLabel outlines the chosen segment.
 */
const SIZE = 560, C = SIZE / 2, R_IN = 92, R_OUT = 232, GAP = 2.2;
const LOW = [220, 228, 255], HIGH = [14, 26, 120];
const mix = (t) => LOW.map((l, i) => Math.round(l + (HIGH[i] - l) * t));
const rgb = (a) => `rgb(${a[0]},${a[1]},${a[2]})`;
const lum = (a) => (0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]) / 255;
const rad = (d) => (d * Math.PI) / 180;

function sector(a0, a1, r0, r1) {
  const p = (a, r) => [C + r * Math.cos(rad(a)), C + r * Math.sin(rad(a))];
  const [x0, y0] = p(a0, r1), [x1, y1] = p(a1, r1), [x2, y2] = p(a1, r0), [x3, y3] = p(a0, r0);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${x0},${y0} A${r1},${r1} 0 ${big} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${big} 0 ${x3},${y3} Z`;
}

export default function WagonWheel({ items, unit = "%", title, testid, onSelect, activeLabel, hint }) {
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const n = items.length;
  const vals = items.map((i) => i.value).filter((v) => v != null);
  const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  const min = vals.length ? Math.min(...vals) : 0, max = vals.length ? Math.max(...vals) : 0;
  const shade = (v) => (v == null ? null : mix(max === min ? 0.7 : 0.12 + 0.88 * ((v - min) / (max - min))));
  const named = (v) => items.filter((i) => i.value === v).map((i) => i.label).join(", ");
  const diff = (v) => (v == null || avg == null ? "" : v === avg ? "same as the average" : `${Math.abs(v - avg)} ${v > avg ? "above" : "below"} the average`);

  if (n < 3) return <p className="text-sm text-slate-500 py-8 text-center">A wheel needs at least three {title?.toLowerCase().includes("subject") ? "subjects" : "classes"} with data.</p>;

  const step = 360 / n;
  const fs = n > 9 ? 12 : 14, fsv = n > 9 ? 15 : 18;
  const h = hover != null ? items[hover] : null;

  return (
    <div data-testid={testid}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-slate-600" data-testid={testid ? `${testid}-legend` : undefined}>
          <span>Lower</span>
          <span className="h-2.5 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${rgb(mix(0.12))}, ${rgb(mix(1))})` }} />
          <span>Higher</span>
        </div>
        <button type="button" onClick={() => setAsTable(!asTable)} className="text-xs font-medium text-[#2B4BFF] hover:underline" data-testid={testid ? `${testid}-toggle` : undefined}>{asTable ? "Show wheel" : "Show as table"}</button>
      </div>

      {asTable ? (
        <table className="w-full text-sm mt-3"><tbody className="divide-y divide-[#EEF0F6]">
          {items.map((i) => <tr key={i.label}>
            <td className="py-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm mr-2 align-middle" style={{ background: i.value == null ? "#D5D9E8" : rgb(shade(i.value)) }} />{i.label}</td>
            <td className="py-1.5 text-right tabular-nums font-medium">{i.value == null ? "No data" : `${i.value}${unit}`}</td></tr>)}
        </tbody></table>
      ) : (
        <div className="mx-auto max-w-[560px] mt-2">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto" role="img"
            aria-label={`${title}: ${items.map((i) => `${i.label} ${i.value ?? "no data"}${i.value == null ? "" : unit}`).join(", ")}`}
            onMouseLeave={() => setHover(null)}>
            <defs>
              <pattern id={`${testid || "ww"}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="8" height="8" fill="#EEF0F7" /><rect width="3" height="8" fill="#D5D9E8" />
              </pattern>
              <filter id={`${testid || "ww"}-lift`} x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0B1020" floodOpacity=".28" /></filter>
            </defs>

            {items.map((it, i) => {
              const a0 = -90 + step * i - step / 2 + GAP / 2, a1 = a0 + step - GAP;
              const mid = (a0 + a1) / 2, on = hover === i;
              const col = shade(it.value);
              const rr = (R_IN + R_OUT) / 2 + 4;
              const tx = C + rr * Math.cos(rad(mid)), ty = C + rr * Math.sin(rad(mid));
              const dark = col ? lum(col) < 0.55 : false;
              const ink = col ? (dark ? "#fff" : "#0B1020") : "#4A5273";
              const dx = on ? 6 * Math.cos(rad(mid)) : 0, dy = on ? 6 * Math.sin(rad(mid)) : 0;
              return (
                <g key={i} transform={`translate(${dx},${dy})`} style={{ transition: "transform .15s", cursor: onSelect ? "pointer" : "default" }} opacity={hover == null || on ? 1 : 0.55}
                  onMouseEnter={() => setHover(i)} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                  role={onSelect ? "button" : undefined} data-testid={testid ? `${testid}-seg-${i}` : undefined}
                  onClick={onSelect ? () => onSelect(it, i) : undefined}
                  onKeyDown={onSelect ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(it, i); } } : undefined}
                  aria-label={`${it.label} ${it.value ?? "no data"}${it.value == null ? "" : unit}${onSelect ? ". Click to open" : ""}`}>
                  <path d={sector(a0, a1, R_IN, R_OUT)} fill={col ? rgb(col) : `url(#${testid || "ww"}-hatch)`} stroke={activeLabel === it.label ? "#E9C46A" : "#fff"} strokeWidth={activeLabel === it.label ? 4 : 2.5} strokeLinejoin="round"
                    filter={on ? `url(#${testid || "ww"}-lift)` : undefined} />
                  <text x={tx} y={ty - (it.value == null ? 0 : 9)} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight="600" fill={ink} style={{ pointerEvents: "none" }}>{it.label}</text>
                  <text x={tx} y={ty + 10} textAnchor="middle" dominantBaseline="middle" fontSize={fsv} fontWeight="700" fill={ink} style={{ pointerEvents: "none" }}>
                    {it.value == null ? "" : `${it.value}${unit}`}
                  </text>
                  {it.value == null && <text x={tx} y={ty + 14} textAnchor="middle" fontSize="11" fill="#6B7392" style={{ pointerEvents: "none" }}>no data</text>}
                </g>
              );
            })}

            <circle cx={C} cy={C} r={R_IN - 8} fill="#0B1020" />
            <circle cx={C} cy={C} r={R_IN - 8} fill="none" stroke="#E9C46A" strokeWidth="2" opacity=".9" />
            <text x={C} y={C - 20} textAnchor="middle" fontSize="12" fill="#AEB7DC">{h ? h.label : "Average"}</text>
            <text x={C} y={C + 12} textAnchor="middle" fontSize="34" fontWeight="700" fill="#fff">
              {h ? (h.value == null ? "-" : `${h.value}${unit}`) : avg == null ? "-" : `${avg}${unit}`}
            </text>
            <text x={C} y={C + 32} textAnchor="middle" fontSize="11" fill="#E9C46A">{h ? diff(h.value).replace(" the average", "") : title}</text>
          </svg>
        </div>
      )}

      {!asTable && (
        <p className="mt-2 text-center text-sm text-slate-600 min-h-[2.75rem]" data-testid={testid ? `${testid}-summary` : undefined} aria-live="polite">
          {h ? (
            <span data-testid="wheel-tip"><b className="text-slate-900">{h.label}</b>: {h.value == null ? "no data yet" : `${h.value}${unit}, ${diff(h.value)}`}{onSelect ? <span className="text-[#2B4BFF]"> · click to open</span> : null}</span>
          ) : vals.length > 1 && max !== min ? (
            <>Highest: <b className="text-slate-900">{named(max)}</b> ({max}{unit}). Lowest: <b className="text-slate-900">{named(min)}</b> ({min}{unit}). {onSelect ? (hint || "Click a segment to open it.") : "Hover a segment for details."}</>
          ) : null}
        </p>
      )}
      {!asTable && max !== min && <p className="text-center text-xs text-slate-500">Shading runs from the lowest ({min}{unit}) to the highest ({max}{unit}) value shown.</p>}
    </div>
  );
}
