import { formatDate, formatMoney } from "@/lib/utils";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Opens a printable fee receipt in a new tab (Save as PDF works from the print dialog). */
export function printReceipt({ school, fee, student, className }) {
  const owed = Math.max(Number(fee.amount || 0) - Number(fee.paid_amount || 0), 0);
  const no = `RCP-${String(fee.id || "").slice(0, 8).toUpperCase()}`;
  const status = fee.status === "paid" ? "PAID" : fee.status === "partial" ? "PART PAID" : "UNPAID";
  const row = (k, v) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(no)}</title><style>
    *{box-sizing:border-box}body{font-family:Inter,Arial,sans-serif;color:#0B1020;margin:0;padding:32px;background:#fff}
    .box{max-width:640px;margin:0 auto;border:1.5px solid #0B1020;border-radius:14px;overflow:hidden}
    .head{background:#0B1020;color:#fff;padding:22px 26px;display:flex;justify-content:space-between;align-items:center}
    .head h1{margin:0;font-size:22px}.head small{opacity:.7;display:block;margin-top:4px}
    .stamp{border:2px solid #E9C46A;color:#E9C46A;border-radius:8px;padding:6px 12px;font-weight:700;letter-spacing:.08em;font-size:13px}
    .body{padding:22px 26px}table{width:100%;border-collapse:collapse}td{padding:9px 0;border-bottom:1px solid #EEF0F6;font-size:14px}
    td:first-child{color:#64708B;width:42%}td:last-child{font-weight:600;text-align:right}
    .tot td{font-size:16px;border-bottom:none;padding-top:14px}.sign{display:flex;justify-content:space-between;margin-top:56px;font-size:12px;color:#64708B}
    .sign div{border-top:1px solid #0B1020;padding-top:6px;min-width:170px;text-align:center}
    .foot{padding:12px 26px;background:#F7F8FC;font-size:11px;color:#64708B;text-align:center}
    @media print{body{padding:0}.box{border-radius:0;border:1px solid #000}}
  </style></head><body><div class="box">
    <div class="head"><div><h1>${esc(school || "School")}</h1><small>Fee receipt</small></div><div class="stamp">${status}</div></div>
    <div class="body"><table>
      ${row("Receipt no.", no)}${row("Date", formatDate(fee.paid_date || new Date().toISOString().slice(0, 10)))}
      ${row("Student", `${student?.first_name || ""} ${student?.last_name || ""}`.trim())}${row("Class", className || "—")}${row("Roll no.", student?.roll_number || "—")}
      ${row("Academic year", fee.academic_year || "—")}${row("Term", fee.term)}${row("Fee amount", formatMoney(fee.amount))}
      ${row("Amount received", formatMoney(fee.paid_amount))}${fee.note ? row("Note", fee.note) : ""}
      <tr class="tot"><td>Balance due</td><td>${esc(formatMoney(owed))}${owed > 0 && fee.due_date ? ` (by ${esc(formatDate(fee.due_date))})` : ""}</td></tr>
    </table>
    <div class="sign"><div>Parent / guardian</div><div>Authorised signatory</div></div></div>
    <div class="foot">This is a computer-generated receipt.</div>
  </div><script>window.onload=function(){setTimeout(function(){window.print()},250)}</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}

/** WhatsApp click-to-chat link with a ready fee reminder (no gateway needed). Returns null when there is no phone. */
export function reminderLink({ school, fee, student }) {
  let phone = String(student?.guardian_phone || "").replace(/\D/g, "");
  if (phone.length === 11 && phone.startsWith("0")) phone = phone.slice(1);
  if (phone.length === 10) phone = `91${phone}`;
  if (phone.length < 11) return null;
  const owed = Math.max(Number(fee.amount || 0) - Number(fee.paid_amount || 0), 0);
  const who = student?.guardian_name || "Parent";
  const msg = `Dear ${who}, this is a gentle reminder from ${school || "the school"}: ${formatMoney(owed)} is pending for ${student?.first_name || "your child"} (${fee.term}${fee.due_date ? `, due ${formatDate(fee.due_date)}` : ""}). Kindly pay at your earliest convenience. Thank you.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}
