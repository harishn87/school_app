import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => new Date().toLocaleDateString("en-CA");
const parse = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ""); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
const pretty = (v) => { const p = parse(v); return p ? new Date(p.y, p.m, p.d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""; };

/**
 * Drop-in replacement for <input type="date">: same value format (YYYY-MM-DD) and the same
 * onChange({ target: { value } }) call, with a branded calendar instead of the browser's own.
 */
export default function DateField({ value = "", onChange, min, max, required, disabled, className = "ui-input", id, placeholder = "Select date", ...rest }) {
  const btn = useRef(null);
  const pop = useRef(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("days");               // "days" | "months"
  const sel = parse(value);
  const start = sel || parse(todayIso());
  const [cur, setCur] = useState({ y: start.y, m: start.m });
  const [pos, setPos] = useState({ top: 0, left: 0, up: false });

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect(); if (!r) return;
    const W = 304, H = 400;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
    const up = r.bottom + H > window.innerHeight && r.top > H;
    setPos({ left, top: up ? r.top - 8 : r.bottom + 8, up });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!pop.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, place]);

  const toggle = () => {
    if (disabled) return;
    if (!open) { const p = parse(value) || parse(todayIso()); setCur({ y: p.y, m: p.m }); setView("days"); }
    setOpen(!open);
  };
  const pick = (v) => { onChange?.({ target: { value: v } }); setOpen(false); btn.current?.focus(); };
  const off = (v) => (min && v < min) || (max && v > max);
  const step = (n) => setCur(({ y, m }) => { const t = y * 12 + m + n; return { y: Math.floor(t / 12), m: t % 12 }; });

  const first = new Date(cur.y, cur.m, 1).getDay();
  const dim = new Date(cur.y, cur.m + 1, 0).getDate();
  const prevDim = new Date(cur.y, cur.m, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const n = i - first + 1;
    if (n < 1) { const t = cur.y * 12 + cur.m - 1; return { y: Math.floor(t / 12), m: t % 12, d: prevDim + n, out: true }; }
    if (n > dim) { const t = cur.y * 12 + cur.m + 1; return { y: Math.floor(t / 12), m: t % 12, d: n - dim, out: true }; }
    return { y: cur.y, m: cur.m, d: n, out: false };
  });
  const today = todayIso();
  const cls = `date-field ${className} flex items-center justify-between gap-2 text-left`;

  return (
    <>
      <button ref={btn} type="button" id={id} className={cls} onClick={toggle} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} {...rest}>
        <span className={value ? "truncate" : "truncate font-normal text-slate-400"}>{value ? pretty(value) : placeholder}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-[#2B4BFF]" aria-hidden="true" />
      </button>
      {required && <input tabIndex={-1} aria-hidden="true" required readOnly value={value || ""} className="pointer-events-none absolute h-0 w-0 opacity-0" onChange={() => {}} />}
      {open && createPortal(
        <div ref={pop} role="dialog" aria-label="Choose a date" data-testid="date-popover"
          className="fixed z-[200] w-[304px] overflow-hidden rounded-2xl border border-[#2B4BFF]/20 bg-white shadow-[0_24px_60px_-18px_rgba(11,16,32,0.45)]"
          style={{ left: pos.left, top: pos.top, transform: pos.up ? "translateY(-100%)" : undefined }}>
          <div className="surface-midnight flex items-center justify-between gap-2 px-3 py-3 text-white">
            <button type="button" onClick={() => (view === "days" ? step(-1) : setCur({ ...cur, y: cur.y - 1 }))} aria-label={view === "days" ? "Previous month" : "Previous year"} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 hover:bg-white/20"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" onClick={() => setView(view === "days" ? "months" : "days")} className="rounded-lg px-3 py-1 font-heading text-sm font-semibold hover:bg-white/10" aria-label="Choose month and year">
              {view === "days" ? `${MONTHS[cur.m]} ${cur.y}` : cur.y}
            </button>
            <button type="button" onClick={() => (view === "days" ? step(1) : setCur({ ...cur, y: cur.y + 1 }))} aria-label={view === "days" ? "Next month" : "Next year"} className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 hover:bg-white/20"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          {view === "months" ? (
            <div className="grid grid-cols-3 gap-2 p-3">
              {MONTHS.map((n, i) => (
                <button key={n} type="button" onClick={() => { setCur({ ...cur, m: i }); setView("days"); }}
                  className={`rounded-xl py-2.5 text-sm font-medium ${i === cur.m ? "bg-gradient-to-br from-[#2B4BFF] to-[#1B2A7A] text-white shadow-md" : "bg-[#F4F6FF] text-slate-700 hover:bg-[#E8ECFF]"}`}>{n.slice(0, 3)}</button>
              ))}
            </div>
          ) : (
            <div className="p-3">
              <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wide text-[#2B4BFF]/80">{DOW.map((d) => <span key={d} className="py-1">{d}</span>)}</div>
              <div className="grid grid-cols-7 gap-y-1" role="grid">
                {cells.map((c) => {
                  const v = iso(c.y, c.m, c.d);
                  const isSel = v === value, isToday = v === today, dis = off(v);
                  return (
                    <button key={v} type="button" disabled={dis} onClick={() => pick(v)} data-date={v}
                      className={`mx-auto grid h-9 w-9 place-items-center rounded-full text-sm tabular-nums transition-colors
                        ${isSel ? "bg-gradient-to-br from-[#2B4BFF] to-[#1B2A7A] font-semibold text-white shadow-[0_6px_14px_-4px_rgba(43,75,255,.7)]"
                          : dis ? "cursor-not-allowed text-slate-300"
                          : c.out ? "text-slate-300 hover:bg-[#F1F4FF]"
                          : "font-medium text-slate-800 hover:bg-[#E8ECFF]"}
                        ${isToday && !isSel ? "ring-2 ring-[#E9C46A] ring-offset-1" : ""}`}>{c.d}</button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-[#EEF0F6] bg-[#F8F9FF] px-4 py-2.5 text-sm font-semibold">
            {required || !value ? <span /> : <button type="button" onClick={() => pick("")} className="text-slate-500 hover:text-rose-600">Clear</button>}
            <button type="button" disabled={off(today)} onClick={() => pick(today)} className="rounded-full bg-[#E9C46A] px-3 py-1 text-xs font-semibold text-[#0B1020] hover:bg-[#F2D283] disabled:opacity-40">Today</button>
          </div>
        </div>, document.body)}
    </>
  );
}
