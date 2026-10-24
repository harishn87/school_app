import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, GraduationCap, Users, Wallet, CalendarCheck, LogOut, School, UserCog, CreditCard, KeyRound,
  AlertTriangle, NotebookPen, FileText, Bus, PartyPopper, ClipboardList,
} from "lucide-react";

const ALL_NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true, testid: "nav-overview" },
  { to: "/app/diary", label: "Class diary", parentLabel: "Updates", icon: NotebookPen, testid: "nav-diary" },
  { to: "/app/students", label: "Students", parentLabel: "My children", icon: GraduationCap, testid: "nav-students" },
  { to: "/app/classes", label: "Classes", icon: Users, testid: "nav-classes", roles: ["admin", "teacher"] },
  { to: "/app/progress", label: "Progress reports", parentLabel: "Progress", icon: ClipboardList, testid: "nav-progress" },
  { to: "/app/fees", label: "Fees", icon: Wallet, testid: "nav-fees", roles: ["admin", "parent"] },
  { to: "/app/attendance", label: "Attendance", icon: CalendarCheck, testid: "nav-attendance" },
  { to: "/app/holidays", label: "Holidays", icon: PartyPopper, testid: "nav-holidays", roles: ["admin", "teacher"] },
  { to: "/app/transport", label: "Transport", icon: Bus, testid: "nav-transport", roles: ["admin"] },
  { to: "/app/letters", label: "Letters", icon: FileText, testid: "nav-letters", roles: ["admin"] },
  { to: "/app/users", label: "Users", icon: UserCog, testid: "nav-users", roles: ["admin"] },
  { to: "/app/billing", label: "Plan & billing", icon: CreditCard, testid: "nav-billing", roles: ["admin"] },
  { to: "/app/account", label: "My account", icon: KeyRound, testid: "nav-account" },
];

function SubscriptionBanner({ school, isAdmin }) {
  const sub = school?.subscription;
  if (!sub) return null;
  let tone = null;
  let text = null;
  if (!sub.active) {
    tone = "red";
    text = sub.reason === "trial_expired"
      ? "Your free trial has ended. Your data is safe, but changes are paused until you choose a plan."
      : "Your subscription payment is due. Changes are paused until it's renewed.";
  } else if (school.plan === "trial" && sub.days_left != null && sub.days_left <= 7) {
    tone = "amber";
    text = `Your free trial ends in ${sub.days_left} day${sub.days_left === 1 ? "" : "s"}.`;
  }
  if (!tone) return null;
  const styles = tone === "red"
    ? "bg-red-50 border-red-200 text-red-800"
    : "bg-amber-50 border-amber-200 text-amber-900";
  return (
    <div data-testid="subscription-banner" className={`mb-6 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-[12rem]">{text}</span>
      {isAdmin
        ? <Link to="/app/billing" className="ui-btn btn-primary text-xs px-3 py-1.5">Choose a plan</Link>
        : <span className="text-xs">Ask your school admin to upgrade.</span>}
    </div>
  );
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const parent = user?.role === "parent";
  const nav = ALL_NAV.filter((n) => !n.roles || n.roles.includes(user?.role))
    .map((n) => ({ ...n, label: parent && n.parentLabel ? n.parentLabel : n.label }));
  const mobileOrder = parent
    ? ["/app", "/app/progress", "/app/diary", "/app/fees", "/app/attendance"]
    : ["/app", "/app/diary", "/app/students", "/app/attendance", user?.role === "teacher" ? "/app/progress" : "/app/fees"];
  const mobileNav = mobileOrder.map((to) => nav.find((n) => n.to === to)).filter(Boolean);
  const signOut = async () => { await logout(); navigate("/login"); };

  const initials = (user?.name || user?.email || "?").split(/[\s@]/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return (
    <div className="min-h-screen bg-dots">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden md:flex w-[264px] shrink-0 flex-col surface-midnight text-slate-300 sticky top-0 h-screen">
          <div className="flex items-center gap-3 px-6 pt-7 pb-6">
            <div className="h-10 w-10 grid place-items-center rounded-xl text-white shrink-0"
              style={{ background: "linear-gradient(135deg,#4A66FF,#2340F0)", boxShadow: "0 8px 20px -6px rgba(43,75,255,.8)" }}>
              <School className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="font-heading font-semibold text-[15px] leading-tight text-white truncate" data-testid="school-name" title={user?.school?.name}>
                {user?.school?.name || "Scholaris"}
              </div>
              <div className="text-xs text-slate-400 truncate mt-0.5">
                <span className="text-[#E9C46A]">{user?.school?.plan_name}</span> plan
              </div>
            </div>
          </div>
          <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto" aria-label="Main">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} data-testid={n.testid}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
                {({ isActive }) => (<>
                  {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-[#E9C46A]" aria-hidden="true" />}
                  <n.icon className={`h-[18px] w-[18px] ${isActive ? "text-[#8EA2FF]" : ""}`} aria-hidden="true" />
                  {n.label}
                </>)}
              </NavLink>
            ))}
          </nav>
          <div className="p-4">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="h-9 w-9 shrink-0 grid place-items-center rounded-full bg-[#2B4BFF] text-white text-sm font-semibold">{initials}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white truncate" data-testid="current-user-email">{user?.email}</div>
                <div className="text-xs text-slate-400 capitalize">{user?.role}</div>
              </div>
              <button data-testid="logout-button" onClick={signOut} title="Sign out" aria-label="Sign out"
                className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors">
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-20 surface-midnight text-white flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 grid place-items-center bg-[#2B4BFF] rounded-lg shrink-0">
              <School className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="font-heading font-semibold truncate">{user?.school?.name || "Scholaris"}</span>
          </div>
          <div className="flex items-center gap-1">
            <Link to="/app/account" className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/10" aria-label="My account">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button onClick={signOut} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-white/10" aria-label="Sign out">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Main */}
        <main className="flex-1 min-w-0 md:py-10 pt-20 pb-24 px-4 md:px-12">
          <div className="max-w-6xl mx-auto">
            <SubscriptionBanner school={user?.school} isAdmin={user?.role === "admin"} />
          </div>
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur border-t border-[#E7E9F1] grid"
          style={{ gridTemplateColumns: `repeat(${mobileNav.length}, minmax(0, 1fr))` }}>
          {mobileNav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium ${isActive ? "text-[#2B4BFF]" : "text-slate-500"}`}>
              <n.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              {n.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
