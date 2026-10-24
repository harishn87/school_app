import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, errorMessage } from "@/lib/api";
import { ArrowLeft, Pencil, Trash2, GraduationCap, Phone, Mail, MapPin, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import StudentFormModal from "@/components/StudentFormModal";
import ReportCard from "@/components/ReportCard";

export default function StudentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "teacher";
  const canDelete = user?.role === "admin";

  const [student, setStudent] = useState(null);
  const [classes, setClasses] = useState([]);
  const [showEdit, setShowEdit] = useState(false);
  const [reports, setReports] = useState([]);

  const load = useCallback(async () => {
    try {
      const [{ data: s }, { data: cls }] = await Promise.all([
        api.get(`/students/${id}`),
        api.get("/classes"),
      ]);
      setStudent(s);
      setClasses(cls);
    } catch (e) { toast.error("Could not load student"); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/reports", { params: { student_id: id } }).then((r) => setReports(r.data)).catch(() => {}); }, [id]);

  const onDelete = async () => {
    if (!confirm("Delete this student?")) return;
    try { await api.delete(`/students/${id}`); toast.success("Deleted"); navigate("/app/students"); }
    catch (e) { toast.error(errorMessage(e)); }
  };

  if (!student) return <div className="ui-card p-6 max-w-3xl mx-auto">Loading…</div>;

  const cls = classes.find((c) => c.id === student.class_id);

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-up" data-testid="student-detail-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link to="/app/students" className="ui-btn bg-white text-sm" data-testid="back-to-students">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </Link>
        <div className="flex gap-2">
          {canEdit && (
            <button onClick={() => setShowEdit(true)} data-testid="edit-student-btn" className="ui-btn btn-primary">
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
            </button>
          )}
          {canDelete && (
            <button onClick={onDelete} data-testid="delete-student-btn" className="ui-btn bg-white">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
            </button>
          )}
        </div>
      </div>

      <div className="ui-card p-6 grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 text-center">
          {student.photo_base64 ? (
            <img src={student.photo_base64} alt="" className="mx-auto w-40 h-40 object-cover border border-slate-200 rounded-xl shadow-md" />
          ) : (
            <div className="mx-auto w-40 h-40 grid place-items-center bg-[#E8ECFF] text-[#2B4BFF] rounded-2xl shadow-sm font-heading text-5xl font-semibold">
              {student.first_name?.[0]}{student.last_name?.[0]}
            </div>
          )}
          <h1 className="font-heading text-2xl sm:text-[28px] font-semibold mt-4 tracking-tight">{student.first_name} {student.last_name}</h1>
          <div className="text-sm text-slate-500">Roll {student.roll_number || "—"}</div>
          <span className={`inline-block mt-3 px-3 py-1 rounded-full font-medium text-xs capitalize ${student.status === "active" ? "bg-[#E6F8EE] text-green-800" : "bg-slate-100 text-slate-600"}`}>
            {student.status}
          </span>
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Info icon={GraduationCap} label="Class" value={cls ? `${cls.name} ${cls.section || ""}` : "—"} />
            <Info icon={CalendarDays} label="Date of birth" value={student.date_of_birth || "—"} />
            <Info icon={CalendarDays} label="Joining date" value={student.joining_date} highlight />
            <Info icon={CalendarDays} label="Leaving date" value={student.leaving_date || "—"} highlight />
            <Info icon={Phone} label="Guardian phone" value={student.guardian_phone || "—"} />
            <Info icon={Mail} label="Guardian email" value={student.guardian_email || "—"} />
          </div>
          <Info icon={MapPin} label="Address" value={student.address || "—"} full />
          {student.notes && (
            <div className="ui-card !shadow-sm bg-[#F8FAFC] p-3">
              <div className="text-xs font-medium text-slate-500">Notes</div>
              <div className="text-sm mt-1">{student.notes}</div>
            </div>
          )}
        </div>
      </div>

      <div className="ui-card p-6" data-testid="academics">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-2xl font-semibold">Academics</h2>
          {canEdit && student.class_id && <Link to={`/app/progress?class=${student.class_id}`} className="ui-btn text-sm" data-testid="update-progress-link">{user?.role === "teacher" ? "Update progress report" : "View analysis"}</Link>}
        </div>
        {reports.length > 0 && (
          <div className="mt-4 grid lg:grid-cols-2 gap-4" data-testid="academics-reports">
            {reports.map((r) => <ReportCard key={r.id} report={r} compact />)}
          </div>
        )}
        {reports.length === 0 && (!student.grades || student.grades.length === 0) ? (
          <p className="text-sm text-slate-500 mt-2">No progress report yet. {canEdit ? "Use \"Update progress report\" to add one." : ""}</p>
        ) : reports.length > 0 ? null : (
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {student.grades.map((g, i) => (
              <div key={i} className="ui-card !shadow-sm p-4">
                <div className="text-xs font-medium text-slate-500">{g.term}</div>
                <div className="font-heading font-semibold text-lg">{g.subject}</div>
                <div className="font-heading text-3xl font-semibold tracking-tight mt-2">
                  {g.score}<span className="text-base font-bold text-slate-400">/{g.max_score || 100}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showEdit && (
        <StudentFormModal
          student={student}
          classes={classes}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); load(); toast.success("Updated"); }}
        />
      )}
    </div>
  );
}

function Info({ icon: Icon, label, value, full, highlight }) {
  return (
    <div className={`ui-card !shadow-sm p-3 ${full ? "sm:col-span-2" : ""} ${highlight ? "bg-[#F1F4FF]" : "bg-white"}`}>
      <div className="flex items-center gap-2 field-label">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
      </div>
      <div className="font-body text-base mt-1 break-words">{value}</div>
    </div>
  );
}
