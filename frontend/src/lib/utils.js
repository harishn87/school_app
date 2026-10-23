import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function formatMoney(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return inr.format(Number(value));
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const LAST_SCHOOL_KEY = "scholaris:lastSchoolCode";
export function getLastSchoolCode() {
  try { return localStorage.getItem(LAST_SCHOOL_KEY) || ""; } catch (_e) { return ""; }
}
export function setLastSchoolCode(code) {
  try { localStorage.setItem(LAST_SCHOOL_KEY, code); } catch (_e) { /* storage unavailable */ }
}

export function slugify(text) {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
}

// "07:15" -> "7:15 AM"
export function fmtTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
