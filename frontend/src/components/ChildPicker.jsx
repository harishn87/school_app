import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";

const KEY = "scholaris.child";
const read = () => { try { return localStorage.getItem(KEY) || ""; } catch (_e) { return ""; } };

/** Which of a parent's children is being looked at. Kept in the address (?child=) and remembered between pages. */
export function useChildPick(kids) {
  const [params, setParams] = useSearchParams();
  const want = params.get("child") || read();
  const id = (kids || []).find((k) => k.id === want)?.id || kids?.[0]?.id || "";
  const pick = (cid) => {
    try { localStorage.setItem(KEY, cid); } catch (_e) { /* private window: just don't remember */ }
    const n = new URLSearchParams(params); n.set("child", cid); setParams(n, { replace: true });
  };
  return [id, pick];
}

let classCache = null;
const initials = (k) => { const f = (k.first_name || "?").trim(); return f[0].toUpperCase() + (f[1] || "").toLowerCase(); };

/** One button per child, so a parent sees a single child at a time instead of everyone stacked on one page. Hidden for one child. */
export default function ChildPicker({ kids, value, onPick, className = "" }) {
  const [names, setNames] = useState({});
  useEffect(() => {
    if (!kids || kids.length < 2) return;
    (classCache || (classCache = api.get("/classes").then((r) => Object.fromEntries(r.data.map((c) => [c.id, `${c.name} ${c.section || ""}`.trim()]))).catch(() => ({}))))
      .then(setNames);
  }, [kids]);
  if (!kids || kids.length < 2) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`} role="tablist" aria-label="Choose a child" data-testid="child-picker">
      {kids.map((k) => {
        const on = k.id === value;
        return (
          <button key={k.id} type="button" role="tab" aria-selected={on} onClick={() => onPick(k.id)} data-testid={`child-tab-${k.id}`}
            className={`flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-all ${on ? "border-[#2B4BFF] bg-[#EEF1FF] shadow-sm" : "border-[#E1E4EE] bg-white hover:border-slate-300"}`}>
            <span className={`h-9 w-9 shrink-0 grid place-items-center rounded-full text-xs font-semibold ${on ? "bg-[#2B4BFF] text-white" : "bg-[#F1F3FA] text-slate-600"}`}>{initials(k)}</span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold leading-tight truncate ${on ? "text-[#2B4BFF]" : "text-slate-800"}`}>{k.first_name} {k.last_name}</span>
              <span className="block text-xs text-slate-500 leading-tight mt-0.5">{names[k.class_id] || k.class_name || " "}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
