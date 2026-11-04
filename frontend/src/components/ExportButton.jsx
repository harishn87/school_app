import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";

/** Downloads the whole school's data as an Excel workbook (principal only). `year` is the academic year, blank for this year. */
export default function ExportButton({ year = "", className = "", testid = "export-excel", label = "Download Excel" }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.get("/export/school.xlsx", { params: year ? { academic_year: year } : {}, responseType: "blob" });
      const cd = r.headers["content-disposition"] || "";
      const name = (/filename="?([^";]+)"?/.exec(cd) || [])[1] || "school-data.xlsx";
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success("Excel file downloaded");
    } catch (e) {
      let msg = "Could not prepare the Excel file";
      try { msg = JSON.parse(await e.response.data.text()).detail || msg; } catch (_x) { msg = errorMessage(e) || msg; }
      toast.error(msg);
    } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={go} disabled={busy} data-testid={testid}
      className={className || "ui-btn bg-white/10 text-white border border-white/20 hover:bg-white/20 disabled:opacity-60"}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
      {busy ? "Preparing…" : label}
    </button>
  );
}
