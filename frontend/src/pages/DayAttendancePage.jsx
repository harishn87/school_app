import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, Pencil, Phone } from "lucide-react";
import { api } from "@/lib/api";

const STATUS = {
  present: ["Present", "bg-emerald-50 text-emerald-700"],
  late: ["Late", "bg-amber-50 text-amber-700"],
  absent: ["Absent", "bg-rose-50 text-rose-700"],
  none: ["Not marked", "bg-slate-100 text-slate-600"],
};
const rank = (n = "") => {
  const m = n.match(/\d+/);
  return (/^(pp|nursery|lkg|ukg|kg)/i.test(n.trim()) ? 0 : 100) + (m ? Number(m[0]) : 0);
};
const shift = (iso, n) => { const d = new Date(iso + "T00:00"); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-CA"); };

function Tile({ label, value, tone, testid }) {
  return <div className={`rounded-2xl p-4 ${tone}`}><div className="text-xs font-medium">{label}</div><div className="font-heading text-3xl font-semibold mt-1" data-testid={testid}>{value}</div></div>;
}

function Split({ c }) {
  const parts = [["present", c.present, "bg-emerald-500"], ["late", c.late, "bg-amber-400"], ["absent", c.absent, "bg-rose-500"], ["none", c.unmarked, "bg-slate-200"]].filter((p) => p[1] > 0);
  return (
    <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`${c.present} present, ${c.late} late, ${c.absent} absent, ${c.unmarked} not marked`}>
      {parts.map(([k, n, cls]) => <div key={k} className={`${cls} rounded-sm`} style={{ flex: n }} />)}
    </div>
  );
}

function ClassCard({ c, date, open, onToggle, canMark }) {
  const flagged = c.students.filter((s) => s.status === "absent" || s.status === "late");
  return (
    <section className="ui-card p-5" data-testid={`day-class-${c.class_id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-semibold"><Link className="hover:text-[#2B4BFF]" to={`/app/classes/${c.class_id}`}>{c.class_name}</Link></h2>
          <p className="text-sm text-slate-500">
            {c.teacher ? `Class teacher ${c.teacher}` : "No class teacher"}{c.secondary_teacher ? `, with ${c.secondary_teacher}` : ""}
          </p>
          {c.attender_name && (
            <p className="mt-0.5 text-sm text-slate-500 inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" aria-hidden="true" /> Attender {c.attender_name}
              {c.attender_phone && <a href={`tel:${c.attender_phone.replace(/\s/g, "")}`} className="text-[#2B4BFF] hover:underline">{c.attender_phone}</a>}</p>
          )}
        </div>
        <div className="text-right">
          <div className="font-heading text-3xl font-semibold leading-none" data-testid={`day-pct-${c.class_id}`}>{c.percent == null ? "-" : `${c.percent}%`}</div>
          <div className="text-xs text-slate-500 mt-1">present</div>
        </div>
      </div>

      <div className="mt-4"><Split c={c} /></div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <span>{c.total} students</span>
        <span><i className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500 mr-1.5" />{c.present} present</span>
        <span><i className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400 mr-1.5" />{c.late} late</span>
        <span><i className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500 mr-1.5" />{c.absent} absent</span>
        {c.unmarked > 0 && <span><i className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-200 mr-1.5" />{c.unmarked} not marked</span>}
      </div>

      {flagged.length > 0 && (
        <p className="mt-3 text-sm" data-testid={`day-flagged-${c.class_id}`}>
          {flagged.map((s) => (
            <span key={s.id} className={`pill mr-1.5 mb-1.5 ${STATUS[s.status][1]}`}>{s.name} · {STATUS[s.status][0]}</span>
          ))}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex items-center gap-1 text-sm font-medium text-[#2B4BFF] hover:underline" data-testid={`day-toggle-${c.class_id}`}>
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" /> {open ? "Hide students" : "All students"}
        </button>
        {canMark && <Link to={`/app/attendance?date=${date}&class=${c.class_id}`} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-[#2B4BFF]">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Mark or edit
        </Link>}
      </div>

      {open && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-[#EEF0F6]">
          <table className="w-full text-sm" data-testid={`day-roster-${c.class_id}`}>
            <tbody className="divide-y divide-[#EEF0F6]">
              {c.students.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 w-12 text-slate-400 tabular-nums">{s.roll_number}</td>
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-right"><span className={`pill ${STATUS[s.status || "none"][1]}`}>{STATUS[s.status || "none"][0]}</span></td>
                </tr>
              ))}
              {c.students.length === 0 && <tr><td className="px-3 py-4 text-slate-500">No students in this class.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function DayAttendancePage() {
  const { user } = useAuth();
  const { date } = useParams();
  const [params] = useSearchParams();
  const only = params.get("class") || "";
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState({});

  useEffect(() => {
    let live = true;
    setData(null); setError(false);
    api.get("/attendance/day", { params: { date, class_id: only || undefined } })
      .then((r) => live && setData(r.data)).catch(() => live && setError(true));
    return () => { live = false; };
  }, [date, only]);

  const go = (iso) => navigate(`/app/attendance/day/${iso}${only ? `?class=${only}` : ""}`);
  const nice = new Date(date + "T00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const classes = data ? [...data.classes].sort((a, b) => rank(a.name) - rank(b.name) || a.class_name.localeCompare(b.class_name)) : [];
  const t = data?.totals;

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-up" data-testid="day-attendance-page">
      <div>
        <Link to="/app/attendance" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#2B4BFF]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Attendance calendar</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-2xl sm:text-[28px] font-semibold" data-testid="day-title">{nice}</h1>
          <div className="flex gap-1">
            <button type="button" className="ui-btn !px-2.5 !py-1.5" onClick={() => go(shift(date, -1))} aria-label="Previous day" data-testid="day-prev"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
            <button type="button" className="ui-btn text-xs !px-3 !py-1.5" onClick={() => go(new Date().toLocaleDateString("en-CA"))}>Today</button>
            <button type="button" className="ui-btn !px-2.5 !py-1.5" onClick={() => go(shift(date, 1))} aria-label="Next day" data-testid="day-next"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </div>
        {only && <p className="mt-1 text-sm text-slate-500">Showing one class. <Link className="text-[#2B4BFF] hover:underline" to={`/app/attendance/day/${date}`}>Show all classes</Link></p>}
      </div>

      {data?.holiday && <div className="rounded-2xl bg-[#0B1020] text-white px-5 py-4" data-testid="day-holiday"><b className="font-heading">Holiday</b> · {data.holiday}</div>}
      {data && !data.holiday && data.weekend && <div className="rounded-2xl bg-slate-100 text-slate-600 px-5 py-3 text-sm">Sunday. School is normally closed.</div>}
      {error && <div className="ui-card p-6 text-sm text-red-600">Couldn&apos;t load attendance for this day.</div>}
      {!data && !error && <div className="ui-card h-40 animate-pulse" />}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Tile label="Present" value={t.present} tone="bg-emerald-50 text-emerald-900" testid="day-t-present" />
            <Tile label="Late" value={t.late} tone="bg-amber-50 text-amber-900" testid="day-t-late" />
            <Tile label="Absent" value={t.absent} tone="bg-rose-50 text-rose-900" testid="day-t-absent" />
            <Tile label="Not marked" value={t.unmarked} tone="bg-white border border-[#E7E9F1]" testid="day-t-unmarked" />
          </div>
          {classes.length === 0
            ? <div className="ui-card p-8 text-center text-slate-500">No classes to show.</div>
            : <div className="grid lg:grid-cols-2 gap-5">{classes.map((c) => <ClassCard key={c.class_id} c={c} canMark={user?.role === "teacher"} date={date} open={!!open[c.class_id]} onToggle={() => setOpen((o) => ({ ...o, [c.class_id]: !o[c.class_id] }))} />)}</div>}
        </>
      )}
    </div>
  );
}
