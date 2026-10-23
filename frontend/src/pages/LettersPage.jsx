import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Search, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { LETTER_KINDS, downloadCertificate } from "@/lib/letters";

const EMPTY = { purpose: "", leaving_date: "", reason: "", conduct: "Good", remarks: "", ignore_dues: false };
const PROFILE_FIELDS = [
  ["address", "School address", "12 MG Road, Hyderabad 500001"],
  ["phone", "Phone", "040 1234 5678"],
  ["email", "Email", "office@yourschool.edu"],
  ["principal_name", "Principal's name", "Dr. A. Rao"],
  ["affiliation", "Board / affiliation", "CBSE affiliation no. 1234567"],
];

export default function LettersPage() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState({});
  const [history, setHistory] = useState([]);
  const [profile, setProfile] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [q, setQ] = useState("");
  const [student, setStudent] = useState(null);
  const [kind, setKind] = useState("bonafide");
  const [f, setF] = useState(EMPTY);
  const [dueError, setDueError] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(() => {
    api.get("/certificates", { params: { limit: 100 } }).then((r) => setHistory(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    api.get("/students").then((r) => setStudents(r.data)).catch(() => {});
    api.get("/classes").then((r) => setClasses(Object.fromEntries(r.data.map((c) => [c.id, `${c.name} ${c.section || ""}`.trim()])))).catch(() => {});
    api.get("/school/profile").then((r) => setProfile(r.data)).catch(() => {});
    loadHistory();
  }, [loadHistory]);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return students.filter((s) => `${s.first_name} ${s.last_name} ${s.roll_number || ""} ${s.guardian_name || ""}`.toLowerCase().includes(t)).slice(0, 6);
  }, [q, students]);

  const incomplete = profile && (!profile.address || !profile.principal_name);

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.put("/school/profile", profile);
      setProfile(data); setProfileOpen(false); toast.success("Letterhead saved");
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const pick = (s) => { setStudent(s); setQ(""); setDueError(false); setF({ ...EMPTY, leaving_date: s.leaving_date || new Date().toLocaleDateString("en-CA") }); };

  const generate = async (e) => {
    e.preventDefault();
    if (!student) return;
    setBusy(true);
    try {
      const body = { student_id: student.id, kind, remarks: f.remarks || null };
      if (kind === "bonafide") body.purpose = f.purpose || null;
      if (kind === "transfer") Object.assign(body, { leaving_date: f.leaving_date || null, reason: f.reason || null, conduct: f.conduct || null, ignore_dues: f.ignore_dues });
      if (kind === "character") body.conduct = f.conduct || null;
      const { data } = await api.post("/certificates", body);
      await downloadCertificate(data);
      toast.success(`${LETTER_KINDS[kind].short} downloaded`);
      setDueError(false);
      loadHistory();
    } catch (err) {
      if (err?.response?.status === 409) setDueError(true);
      toast.error(errorMessage(err));
    }
    setBusy(false);
  };

  const redownload = async (c) => {
    try { await downloadCertificate(c); } catch (err) { toast.error(errorMessage(err)); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-up" data-testid="letters-page">
      <header>
        <h1 className="font-heading text-2xl sm:text-[28px] font-semibold">Letters</h1>
        <p className="text-slate-500 mt-1">Issue bonafide, fee clearance, transfer and character certificates. Each gets a serial number and is saved below.</p>
      </header>

      {incomplete && !profileOpen && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center gap-3 text-sm text-amber-900" data-testid="letterhead-hint">
          <span className="flex-1 min-w-[14rem]">Add your school address and principal&apos;s name so the letters look complete.</span>
          <button type="button" onClick={() => setProfileOpen(true)} className="ui-btn text-sm">Add letterhead details</button>
        </div>
      )}

      <section className="ui-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">Letterhead</h2>
            <p className="text-sm text-slate-500">Printed at the top of every letter.</p>
          </div>
          {!profileOpen && <button type="button" onClick={() => setProfileOpen(true)} data-testid="edit-letterhead" className="ui-btn text-sm">Edit details</button>}
        </div>
        {profile && !profileOpen && (
          <dl className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div><dt className="text-slate-500">School</dt><dd className="font-medium">{profile.name}</dd></div>
            {PROFILE_FIELDS.map(([k, l]) => <div key={k}><dt className="text-slate-500">{l}</dt><dd className="font-medium break-words">{profile[k] || <span className="text-slate-400 font-normal">Not added</span>}</dd></div>)}
          </dl>
        )}
        {profile && profileOpen && (
          <form onSubmit={saveProfile} className="mt-4 grid sm:grid-cols-2 gap-4" data-testid="letterhead-form">
            {PROFILE_FIELDS.map(([k, l, ph]) => (
              <div key={k} className={k === "address" || k === "affiliation" ? "sm:col-span-2" : ""}>
                <label className="field-label" htmlFor={`lh-${k}`}>{l}</label>
                <input id={`lh-${k}`} data-testid={`lh-${k}`} className="ui-input mt-1.5" placeholder={ph} value={profile[k] || ""}
                  onChange={(e) => setProfile({ ...profile, [k]: e.target.value })} />
              </div>
            ))}
            <div className="sm:col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setProfileOpen(false)} className="ui-btn">Cancel</button>
              <button type="submit" data-testid="lh-save" className="ui-btn btn-primary">Save letterhead</button>
            </div>
          </form>
        )}
      </section>

      <form onSubmit={generate} className="ui-card p-5 sm:p-6 space-y-5" data-testid="letter-form">
        <h2 className="font-heading text-lg font-semibold">New letter</h2>

        <div>
          <label className="field-label" htmlFor="letter-student">Student</label>
          {student ? (
            <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-[#E1E4EE] bg-[#F1F4FF] px-4 py-3" data-testid="letter-student-chosen">
              <div className="h-9 w-9 grid place-items-center rounded-full bg-[#2B4BFF] text-white text-sm font-semibold">{student.first_name[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{student.first_name} {student.last_name}</div>
                <div className="text-xs text-slate-500">{classes[student.class_id] || "No class"}{student.roll_number ? ` · Roll ${student.roll_number}` : ""}{student.status === "left" ? " · Left school" : ""}</div>
              </div>
              <button type="button" onClick={() => { setStudent(null); setDueError(false); }} aria-label="Choose a different student"
                className="h-8 w-8 grid place-items-center rounded-lg text-slate-500 hover:bg-white"><X className="h-4 w-4" aria-hidden="true" /></button>
            </div>
          ) : (
            <div className="relative mt-1.5">
              <Search className="h-4 w-4 absolute left-3.5 top-3.5 text-slate-400" aria-hidden="true" />
              <input id="letter-student" data-testid="letter-student-search" className="ui-input pl-10" placeholder="Search by name, roll number or guardian"
                value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
              {q.trim() && (
                <ul className="absolute z-10 left-0 right-0 mt-1.5 rounded-xl border border-[#E1E4EE] bg-white shadow-lg overflow-hidden" role="listbox">
                  {matches.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No student found</li>}
                  {matches.map((s) => (
                    <li key={s.id}>
                      <button type="button" role="option" aria-selected="false" data-testid={`letter-pick-${s.id}`} onClick={() => pick(s)}
                        className="w-full text-left px-4 py-2.5 hover:bg-[#F1F4FF] flex items-center justify-between gap-3">
                        <span className="font-medium">{s.first_name} {s.last_name}</span>
                        <span className="text-xs text-slate-500">{classes[s.class_id] || "No class"}{s.roll_number ? ` · Roll ${s.roll_number}` : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <fieldset>
          <legend className="field-label">Type of letter</legend>
          <div className="mt-1.5 grid sm:grid-cols-2 gap-3">
            {Object.entries(LETTER_KINDS).map(([k, v]) => (
              <label key={k} className={`cursor-pointer rounded-xl border p-4 transition-colors ${kind === k ? "border-[#2B4BFF] bg-[#F1F4FF] ring-4 ring-[#2B4BFF]/10" : "border-[#E1E4EE] hover:border-slate-300"}`}>
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => { setKind(k); setDueError(false); }} className="sr-only" data-testid={`letter-kind-${k}`} />
                <div className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-[#2B4BFF]" aria-hidden="true" /> {v.short}</div>
                <p className="text-xs text-slate-500 mt-1">{v.blurb}</p>
              </label>
            ))}
          </div>
        </fieldset>

        {kind === "bonafide" && (
          <div>
            <label className="field-label" htmlFor="l-purpose">Purpose <span className="text-slate-400 font-normal">(optional)</span></label>
            <input id="l-purpose" data-testid="l-purpose" className="ui-input mt-1.5" placeholder="for passport application" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} />
          </div>
        )}
        {kind === "transfer" && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label" htmlFor="l-leave">Date of leaving</label>
              <input id="l-leave" type="date" data-testid="l-leaving" className="ui-input mt-1.5" value={f.leaving_date} onChange={(e) => setF({ ...f, leaving_date: e.target.value })} />
            </div>
            <div>
              <label className="field-label" htmlFor="l-conduct">General conduct</label>
              <select id="l-conduct" className="ui-input mt-1.5" value={f.conduct} onChange={(e) => setF({ ...f, conduct: e.target.value })}>
                {["Excellent", "Very good", "Good", "Satisfactory"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="l-reason">Reason for leaving <span className="text-slate-400 font-normal">(optional)</span></label>
              <input id="l-reason" data-testid="l-reason" className="ui-input mt-1.5" placeholder="Family relocating to another city" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
            </div>
            {dueError && (
              <label className="sm:col-span-2 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
                <input type="checkbox" data-testid="l-ignore-dues" checked={f.ignore_dues} onChange={(e) => setF({ ...f, ignore_dues: e.target.checked })} />
                Issue even though fees are pending
              </label>
            )}
          </div>
        )}
        {kind === "character" && (
          <div>
            <label className="field-label" htmlFor="l-conduct2">Conduct and character</label>
            <select id="l-conduct2" className="ui-input mt-1.5" value={f.conduct} onChange={(e) => setF({ ...f, conduct: e.target.value })}>
              {["Excellent", "Very good", "Good", "Satisfactory"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}
        {kind !== "fee_clearance" && (
          <div>
            <label className="field-label" htmlFor="l-remarks">Extra note <span className="text-slate-400 font-normal">(optional, printed on the letter)</span></label>
            <input id="l-remarks" className="ui-input mt-1.5" maxLength={300} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} />
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={!student || busy} data-testid="letter-generate" className="ui-btn btn-primary">
            <Download className="h-4 w-4" aria-hidden="true" /> {busy ? "Preparing…" : "Generate and download PDF"}
          </button>
        </div>
      </form>

      <section className="ui-card overflow-hidden">
        <div className="px-5 sm:px-6 pt-5 pb-3">
          <h2 className="font-heading text-lg font-semibold">Issued letters</h2>
          <p className="text-sm text-slate-500">Download any letter again, exactly as it was issued.</p>
        </div>
        {history.length === 0 ? (
          <p className="px-6 pb-8 pt-2 text-sm text-slate-500" data-testid="letters-empty">No letters issued yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="letters-history">
              <thead><tr className="table-head">
                <th className="px-5 py-3 font-medium">Number</th><th className="px-5 py-3 font-medium">Letter</th>
                <th className="px-5 py-3 font-medium">Student</th><th className="px-5 py-3 font-medium">Issued</th><th className="px-5 py-3" />
              </tr></thead>
              <tbody>
                {history.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-3 font-mono text-xs">{c.number}</td>
                    <td className="px-5 py-3">{LETTER_KINDS[c.kind]?.short}</td>
                    <td className="px-5 py-3 font-medium">{c.data.student_name}</td>
                    <td className="px-5 py-3 text-slate-500">{formatDate(c.issued_on)}</td>
                    <td className="px-5 py-3 text-right">
                      <button type="button" onClick={() => redownload(c)} data-testid={`letter-dl-${c.id}`} className="ui-btn text-xs px-3 py-1.5"><Download className="h-3.5 w-3.5" aria-hidden="true" /> PDF</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
