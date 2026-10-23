import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Bus, MapPin, Pencil, Phone, Plus, Search, Trash2, Users, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Modal from "@/components/Modal";
import { fmtTime } from "@/lib/utils";

const MODES = { both: "Morning and evening", pickup: "Morning pickup only", drop: "Evening drop only" };
const EMPTY_BUS = { number: "", registration: "", capacity: 40, driver_name: "", driver_phone: "", attendant_name: "", attendant_phone: "" };

function Seats({ used, cap }) {
  const pct = Math.min(100, Math.round((used / Math.max(cap, 1)) * 100));
  const over = used > cap;
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>Seats used</span><span className={over ? "text-red-600 font-medium" : ""}>{used} of {cap}{over ? " (over capacity)" : ""}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-[#2B4BFF]"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function TransportPage() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const [tab, setTab] = useState("routes");
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [assigns, setAssigns] = useState([]);
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState({});
  const [busModal, setBusModal] = useState(null);      // bus object or {} for new
  const [routeModal, setRouteModal] = useState(null);
  const [assignModal, setAssignModal] = useState(null); // { student?, routeId? }
  const [roster, setRoster] = useState(null);           // route whose students are shown
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, r, a] = await Promise.all([api.get("/transport/buses"), api.get("/transport/routes"), api.get("/transport/assignments")]);
      setBuses(b.data); setRoutes(r.data); setAssigns(a.data);
    } catch (e) { toast.error(errorMessage(e)); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    load();
    api.get("/students", { params: { status: "active" } }).then((r) => setStudents(r.data)).catch(() => {});
    api.get("/classes").then((r) => setClasses(Object.fromEntries(r.data.map((c) => [c.id, `${c.name} ${c.section || ""}`.trim()])))).catch(() => {});
  }, [load]);

  const routeMap = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r])), [routes]);
  const assignMap = useMemo(() => Object.fromEntries(assigns.map((a) => [a.student_id, a])), [assigns]);

  const del = async (url, what) => {
    if (!window.confirm(`Delete ${what}?`)) return;
    try { await api.delete(url); toast.success("Deleted"); load(); } catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="transport-page">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-[28px] font-semibold">Transport</h1>
          <p className="text-slate-500 mt-1">Buses, routes and which stop each student uses. Parents see their child&apos;s bus in their app.</p>
        </div>
        {admin && (
          <div className="flex gap-2">
            {tab === "buses" && <button className="ui-btn btn-primary" data-testid="new-bus" onClick={() => setBusModal({})}><Plus className="h-4 w-4" aria-hidden="true" /> New bus</button>}
            {tab === "routes" && <button className="ui-btn btn-primary" data-testid="new-route" onClick={() => setRouteModal({})}><Plus className="h-4 w-4" aria-hidden="true" /> New route</button>}
          </div>
        )}
      </header>

      <div className="inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Transport sections">
        {[["routes", "Routes"], ["buses", "Buses"], ["students", "Students"]].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} data-testid={`tab-${k}`} onClick={() => setTab(k)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === k ? "bg-white text-[#2B4BFF] shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{l}</button>
        ))}
      </div>

      {tab === "routes" && (
        <section className="grid md:grid-cols-2 gap-5" data-testid="routes-list">
          {loaded && routes.length === 0 && (
            <div className="ui-card p-8 text-center text-slate-500 md:col-span-2">
              No routes yet.{admin ? " Add your buses first, then create a route with its stops and timings." : ""}
            </div>
          )}
          {routes.map((r) => (
            <article key={r.id} className="ui-card p-5" data-testid={`route-${r.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-heading text-lg font-semibold truncate">{r.name}</h2>
                  <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <Bus className="h-4 w-4" aria-hidden="true" />
                    {r.bus ? `${r.bus.number}${r.bus.registration ? ` · ${r.bus.registration}` : ""}` : "No bus assigned yet"}
                  </p>
                </div>
                {admin && (
                  <div className="flex gap-1 shrink-0">
                    <button type="button" aria-label="Edit route" onClick={() => setRouteModal(r)} className="h-9 w-9 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                    <button type="button" aria-label="Delete route" onClick={() => del(`/transport/routes/${r.id}`, `the route “${r.name}”`)} className="h-9 w-9 grid place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                )}
              </div>
              {r.bus && <div className="mt-4"><Seats used={r.students} cap={r.bus.capacity} /></div>}
              <ol className="mt-4 space-y-0">
                {r.stops.map((s, i) => (
                  <li key={s.name} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#2B4BFF] mt-1.5" />
                      {i < r.stops.length - 1 && <span className="w-px flex-1 bg-[#D5DDFF]" />}
                    </div>
                    <div className="pb-3 flex-1 min-w-0 flex justify-between gap-3 text-sm">
                      <span className="font-medium truncate">{s.name}</span>
                      <span className="text-slate-500 shrink-0">{fmtTime(s.pickup_time) || "-"} / {fmtTime(s.drop_time) || "-"}</span>
                    </div>
                  </li>
                ))}
                {r.stops.length === 0 && <li className="text-sm text-slate-400">No stops added yet.</li>}
              </ol>
              {r.stops.length > 0 && <p className="text-xs text-slate-400 -mt-1">Times shown as morning pickup / evening drop.</p>}
              <div className="mt-4 pt-4 border-t border-[#E7E9F1] flex items-center justify-between">
                <span className="text-sm text-slate-600 flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden="true" /> {r.students} student{r.students === 1 ? "" : "s"}</span>
                <button type="button" onClick={() => setRoster(r)} data-testid={`roster-${r.id}`} className="ui-btn text-sm px-3 py-1.5">View students</button>
              </div>
            </article>
          ))}
        </section>
      )}

      {tab === "buses" && (
        <section className="ui-card overflow-hidden" data-testid="buses-list">
          {loaded && buses.length === 0 ? (
            <p className="p-8 text-center text-slate-500">No buses yet.{admin ? " Add your first bus with the driver's details." : ""}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="table-head">
                  <th className="px-5 py-3 font-medium">Bus</th><th className="px-5 py-3 font-medium">Driver</th><th className="px-5 py-3 font-medium">Attendant</th>
                  <th className="px-5 py-3 font-medium">Students</th>{admin && <th className="px-5 py-3" />}
                </tr></thead>
                <tbody>
                  {buses.map((b) => (
                    <tr key={b.id} className="border-b border-slate-100 last:border-0" data-testid={`bus-${b.id}`}>
                      <td className="px-5 py-3"><div className="font-medium">{b.number}</div><div className="text-xs text-slate-500">{b.registration || "No registration added"}</div></td>
                      <td className="px-5 py-3"><Person name={b.driver_name} phone={b.driver_phone} /></td>
                      <td className="px-5 py-3"><Person name={b.attendant_name} phone={b.attendant_phone} /></td>
                      <td className="px-5 py-3"><span className={b.students > b.capacity ? "text-red-600 font-medium" : ""}>{b.students}</span> <span className="text-slate-400">/ {b.capacity}</span></td>
                      {admin && (
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <button className="ui-btn text-xs px-3 py-1.5" onClick={() => setBusModal(b)}>Edit</button>{" "}
                          <button className="ui-btn text-xs px-2.5 py-1.5" aria-label={`Delete ${b.number}`} onClick={() => del(`/transport/buses/${b.id}`, `${b.number}`)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "students" && <StudentsTab students={students} classes={classes} assignMap={assignMap} routeMap={routeMap} routes={routes} admin={admin} onAssign={(s) => setAssignModal({ student: s })} />}

      {busModal && <BusModal bus={busModal} onClose={() => setBusModal(null)} onSaved={() => { setBusModal(null); load(); }} />}
      {routeModal && <RouteModal route={routeModal} buses={buses} onClose={() => setRouteModal(null)} onSaved={() => { setRouteModal(null); load(); }} />}
      {assignModal && <AssignModal {...assignModal} students={students} classes={classes} routes={routes} assignMap={assignMap}
        onClose={() => setAssignModal(null)} onSaved={() => { setAssignModal(null); load(); }} />}
      {roster && <Roster route={roster} assigns={assigns.filter((a) => a.route_id === roster.id)} students={students} classes={classes} admin={admin}
        onClose={() => setRoster(null)} onAdd={() => { const r = roster; setRoster(null); setAssignModal({ routeId: r.id }); }}
        onRemove={async (sid) => { try { await api.delete(`/transport/assignments/${sid}`); load(); } catch (e) { toast.error(errorMessage(e)); } }} />}
    </div>
  );
}

function Person({ name, phone }) {
  if (!name && !phone) return <span className="text-slate-400">Not added</span>;
  return (
    <div>
      <div className="font-medium">{name || "-"}</div>
      {phone && <a href={`tel:${phone.replace(/\s/g, "")}`} className="text-xs text-[#2B4BFF] inline-flex items-center gap-1 hover:underline"><Phone className="h-3 w-3" aria-hidden="true" />{phone}</a>}
    </div>
  );
}

function StudentsTab({ students, classes, assignMap, routeMap, routes, admin, onAssign }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [routeId, setRouteId] = useState("");
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return students.filter((s) => {
      const a = assignMap[s.id];
      if (filter === "on" && !a) return false;
      if (filter === "off" && a) return false;
      if (routeId && a?.route_id !== routeId) return false;
      return !t || `${s.first_name} ${s.last_name} ${s.roll_number || ""}`.toLowerCase().includes(t);
    });
  }, [students, assignMap, q, filter, routeId]);
  const onBus = students.filter((s) => assignMap[s.id]).length;
  return (
    <section className="space-y-4" data-testid="transport-students">
      <div className="ui-card p-4 grid md:grid-cols-[1fr_auto_auto] gap-3 items-center">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3.5 top-3.5 text-slate-400" aria-hidden="true" />
          <input className="ui-input pl-10" placeholder="Search student" value={q} onChange={(e) => setQ(e.target.value)} data-testid="transport-student-search" />
        </div>
        <select className="ui-input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by bus use">
          <option value="all">All students ({students.length})</option><option value="on">Using the bus ({onBus})</option><option value="off">Not on a bus ({students.length - onBus})</option>
        </select>
        <select className="ui-input" value={routeId} onChange={(e) => setRouteId(e.target.value)} aria-label="Filter by route">
          <option value="">All routes</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div className="ui-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="table-head">
              <th className="px-5 py-3 font-medium">Student</th><th className="px-5 py-3 font-medium">Class</th><th className="px-5 py-3 font-medium">Bus and route</th>
              <th className="px-5 py-3 font-medium">Stop</th>{admin && <th className="px-5 py-3" />}
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No students match.</td></tr>}
              {rows.map((s) => {
                const a = assignMap[s.id]; const r = a && routeMap[a.route_id];
                return (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0" data-testid={`ts-row-${s.id}`}>
                    <td className="px-5 py-3 font-medium">{s.first_name} {s.last_name}</td>
                    <td className="px-5 py-3 text-slate-600">{classes[s.class_id] || "-"}</td>
                    <td className="px-5 py-3">{r ? <><span className="font-medium">{r.bus?.number || "No bus"}</span><span className="text-slate-500"> · {r.name}</span></> : <span className="text-slate-400">Not on a bus</span>}</td>
                    <td className="px-5 py-3 text-slate-600">{a ? <>{a.stop}{a.mode !== "both" && <span className="text-xs text-slate-400"> ({a.mode === "pickup" ? "pickup only" : "drop only"})</span>}</> : "-"}</td>
                    {admin && <td className="px-5 py-3 text-right"><button className="ui-btn text-xs px-3 py-1.5" data-testid={`assign-${s.id}`} onClick={() => onAssign(s)}>{a ? "Change" : "Assign"}</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function BusModal({ bus, onClose, onSaved }) {
  const [f, setF] = useState({ ...EMPTY_BUS, ...bus });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    const body = { number: f.number, registration: f.registration || null, capacity: Number(f.capacity) || 40,
      driver_name: f.driver_name || null, driver_phone: f.driver_phone || null, attendant_name: f.attendant_name || null, attendant_phone: f.attendant_phone || null };
    try { bus.id ? await api.put(`/transport/buses/${bus.id}`, body) : await api.post("/transport/buses", body); toast.success("Bus saved"); onSaved(); }
    catch (err) { toast.error(errorMessage(err)); }
    setBusy(false);
  };
  const field = (k, label, props = {}) => (
    <div><label className="field-label" htmlFor={`bus-${k}`}>{label}</label><input id={`bus-${k}`} data-testid={`bus-${k}`} className="ui-input mt-1.5" value={f[k] ?? ""} onChange={set(k)} {...props} /></div>
  );
  return (
    <Modal title={bus.id ? "Edit bus" : "New bus"} size="lg" onClose={onClose} onSubmit={submit} testid="bus-form"
      footer={<><button type="button" className="ui-btn" onClick={onClose}>Cancel</button><button type="submit" disabled={busy} data-testid="bus-save" className="ui-btn btn-primary">Save bus</button></>}>
      <div className="grid sm:grid-cols-2 gap-4">
        {field("number", "Bus name or number", { required: true, placeholder: "Bus 7" })}
        {field("registration", "Registration number", { placeholder: "TS09 AB 1234" })}
        {field("capacity", "Seats", { type: "number", min: 1, max: 200 })}
        <span className="hidden sm:block" />
        {field("driver_name", "Driver name")}
        {field("driver_phone", "Driver phone", { type: "tel" })}
        {field("attendant_name", "Attendant name (optional)")}
        {field("attendant_phone", "Attendant phone (optional)", { type: "tel" })}
      </div>
    </Modal>
  );
}

function RouteModal({ route, buses, onClose, onSaved }) {
  const [name, setName] = useState(route.name || "");
  const [busId, setBusId] = useState(route.bus_id || "");
  const [stops, setStops] = useState(route.stops?.length ? route.stops.map((s) => ({ ...s })) : [{ name: "", pickup_time: "", drop_time: "" }]);
  const [busy, setBusy] = useState(false);
  const setStop = (i, patch) => setStops((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const move = (i, d) => setStops((ss) => { const j = i + d; if (j < 0 || j >= ss.length) return ss; const c = [...ss]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    const body = { name, bus_id: busId || null, stops: stops.filter((s) => s.name.trim()).map((s) => ({ name: s.name, pickup_time: s.pickup_time || null, drop_time: s.drop_time || null })) };
    try { route.id ? await api.put(`/transport/routes/${route.id}`, body) : await api.post("/transport/routes", body); toast.success("Route saved"); onSaved(); }
    catch (err) { toast.error(errorMessage(err)); }
    setBusy(false);
  };
  return (
    <Modal title={route.id ? "Edit route" : "New route"} subtitle="List the stops in the order the bus visits them." size="lg" onClose={onClose} onSubmit={submit} testid="route-form"
      footer={<><button type="button" className="ui-btn" onClick={onClose}>Cancel</button><button type="submit" disabled={busy} data-testid="route-save" className="ui-btn btn-primary">Save route</button></>}>
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className="field-label" htmlFor="route-name">Route name</label><input id="route-name" data-testid="route-name" required className="ui-input mt-1.5" placeholder="Route A, Kukatpally" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="field-label" htmlFor="route-bus">Bus</label>
            <select id="route-bus" data-testid="route-bus" className="ui-input mt-1.5" value={busId} onChange={(e) => setBusId(e.target.value)}>
              <option value="">No bus yet</option>{buses.map((b) => <option key={b.id} value={b.id}>{b.number}{b.registration ? ` (${b.registration})` : ""}</option>)}
            </select></div>
        </div>
        <div>
          <div className="grid grid-cols-[1fr_7.5rem_7.5rem_5.5rem] gap-2 text-xs text-slate-500 px-1 mb-1.5"><span>Stop</span><span>Morning pickup</span><span>Evening drop</span><span /></div>
          <div className="space-y-2">
            {stops.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_7.5rem_7.5rem_5.5rem] gap-2 items-center" data-testid={`stop-row-${i}`}>
                <div className="relative"><MapPin className="h-4 w-4 absolute left-3 top-3 text-slate-400" aria-hidden="true" /><input data-testid={`stop-name-${i}`} aria-label={`Stop ${i + 1} name`} className="ui-input pl-9" placeholder="Stop name" value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} /></div>
                <input type="time" data-testid={`stop-pickup-${i}`} aria-label={`Stop ${i + 1} pickup time`} className="ui-input px-2" value={s.pickup_time || ""} onChange={(e) => setStop(i, { pickup_time: e.target.value })} />
                <input type="time" data-testid={`stop-drop-${i}`} aria-label={`Stop ${i + 1} drop time`} className="ui-input px-2" value={s.drop_time || ""} onChange={(e) => setStop(i, { drop_time: e.target.value })} />
                <div className="flex justify-end">
                  <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="h-8 w-7 grid place-items-center text-slate-400 hover:text-slate-900"><ArrowUp className="h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="h-8 w-7 grid place-items-center text-slate-400 hover:text-slate-900"><ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
                  <button type="button" aria-label="Remove stop" onClick={() => setStops((ss) => ss.filter((_, idx) => idx !== i))} className="h-8 w-7 grid place-items-center text-slate-400 hover:text-red-600"><X className="h-4 w-4" aria-hidden="true" /></button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" data-testid="add-stop" onClick={() => setStops((ss) => [...ss, { name: "", pickup_time: "", drop_time: "" }])} className="ui-btn text-sm mt-3"><Plus className="h-4 w-4" aria-hidden="true" /> Add stop</button>
        </div>
      </div>
    </Modal>
  );
}

function AssignModal({ student: initial, routeId, students, classes, routes, assignMap, onClose, onSaved }) {
  const [student, setStudent] = useState(initial || null);
  const [q, setQ] = useState("");
  const existing = student ? assignMap[student.id] : null;
  const [rid, setRid] = useState(existing?.route_id || routeId || routes[0]?.id || "");
  const [stop, setStop] = useState(existing?.stop || "");
  const [mode, setMode] = useState(existing?.mode || "both");
  const [busy, setBusy] = useState(false);
  const route = routes.find((r) => r.id === rid);
  const stops = route?.stops || [];
  useEffect(() => { if (route && !stops.some((s) => s.name === stop)) setStop(stops[0]?.name || ""); }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? students.filter((s) => `${s.first_name} ${s.last_name} ${s.roll_number || ""}`.toLowerCase().includes(t)).slice(0, 6) : [];
  }, [q, students]);
  const pick = (s) => { setStudent(s); setQ(""); const a = assignMap[s.id]; if (a) { setRid(a.route_id); setStop(a.stop); setMode(a.mode); } };

  const submit = async (e) => {
    e.preventDefault(); if (!student) return; setBusy(true);
    try { await api.put(`/transport/assignments/${student.id}`, { route_id: rid, stop, mode }); toast.success("Bus saved for " + student.first_name); onSaved(); }
    catch (err) { toast.error(errorMessage(err)); }
    setBusy(false);
  };
  const remove = async () => {
    try { await api.delete(`/transport/assignments/${student.id}`); toast.success("Removed from bus"); onSaved(); } catch (err) { toast.error(errorMessage(err)); }
  };
  return (
    <Modal title={existing ? "Change bus" : "Assign to a bus"} onClose={onClose} onSubmit={submit} testid="assign-form"
      footer={<>
        {existing && <button type="button" onClick={remove} className="ui-btn mr-auto text-red-600">Remove from bus</button>}
        <button type="button" className="ui-btn" onClick={onClose}>Cancel</button>
        <button type="submit" disabled={busy || !student || !stop} data-testid="assign-save" className="ui-btn btn-primary">Save</button></>}>
      <div className="space-y-4">
        <div>
          <label className="field-label" htmlFor="as-student">Student</label>
          {student ? (
            <div className="mt-1.5 flex items-center gap-3 rounded-xl bg-[#F1F4FF] px-4 py-3">
              <div className="flex-1 min-w-0"><div className="font-medium truncate">{student.first_name} {student.last_name}</div><div className="text-xs text-slate-500">{classes[student.class_id] || "No class"}</div></div>
              {!initial && <button type="button" aria-label="Choose a different student" onClick={() => setStudent(null)} className="h-8 w-8 grid place-items-center rounded-lg text-slate-500 hover:bg-white"><X className="h-4 w-4" aria-hidden="true" /></button>}
            </div>
          ) : (
            <div className="relative mt-1.5">
              <Search className="h-4 w-4 absolute left-3.5 top-3.5 text-slate-400" aria-hidden="true" />
              <input id="as-student" data-testid="assign-search" className="ui-input pl-10" placeholder="Search by name or roll number" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
              {q.trim() && (
                <ul className="absolute z-10 left-0 right-0 mt-1.5 rounded-xl border border-[#E1E4EE] bg-white shadow-lg overflow-hidden">
                  {matches.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No student found</li>}
                  {matches.map((s) => (
                    <li key={s.id}><button type="button" data-testid={`assign-pick-${s.id}`} onClick={() => pick(s)} className="w-full text-left px-4 py-2.5 hover:bg-[#F1F4FF] flex justify-between gap-3">
                      <span className="font-medium">{s.first_name} {s.last_name}</span><span className="text-xs text-slate-500">{assignMap[s.id] ? "Already on a bus" : classes[s.class_id] || ""}</span></button></li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {routes.length === 0 ? <p className="text-sm text-slate-500">Create a route first.</p> : (<>
          <div><label className="field-label" htmlFor="as-route">Route</label>
            <select id="as-route" data-testid="assign-route" className="ui-input mt-1.5" value={rid} onChange={(e) => setRid(e.target.value)}>
              {routes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.bus ? ` (${r.bus.number})` : ""}</option>)}</select></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="field-label" htmlFor="as-stop">Stop</label>
              <select id="as-stop" data-testid="assign-stop" className="ui-input mt-1.5" value={stop} onChange={(e) => setStop(e.target.value)}>
                {stops.length === 0 && <option value="">This route has no stops</option>}
                {stops.map((s) => <option key={s.name} value={s.name}>{s.name}{s.pickup_time ? ` · ${fmtTime(s.pickup_time)}` : ""}</option>)}</select></div>
            <div><label className="field-label" htmlFor="as-mode">Uses the bus for</label>
              <select id="as-mode" className="ui-input mt-1.5" value={mode} onChange={(e) => setMode(e.target.value)}>{Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>
        </>)}
      </div>
    </Modal>
  );
}

function Roster({ route, assigns, students, classes, admin, onClose, onAdd, onRemove }) {
  const sMap = Object.fromEntries(students.map((s) => [s.id, s]));
  return (
    <Modal title={route.name} subtitle={route.bus ? `${route.bus.number} · ${assigns.length} of ${route.bus.capacity} seats` : `${assigns.length} students`} size="lg" onClose={onClose} testid="roster"
      footer={admin ? <button type="button" onClick={onAdd} data-testid="roster-add" className="ui-btn btn-primary"><Plus className="h-4 w-4" aria-hidden="true" /> Add student</button> : null}>
      {route.stops.length === 0 && <p className="text-sm text-slate-500">This route has no stops yet.</p>}
      <div className="space-y-5">
        {route.stops.map((st) => {
          const here = assigns.filter((a) => a.stop === st.name);
          return (
            <section key={st.name}>
              <h3 className="text-sm font-medium flex items-center gap-2"><MapPin className="h-4 w-4 text-[#2B4BFF]" aria-hidden="true" />{st.name}
                <span className="text-slate-400 font-normal">{fmtTime(st.pickup_time) || ""}</span><span className="ml-auto text-xs text-slate-400 font-normal">{here.length} student{here.length === 1 ? "" : "s"}</span></h3>
              <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-[#E7E9F1]">
                {here.length === 0 && <li className="px-4 py-2.5 text-sm text-slate-400">Nobody yet</li>}
                {here.map((a) => { const s = sMap[a.student_id]; return (
                  <li key={a.student_id} className="px-4 py-2.5 text-sm flex items-center gap-3">
                    <span className="font-medium flex-1 truncate">{s ? `${s.first_name} ${s.last_name}` : "Student"}</span>
                    <span className="text-xs text-slate-500">{s ? classes[s.class_id] || "" : ""}</span>
                    {a.mode !== "both" && <span className="pill bg-slate-100 text-slate-600">{a.mode === "pickup" ? "Pickup only" : "Drop only"}</span>}
                    {admin && <button type="button" aria-label="Remove from bus" onClick={() => onRemove(a.student_id)} className="text-slate-400 hover:text-red-600"><X className="h-4 w-4" aria-hidden="true" /></button>}
                  </li>); })}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
