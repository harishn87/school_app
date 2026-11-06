import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE = 25;

/** Slice helper: returns the rows for one page, keeping the page inside range. */
export function pageOf(rows, page, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(page, 1), pages);
  return { rows: rows.slice((p - 1) * size, p * size), page: p, pages };
}

/** "Showing 1-25 of 360" with previous / next. Hidden when everything fits on one page. */
export default function Pager({ total, page, onPage, size = PAGE_SIZE, noun = "records" }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return null;
  const from = (page - 1) * size + 1, to = Math.min(page * size, total);
  const btn = "ui-btn !px-3 !py-1.5 bg-white disabled:opacity-40";
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF0F6] px-4 py-3 text-sm" aria-label="Pages" data-testid="pager">
      <span className="text-slate-500">Showing <b className="text-[#0B1020] tabular-nums">{from}–{to}</b> of <b className="text-[#0B1020] tabular-nums">{total}</b> {noun}</span>
      <span className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="pager-prev"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Previous</button>
        <span className="tabular-nums text-slate-500">Page {page} of {pages}</span>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)} data-testid="pager-next">Next<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
      </span>
    </nav>
  );
}
