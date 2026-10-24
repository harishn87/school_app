import PageHero from "@/components/PageHero";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Clock } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate, formatMoney } from "@/lib/utils";

function Usage({ label, used, max }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-slate-600">{used} / {max}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : "bg-[#2B4BFF]"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { refreshMe } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await api.get("/billing");
    setData(res.data);
  };
  useEffect(() => { load(); }, []);

  const request = async (plan) => {
    setBusy(true);
    try {
      await api.post("/billing/upgrade-request", { plan });
      toast.success("Upgrade requested. We'll confirm shortly.");
      await load();
      refreshMe();
    } catch (err) { toast.error(errorMessage(err)); }
    setBusy(false);
  };

  if (!data) return <div className="max-w-6xl mx-auto text-slate-500">Loading…</div>;
  const { school, usage, plans, upgrade_request: pending } = data;
  const sub = school.subscription;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="billing-page">
      <PageHero title="Your subscription" subtitle="Your plan, how much of it you are using, and the plans you can move to." />

      <div className="grid md:grid-cols-2 gap-6">
        <div className="ui-card p-6">
          <div className="text-xs font-medium text-slate-500">Current plan</div>
          <div className="font-heading text-3xl font-semibold mt-1" data-testid="current-plan">{school.plan_name}</div>
          <div className="mt-2 text-sm">
            {!sub.active ? (
              <span className="inline-block px-2 py-1 rounded-full bg-red-50 text-red-700 font-semibold text-xs">
                {sub.reason === "trial_expired" ? "Trial ended" : sub.reason === "payment_due" ? "Payment due" : "Inactive"}
              </span>
            ) : school.plan === "trial" ? (
              <span className="text-slate-600">Trial ends {formatDate(school.trial_ends_at)} ({sub.days_left} days left)</span>
            ) : school.paid_until ? (
              <span className="text-slate-600">Paid until {formatDate(school.paid_until)}</span>
            ) : (
              <span className="text-slate-600">Active</span>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-500">School code: <span className="font-mono">{school.slug}</span></div>
        </div>
        <div className="ui-card p-6 space-y-5">
          <Usage label="Active students" used={usage.students} max={usage.max_students} />
          <Usage label="Staff (admins & teachers)" used={usage.staff} max={usage.max_staff} />
        </div>
      </div>

      {pending && (
        <div className="flex items-center gap-3 rounded-xl border border-[#D5DDFF] bg-[#F1F4FF] px-4 py-3 text-sm text-[#64708F]" data-testid="pending-upgrade">
          <Clock className="h-4 w-4" aria-hidden="true" />
          Upgrade to <b className="capitalize">{pending.plan}</b> requested on {formatDate(pending.requested_at)}. We&apos;ll activate it after confirming payment.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {plans.map((p) => {
          const current = school.plan === p.id;
          return (
            <div key={p.id} className={`ui-card p-6 flex flex-col ${current ? "ring-2 ring-[#2B4BFF]" : ""}`}>
              <div className="font-heading text-2xl font-semibold">{p.name}</div>
              <div className="mt-1"><span className="font-heading text-3xl font-semibold">{formatMoney(p.price_inr_month)}</span><span className="text-slate-500"> / month</span></div>
              <ul className="mt-4 space-y-2 text-sm flex-1">
                <li className="flex gap-2"><Check className="h-4 w-4 text-green-600" aria-hidden="true" />Up to {p.max_students.toLocaleString("en-IN")} active students</li>
                <li className="flex gap-2"><Check className="h-4 w-4 text-green-600" aria-hidden="true" />Up to {p.max_staff} staff logins</li>
                <li className="flex gap-2"><Check className="h-4 w-4 text-green-600" aria-hidden="true" />Unlimited parent logins</li>
                <li className="flex gap-2"><Check className="h-4 w-4 text-green-600" aria-hidden="true" />Your own private database</li>
              </ul>
              <button disabled={current || busy || pending?.plan === p.id} onClick={() => request(p.id)}
                data-testid={`request-${p.id}`} className="ui-btn btn-primary mt-6">
                {current ? "Current plan" : pending?.plan === p.id ? "Requested" : `Request ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
