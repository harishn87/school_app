import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { GraduationCap, Users, Wallet, CalendarCheck, Clock, UserMinus, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatMoney } from "@/lib/utils";
import ProgressBoard from "@/components/ProgressBoard";

function Ring({ pct }) {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct || 0));
  return (
    <svg viewBox="0 0 128 128" className="h-28 w-28 -rotate-90" role="img" aria-label={`${v}% present today`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="#E8ECFF" strokeWidth="12" />
      <circle cx="64" cy="64" r={r} fill="none" stroke="#2B4BFF" strokeWidth="12" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
    </svg>
  );
}

function Small({ icon: Icon, label, value, testid, tone = "blue" }) {
  const tones = { blue: "bg-[#E8ECFF] text-[#2B4BFF]", amber: "bg-amber-50 text-amber-600", slate: "bg-slate-100 text-slate-600" };
  return (
    <div className="ui-card p-5">
      <div className={`h-10 w-10 grid place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" aria-hidden="true" /></div>
      <div className="mt-4 font-heading text-3xl font-semibold" data-testid={testid}>{value}</div>
      <div className="text-sm text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

export default function DashboardHome() {
  const { user } = useAuth();
  const [stats, setStats] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/dashboard/stats");
        setStats(data);
      } catch (_e) { /* ignore */ }
      setLoaded(true);
    })();
  }, []);

  const parent = user?.role === "parent";
  const teacher = user?.role === "teacher";
  const collected = stats.fees_collected || 0;
  const pending = stats.fees_pending || 0;
  const total = collected + pending;
  const paidPct = total ? Math.round((collected / total) * 100) : 0;
  const n = (v) => (v == null ? "—" : v);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="dashboard-home">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-heading text-2xl sm:text-[30px] font-semibold">
            Good to see you, {user?.name?.split(" ")[0] || "there"}
          </h1>
          <p className="text-slate-500 mt-1">
            {parent ? "Here's how your children are doing." : <>Here&apos;s what&apos;s happening at {user?.school?.name || "your school"}.</>}
          </p>
        </div>
        <div className="text-sm text-slate-500">{today}</div>
      </header>

      <div className="grid lg:grid-cols-3 gap-6" data-testid="stats-grid">
        {teacher ? (
          <section className="lg:col-span-2 rounded-3xl p-7 text-white relative overflow-hidden surface-midnight" data-testid="teacher-hero" style={{ boxShadow: "0 24px 50px -24px rgba(35,64,240,.7)" }}>
            <div className="text-sm text-slate-300">Your students</div>
            <div className="font-heading text-4xl sm:text-5xl font-semibold mt-2">{n(stats.total_students)}</div>
            <p className="text-sm text-slate-300 mt-2">across {n(stats.total_classes)} {stats.total_classes === 1 ? "class" : "classes"}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/app/progress" className="inline-flex items-center gap-1 text-sm rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5">Update progress reports <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
              <Link to="/app/attendance" className="inline-flex items-center gap-1 text-sm rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1.5">Mark attendance <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </div>
          </section>
        ) : (
        /* Fees: the one hero card */
        <section className="lg:col-span-2 rounded-3xl p-7 text-white relative overflow-hidden surface-midnight"
          style={{ boxShadow: "0 24px 50px -24px rgba(35,64,240,.7)" }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-slate-300">Fees collected</div>
              <div className="font-heading text-4xl sm:text-5xl font-semibold mt-2" data-testid="stat-fees_collected">
                {stats.fees_collected == null ? "—" : formatMoney(collected)}
              </div>
            </div>
            <Link to="/app/fees" className="inline-flex items-center gap-1 text-sm text-slate-200 hover:text-white rounded-lg bg-white/10 px-3 py-1.5">
              View fees <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-8">
            <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#7C8FFF] to-[#E9C46A]" style={{ width: `${paidPct}%` }} />
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-slate-300">{paidPct}% of billed fees received</span>
              <span className="text-slate-300">Pending <b className="text-white font-medium" data-testid="stat-fees_pending">{stats.fees_pending == null ? "—" : formatMoney(pending)}</b></span>
            </div>
          </div>
        </section>
        )}

        <section className="ui-card p-6 flex items-center gap-5">
          <div className="relative shrink-0">
            <Ring pct={stats.attendance_today_pct} />
            <div className="absolute inset-0 grid place-items-center">
              <span className="font-heading text-2xl font-semibold" data-testid="stat-attendance_today_pct">
                {stats.attendance_today_pct == null ? "—" : `${stats.attendance_today_pct}%`}
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="font-medium">Present today</div>
            <p className="text-sm text-slate-500 mt-1">
              {stats.attendance_today_pct == null ? "Attendance isn't marked yet today." : "Students marked present."}
            </p>
            <Link to="/app/attendance" className="inline-flex items-center gap-1 text-sm font-medium text-[#2B4BFF] mt-2 hover:underline">
              Mark now <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </section>

        {!teacher && <Small icon={GraduationCap} label="Active students" value={n(stats.total_students)} testid="stat-total_students" />}
        {!parent && !teacher && <Small icon={Users} label="Classes" value={n(stats.total_classes)} testid="stat-total_classes" />}
        {parent && <Small icon={Clock} label="Fees pending" value={stats.fees_pending == null ? "—" : formatMoney(pending)} testid="stat-parent_pending" tone="amber" />}
        {!parent && !teacher && <Small icon={UserMinus} label="Students who left" value={n(stats.students_left)} testid="stat-students_left" tone="slate" />}
      </div>

      {!parent && <ProgressBoard />}

      {user?.role === "admin" && loaded && !stats.total_students && (
        <div className="ui-card p-7">
          <h3 className="font-heading text-lg font-semibold">Set up your school in four steps</h3>
          <p className="text-sm text-slate-500 mt-1">Most schools are up and running in under ten minutes.</p>
          <ol className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            {[["Create classes", "/app/classes"], ["Add students", "/app/students"], ["Invite staff and parents", "/app/users"], ["Mark attendance", "/app/attendance"]].map(([s, to], i) => (
              <li key={s}>
                <Link to={to} className="flex items-center gap-3 rounded-xl border border-[#E7E9F1] p-3.5 hover:border-[#2B4BFF]/40 hover:bg-[#F1F4FF] transition-colors">
                  <span className="h-7 w-7 grid place-items-center rounded-full bg-[#E8ECFF] text-[#2B4BFF] font-semibold text-xs">{i + 1}</span>
                  <span className="font-medium">{s}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
