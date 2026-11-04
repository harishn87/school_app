import { useEffect, useState } from "react";

/**
 * A counter that goes up when the user comes back to the tab and every `ms` while it is visible.
 * Put it in a data effect's dependency list and the page refetches, so what a teacher saves shows up for
 * the principal and for parents without anyone pressing refresh.
 */
export function useLive(ms = 30000) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => { if (document.visibilityState === "visible") setTick((t) => t + 1); };
    const id = setInterval(bump, ms);
    document.addEventListener("visibilitychange", bump);
    window.addEventListener("focus", bump);
    window.addEventListener("online", bump);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", bump); window.removeEventListener("focus", bump); window.removeEventListener("online", bump); };
  }, [ms]);
  return tick;
}
