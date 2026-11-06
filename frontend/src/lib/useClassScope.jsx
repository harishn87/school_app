import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ChildPicker, { useChildPick } from "@/components/ChildPicker";

/**
 * Which class a schedule page is showing.
 * Admin and teachers pick a class (teachers only get their own); a parent picks a child and sees that child's class.
 * Returns { classId, cls, subjects, picker, ready, empty }.
 */
export default function useClassScope() {
  const { user } = useAuth();
  const parent = user?.role === "parent";
  const [classes, setClasses] = useState([]);
  const [kids, setKids] = useState([]);
  const [ready, setReady] = useState(false);
  const [classId, setClassId] = useState("");
  const [kidId, pickKid] = useChildPick(kids);

  useEffect(() => {
    let live = true;
    Promise.all([
      api.get("/classes").then((r) => r.data).catch(() => []),
      parent ? api.get("/students").then((r) => r.data.filter((s) => s.status === "active")).catch(() => []) : Promise.resolve([]),
    ]).then(([c, k]) => { if (!live) return; setClasses(c); setKids(k); setReady(true); });
    return () => { live = false; };
  }, [parent]);

  const kid = kids.find((k) => k.id === kidId);
  const id = parent ? (kid?.class_id || "") : (classId && classes.some((c) => c.id === classId) ? classId : classes[0]?.id || "");
  const cls = classes.find((c) => c.id === id);
  const subjects = useMemo(() => (cls?.subjects || []).map((s) => (typeof s === "string" ? s : s.name)).filter(Boolean), [cls]);

  const picker = parent
    ? <ChildPicker kids={kids} value={kidId} onPick={pickKid} />
    : (classes.length > 0 && (
      <div className="inline-block min-w-[220px]">
        <label className="field-label" htmlFor="scope-class">Class</label>
        <select id="scope-class" className="ui-input mt-1" value={id} onChange={(e) => setClassId(e.target.value)} data-testid="scope-class">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name} {c.section}</option>)}
        </select>
      </div>));
  const name = parent ? (cls ? `${cls.name} ${cls.section || ""}`.trim() : "") : (cls ? `${cls.name} ${cls.section || ""}`.trim() : "");
  return { classId: id, cls, className: name, subjects, picker, ready, empty: ready && !id };
}
