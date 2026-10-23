import axios from "axios";

// Empty in production: the site and the API are served from the same origin (/api via Nginx).
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

// When the short-lived access cookie expires, quietly get a new one with the refresh cookie and retry once.
const NO_RETRY = ["/auth/login", "/auth/refresh", "/auth/logout", "/platform/auth/login",
  "/platform/auth/refresh", "/platform/auth/logout", "/schools/signup"];
let refreshing = {};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const cfg = error.config || {};
    const url = cfg.url || "";
    if (error.response?.status !== 401 || cfg._retried || NO_RETRY.some((p) => url.startsWith(p))) {
      return Promise.reject(error);
    }
    const refreshUrl = url.startsWith("/platform") ? "/platform/auth/refresh" : "/auth/refresh";
    try {
      refreshing[refreshUrl] = refreshing[refreshUrl] || api.post(refreshUrl);
      await refreshing[refreshUrl];
    } catch (_e) {
      return Promise.reject(error);
    } finally {
      delete refreshing[refreshUrl];
    }
    cfg._retried = true;
    return api(cfg);
  }
);

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => {
        if (!e || typeof e.msg !== "string") return JSON.stringify(e);
        const field = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : null;
        const msg = e.msg.replace(/^Value error, /, "");
        return field && typeof field === "string" ? `${field.replace(/_/g, " ")}: ${msg}` : msg;
      })
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const errorMessage = (e) => formatApiErrorDetail(e?.response?.data?.detail) || e?.message;
