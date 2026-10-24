/** Shared page header: ink hero band with title, one-line purpose and the page's main actions. */
export default function PageHero({ title, subtitle, actions, children, testid }) {
  return (
    <header className="page-hero surface-midnight relative overflow-hidden rounded-3xl px-6 py-7 sm:px-9 sm:py-8 text-white" data-testid={testid}>
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-[32px] font-semibold tracking-tight leading-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm sm:text-[15px] text-slate-300 max-w-2xl leading-relaxed">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="relative mt-6">{children}</div>}
    </header>
  );
}
