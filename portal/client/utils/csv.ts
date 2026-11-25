function escapeCell(value: string | number) {
  const text = String(value);
  const safe = /^[\s\u200b-\u200f\u202a-\u202e\u2060\ufeff]*[=+\-@]/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function csvText(rows: (string | number)[][]) {
  return '\ufeff' + rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}
