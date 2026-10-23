import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { slugify } from "@/lib/utils";
import { AuthShell, Field, FormError } from "@/components/AuthShell";

// Self-serve signup: a school creates its account (own database) and starts a free trial.
export default function RegisterPage() {
  const { signupSchool } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    school_name: "", school_code: "", admin_name: "", admin_email: "", password: "", phone: "",
  });
  const [codeTouched, setCodeTouched] = useState(false);
  const [codeStatus, setCodeStatus] = useState(null); // {available, reason}
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Suggest a code from the school name until the user edits the code themselves.
  useEffect(() => {
    if (!codeTouched) setForm((f) => ({ ...f, school_code: slugify(f.school_name) }));
  }, [form.school_name, codeTouched]);

  useEffect(() => {
    clearTimeout(timer.current);
    const code = form.school_code;
    if (!code || code.length < 3) { setCodeStatus(null); return; }
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.get("/schools/check-code", { params: { code } });
        setCodeStatus(data);
      } catch (_e) { setCodeStatus(null); }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [form.school_code]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const payload = { ...form, phone: form.phone || null };
    const res = await signupSchool(payload);
    setLoading(false);
    if (res.ok) {
      toast.success("Your school is ready. Your 14-day free trial has started.");
      navigate("/app");
    } else {
      setError(res.error || "Signup failed");
    }
  };

  return (
    <AuthShell wide>
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Register your school</h1>
      <p className="text-sm text-slate-600 mt-1">Free for 14 days. No card needed.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="School name">
          <input data-testid="signup-school-name" required minLength={2} value={form.school_name}
            onChange={set("school_name")} className="ui-input" placeholder="Greenwood High School" />
        </Field>
        <Field label="School code" hint="Staff and parents type this when they sign in. Lowercase letters, numbers, hyphens.">
          <div className="relative">
            <input data-testid="signup-school-code" required minLength={3} maxLength={30} value={form.school_code}
              autoCapitalize="none"
              onChange={(e) => { setCodeTouched(true); setForm((f) => ({ ...f, school_code: e.target.value.toLowerCase() })); }}
              className="ui-input pr-10" placeholder="greenwood-high" />
            {codeStatus && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden="true">
                {codeStatus.available
                  ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                  : <XCircle className="h-5 w-5 text-red-600" />}
              </span>
            )}
          </div>
          {codeStatus && !codeStatus.available && (
            <div className="text-xs text-red-700 mt-1" data-testid="signup-code-error">{codeStatus.reason}</div>
          )}
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Your name">
            <input data-testid="signup-admin-name" required value={form.admin_name} onChange={set("admin_name")}
              className="ui-input" placeholder="Priya Rao" />
          </Field>
          <Field label="Phone (optional)">
            <input value={form.phone} onChange={set("phone")} className="ui-input" placeholder="+91 98xxxxxx" />
          </Field>
        </div>
        <Field label="Admin email">
          <input data-testid="signup-admin-email" type="email" required value={form.admin_email}
            autoComplete="username" onChange={set("admin_email")} className="ui-input" placeholder="principal@school.com" />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <input data-testid="signup-password" type="password" required minLength={8} value={form.password}
            autoComplete="new-password" onChange={set("password")} className="ui-input" />
        </Field>
        <FormError message={error} testid="signup-error" />
        <button data-testid="signup-submit" disabled={loading || (codeStatus && !codeStatus.available)} type="submit"
          className="ui-btn btn-primary w-full py-3">
          {loading ? "Setting up your school…" : "Create school & start trial"}
        </button>
      </form>
      <div className="mt-6 text-sm text-center text-slate-600">
        Already registered?{" "}
        <Link data-testid="register-login-link" to="/login" className="font-semibold text-[#2B4BFF] hover:underline">Sign in</Link>
      </div>
    </AuthShell>
  );
}
