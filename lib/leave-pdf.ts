export type LeavePdfData = {
  firmName: string;
  firmAddress?: string | null;
  employee: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
  coverName: string;
  status: string;
  submittedAt: string;
  approvedBy: string;
  decisionNote?: string | null;
  template: { title: string; footer: string; accentColor: string };
};

function clean(value: string) {
  return value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(value: string, max = 74) {
  const words = value.split(/\s+/);
  const result: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && `${line} ${word}`.length > max) {
      result.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) result.push(line);
  return result;
}

export function renderLeavePdf(data: LeavePdfData) {
  const color = /^#[0-9a-f]{6}$/i.test(data.template.accentColor) ? data.template.accentColor.slice(1) : "325c4b";
  const red = parseInt(color.slice(0, 2), 16) / 255;
  const green = parseInt(color.slice(2, 4), 16) / 255;
  const blue = parseInt(color.slice(4, 6), 16) / 255;
  const entries: [string, string][] = [
    ["Firm", data.firmName],
    ...(data.firmAddress ? [["Address", data.firmAddress] as [string, string]] : []),
    ["Employee", data.employee],
    ["Leave type", data.leaveType],
    ["Dates", `${data.startDate} to ${data.endDate}`],
    ["Working days", String(data.workingDays)],
    ["Covering colleague", data.coverName],
    ["Status", data.status],
    ["Submitted", data.submittedAt],
    ["Approved by", data.approvedBy || "—"],
    ["Reason", data.reason],
    ...(data.decisionNote ? [["Decision note", data.decisionNote] as [string, string]] : []),
  ];
  const lines: { value: string; size: number; color: [number, number, number]; gap: number }[] = [
    { value: data.template.title, size: 21, color: [red, green, blue], gap: 32 },
  ];
  for (const [label, value] of entries) {
    const row = wrap(`${label}: ${value}`, 76);
    for (const line of row) lines.push({ value: line, size: 11, color: [0.16, 0.2, 0.19], gap: 19 });
    lines.push({ value: "", size: 10, color: [0.16, 0.2, 0.19], gap: 7 });
  }
  lines.push({ value: data.template.footer, size: 9, color: [0.38, 0.4, 0.39], gap: 15 });
  let stream = "BT\n";
  let y = 790;
  for (const line of lines) {
    if (line.value) {
      stream += `${line.color[0].toFixed(3)} ${line.color[1].toFixed(3)} ${line.color[2].toFixed(3)} rg\n/F1 ${line.size} Tf\n1 0 0 1 48 ${y} Tm\n(${clean(line.value)}) Tj\n`;
    }
    y -= line.gap;
  }
  stream += "ET";
  const streamBytes = Buffer.from(stream, "ascii");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "ascii");
}
