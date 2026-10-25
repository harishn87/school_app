import { useEffect, useRef, useState } from "react";

/** Numbers that count up to their value once when they appear. Props: value, format (fn), duration (ms). */
export default function CountUp({ value, format = (v) => Math.round(v).toLocaleString("en-IN"), duration = 900 }) {
  const target = Number(value);
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShown(target); return undefined; }
    const start = performance.now(), a = from.current;
    let raf;
    const tick = (t) => {
      const p = Math.min((t - start) / duration, 1);
      const v = a + (target - a) * (1 - Math.pow(1 - p, 3));
      setShown(v); from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  if (!Number.isFinite(target)) return <>{format(value)}</>;
  return <>{format(shown)}</>;
}
