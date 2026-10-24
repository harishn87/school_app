import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ArrowRight, GraduationCap, Wallet, CalendarCheck, Users, ShieldCheck, Smartphone } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { Logo } from "@/components/AuthShell";

function ProductPreview() {
  const kids = [["Aarav Reddy", "P"], ["Ananya Reddy", "P"], ["Dhruv Khan", "A"], ["Kavya Patel", "P"], ["Meera Sharma", "L"], ["Varun Das", "P"]];
  const tone = { P: "bg-emerald-500 text-white", A: "bg-rose-500 text-white", L: "bg-[#E9C46A] text-[#0B1020]" };
  return (
    <div className="relative" aria-hidden="true">
      <div className="rounded-2xl bg-white text-[#0B1020] shadow-[0_30px_60px_-30px_rgba(0,0,0,.6)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E6EF]">
          <div><div className="font-heading font-semibold">Class 3 A · Attendance</div><div className="text-xs text-slate-500">Saturday, 24 October · 5 of 6 in school</div></div>
          <span className="pill bg-[#E8ECFF] text-[#2B4BFF]">Ravi Kumar</span>
        </div>
        <ul className="divide-y divide-[#EEF0F6]">
          {kids.map(([n, st]) => (
            <li key={n} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="h-8 w-8 grid place-items-center rounded-full bg-[#F1F4FF] text-xs font-bold text-[#2B4BFF]">{n.split(" ").map((w) => w[0]).join("")}</span>
              <span className="flex-1 font-medium">{n}</span>
              <span className={`h-7 w-7 grid place-items-center rounded-md text-xs font-bold ${tone[st]}`}>{st}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="absolute -bottom-8 right-4 hidden sm:block rounded-xl bg-[#E9C46A] text-[#0B1020] px-4 py-3 shadow-xl rotate-[2deg]">
        <div className="text-xs font-semibold">Parent app, 9:12 am</div>
        <div className="text-sm font-bold">Dhruv was marked absent today</div>
      </div>
    </div>
  );
}

const ROLES = [
  { who: "Principal", icon: ShieldCheck, line: "See the whole school on one page: attendance, fee dues and results by class, with pivot tables for anything else you want to ask." },
  { who: "Teachers", icon: CalendarCheck, line: "Take the register, write progress reports and post homework for their own classes. They never see other classes or fee details." },
  { who: "Parents", icon: Smartphone, line: "One login for all their children: month calendar, report cards, fee dues and notes from the class teacher." },
];

const FEATURES = [
  { icon: GraduationCap, title: "Students", desc: "Admission to leaving date, guardian contacts, photo and report cards in one profile." },
  { icon: Users, title: "Classes", desc: "Class teacher, second teacher and attender for every section, with live attendance and results." },
  { icon: Wallet, title: "Fees", desc: "Term-wise fees in rupees. See who has paid, who is part paid and who is overdue." },
  { icon: CalendarCheck, title: "Attendance and holidays", desc: "Mark a class in a few taps. Holidays show on every calendar." },
  { icon: Smartphone, title: "Class diary", desc: "Post homework and notices for a class and parents see them straight away." },
  { icon: ShieldCheck, title: "Your data stays yours", desc: "Every school gets its own separate database. Nothing is ever mixed with another school." },
];

export default function LandingPage() {
  const [plans, setPlans] = useState([]);
  useEffect(() => {
    api.get("/schools/plans").then((r) => setPlans(r.data)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F6FA]">
      <div className="surface-midnight ruled-light text-white">
        <header className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <Logo dark />
          <div className="flex items-center gap-2">
            <Link to="/login" data-testid="landing-login-btn" className="px-4 py-2 rounded-xl text-sm font-medium text-slate-200 hover:bg-white/10 transition-colors">Sign in</Link>
            <Link to="/register" data-testid="landing-register-btn" className="ui-btn btn-primary text-sm">Start free trial</Link>
          </div>
        </header>

        <section className="max-w-6xl mx-auto px-6 pt-14 pb-28 md:pt-20 md:pb-32 grid lg:grid-cols-[1.05fr_1fr] gap-16 items-center">
          <div>
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-[56px] font-semibold leading-[1.06]">
              The school register, fee book and report card in one place.
            </h1>
            <p className="mt-6 text-lg text-slate-300 max-w-xl leading-relaxed">
              Scholaris gives principals a clear view of the school, teachers a faster day, and parents one app for everything about their children.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/register" data-testid="hero-register-btn" className="ui-btn text-base px-6 py-3.5 !bg-[#E9C46A] !border-transparent !text-[#0B1020] hover:!bg-[#F2D283]">
                Start your 14-day free trial <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link to="/login" data-testid="hero-login-btn"
                className="inline-flex items-center justify-center rounded-lg px-6 py-3.5 text-base font-semibold border border-white/25 text-white hover:bg-white/10 transition-colors">
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-400">No card needed. Add your classes and students in about ten minutes.</p>
          </div>
          <ProductPreview />
        </section>
      </div>

      <section className="max-w-6xl mx-auto px-6 pt-20">
        <h2 className="font-heading text-3xl sm:text-4xl font-semibold max-w-xl">One school, three different views.</h2>
        <div className="mt-8 grid md:grid-cols-3 gap-5">
          {ROLES.map((r) => (
            <div key={r.who} className="ui-card p-6 border-t-4 !border-t-[#E9C46A]">
              <h3 className="font-heading text-xl font-semibold flex items-center gap-2"><r.icon className="h-5 w-5 text-[#2B4BFF]" aria-hidden="true" />{r.who}</h3>
              <p className="text-slate-600 mt-2 leading-relaxed">{r.line}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="font-heading text-3xl sm:text-4xl font-semibold max-w-xl">What the school office gets done here.</h2>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="ui-card p-6">
              <div className="h-11 w-11 grid place-items-center rounded-lg bg-[#E8ECFF] text-[#2B4BFF]">
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
              <div key={p.id} className={`rounded-2xl p-7 flex flex-col ${featured ? "surface-midnight text-white shadow-2xl shadow-[#1F36D6]/30" : "ui-card"}`}>
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
