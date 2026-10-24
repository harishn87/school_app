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
    <svg viewBox="0 0 128 128" className="h-20 w-20 -rotate-90" role="img" aria-label={`${v}% present today`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="#E8ECFF" strokeWidth="14" />
      <circle cx="64" cy="64" r={r} fill="none" stroke="#2B4BFF" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
    </svg>
  );
}

function Small({ icon: Icon, label, value, testid, tone = "blue" }) {
  const tones = { blue: "bg-[#E8ECFF] text-[#2B4BFF]", amber: "bg-amber-50 text-amber-600", slate: "bg-slate-100 text-slate-600" };
  return (
    <div className="ui-card p-5">
      <div className={`h-9 w-9 grid place-items-center rounded-lg ${tones[tone]}`}><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></div>
      <div className="mt-3 font-heading text-3xl font-semibold tabular-nums" data-testid={testid}>{value}</div>
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
            {new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}, {user?.name?.split(" ")[0] || "there"}
          </h1>
          <p className="text-slate-500 mt-1">
            {parent ? "Here's how your children are doing." : <>Here&apos;s what&apos;s happening at {user?.school?.name || "your school"}.</>}
          </p>
        </div>
        <div className="text-sm text-slate-500">{today}</div>
      </header>

      <div data-testid="stats-grid" className="space-y-6">
        {!parent && (
          <section className="rounded-2xl surface-midnight ruled-light p-7 sm:p-9 text-white" data-testid={teacher ? "teacher-hero" : "briefing"}>
            {teacher ? (
              <>
                <p className="font-heading text-3xl sm:text-4xl font-semibold leading-tight max-w-2xl">
                  You have {n(stats.total_students)} students across {n(stats.total_classes)} {stats.total_classes === 1 ? "class" : "classes"}.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link to="/app/attendance" className="inline-flex items-center gap-1.5 rounded-lg bg-[#E9C46A] text-[#0B1020] font-semibold text-sm px-4 py-2.5 hover:bg-[#F2D283]">Mark attendance <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
                  <Link to="/app/progress" className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold text-sm px-4 py-2.5">Update academics</Link>
                </div>
              </>
            ) : (
              <>
                <p className="font-heading text-3xl sm:text-4xl font-semibold leading-tight max-w-3xl">
                  {stats.attendance_today_pct == null
                    ? "Attendance isn't marked yet today."
                    : <>{stats.attendance_today_pct}% of students are in school today.</>}{" "}
                  <span className="text-[#E9C46A]">{formatMoney(pending)} in fees is still to collect.</span>
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link to="/app/attendance" className="inline-flex items-center gap-1.5 rounded-lg bg-[#E9C46A] text-[#0B1020] font-semibold text-sm px-4 py-2.5 hover:bg-[#F2D283]">View attendance <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
                  <Link to="/app/fees" className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold text-sm px-4 py-2.5">View fees</Link>
                  {user?.role === "admin" && <Link to="/app/management" className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold text-sm px-4 py-2.5">School dashboard</Link>}
                </div>
              </>
            )}
          </section>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {!teacher && (
            <section className="ui-card p-5 col-span-2" >
              <div className="text-sm text-slate-500">Fees collected</div>
              <div className="font-heading text-3xl font-semibold mt-1 tabular-nums" data-testid="stat-fees_collected">{stats.fees_collected == null ? "—" : formatMoney(collected)}</div>
              <div className="mt-4 h-2 rounded-full bg-[#E8ECFF] overflow-hidden"><div className="h-full rounded-full bg-[#2B4BFF]" style={{ width: `${paidPct}%` }} /></div>
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>{paidPct}% of billed fees received</span>
                <span>Pending <b className="text-slate-800 font-semibold" data-testid="stat-fees_pending">{stats.fees_pending == null ? "—" : formatMoney(pending)}</b></span>
              </div>
            </section>
          )}
          <section className="ui-card p-5 flex items-center gap-4">
            <div className="relative shrink-0">
              <Ring pct={stats.attendance_today_pct} />
              <div className="absolute inset-0 grid place-items-center">
                <span className="font-heading text-lg font-semibold" data-testid="stat-attendance_today_pct">{stats.attendance_today_pct == null ? "—" : `${stats.attendance_today_pct}%`}</span>
              </div>
            </div>
            <div className="min-w-0 text-sm"><div className="font-semibold">Present today</div><Link to="/app/attendance" className="text-[#2B4BFF] font-medium hover:underline">{stats.attendance_today_pct == null ? "Mark now" : "Open register"}</Link></div>
          </section>
          {parent
            ? <Small icon={Clock} label="Fees pending" value={stats.fees_pending == null ? "—" : formatMoney(pending)} testid="stat-parent_pending" tone="amber" />
            : (
              <section className="ui-card p-5">
                <div className="text-sm text-slate-500">Active students</div>
                <div className="font-heading text-3xl font-semibold mt-1 tabular-nums" data-testid="stat-total_students">{n(stats.total_students)}</div>
                {!teacher && (
                  <div className="mt-3 text-xs text-slate-500 space-y-0.5">
                    <div><b className="text-slate-800 font-semibold" data-testid="stat-total_classes">{n(stats.total_classes)}</b> classes</div>
                    <div><b className="text-slate-800 font-semibold" data-testid="stat-students_left">{n(stats.students_left)}</b> have left</div>
                  </div>
                )}
              </section>
            )}
        </div>
      </div>

      {!parent && <ProgressBoard />}

      {user?.role === "admin" && loaded && !stats.total_students && (
        <div className="ui-card p-7">
          <h3 className="font-heading text-lg font-semibold">Set up your school in four steps</h3>
          <p className="text-sm text-slate-500 mt-1">Most schools are up and running in under ten minutes.</p>
          <ol className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            {[["Create classes", "/app/classes"], ["Add students", "/app/students"], ["Invite staff and parents", "/app/users"], ["View attendance", "/app/attendance"]].map(([s, to], i) => (
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
