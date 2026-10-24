import PageHero from "@/components/PageHero";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, KeyRound, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/utils";
import Modal from "@/components/Modal";
import { Field, FormError } from "@/components/AuthShell";

const ROLE_HELP = {
  admin: "Full access, including users and billing",
  teacher: "Manage students and attendance",
  parent: "Sees only children whose guardian email matches theirs",
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [resetFor, setResetFor] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", role: "teacher", password: "" });
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const { data } = await api.get("/users");
    setUsers(data);
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/users", form);
      toast.success(`${form.name} can now sign in`);
      setShowAdd(false);
      setForm({ name: "", email: "", role: "teacher", password: "" });
      load();
    } catch (err) { setError(errorMessage(err)); }
  };

  const toggleActive = async (u) => {
    try {
      await api.put(`/users/${u.id}`, { active: !u.active });
      toast.success(u.active ? "User disabled" : "User enabled");
      load();
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const changeRole = async (u, role) => {
    try { await api.put(`/users/${u.id}`, { role }); load(); }
    catch (err) { toast.error(errorMessage(err)); }
  };

  const remove = async (u) => {
    if (!window.confirm(`Delete ${u.name}'s login? This can't be undone.`)) return;
    try { await api.delete(`/users/${u.id}`); toast.success("User deleted"); load(); }
    catch (err) { toast.error(errorMessage(err)); }
  };

  const reset = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.post(`/users/${resetFor.id}/reset-password`, { new_password: newPassword });
      toast.success("Password updated. Share it with the user securely.");
      setResetFor(null); setNewPassword("");
    } catch (err) { setError(errorMessage(err)); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-up" data-testid="users-page">
      <PageHero title="Staff & parent logins" subtitle="Only people you add here can sign in to your school."
        actions={<button data-testid="add-user-btn" onClick={() => { setError(""); setShowAdd(true); }} className="ui-btn btn-primary">
          <Plus className="h-4 w-4" aria-hidden="true" /> Add user
        </button>} />

      <div className="ui-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="table-head">
              <th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Added</th><th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === me?.id;
              return (
                <tr key={u.id} className="border-b border-slate-100" data-testid={`user-row-${u.email}`}>
                  <td className="px-4 py-3 font-semibold">{u.name}{self && <span className="text-slate-400 font-normal"> (you)</span>}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3">
                    <select className="ui-input py-1 w-auto" value={u.role} disabled={self}
                      onChange={(e) => changeRole(u, e.target.value)} aria-label={`Role for ${u.name}`}>
                      <option value="admin">Admin</option><option value="teacher">Teacher</option><option value="parent">Parent</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full font-medium text-xs capitalize ${u.active ? "bg-[#E6F8EE] text-green-800" : "bg-slate-100 text-slate-600"}`}>
                      {u.active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button className="ui-btn bg-white px-2 py-1" title="Reset password" aria-label="Reset password"
                        onClick={() => { setError(""); setResetFor(u); }}>
                        <KeyRound className="h-4 w-4" aria-hidden="true" />
                      </button>
                      {!self && (
                        <>
                          <button className="ui-btn bg-white px-3 py-1 text-xs" onClick={() => toggleActive(u)}>
                            {u.active ? "Disable" : "Enable"}
                          </button>
                          <button className="ui-btn bg-white px-2 py-1" title="Delete" aria-label="Delete user" onClick={() => remove(u)}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title="Add user" onClose={() => setShowAdd(false)} testid="add-user-modal">
          <form onSubmit={add} className="space-y-4">
            <Field label="Name"><input required className="ui-input" value={form.name} data-testid="new-user-name"
              onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email"><input required type="email" className="ui-input" value={form.email} data-testid="new-user-email"
              onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Role" hint={ROLE_HELP[form.role]}>
              <select className="ui-input" value={form.role} data-testid="new-user-role"
                onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="teacher">Teacher</option><option value="parent">Parent</option><option value="admin">Admin</option>
              </select>
            </Field>
            <Field label="Temporary password" hint="At least 8 characters. They can change it under My account.">
              <input required minLength={8} type="text" className="ui-input font-mono" value={form.password} data-testid="new-user-password"
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <FormError message={error} />
            <div className="flex justify-end gap-2">
              <button type="button" className="ui-btn bg-white" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="ui-btn btn-primary" data-testid="new-user-save">Add user</button>
            </div>
          </form>
        </Modal>
      )}

      {resetFor && (
        <Modal title={`Reset password — ${resetFor.name}`} onClose={() => setResetFor(null)}>
          <form onSubmit={reset} className="space-y-4">
            <Field label="New password" hint="At least 8 characters">
              <input required minLength={8} type="text" className="ui-input font-mono" value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <FormError message={error} />
            <div className="flex justify-end gap-2">
              <button type="button" className="ui-btn bg-white" onClick={() => setResetFor(null)}>Cancel</button>
              <button type="submit" className="ui-btn btn-primary">Set password</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
