import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarCheck, GraduationCap, TrendingUp, Wallet } from "lucide-react";
import { api } from "@/lib/api";
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
      <div className="flex items-center gap-2 text-sm text-slate-500"><Icon className="h-4 w-4 text-[#2B4BFF]" aria-hidden="true" /> {label}</div>
      <div className="font-heading text-2xl font-semibold mt-1.5" data-testid={testid}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function ClassDetailPage() {
  const { id } = useParams();
  const [cls, setCls] = useState(null);
  const [teacher, setTeacher] = useState(null);
  const [ov, setOv] = useState(null);
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
        if (found.teacher_id) api.get("/users").then((u) => setTeacher(u.data.find((x) => x.id === found.teacher_id) || null)).catch(() => {});
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
  const pending = rows.reduce((a, r) => a + r.fees_pending, 0);

  if (missing) return <div className="ui-card p-8 text-center text-slate-500">Class not found. <Link className="text-[#2B4BFF]" to="/app/classes">Back to classes</Link></div>;
  if (!cls || !ov) return <div className="max-w-6xl mx-auto h-40 ui-card animate-pulse" />;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="class-detail">
      <div>
        <Link to="/app/classes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#2B4BFF]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> All classes</Link>
        <h1 className="font-heading text-2xl sm:text-[28px] font-semibold mt-1" data-testid="class-title">{cls.name}{cls.section ? ` ${cls.section}` : ""}</h1>
        <p className="text-slate-500 mt-1">{teacher ? `Class teacher: ${teacher.name}` : "No class teacher assigned"}{cls.academic_year ? ` · ${cls.academic_year}` : ""}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={GraduationCap} label="Students" value={rows.length} testid="cd-students" />
        <Tile icon={CalendarCheck} label="Attendance, 30 days" value={sum?.attendance_pct == null ? "-" : `${sum.attendance_pct}%`} testid="cd-att" />
        <Tile icon={TrendingUp} label="Average grade" value={sum?.grade_avg == null ? "-" : `${sum.grade_avg}%`} testid="cd-grade" />
        <Tile icon={Wallet} label="Fees pending" value={pending > 0 ? formatMoney(pending) : "Nil"} sub={`${rows.filter((r) => r.fees_pending > 0).length} students`} testid="cd-fees" />
      </div>

      <section className="ui-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEF0F6] flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Students</h2>
          <Link to="/app/diary" className="text-sm font-medium text-[#2B4BFF] hover:underline">Post to class diary</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="cd-table">
            <thead><tr>
              <th scope="col" className="table-head px-4 py-2.5 text-left">Roll</th><th scope="col" className="table-head px-4 py-2.5 text-left">Student</th>
              <th scope="col" className="table-head px-4 py-2.5 text-right">Grade avg</th><th scope="col" className="table-head px-4 py-2.5 text-right">Attendance</th><th scope="col" className="table-head px-4 py-2.5 text-right">Fees</th>
            </tr></thead>
            <tbody className="divide-y divide-[#EEF0F6]">
              {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No students in this class yet.</td></tr>}
              {rows.map((s) => {
                const [fl, fc] = FEE[s.fee_status];
                return (
                  <tr key={s.id} className="hover:bg-[#F7F8FF]" data-testid={`cd-row-${s.id}`}>
                    <td className="px-4 py-2.5 text-slate-500 tabular-nums">{s.roll_number || "-"}</td>
                    <td className="px-4 py-2.5"><Link className="font-medium hover:text-[#2B4BFF]" to={`/app/students/${s.id}`}>{s.name}</Link></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.grade_avg == null ? "-" : `${s.grade_avg}%`}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.attendance_pct == null ? "-" : `${s.attendance_pct}%`}{s.attendance_pct != null && s.attendance_pct < 75 ? " ⚠" : ""}</td>
                    <td className="px-4 py-2.5 text-right"><span className={`pill ${fc}`}>{fl}</span>{s.fees_pending > 0 && <span className="ml-2 tabular-nums text-slate-600">{formatMoney(s.fees_pending)}</span>}</td>
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
            {marked === 0 ? <p className="text-slate-500 mt-1">No attendance marked for this day. <Link className="text-[#2B4BFF]" to="/app/attendance">Mark attendance</Link></p> : (
              <div className="mt-1 space-y-1.5">
                <p className="text-slate-600">{present} present · {late.length} late · {absent.length} absent</p>
                {absent.length > 0 && <p><b className="text-rose-700">Absent:</b> {absent.map((m) => byId[m.student_id].name).join(", ")}</p>}
                {late.length > 0 && <p><b className="text-amber-700">Late:</b> {late.map((m) => byId[m.student_id].name).join(", ")}</p>}
              </div>
            )}
          </div>
        </div>
        <section>
          <h2 className="font-heading text-lg font-semibold mb-3">Recent class diary</h2>
          {posts.length === 0 ? <div className="ui-card p-6 text-sm text-slate-500">No posts for this class yet.</div>
            : <div className="space-y-3">{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>}
        </section>
      </div>
    </div>
  );
}
