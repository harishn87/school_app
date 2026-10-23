import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Bus, CalendarCheck, Phone, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { fmtTime, formatDate, formatMoney } from "@/lib/utils";
import PostCard from "@/components/PostCard";

const STATUS = {
  present: ["Present today", "bg-emerald-50 text-emerald-700"],
  late: ["Late today", "bg-amber-50 text-amber-700"],
  absent: ["Absent today", "bg-rose-50 text-rose-700"],
};

function Child({ c }) {
  const [txt, tone] = STATUS[c.attendance.today] || ["Not marked yet", "bg-slate-100 text-slate-600"];
  const pct = c.attendance.percent;
  const nd = c.fees.next_due;
  return (
    <section className="ui-card p-5 sm:p-6" data-testid={`child-${c.id}`}>
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 grid place-items-center rounded-2xl text-white text-xl font-heading font-semibold shrink-0"
          style={{ background: "linear-gradient(135deg,#4A66FF,#2340F0)" }}>{c.first_name[0]}</div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-semibold truncate">{c.first_name} {c.last_name}</h2>
          <p className="text-sm text-slate-500 truncate">{c.class_name || "No class yet"}{c.roll_number ? ` · Roll ${c.roll_number}` : ""}</p>
        </div>
      </div>
      <span className={`pill ${tone} mt-3`}>{txt}</span>

      <div className="mt-5 grid sm:grid-cols-2 gap-3">
        <Link to="/app/attendance" className="rounded-xl bg-[#F1F4FF] p-4 hover:bg-[#E8ECFF] transition-colors">
          <div className="flex items-center gap-2 text-sm text-slate-600"><CalendarCheck className="h-4 w-4 text-[#2B4BFF]" aria-hidden="true" /> Attendance, last 30 days</div>
          <div className="font-heading text-2xl font-semibold mt-1.5">{pct == null ? "—" : `${pct}%`}</div>
          <div className="text-xs text-slate-500 mt-0.5">{c.attendance.days_marked ? `${c.attendance.days_present} of ${c.attendance.days_marked} days present` : "No attendance marked yet"}</div>
        </Link>
        <Link to="/app/fees" className="rounded-xl bg-[#F1F4FF] p-4 hover:bg-[#E8ECFF] transition-colors">
          <div className="flex items-center gap-2 text-sm text-slate-600"><Wallet className="h-4 w-4 text-[#2B4BFF]" aria-hidden="true" /> Fees</div>
          <div className="font-heading text-2xl font-semibold mt-1.5">{c.fees.pending > 0 ? formatMoney(c.fees.pending) : c.fees.total ? "All paid" : "No fees yet"}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {c.fees.pending > 0
              ? (nd ? `${nd.term}${nd.due_date ? `, due ${formatDate(nd.due_date)}` : ""}` : "Pending")
              : c.fees.total ? `${formatMoney(c.fees.paid)} paid so far` : "Nothing due right now"}
          </div>
        </Link>
      </div>

      {c.transport && (
        <div className="mt-3 rounded-xl border border-[#E7E9F1] p-4" data-testid={`bus-card-${c.id}`}>
          <div className="flex items-center gap-2 text-sm text-slate-600"><Bus className="h-4 w-4 text-[#2B4BFF]" aria-hidden="true" /> School bus</div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-heading text-xl font-semibold">{c.transport.bus_number || "Bus not assigned yet"}</span>
            <span className="text-sm text-slate-500">{c.transport.route_name}{c.transport.registration ? ` · ${c.transport.registration}` : ""}</span>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-xs text-slate-500">Stop</dt><dd className="font-medium">{c.transport.stop}</dd></div>
            <div><dt className="text-xs text-slate-500">Morning pickup</dt><dd className="font-medium">{c.transport.mode === "drop" ? "Not used" : fmtTime(c.transport.pickup_time) || "-"}</dd></div>
            <div><dt className="text-xs text-slate-500">Evening drop</dt><dd className="font-medium">{c.transport.mode === "pickup" ? "Not used" : fmtTime(c.transport.drop_time) || "-"}</dd></div>
          </dl>
          {(c.transport.driver_phone || c.transport.attendant_phone) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {c.transport.driver_phone && <a href={`tel:${c.transport.driver_phone.replace(/\s/g, "")}`} className="ui-btn text-sm"><Phone className="h-4 w-4" aria-hidden="true" /> Call driver{c.transport.driver_name ? `, ${c.transport.driver_name}` : ""}</a>}
              {c.transport.attendant_phone && <a href={`tel:${c.transport.attendant_phone.replace(/\s/g, "")}`} className="ui-btn text-sm"><Phone className="h-4 w-4" aria-hidden="true" /> Call attendant</a>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function ParentHome() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [classes, setClasses] = useState({});

  useEffect(() => {
    api.get("/parent/overview").then((r) => setData(r.data)).catch(() => setData({ children: [], posts: [] }));
    api.get("/classes").then((r) => setClasses(Object.fromEntries(r.data.map((c) => [c.id, `${c.name} ${c.section || ""}`.trim()])))).catch(() => {});
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-up" data-testid="parent-home">
      <header>
        <h1 className="font-heading text-2xl sm:text-[28px] font-semibold">Hello, {user?.name?.split(" ")[0] || "there"}</h1>
        <p className="text-slate-500 mt-1">{data?.school_name ? `${data.school_name}: ` : ""}here&apos;s how your {data?.children?.length === 1 ? "child is" : "children are"} doing.</p>
      </header>

      {data && data.children.length === 0 && (
        <div className="ui-card p-8 text-center text-slate-500" data-testid="parent-empty">
          No students are linked to <b>{user?.email}</b> yet. Ask the school to add your email as the guardian email on your child&apos;s profile.
        </div>
      )}
      {data?.children.map((c) => <Child key={c.id} c={c} />)}

      {data && data.children.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-lg font-semibold">Latest from class</h2>
            <Link to="/app/diary" className="inline-flex items-center gap-1 text-sm font-medium text-[#2B4BFF] hover:underline">
              See all <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          {data.posts.length === 0
            ? <div className="ui-card p-6 text-sm text-slate-500">Nothing yet. Classwork, homework and notices will show up here.</div>
            : <div className="space-y-3">{data.posts.slice(0, 5).map((p) => <PostCard key={p.id} post={p} className={classes[p.class_id]} />)}</div>}
        </section>
      )}
    </div>
  );
}
