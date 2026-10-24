import PageHero from "@/components/PageHero";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CalendarCheck, Plus, Send, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PostCard, { KINDS } from "@/components/PostCard";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the local time zone
const blankRow = (due = "") => ({ subject: "", title: "", body: "", due_date: due });
const SUBJECTS = ["Maths", "English", "Science", "Social Studies", "Hindi", "Telugu", "EVS", "Computer", "General Knowledge", "Art", "Physical Education"];

export default function DiaryPage() {
  const { user } = useAuth();
  const staff = user?.role === "admin" || user?.role === "teacher";
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [posts, setPosts] = useState([]);
  const [filter, setFilter] = useState("");
  const [kind, setKind] = useState("classwork");
  const [rows, setRows] = useState([blankRow()]);
  const [busy, setBusy] = useState(false);
  const [marked, setMarked] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const classMap = useMemo(() => Object.fromEntries(classes.map((c) => [c.id, c])), [classes]);
  const label = (c) => (c ? `${c.name} ${c.section || ""}`.trim() : "");
  // Teachers post to their own classes; admins to any class.
  const postable = useMemo(
    () => (user?.role === "teacher" ? classes.filter((c) => c.teacher_id === user.id) : classes),
    [classes, user]
  );

  useEffect(() => {
    api.get("/classes").then((r) => setClasses(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    if (staff && !classId && postable.length) setClassId(postable[0].id);
  }, [staff, classId, postable]);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (staff && classId) params.class_id = classId;
      if (filter) params.kind = filter;
      const { data } = await api.get("/posts", { params });
      setPosts(data);
    } catch (e) { toast.error(errorMessage(e)); }
    setLoaded(true);
  }, [staff, classId, filter]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!staff || !classId) return;
    api.get("/attendance", { params: { date: today(), class_id: classId } })
      .then((r) => setMarked(r.data.length)).catch(() => setMarked(null));
  }, [staff, classId]);

  const setRow = (i, patch) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow(kind === "homework" ? rs[rs.length - 1]?.due_date || "" : "")]);
  const removeRow = (i) => setRows((rs) => rs.filter((_, idx) => idx !== i));
  const switchKind = (k) => { setKind(k); if (k === "notice") setRows((rs) => [rs[0]]); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/posts/batch", {
        class_id: classId, kind, date: today(),
        items: rows.map((r) => ({
          title: r.title, body: r.body || null,
          subject: kind === "notice" ? null : r.subject || null,
          due_date: kind === "homework" ? r.due_date || null : null,
        })),
      });
      const n = rows.length;
      toast.success(n === 1 ? `${KINDS[kind].label} posted` : `${n} ${KINDS[kind].label.toLowerCase()} updates posted`);
      setRows([blankRow(kind === "homework" ? rows[0].due_date : "")]);
      load();
    } catch (err) { toast.error(errorMessage(err)); }
    setBusy(false);
  };

  const remove = async (post) => {
    if (!window.confirm("Delete this post? Parents will no longer see it.")) return;
    try { await api.delete(`/posts/${post.id}`); load(); } catch (err) { toast.error(errorMessage(err)); }
  };

  // Group the feed by day
  const groups = useMemo(() => {
    const m = new Map();
    for (const p of posts) { if (!m.has(p.date)) m.set(p.date, []); m.get(p.date).push(p); }
    return [...m.entries()];
  }, [posts]);

  const dayLabel = (d) => {
    if (d === today()) return "Today";
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (d === y.toLocaleDateString("en-CA")) return "Yesterday";
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
  };
  const canDelete = (p) => user?.role === "admin" || p.created_by === user?.id;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-up" data-testid="diary-page">
      <PageHero title={staff ? "Class diary" : "Updates from school"}
        subtitle={staff ? "Share classwork, homework and notices. Parents see them in their app straight away." : "Classwork, homework and notices from your child's class."} />

      {staff && (postable.length === 0 ? (
        <div className="ui-card p-6 text-sm text-slate-600" data-testid="diary-no-class">
          You aren&apos;t assigned to a class yet. Ask your school admin to set you as the class teacher in <b>Classes</b>.
        </div>
      ) : (
        <>
          <div className="ui-card p-4 sm:p-5 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[12rem]">
              <label className="field-label" htmlFor="diary-class">Class</label>
              <select id="diary-class" data-testid="diary-class" className="ui-input mt-1.5" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {postable.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-[#F1F4FF] px-4 py-3 flex-1 min-w-[14rem]">
              <CalendarCheck className="h-5 w-5 text-[#2B4BFF] shrink-0" aria-hidden="true" />
              <div className="text-sm flex-1">
                <div className="font-medium">Today&apos;s attendance</div>
                <div className="text-slate-500" data-testid="diary-attendance">{marked ? `${marked} students marked` : "Not marked yet"}</div>
              </div>
              <Link to="/app/attendance" className="text-sm font-medium text-[#2B4BFF] hover:underline">{marked ? "Review" : "Mark now"}</Link>
            </div>
          </div>

          <form onSubmit={submit} className="ui-card p-4 sm:p-5 space-y-4" data-testid="diary-form">
            <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Post type">
              {Object.entries(KINDS).map(([k, v]) => (
                <button key={k} type="button" role="tab" aria-selected={kind === k} data-testid={`kind-${k}`} onClick={() => switchKind(k)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${kind === k ? "bg-white text-[#2B4BFF] shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                  {v.label}
                </button>
              ))}
            </div>
            {kind !== "notice" && (
              <p className="text-sm text-slate-500">Add one block per subject, then post them all together.</p>
            )}
            <datalist id="subject-list">{[...new Set([...SUBJECTS, ...posts.map((p) => p.subject).filter(Boolean)])].map((x) => <option key={x} value={x} />)}</datalist>

            <div className="space-y-3">
              {rows.map((r, i) => (
                <div key={i} className={`space-y-3 ${rows.length > 1 || kind !== "notice" ? "rounded-xl border border-[#E7E9F1] bg-slate-50/60 p-4" : ""}`} data-testid={`diary-row-${i}`}>
                  {(kind !== "notice") && (
                    <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
                      <div>
                        <label className="field-label" htmlFor={`d-subject-${i}`}>Subject</label>
                        <input id={`d-subject-${i}`} list="subject-list" data-testid={`diary-subject-${i}`} className="ui-input mt-1.5" placeholder="Maths"
                          value={r.subject} onChange={(e) => setRow(i, { subject: e.target.value })} />
                      </div>
                      {kind === "homework" && (
                        <div>
                          <label className="field-label" htmlFor={`d-due-${i}`}>Due date</label>
                          <input id={`d-due-${i}`} type="date" data-testid={`diary-due-${i}`} className="ui-input mt-1.5" value={r.due_date}
                            onChange={(e) => setRow(i, { due_date: e.target.value })} />
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="field-label" htmlFor={`d-title-${i}`}>{kind === "notice" ? "Notice" : kind === "homework" ? "Homework" : "What was covered"}</label>
                    <input id={`d-title-${i}`} required maxLength={150} data-testid={`diary-title-${i}`} className="ui-input mt-1.5" value={r.title}
                      placeholder={kind === "homework" ? "Exercise 3, questions 1 to 10" : kind === "notice" ? "School closed on Friday" : "Fractions: adding unlike denominators"}
                      onChange={(e) => setRow(i, { title: e.target.value })} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor={`d-body-${i}`}>Details <span className="text-slate-400 font-normal">(optional)</span></label>
                    <textarea id={`d-body-${i}`} rows={2} maxLength={2000} data-testid={`diary-body-${i}`} className="ui-input mt-1.5" value={r.body}
                      onChange={(e) => setRow(i, { body: e.target.value })} />
                  </div>
                  {rows.length > 1 && (
                    <div className="flex justify-end">
                      <button type="button" onClick={() => removeRow(i)} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-red-600">
                        <X className="h-3.5 w-3.5" aria-hidden="true" /> Remove this subject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {kind !== "notice" ? (
                <button type="button" onClick={addRow} data-testid="diary-add-row" className="ui-btn text-sm">
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add another subject
                </button>
              ) : <span />}
              <button type="submit" disabled={busy || !classId} data-testid="diary-post-btn" className="ui-btn btn-primary">
                <Send className="h-4 w-4" aria-hidden="true" /> {busy ? "Posting…" : rows.length > 1 ? `Post ${rows.length} updates to parents` : "Post to parents"}
              </button>
            </div>
          </form>
        </>
      ))}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter posts">
        {[["", "All"], ["classwork", "Classwork"], ["homework", "Homework"], ["notice", "Notices"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${filter === k ? "bg-[#0B1020] text-white border-[#0B1020]" : "bg-white text-slate-600 border-[#E1E4EE] hover:border-slate-300"}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="space-y-6" data-testid="diary-feed">
        {loaded && groups.length === 0 && (
          <div className="ui-card p-8 text-center text-slate-500">
            {staff ? "Nothing posted yet. Your first post will appear here." : "No updates yet. When the class teacher posts, you'll see it here."}
          </div>
        )}
        {groups.map(([d, items]) => (
          <section key={d}>
            <h2 className="text-sm font-medium text-slate-500 mb-2.5">{dayLabel(d)}</h2>
            <div className="space-y-3">
              {items.map((p) => (
                <PostCard key={p.id} post={p} className={label(classMap[p.class_id])} showClass={!staff}
                  onDelete={staff && canDelete(p) ? remove : undefined} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
