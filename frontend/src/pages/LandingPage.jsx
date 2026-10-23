import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ArrowRight, GraduationCap, Wallet, CalendarCheck, Users, ShieldCheck, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { Logo } from "@/components/AuthShell";

function ProductPreview() {
  const rows = [
    ["Aarav Sharma", "Grade 5 A", "Paid", "bg-emerald-400/20 text-emerald-300"],
    ["Diya Patel", "Grade 5 A", "Partial", "bg-amber-400/20 text-amber-300"],
    ["Kabir Mehta", "Grade 6 B", "Paid", "bg-emerald-400/20 text-emerald-300"],
    ["Meera Iyer", "Grade 4 A", "Unpaid", "bg-rose-400/20 text-rose-300"],
  ];
  return (
    <div className="relative" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2rem] bg-[#2B4BFF]/30 blur-3xl" />
      <div className="relative rounded-2xl border border-white/15 bg-[#10172E]/90 backdrop-blur p-5 shadow-2xl text-white">
        <div className="flex items-center gap-1.5 mb-4">
          <span className="h-2.5 w-2.5 rounded-full bg-white/20" /><span className="h-2.5 w-2.5 rounded-full bg-white/20" /><span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 rounded-xl p-4" style={{ background: "linear-gradient(135deg,#3A58FF,#2340F0)" }}>
            <div className="text-xs text-white/70">Fees collected</div>
            <div className="font-heading text-2xl font-semibold mt-1">₹4,52,000</div>
            <div className="mt-3 h-1.5 rounded-full bg-white/25"><div className="h-full w-[84%] rounded-full bg-[#E9C46A]" /></div>
          </div>
          <div className="rounded-xl p-4 bg-white/5 border border-white/10">
            <div className="text-xs text-white/60">Present today</div>
            <div className="font-heading text-2xl font-semibold mt-1">94%</div>
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-white/10 divide-y divide-white/10">
          {rows.map(([n, c, s, tone]) => (
            <div key={n} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="h-7 w-7 grid place-items-center rounded-full bg-white/10 text-xs">{n[0]}</span>
              <span className="flex-1 truncate">{n}</span>
              <span className="text-white/50 text-xs hidden sm:inline">{c}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${tone}`}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: GraduationCap, title: "Student profiles", desc: "Joining date to leaving date, with photo, guardian details and grades in one place." },
  { icon: Users, title: "Classes and sections", desc: "Organise students into classes and assign a teacher to each." },
  { icon: Wallet, title: "Fee tracking", desc: "See what's paid, what's due and what's overdue, without a spreadsheet." },
  { icon: CalendarCheck, title: "Daily attendance", desc: "Mark a whole class present in a few taps and see the trend." },
  { icon: Smartphone, title: "Parent access", desc: "Parents sign in to see their own child's attendance and fees." },
  { icon: ShieldCheck, title: "Private by design", desc: "Every school gets its own separate database. Your data is never mixed." },
];

export default function LandingPage() {
  const [plans, setPlans] = useState([]);
  useEffect(() => {
    api.get("/schools/plans").then((r) => setPlans(r.data)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      <div className="surface-midnight text-white">
        <header className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <Logo dark />
          <div className="flex items-center gap-2">
            <Link to="/login" data-testid="landing-login-btn" className="px-4 py-2 rounded-xl text-sm font-medium text-slate-200 hover:bg-white/10 transition-colors">Sign in</Link>
            <Link to="/register" data-testid="landing-register-btn" className="ui-btn btn-primary text-sm">Start free trial</Link>
          </div>
        </header>

        <section className="max-w-6xl mx-auto px-6 pt-14 pb-24 md:pt-20 md:pb-32 grid lg:grid-cols-[1.05fr_1fr] gap-14 items-center">
          <div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-[56px] font-semibold leading-[1.06]">
              Run your school without the paperwork.
            </h1>
            <p className="mt-6 text-lg text-slate-300 max-w-xl leading-relaxed">
              Students, classes, fees and attendance in one clean workspace, made for school owners and the teams who keep schools running.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/register" data-testid="hero-register-btn" className="ui-btn btn-primary text-base px-6 py-3.5">
                Start your 14-day free trial <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link to="/login" data-testid="hero-login-btn"
                className="inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-base font-medium border border-white/20 text-white hover:bg-white/10 transition-colors">
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-400">No card needed. Set up in about ten minutes.</p>
          </div>
          <ProductPreview />
        </section>
      </div>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="font-heading text-3xl sm:text-4xl font-semibold max-w-xl">Everything a school office does every day.</h2>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="ui-card p-6">
              <div className="h-11 w-11 grid place-items-center rounded-xl bg-[#E8ECFF] text-[#2B4BFF]">
                <f.icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="font-heading text-lg font-semibold mt-4">{f.title}</h3>
              <p className="text-slate-500 mt-1.5 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="max-w-6xl mx-auto px-6 pb-24">
        <h2 className="font-heading text-3xl sm:text-4xl font-semibold">Simple pricing, per school.</h2>
        <p className="text-slate-500 mt-2">Start free for 14 days. Upgrade when you&apos;re ready.</p>
        <div className="mt-10 grid md:grid-cols-3 gap-5 items-stretch">
          {plans.map((p) => {
            const featured = p.id === "basic";
            return (
              <div key={p.id} className={`rounded-2xl p-7 flex flex-col ${featured ? "surface-midnight text-white shadow-2xl shadow-[#2340F0]/30" : "ui-card"}`}>
                <div className="flex items-center justify-between">
                  <div className="font-heading text-lg font-semibold">{p.name}</div>
                  {featured && <span className="pill bg-[#E9C46A] text-[#3B2A00]">Most popular</span>}
                </div>
                <div className="mt-4">
                  <span className="font-heading text-4xl font-semibold">{p.price_inr_month ? formatMoney(p.price_inr_month) : "Free"}</span>
                  <span className={featured ? "text-slate-300" : "text-slate-500"}>{p.price_inr_month ? " / month" : " for 14 days"}</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm flex-1">
                  {[`Up to ${p.max_students.toLocaleString("en-IN")} students`, `${p.max_staff} staff logins`, "Unlimited parent logins"].map((t) => (
                    <li key={t} className="flex gap-2.5">
                      <Check className={`h-4 w-4 mt-0.5 shrink-0 ${featured ? "text-[#E9C46A]" : "text-[#2B4BFF]"}`} aria-hidden="true" />{t}
                    </li>
                  ))}
                </ul>
                <Link to="/register" className={`ui-btn mt-8 py-3 ${featured ? "btn-primary" : ""}`}>
                  {p.id === "trial" ? "Start free trial" : `Choose ${p.name}`}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-[#E7E9F1] bg-white">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <span>&copy; {new Date().getFullYear()} Scholaris</span>
          <div className="flex gap-5">
            <Link to="/login" className="hover:text-[#2B4BFF]">School sign in</Link>
            <Link to="/platform/login" className="hover:text-[#2B4BFF]">Platform console</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
