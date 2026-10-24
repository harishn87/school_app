import { useMemo, useState } from "react";

/**
 * Wagon wheel: one spoke per item (class, subject...), distance from the centre = value.
 * Props: items [{ label, value }] (value 0-100 or null), unit ("%"), title, zoom (bool: scale starts near the lowest value).
 */
const SIZE = 460, C = SIZE / 2, R = 150;

export default function WagonWheel({ items, unit = "%", title, zoom = false, testid }) {
  const [hover, setHover] = useState(null);
  const [asTable, setAsTable] = useState(false);
  const n = items.length;
  const vals = items.map((i) => i.value).filter((v) => v != null);
  const lo = zoom && vals.length ? Math.max(0, Math.floor((Math.min(...vals) - 8) / 10) * 10) : 0;
  const hi = 100;
  const rad = (v) => ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * R;
  const ang = (i) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const pt = (i, r) => [C + r * Math.cos(ang(i)), C + r * Math.sin(ang(i))];
  const rings = useMemo(() => [0.25, 0.5, 0.75, 1].map((f) => lo + (hi - lo) * f), [lo]);
  const poly = items.map((it, i) => pt(i, it.value == null ? 0 : rad(it.value)).join(",")).join(" ");
  const best = vals.length ? Math.max(...vals) : null;
  const worst = vals.length ? Math.min(...vals) : null;

  if (n < 3) return <p className="text-sm text-slate-500 py-8 text-center">A wheel needs at least three {title?.toLowerCase().includes("subject") ? "subjects" : "classes"} with data.</p>;

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * SIZE - C, y = ((e.clientY - r.top) / r.height) * SIZE - C;
    if (Math.hypot(x, y) < 20) return setHover(null);
    let a = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (a < 0) a += 360;
    setHover(Math.round(a / (360 / n)) % n);
  };

  return (
    <div data-testid={testid}>
      <div className="flex justify-end -mb-2">
        <button type="button" onClick={() => setAsTable(!asTable)} className="text-xs font-medium text-[#2B4BFF] hover:underline" data-testid={testid ? `${testid}-toggle` : undefined}>{asTable ? "Show wheel" : "Show as table"}</button>
      </div>
      {asTable ? (
        <table className="w-full text-sm mt-3"><tbody className="divide-y divide-[#EEF0F6]">
          {items.map((i) => <tr key={i.label}><td className="py-1.5">{i.label}</td><td className="py-1.5 text-right tabular-nums font-medium">{i.value == null ? "-" : `${i.value}${unit}`}</td></tr>)}
        </tbody></table>
      ) : (
        <div className="relative mx-auto max-w-[480px]">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto" role="img" aria-label={`${title}: ${items.map((i) => `${i.label} ${i.value ?? "no data"}${i.value == null ? "" : unit}`).join(", ")}`}
            onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
            {rings.map((v) => (
              <g key={v}>
                <circle cx={C} cy={C} r={rad(v)} fill="none" stroke="#E3E7F5" strokeWidth="1" />
                <text x={C + 3} y={C - rad(v) - 2} fontSize="9" fill="#8A93AD">{Math.round(v)}{unit}</text>
              </g>
            ))}
            {items.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke={hover === i ? "#2B4BFF" : "#E3E7F5"} strokeWidth={hover === i ? 1.5 : 1} />; })}
            <polygon points={poly} fill="#2B4BFF" fillOpacity="0.13" stroke="#2B4BFF" strokeWidth="2" strokeLinejoin="round" />
            {items.map((it, i) => {
              if (it.value == null) return null;
              const [x, y] = pt(i, rad(it.value));
              return <circle key={i} cx={x} cy={y} r={hover === i ? 6 : 4.5} fill="#2B4BFF" stroke="#fff" strokeWidth="2" tabIndex={0}
                aria-label={`${it.label} ${it.value}${unit}`} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />;
            })}
            {items.map((it, i) => {
              const [x, y] = pt(i, R + 16); const cos = Math.cos(ang(i));
              const strong = it.value != null && (it.value === best || it.value === worst) && best !== worst;
              return (
                <text key={i} x={x} y={y} fontSize="11" textAnchor={Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end"} dominantBaseline="middle"
                  fill={hover === i ? "#2340F0" : "#3A4160"} fontWeight={hover === i || strong ? 600 : 400}>
                  {it.label}{strong ? ` ${it.value}${unit}` : ""}
                </text>
              );
            })}
          </svg>
          {hover != null && (
            <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg bg-[#0B1020] px-3 py-1.5 text-xs text-white shadow-lg" data-testid="wheel-tip">
              <b className="font-medium">{items[hover].label}</b> · {items[hover].value == null ? "no data" : `${items[hover].value}${unit}`}
            </div>
          )}
        </div>
      )}
      {lo > 0 && !asTable && <p className="text-center text-xs text-slate-500">Zoomed: the centre of the wheel is {lo}{unit}, not zero.</p>}
    </div>
  );
}
