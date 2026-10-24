import PageHero from "@/components/PageHero";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarCheck, GraduationCap, Phone, TrendingUp, UserRound, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate, formatMoney } from "@/lib/utils";
import SchoolMonthCalendar from "@/components/SchoolMonthCalendar";
import PostCard from "@/components/PostCard";

const FEE = {
  paid: ["Paid", "bg-emerald-50 text-emerald-700"],
  partial: ["Part paid", "bg-amber-50 text-amber-700"],
  unpaid: ["Unpaid", "bg-rose-50 text-rose-700"],
  none: ["No fees", "bg-slate-100 text-slate-600"],
};

function Tile({ icon: Icon, label, value, sub, testid }) {
  return (
    <div className="ui-card p-5">
      <span className="h-9 w-9 grid place-items-center rounded-xl bg-[#E8ECFF] text-[#2B4BFF]"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
      <div className="font-heading text-3xl font-semibold mt-3 tabular-nums" data-testid={testid}>{value}</div>
      <div className="text-sm text-slate-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function ClassDetailPage() {
  const { id } = useParams();
  const [cls, setCls] = useState(null);
  const [staff, setStaff] = useState([]);
  const [ov, setOv] = useState(null);
  const { user } = useAuth();
  const teacherView = user?.role === "teacher";
  const [posts, setPosts] = useState([]);
  const [day, setDay] = useState(new Date().toLocaleDateString("en-CA"));
  const [dayMarks, setDayMarks] = useState([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [c, o, p] = await Promise.all([api.get("/classes"), api.get("/dashboard/overview"), api.get("/posts", { params: { class_id: id, limit: 5 } })]);
        const found = c.data.find((x) => x.id === id);
        if (!found) { setMissing(true); return; }
        setCls(found); setOv(o.data); setPosts(p.data);
        api.get("/users").then((u) => setStaff(u.data)).catch(() => {});
      } catch (_e) { setMissing(true); }
    })();
  }, [id]);

  useEffect(() => {
    api.get("/attendance", { params: { date: day } }).then((r) => setDayMarks(r.data)).catch(() => setDayMarks([]));
  }, [day, id]);

  const rows = useMemo(() => (ov ? ov.students.filter((s) => s.class_id === id).sort((a, b) => Number(a.roll_number || 9999) - Number(b.roll_number || 9999) || a.name.localeCompare(b.name)) : []), [ov, id]);
  const sum = ov?.classes.find((c) => c.class_id === id);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const absent = dayMarks.filter((m) => m.status === "absent" && byId[m.student_id]);
  const late = dayMarks.filter((m) => m.status === "late" && byId[m.student_id]);
  const present = dayMarks.filter((m) => m.status === "present" && byId[m.student_id]).length;
  const marked = absent.length + late.length + present;
  const showFees = !!ov && ov.totals.fees_pending != null;
  const pending = rows.reduce((a, r) => a + (r.fees_pending || 0), 0);

  if (missing) return <div className="ui-card p-8 text-center text-slate-500">Class not found. <Link className="text-[#2B4BFF]" to="/app/classes">Back to classes</Link></div>;
  if (!cls || !ov) return <div className="max-w-6xl mx-auto h-40 ui-card animate-pulse" />;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="class-detail">
      <PageHero testid="class-hero" title={<span data-testid="class-title">{cls.name}{cls.section ? ` ${cls.section}` : ""}</span>}
        subtitle={cls.academic_year ? `Academic year ${cls.academic_year}` : "Class overview"}
        actions={<Link to="/app/classes" className="ui-btn text-sm"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All classes</Link>} />

      <div className="grid sm:grid-cols-3 gap-3" data-testid="class-team">
        {[["Class teacher", staff.find((x) => x.id === cls.teacher_id)?.name || (cls.teacher_id ? "Assigned" : "Not assigned"), "primary"],
          ["Second teacher", staff.find((x) => x.id === cls.secondary_teacher_id)?.name || (cls.secondary_teacher_id ? "Assigned" : "None"), "secondary"]].map(([label, name, k]) => (
          <div key={k} className="ui-card p-4 flex items-center gap-3" data-testid={`team-${k}`}>
            <span className="h-10 w-10 grid place-items-center rounded-xl bg-[#E8ECFF] text-[#2B4BFF]"><UserRound className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0"><div className="text-xs text-slate-500">{label}</div><div className="font-medium truncate">{name}</div></div>
          </div>
        ))}
        <div className="ui-card p-4 flex items-center gap-3" data-testid="team-attender">
          <span className="h-10 w-10 grid place-items-center rounded-xl bg-[#E8ECFF] text-[#2B4BFF]"><Phone className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0"><div className="text-xs text-slate-500">Attender</div>
            <div className="font-medium truncate">{cls.attender_name || "None"}</div>
            {cls.attender_phone && <a href={`tel:${cls.attender_phone.replace(/\s/g, "")}`} className="text-sm text-[#2B4BFF] hover:underline">{cls.attender_phone}</a>}</div>
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-4 ${showFees ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <Tile icon={GraduationCap} label="Students" value={rows.length} testid="cd-students" />
        <Tile icon={CalendarCheck} label="Attendance, 30 days" value={sum?.attendance_pct == null ? "-" : `${sum.attendance_pct}%`} testid="cd-att" />
        <Tile icon={TrendingUp} label="Average grade" value={sum?.grade_avg == null ? "-" : `${sum.grade_avg}%`} testid="cd-grade" />
        {showFees && <Tile icon={Wallet} label="Fees pending" value={pending > 0 ? formatMoney(pending) : "Nil"} sub={`${rows.filter((r) => r.fees_pending > 0).length} students`} testid="cd-fees" />}
      </div>

      <section className="ui-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEF0F6] flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Students</h2>
          {teacherView && <Link to="/app/diary" className="text-sm font-medium text-[#2B4BFF] hover:underline">Post to class diary</Link>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="cd-table">
            <thead><tr>
              <th scope="col" className="table-head px-4 py-2.5 text-left">Roll</th><th scope="col" className="table-head px-4 py-2.5 text-left">Student</th>
              <th scope="col" className="table-head px-4 py-2.5 text-right">Grade avg</th><th scope="col" className="table-head px-4 py-2.5 text-right">Attendance</th>{showFees && <th scope="col" className="table-head px-4 py-2.5 text-right">Fees</th>}
            </tr></thead>
            <tbody className="divide-y divide-[#EEF0F6]">
              {rows.length === 0 && <tr><td colSpan={showFees ? 5 : 4} className="px-4 py-8 text-center text-slate-500">No students in this class yet.</td></tr>}
              {rows.map((s) => {
                const [fl, fc] = FEE[s.fee_status || "none"];
                return (
                  <tr key={s.id} className="hover:bg-[#F7F8FF]" data-testid={`cd-row-${s.id}`}>
                    <td className="px-4 py-2.5 text-slate-500 tabular-nums">{s.roll_number || "-"}</td>
                    <td className="px-4 py-2.5"><Link className="font-medium hover:text-[#2B4BFF]" to={`/app/students/${s.id}`}>{s.name}</Link></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.grade_avg == null ? "-" : `${s.grade_avg}%`}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.attendance_pct == null ? "-" : `${s.attendance_pct}%`}{s.attendance_pct != null && s.attendance_pct < 75 ? " ⚠" : ""}</td>
                    {showFees && <td className="px-4 py-2.5 text-right">
                      <Link to={`/app/fees?student=${s.id}`} className="inline-flex items-center justify-end rounded-lg px-1.5 py-1 -mr-1.5 hover:bg-[#E8ECFF] transition-colors" title="Open this student's fees" data-testid={`cd-fee-${s.id}`}>
                        <span className={`pill ${fc}`}>{fl}</span>{s.fees_pending > 0 && <span className="ml-2 tabular-nums text-slate-600">{formatMoney(s.fees_pending)}</span>}
                      </Link></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-3">
          <SchoolMonthCalendar classId={id} selected={day} onPick={setDay} refreshKey={0} />
          <div className="ui-card p-4 text-sm" data-testid="cd-day">
            <div className="font-medium">{formatDate(day)}</div>
            {marked === 0 ? <p className="text-slate-500 mt-1">No attendance marked for this day.{teacherView && <> <Link className="text-[#2B4BFF]" to="/app/attendance">Mark attendance</Link></>}</p> : (
              <div className="mt-1 space-y-1.5">
                <p className="text-slate-600">{present} present · {late.length} late · {absent.length} absent</p>
                {absent.length > 0 && <p><b className="text-rose-700">Absent:</b> {absent.map((m) => byId[m.student_id].name).join(", ")}</p>}
                {late.length > 0 && <p><b className="text-amber-700">Late:</b> {late.map((m) => byId[m.student_id].name).join(", ")}</p>}
              </div>
            )}
          </div>
        </div>
        {teacherView && <section>
          <h2 className="font-heading text-lg font-semibold mb-3">Recent class diary</h2>
          {posts.length === 0 ? <div className="ui-card p-6 text-sm text-slate-500">No posts for this class yet.</div>
            : <div className="space-y-3">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>}
        </section>}
      </div>
    </div>
  );
}
