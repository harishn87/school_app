import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "@/lib/api";
import { AuthShell, Field, FormError } from "@/components/AuthShell";

export default function PlatformLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await api.post("/platform/auth/login", { email, password });
      navigate("/platform");
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  return (
    <AuthShell>
      <div className="text-xs font-medium text-[#2B4BFF]">Platform console</div>
      <h1 className="font-heading text-3xl font-semibold tracking-tight mt-1">Owner sign in</h1>
      <p className="text-sm text-slate-600 mt-1">Manage every school on Scholaris.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Email">
          <input data-testid="platform-email" type="email" required className="ui-input" value={email}
            autoComplete="username" onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input data-testid="platform-password" type="password" required className="ui-input" value={password}
            autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <FormError message={error} />
        <button data-testid="platform-submit" disabled={busy} className="ui-btn btn-primary w-full py-3">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
