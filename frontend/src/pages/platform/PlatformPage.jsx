import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LogOut, Plus, Search, Shield } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { formatDate, slugify } from "@/lib/utils";
import Modal from "@/components/Modal";
import { Field, FormError } from "@/components/AuthShell";

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

function StatusPill({ school }) {
  const sub = school.subscription;
  let cls = "bg-[#E6F8EE] text-green-800"; let text = "Active";
  if (school.status === "suspended") { cls = "bg-slate-200 text-slate-700"; text = "Suspended"; }
  else if (!sub.active) { cls = "bg-red-50 text-red-700"; text = sub.reason === "trial_expired" ? "Trial ended" : "Payment due"; }
  else if (school.plan === "trial") { cls = "bg-[#E8ECFF] text-[#2B4BFF]"; text = `Trial · ${sub.days_left}d left`; }
  return <span className={`inline-block whitespace-nowrap px-2 py-1 rounded-full font-semibold text-[11px] ${cls}`}>{text}</span>;
}

export default function PlatformPage() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null); // null loading, false logged out
  const [schools, setSchools] = useState([]);
  const [stats, setStats] = useState(null);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ school_name: "", school_code: "", admin_name: "", admin_email: "", password: "" });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [s, st] = await Promise.all([api.get("/platform/schools"), api.get("/platform/stats")]);
    setSchools(s.data); setStats(st.data);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/platform/auth/me");
        setAdmin(data);
        await load();
      } catch { setAdmin(false); }
    })();
  }, [load]);

  const patch = async (school, body, msg) => {
    try {
      await api.patch(`/platform/schools/${school.id}`, body);
      toast.success(msg);
      load();
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const create = async (e) => {
    e.preventDefault(); setError("");
    try {
      await api.post("/platform/schools", form);
      toast.success(`${form.school_name} created`);
      setShowCreate(false);
      setForm({ school_name: "", school_code: "", admin_name: "", admin_email: "", password: "" });
      load();
    } catch (err) { setError(errorMessage(err)); }
  };

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return schools;
    return schools.filter((s) => [s.name, s.slug, s.contact_email].some((v) => (v || "").toLowerCase().includes(t)));
  }, [schools, q]);

  if (admin === false) return <Navigate to="/platform/login" replace />;
  if (admin === null) return <div className="min-h-screen grid place-items-center text-slate-500">Loading…</div>;

  return (
    <div className="min-h-screen bg-brand-paper">
      <header className="bg-[#0F172A] text-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-[#A9B7FF]" aria-hidden="true" />
            <span className="font-heading font-semibold">Scholaris · Platform console</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-slate-300">{admin.email}</span>
            <button className="ui-btn bg-white text-xs px-3 py-1.5" onClick={async () => {
              await api.post("/platform/auth/logout"); navigate("/platform/login");
            }}><LogOut className="h-3 w-3" aria-hidden="true" /> Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6" data-testid="platform-page">
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ["Schools", stats.total_schools],
              ["Active subscriptions", stats.active_subscriptions],
              ["Paying (Basic + Pro)", (stats.by_plan.basic || 0) + (stats.by_plan.pro || 0)],
              ["Upgrade requests", stats.pending_upgrade_requests],
            ].map(([label, value]) => (
              <div key={label} className="ui-card p-5">
                <div className="text-xs font-medium text-slate-500">{label}</div>
                <div className="font-heading text-3xl font-semibold mt-1">{value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className="ui-input pl-9" placeholder="Search schools" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="ui-btn btn-primary" onClick={() => { setError(""); setShowCreate(true); }} data-testid="platform-add-school">
            <Plus className="h-4 w-4" aria-hidden="true" /> Add school
          </button>
        </div>

        <div className="ui-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-3">School</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Students</th><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No schools yet.</td></tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 align-top" data-testid={`school-row-${s.slug}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-slate-500"><span className="font-mono">{s.slug}</span> · {s.contact_email}</div>
                    {s.upgrade_request && (
                      <div className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-900">
                        Wants <b className="capitalize">{s.upgrade_request.plan}</b>
                        <button className="underline font-semibold" onClick={() => patch(s, { plan: s.upgrade_request.plan, paid_until: inDays(30) },
                          `${s.name} upgraded to ${s.upgrade_request.plan}`)}>Approve (30 days)</button>
                        <button className="underline" onClick={() => patch(s, { clear_upgrade_request: true }, "Request dismissed")}>Dismiss</button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select className="ui-input py-1 w-auto" value={s.plan} aria-label={`Plan for ${s.name}`}
                      onChange={(e) => patch(s, { plan: e.target.value, ...(e.target.value !== "trial" ? { paid_until: inDays(30) } : {}) },
                        "Plan updated")}>
                      <option value="trial">Trial</option><option value="basic">Basic</option><option value="pro">Pro</option>
                    </select>
                    {s.paid_until && s.plan !== "trial" && <div className="text-xs text-slate-500 mt-1">Paid until {formatDate(s.paid_until)}</div>}
                  </td>
                  <td className="px-4 py-3"><StatusPill school={s} /></td>
                  <td className="px-4 py-3">{s.usage.students} <span className="text-slate-400">/ {s.limits.max_students}</span></td>
                  <td className="px-4 py-3">{s.usage.staff} <span className="text-slate-400">/ {s.limits.max_staff}</span></td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(s.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {s.plan === "trial"
                        ? <button className="ui-btn bg-white px-2 py-1 text-xs" onClick={() => patch(s, { trial_ends_at: inDays(14) }, "Trial extended 14 days")}>+14d trial</button>
                        : <button className="ui-btn bg-white px-2 py-1 text-xs" onClick={() => patch(s, { paid_until: inDays(30) }, "Renewed for 30 days")}>Renew 30d</button>}
                      {s.status === "suspended"
                        ? <button className="ui-btn bg-white px-2 py-1 text-xs" onClick={() => patch(s, { status: "active" }, "School reactivated")}>Reactivate</button>
                        : <button className="ui-btn bg-white px-2 py-1 text-xs text-red-700" onClick={() => {
                          if (window.confirm(`Suspend ${s.name}? Nobody at the school will be able to sign in.`)) patch(s, { status: "suspended" }, "School suspended");
                        }}>Suspend</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {showCreate && (
        <Modal title="Add a school" onClose={() => setShowCreate(false)}>
          <form onSubmit={create} className="space-y-4">
            <Field label="School name"><input required className="ui-input" value={form.school_name}
              onChange={(e) => setForm({ ...form, school_name: e.target.value, school_code: slugify(e.target.value) })} /></Field>
            <Field label="School code"><input required minLength={3} className="ui-input font-mono" value={form.school_code}
              onChange={(e) => setForm({ ...form, school_code: e.target.value.toLowerCase() })} /></Field>
            <Field label="Admin name"><input required className="ui-input" value={form.admin_name}
              onChange={(e) => setForm({ ...form, admin_name: e.target.value })} /></Field>
            <Field label="Admin email"><input required type="email" className="ui-input" value={form.admin_email}
              onChange={(e) => setForm({ ...form, admin_email: e.target.value })} /></Field>
            <Field label="Temporary password" hint="At least 8 characters"><input required minLength={8} className="ui-input font-mono" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            <FormError message={error} />
            <div className="flex justify-end gap-2">
              <button type="button" className="ui-btn bg-white" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="ui-btn btn-primary">Create school</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
