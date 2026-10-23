// Draws school letters as A4 PDFs in the browser. jsPDF is loaded only when a letter is downloaded.
// Built-in PDF fonts have no rupee sign, so amounts are written as "Rs.".

export const LETTER_KINDS = {
  bonafide: { title: "Bonafide Certificate", short: "Bonafide", blurb: "Confirms the student is enrolled at the school." },
  fee_clearance: { title: "Fee Clearance Certificate", short: "Fees cleared", blurb: "Confirms there are no pending fees. Only available when everything is paid." },
  transfer: { title: "Transfer Certificate", short: "Transfer certificate", blurb: "For a student leaving the school." },
  character: { title: "Character Certificate", short: "Character", blurb: "Conduct and character during the student's time at school." },
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function longDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
const rs = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

function pronouns(relation) {
  if (relation === "Son") return { he: "he", him: "him", his: "his", rel: "son" };
  if (relation === "Daughter") return { he: "she", him: "her", his: "her", rel: "daughter" };
  return { he: "the student", him: "the student", his: "the student's", rel: "child" };
}

function who(d) {
  const p = pronouns(d.relation);
  return `${d.student_name}${d.guardian_name ? `, ${p.rel} of ${d.guardian_name}` : ""}`;
}

function paragraphs(cert) {
  const d = cert.data;
  const p = pronouns(d.relation);
  const cls = d.class_name || "this school";
  const out = [];
  if (cert.kind === "bonafide") {
    out.push(`This is to certify that ${who(d)}, is a bonafide student of this school, studying in ${cls} during the academic year ${d.academic_year}.`
      + (d.roll_number ? ` Roll number: ${d.roll_number}.` : ""));
    if (d.date_of_birth) out.push(`As per the school records, ${p.his} date of birth is ${longDate(d.date_of_birth)}.`);
    out.push(`This certificate is issued on request${d.purpose ? ` ${d.purpose.replace(/^for\s+/i, "for ")}` : ""}.`);
  } else if (cert.kind === "fee_clearance") {
    out.push(`This is to certify that ${who(d)}, studying in ${cls} (academic year ${d.academic_year}), has paid all the fees due to the school up to ${longDate(cert.issued_on)}.`);
    out.push(`As per the school records, no dues are outstanding against ${p.him}. Total fees paid: ${rs(d.fees_paid)}.`);
  } else if (cert.kind === "character") {
    const to = d.leaving_date ? `to ${longDate(d.leaving_date)}` : "to date";
    out.push(`This is to certify that ${who(d)}, has been a student of this school from ${longDate(d.joining_date)} ${to}, and ${p.he === "the student" ? "has studied" : `${p.he} has studied`} in ${cls}.`);
    out.push(`During this period ${p.his} conduct and character have been ${String(d.conduct || "good").toLowerCase()}.`);
    out.push(`We wish ${p.him} every success in the future.`);
  }
  if (d.remarks && cert.kind !== "transfer") out.push(d.remarks);
  return out;
}

function transferRows(cert) {
  const d = cert.data;
  return [
    ["Name of student", d.student_name],
    ["Name of parent / guardian", d.guardian_name || "-"],
    ["Date of birth", d.date_of_birth ? longDate(d.date_of_birth) : "-"],
    ["Class last studied", d.class_name || "-"],
    ["Date of admission", longDate(d.joining_date) || "-"],
    ["Date of leaving", longDate(d.leaving_date) || "-"],
    ["Reason for leaving", d.reason || "-"],
    ["General conduct", d.conduct || "Good"],
    ["School dues", d.dues_pending > 0 ? `Rs. ${Math.round(d.dues_pending).toLocaleString("en-IN")} pending` : "Nil"],
  ];
}

export function certificateFileName(cert) {
  const k = LETTER_KINDS[cert.kind]?.short || "Letter";
  return `${k} - ${cert.data.student_name} - ${cert.number.replace(/\//g, "-")}.pdf`;
}

export async function downloadCertificate(cert) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 20;
  const navy = [11, 16, 32], blue = [43, 75, 255], grey = [100, 110, 130];
  const school = cert.school || {};
  const kind = LETTER_KINDS[cert.kind];

  // Frame
  doc.setDrawColor(...navy); doc.setLineWidth(0.8); doc.rect(9, 9, W - 18, H - 18);
  doc.setDrawColor(...blue); doc.setLineWidth(0.25); doc.rect(11, 11, W - 22, H - 22);

  // Letterhead
  let y = 30;
  doc.setTextColor(...navy); doc.setFont("times", "bold"); doc.setFontSize(22);
  doc.text(school.name || "School", W / 2, y, { align: "center", maxWidth: W - 2 * M });
  doc.setFont("times", "normal"); doc.setFontSize(10.5); doc.setTextColor(...grey);
  y += 7;
  if (school.affiliation) { doc.setFont("times", "italic"); doc.text(school.affiliation, W / 2, y, { align: "center", maxWidth: W - 2 * M }); doc.setFont("times", "normal"); y += 5; }
  if (school.address) { const lines = doc.splitTextToSize(school.address, W - 2 * M - 10); doc.text(lines, W / 2, y, { align: "center" }); y += lines.length * 4.6; }
  const contact = [school.phone && `Phone: ${school.phone}`, school.email].filter(Boolean).join("   |   ");
  if (contact) { doc.text(contact, W / 2, y, { align: "center" }); y += 5; }
  y += 2;
  doc.setDrawColor(...blue); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
  doc.setDrawColor(...navy); doc.setLineWidth(0.2); doc.line(M, y + 1.2, W - M, y + 1.2);

  // Reference and date
  y += 11;
  doc.setTextColor(...navy); doc.setFontSize(11);
  doc.text(`Ref. no.: ${cert.number}`, M, y);
  doc.text(`Date: ${longDate(cert.issued_on)}`, W - M, y, { align: "right" });

  // Title
  y += 20;
  doc.setFont("times", "bold"); doc.setFontSize(17);
  const title = kind.title.toUpperCase();
  doc.text(title, W / 2, y, { align: "center" });
  const tw = doc.getTextWidth(title) + 6;
  doc.setDrawColor(...navy); doc.setLineWidth(0.4); doc.line(W / 2 - tw / 2, y + 2, W / 2 + tw / 2, y + 2);

  // Body
  y += 17;
  doc.setFont("times", "normal"); doc.setFontSize(12.5); doc.setTextColor(30, 35, 55);
  const bodyW = W - 2 * M - 4;
  if (cert.kind === "transfer") {
    doc.text("This is to certify that the following particulars of the student are correct as per the school records.", M + 2, y, { maxWidth: bodyW });
    y += 14;
    const rows = transferRows(cert);
    const rowH = 9.2;
    const tableTop = y - 6.2;
    doc.setDrawColor(210, 215, 228); doc.setLineWidth(0.25);
    rows.forEach(([k, v], i) => {
      const top = y + i * rowH;
      if (i % 2 === 0) { doc.setFillColor(244, 246, 252); doc.rect(M + 2, top - 6.2, bodyW, rowH, "F"); }
      doc.setFont("times", "bold"); doc.setFontSize(11.5); doc.text(k, M + 5, top);
      doc.setFont("times", "normal"); doc.text(String(v), M + 78, top, { maxWidth: bodyW - 80 });
    });
    doc.rect(M + 2, tableTop, bodyW, rows.length * rowH, "S");
    y += rows.length * rowH + 6;
    doc.setFontSize(12.5);
    const closing = ["The student is permitted to join another school.", cert.data.remarks].filter(Boolean).join(" ");
    doc.text(closing, M + 2, y + 4, { maxWidth: bodyW });
  } else {
    for (const para of paragraphs(cert)) {
      const lines = doc.splitTextToSize(para, bodyW);
      doc.text(lines, M + 2, y, { maxWidth: bodyW, align: "justify", lineHeightFactor: 1.65 });
      y += lines.length * 12.5 * 0.3528 * 1.65 + 5;
    }
  }

  // Signature block
  const sy = H - 62;
  doc.setDrawColor(...grey); doc.setLineDashPattern([1.2, 1.2], 0); doc.setLineWidth(0.3);
  doc.circle(M + 18, sy + 6, 14, "S"); doc.setLineDashPattern([], 0);
  doc.setFontSize(8.5); doc.setTextColor(...grey); doc.text("School seal", M + 18, sy + 7, { align: "center" });
  doc.setTextColor(...navy); doc.setDrawColor(...navy); doc.setLineWidth(0.3);
  doc.line(W - M - 60, sy + 14, W - M, sy + 14);
  doc.setFont("times", "bold"); doc.setFontSize(11.5);
  doc.text(school.principal_name || "Principal", W - M - 30, sy + 20, { align: "center" });
  if (school.principal_name) { doc.setFont("times", "normal"); doc.text("Principal", W - M - 30, sy + 25.5, { align: "center" }); }

  // Footer
  doc.setFont("times", "italic"); doc.setFontSize(8.5); doc.setTextColor(...grey);
  doc.text(`Certificate no. ${cert.number}. Issued by ${school.name || "the school"}. Valid only with the school seal and signature.`, W / 2, H - 15, { align: "center", maxWidth: W - 2 * M });

  doc.save(certificateFileName(cert));
}
