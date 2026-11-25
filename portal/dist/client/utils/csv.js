function escapeCell(value) {
  const text = String(value);
  const safe = /^[\s\u200b-\u200f\u202a-\u202e\u2060\ufeff]*[=+\-@]/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
function csvText(rows) {
  return "\uFEFF" + rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}
export {
  csvText
};
