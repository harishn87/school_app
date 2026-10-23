import { useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Field, FormError } from "@/components/AuthShell";

export default function AccountPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.new_password !== form.confirm) { setError("New passwords don't match"); return; }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: form.current_password, new_password: form.new_password });
      toast.success("Password changed");
      setForm({ current_password: "", new_password: "", confirm: "" });
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 animate-fade-up" data-testid="account-page">
      <header>
        <h1 className="font-heading text-2xl sm:text-[28px] font-semibold tracking-tight">{user?.name}</h1>
        <p className="text-slate-600 text-sm mt-1">{user?.email} · {user?.school?.name} (<span className="font-mono">{user?.school?.slug}</span>)</p>
      </header>
      <form onSubmit={submit} className="ui-card p-6 space-y-4">
        <h2 className="font-heading text-xl font-semibold">Change password</h2>
        <Field label="Current password">
          <input type="password" required className="ui-input" autoComplete="current-password" value={form.current_password}
            onChange={(e) => setForm({ ...form, current_password: e.target.value })} />
        </Field>
        <Field label="New password" hint="At least 8 characters">
          <input type="password" required minLength={8} className="ui-input" autoComplete="new-password" value={form.new_password}
            onChange={(e) => setForm({ ...form, new_password: e.target.value })} />
        </Field>
        <Field label="Confirm new password">
          <input type="password" required minLength={8} className="ui-input" autoComplete="new-password" value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </Field>
        <FormError message={error} />
        <button disabled={busy} className="ui-btn btn-primary">{busy ? "Saving…" : "Update password"}</button>
      </form>
    </div>
  );
}
