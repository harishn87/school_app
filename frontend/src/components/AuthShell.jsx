import { Link } from "react-router-dom";
import { School, ShieldCheck, Wallet, CalendarCheck, GraduationCap } from "lucide-react";

const POINTS = [
  { icon: GraduationCap, text: "Every student, from joining day to leaving day" },
  { icon: Wallet, text: "Fees, dues and collections in one view" },
  { icon: CalendarCheck, text: "Attendance marked in seconds" },
  { icon: ShieldCheck, text: "A private database for each school" },
];

export function Logo({ dark = false }) {
  return (
    <Link to="/" className="inline-flex items-center gap-3">
      <div className="h-10 w-10 grid place-items-center rounded-xl text-white"
        style={{ background: "linear-gradient(135deg,#4A66FF,#2340F0)", boxShadow: "0 8px 20px -6px rgba(43,75,255,.7)" }}>
        <School className="h-5 w-5" aria-hidden="true" />
      </div>
      <span className={`font-heading font-semibold text-xl ${dark ? "text-white" : "text-[#0F1530]"}`}>Scholaris</span>
    </Link>
  );
}

export function AuthShell({ children, wide = false }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden lg:flex surface-midnight text-white flex-col justify-between p-12 xl:p-16">
        <Logo dark />
        <div>
          <h2 className="font-heading text-4xl xl:text-[44px] font-semibold leading-[1.1] max-w-md">
            The calm way to run a school.
          </h2>
          <p className="mt-4 text-slate-300 max-w-md leading-relaxed">
            Students, classes, fees and attendance, together in one clean workspace your whole team will enjoy using.
          </p>
          <ul className="mt-10 space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-slate-200">
                <span className="h-9 w-9 grid place-items-center rounded-lg bg-white/10 border border-white/10">
                  <Icon className="h-4 w-4 text-[#E9C46A]" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="text-xs text-slate-500">&copy; {new Date().getFullYear()} Scholaris</div>
      </aside>
      <main className="bg-dots flex items-center justify-center p-6 sm:p-10">
        <div className={`w-full ${wide ? "max-w-xl" : "max-w-md"}`}>
          <div className="lg:hidden mb-8 flex justify-center"><Logo /></div>
          <div className="bg-white rounded-3xl border border-[#E7E9F1] p-8 sm:p-10 animate-fade-up"
            style={{ boxShadow: "0 30px 60px -30px rgba(15,21,48,.25)" }}>{children}</div>
        </div>
      </main>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <div className="mt-1.5">{children}</div>
      {hint && <div className="text-xs text-slate-500 mt-1.5">{hint}</div>}
    </div>
  );
}

export function FormError({ message, testid }) {
  if (!message) return null;
  return (
    <div data-testid={testid} role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </div>
  );
}
