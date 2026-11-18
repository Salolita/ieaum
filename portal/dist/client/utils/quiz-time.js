const tehranDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" });
const displayDate = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "long", timeStyle: "short" });
function quizDate(date = /* @__PURE__ */ new Date()) {
  const parts = Object.fromEntries(tehranDate.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function endOfQuizDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const day = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(+day) || day.toISOString().slice(0, 10) !== date) return null;
  day.setUTCDate(day.getUTCDate() + 1);
  const wallTime = day.toISOString().slice(0, 10) + "T00:00:00";
  const zone = new Intl.DateTimeFormat("en", { timeZone: "Asia/Tehran", timeZoneName: "longOffset" });
  const offset = zone.formatToParts(day).find(({ type }) => type === "timeZoneName").value.replace("GMT", "") || "+00:00";
  const deadline = new Date(wallTime + offset);
  return Number.isFinite(+deadline) ? deadline.toISOString() : null;
}
const formatQuizTime = (iso) => displayDate.format(new Date(iso));
export {
  endOfQuizDate,
  formatQuizTime,
  quizDate
};
