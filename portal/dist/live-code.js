const liveCodeLabel = "\u0627\u062C\u0631\u0627\u06CC \u0632\u0646\u062F\u0647 \u06A9\u062F";
const liveCodeUrl = "https://livecode.ieaum.ir";
const liveCodeOffline = "\u0633\u0631\u0648\u0631 \u062E\u0627\u0645\u0648\u0634 \u0627\u0633\u062A \u06CC\u0627 \u0627\u06CC\u0646 \u0628\u062E\u0634 \u062A\u0648\u0633\u0637 \u0645\u062F\u06CC\u0631 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0634\u062F\u0647 \u0627\u0633\u062A.";
const liveCodeContactUrl = "https://ieaum.ir/contact/";
async function liveCodeOnline() {
  try {
    const response = await fetch(liveCodeUrl + "/api/status", {
      signal: AbortSignal.timeout(3e3),
      cache: "no-store",
      credentials: "omit",
      redirect: "error"
    });
    return response.ok && (await response.json())?.status === "online";
  } catch {
    return false;
  }
}
export {
  liveCodeContactUrl,
  liveCodeLabel,
  liveCodeOffline,
  liveCodeOnline,
  liveCodeUrl
};
