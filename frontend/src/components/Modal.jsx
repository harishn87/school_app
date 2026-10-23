import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Popup dialog. Rendered into <body> (so page animations can't clip it), capped to the
 * screen height, with a fixed header and footer and a scrolling middle.
 *
 * Props: title, subtitle, onClose, testid, size ("md" | "lg" | "xl"),
 *        onSubmit (makes the dialog a <form>), footer (buttons, pinned at the bottom).
 */
const SIZES = { md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

export default function Modal({ title, subtitle, onClose, children, testid, size = "md", onSubmit, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const Root = onSubmit ? "form" : "div";
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#0B1020]/55 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Root data-testid={testid} role="dialog" aria-modal="true" aria-label={title} onSubmit={onSubmit}
        className={`bg-white w-full ${SIZES[size] || SIZES.md} max-h-full flex flex-col rounded-2xl overflow-hidden
          shadow-[0_24px_80px_-12px_rgba(11,16,32,0.45)] animate-pop`}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[#E7E9F1] shrink-0">
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-semibold truncate">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="h-9 w-9 shrink-0 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-[#E7E9F1] bg-slate-50/70 flex justify-end gap-3 shrink-0">{footer}</div>
        )}
      </Root>
    </div>,
    document.body
  );
}
