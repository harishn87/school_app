import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { AuthShell, Field, FormError } from "@/components/AuthShell";
import { getLastSchoolCode } from "@/lib/utils";

const isDev = process.env.NODE_ENV === "development";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [schoolCode, setSchoolCode] = useState(getLastSchoolCode());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await login(schoolCode, email, password);
    setLoading(false);
    if (res.ok) {
      toast.success("Welcome back!");
      navigate("/app");
    } else {
      setError(res.error || "Login failed");
    }
  };

  return (
    <AuthShell>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-sm text-slate-600 mt-1">Welcome back — let&apos;s run your school.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="School code" hint="Your school's unique code, e.g. greenwood-high">
          <input data-testid="login-school-input" required value={schoolCode} autoCapitalize="none"
            onChange={(e) => setSchoolCode(e.target.value)} className="ui-input" placeholder="your-school" />
        </Field>
        <Field label="Email">
          <input data-testid="login-email-input" type="email" required value={email} autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} className="ui-input" placeholder="you@school.com" />
        </Field>
        <Field label="Password">
          <input data-testid="login-password-input" type="password" required value={password}
            autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} className="ui-input"
            placeholder="••••••••" />
        </Field>
        <FormError message={error} testid="login-error" />
        <button data-testid="login-submit-button" disabled={loading} type="submit" className="ui-btn btn-primary w-full py-3">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div className="mt-6 text-sm text-center text-slate-600">
        New school?{" "}
        <Link data-testid="login-register-link" to="/register" className="font-semibold text-[#2B4BFF] hover:underline">
          Start a free trial
        </Link>
      </div>
      {isDev && (
        <div className="mt-4 text-xs text-center text-slate-500">
          Local demo: <span className="font-mono">demo</span> · <span className="font-mono">admin@school.com</span> · <span className="font-mono">admin123</span>
        </div>
      )}
    </AuthShell>
  );
}
