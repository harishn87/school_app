import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { setLastSchoolCode } from "@/lib/utils";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // null = checking, false = logged out, object = user (with user.school)
  const [user, setUser] = useState(null);

  const refreshMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch {
      setUser(false);
      return null;
    }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  const login = async (schoolCode, email, password) => {
    try {
      const { data } = await api.post("/auth/login", { school_code: schoolCode, email, password });
      setLastSchoolCode(schoolCode.trim().toLowerCase());
      setUser(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  };

  const signupSchool = async (payload) => {
    try {
      const { data } = await api.post("/schools/signup", payload);
      setLastSchoolCode(payload.school_code);
      setUser(data);
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (_e) { /* ignore */ }
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, signupSchool, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
