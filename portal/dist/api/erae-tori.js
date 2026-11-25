import { createHmac } from "node:crypto";
import { currentProfile, digest, equalSecret, field, limit, PortalError, query, readBody, reply, rpc, setting, studentNumber, supabase, token, tokenPattern, uuidPattern, write } from "../server/portal-store.js";
import { maxImageBytes, maxPages, ranking, readQuestions, timeline, visibleStep } from "../client/utils/erae-model.js";
import { availableRoom, deletePresentation, editPresentation, expiration, ownedPresentations, retention } from "../server/erae-owner.js";
import { automationReady } from "../server/weekly-worker.js";
const fail = (status, message) => {
  throw new PortalError(status, message);
};
const roomFields = "id,owner_id,join_code,admin_digest,title,caption,page_count,published,revision,body";
const runId = (room) => room.body.runKey ? digest(room.body.runKey).slice(0, 32) : "initial";
const roomInfo = (room) => ({
  title: room.title,
  caption: room.caption,
  pageCount: room.page_count,
  studentEntry: true,
  runId: runId(room)
});
function assertRun(current, loaded, requested) {
  if (runId(current) !== runId(loaded) || requested !== void 0 && requested !== runId(current)) {
    return fail(409, "\u0627\u062C\u0631\u0627 \u0628\u0627\u0632\u0646\u0634\u0627\u0646\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A. \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0642\u062F\u0627\u0645 \u06A9\u0646\u06CC\u062F.");
  }
}
const playerFor = (room, key) => Object.hasOwn(room.body.players, key) ? room.body.players[key] : void 0;
function view(room, player, admin = false) {
  const steps = timeline(room.page_count, room.body.questions);
  const step = visibleStep(room.body, steps, player);
  const question = step.type === "question" ? room.body.questions[step.index] : void 0;
  return {
    ...roomInfo(room),
    revision: room.revision,
    step,
    resumeAt: player?.resumeAt,
    stepPosition: step.type === "waiting" ? -1 : steps.findIndex((item) => item === step),
    ...question ? { question: { text: question.text, options: question.options }, answer: player?.answers[step.type === "question" ? step.index : -1] } : {},
    ...step.type === "ranking" ? { ranking: ranking(room.body), questionCount: room.body.questions.length } : {},
    ...admin ? {
      published: room.published,
      position: room.body.position,
      total: steps.length,
      participants: Object.keys(room.body.players).length,
      questions: room.body.questions,
      lastShownPage: Math.max(0, ...steps.slice(0, room.body.furthest + 1).map((item) => item.type === "slide" ? item.page : 0)),
      joinCode: room.join_code,
      answered: step.type === "question" ? Object.values(room.body.players).filter((p) => p.answers[step.index] !== void 0).length : null
    } : {}
  };
}
async function load(filters) {
  const [room] = await query("erae_rooms", { ...availableRoom(), ...filters, select: roomFields, limit: "1" });
  return room ?? fail(404, "\u0627\u0631\u0627\u0626\u0647 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F \u06CC\u0627 \u062F\u06CC\u06AF\u0631 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
}
async function update(room, change) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const [saved] = await write("erae_rooms", "PATCH", { ...change(room), revision: room.revision + 1 }, {
      ...availableRoom(),
      id: `eq.${room.id}`,
      revision: `eq.${room.revision}`,
      select: roomFields
    });
    if (saved) return saved;
    room = await load({ id: `eq.${room.id}` });
  }
  return fail(409, "\u0648\u0636\u0639\u06CC\u062A \u0627\u0631\u0627\u0626\u0647 \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
}
async function image(roomId, page) {
  const [record] = await query("erae_images", { room_id: `eq.${roomId}`, page: `eq.${page}`, select: "jpeg" });
  if (!record?.jpeg.startsWith("\\x")) return fail(404, "\u062A\u0635\u0648\u06CC\u0631 \u0622\u0645\u0627\u062F\u0647 \u0646\u06CC\u0633\u062A.");
  return new Response(new Uint8Array(Buffer.from(record.jpeg.slice(2), "hex")), { headers: {
    "Content-Type": "image/jpeg",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  } });
}
async function upload(request, room, page, replaceCover = false, batch = "") {
  if (!Number.isInteger(page) || page < 0 || page > room.page_count) return fail(409, "\u0627\u0633\u0644\u0627\u06CC\u062F \u0642\u0627\u0628\u0644 \u0628\u0627\u0631\u06AF\u0630\u0627\u0631\u06CC \u0646\u06CC\u0633\u062A.");
  if (room.published && !replaceCover && !batch) return reply({ ok: true });
  if (request.headers.get("content-type") !== "image/jpeg" || Number(request.headers.get("content-length")) > maxImageBytes) {
    return fail(413, "\u062D\u062C\u0645 \u062A\u0635\u0648\u06CC\u0631 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0627\u0633\u062A \u06CC\u0627 \u0642\u0627\u0644\u0628 \u0622\u0646 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length > maxImageBytes || bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
    return fail(400, "\u062A\u0635\u0648\u06CC\u0631 JPEG \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  }
  const endpoint = batch ? "erae_replacement_images?on_conflict=room_id,batch_id,page" : "erae_images?on_conflict=room_id,page";
  await supabase(`/rest/v1/${endpoint}&select=page`, "POST", {
    room_id: room.id,
    page,
    jpeg: `\\x${bytes.toString("hex")}`,
    ...batch ? { batch_id: batch } : {}
  }, false, void 0, replaceCover || batch ? "resolution=merge-duplicates" : "resolution=ignore-duplicates");
  return reply({ ok: true });
}
var erae_tori_default = {
  async fetch(request) {
    try {
      const params = new URL(request.url).searchParams;
      const action = params.get("action");
      const get = request.method === "GET";
      if (!get && request.method !== "POST") return fail(405, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
      const origin = request.headers.get("origin");
      if (!get && origin !== "https://ieaum.ir" && origin !== setting("PORTAL_ORIGIN")) return fail(403, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
      const key = request.headers.get("authorization")?.match(/^Bearer ([\w-]{32})$/)?.[1] ?? "";
      const roomId = params.get("id") ?? "";
      const joinCode = params.get("s") ?? "";
      const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      if (joinCode) {
        if (!tokenPattern.test(joinCode)) return fail(404, "\u0644\u06CC\u0646\u06A9 \u0627\u0631\u0627\u0626\u0647 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
        const room2 = await load({ join_code: `eq.${joinCode}`, published: "eq.true" });
        if (get && action === "info") return reply(roomInfo(room2));
        if (get && action === "cover") return image(room2.id, 0);
        if (!get && action === "join") {
          await limit(`erae-join:${ip}`, 200);
          const data = await readBody(request, 2e3);
          const name = field(data, "name").trim();
          if (!name || name.length > 60 || /\p{Cc}/u.test(name)) return fail(422, "\u0646\u0627\u0645 \u0631\u0627 \u062A\u0627 \u06F6\u06F0 \u0646\u0648\u06CC\u0633\u0647 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
          const number = studentNumber(field(data, "studentNumber"));
          if (!/^[0-9]{6,20}$/.test(number)) return fail(422, "\u0634\u0645\u0627\u0631\u0647\u0654 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC \u0631\u0627 \u0628\u0627 \u06F6 \u062A\u0627 \u06F2\u06F0 \u0631\u0642\u0645 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
          const provided = field(data, "recovery").trim();
          const studentKey = digest(room2.id + ":" + number);
          const requestedAccess = field(data, "attempt");
          const attempt = tokenPattern.test(requestedAccess) ? requestedAccess : token();
          const access = room2.body.runKey ? createHmac("sha256", room2.body.runKey).update(attempt).digest("base64url").slice(0, 32) : attempt;
          const recovery = tokenPattern.test(provided) ? provided : token();
          const playerKey2 = digest(access);
          let newPlayer = false;
          const saved = await update(room2, (next) => {
            assertRun(next, room2, data.runId);
            const previous = Object.entries(next.body.players).find(([, p]) => p.studentKey === studentKey);
            if (previous) {
              const [oldKey, player2] = previous;
              if (!tokenPattern.test(provided) || !player2.recoveryDigest || !equalSecret(digest(provided), player2.recoveryDigest)) {
                return fail(409, "\u0628\u0631\u0627\u06CC \u0627\u062F\u0627\u0645\u0647\u0654 \u0627\u06CC\u0646 \u0646\u0634\u0633\u062A\u060C \u06A9\u062F \u0628\u0627\u0632\u06CC\u0627\u0628\u06CC \u0647\u0645\u0627\u0646 \u0627\u0631\u0627\u0626\u0647 \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
              }
              if (oldKey === playerKey2) return {};
              if (Object.hasOwn(next.body.players, playerKey2)) return fail(409, "\u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0631\u0627\u06CC \u0648\u0631\u0648\u062F \u0627\u0642\u062F\u0627\u0645 \u06A9\u0646\u06CC\u062F.");
              if ((player2.entries ?? 1) >= 3) return fail(403, "\u0633\u0642\u0641 \u0633\u0647 \u0648\u0631\u0648\u062F \u0628\u0627 \u0627\u06CC\u0646 \u0634\u0645\u0627\u0631\u0647\u0654 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC \u062F\u0631 \u0627\u06CC\u0646 \u0627\u0631\u0627\u0626\u0647 \u062A\u06A9\u0645\u06CC\u0644 \u0634\u062F\u0647 \u0627\u0633\u062A.");
              player2.entries = (player2.entries ?? 1) + 1;
              const checkpoint = typeof data.lastSeen === "number" && Number.isInteger(data.lastSeen) ? data.lastSeen : player2.lastSeen;
              if (checkpoint !== void 0 && checkpoint >= player2.firstPosition && checkpoint < next.body.position && checkpoint <= next.body.furthest) player2.resumeAt = checkpoint;
              delete next.body.players[oldKey];
              next.body.players[playerKey2] = player2;
              newPlayer = false;
            } else {
              if (next.body.position >= timeline(next.page_count, next.body.questions).length - 1) return fail(409, "\u0627\u0631\u0627\u0626\u0647 \u0628\u0647 \u067E\u0627\u06CC\u0627\u0646 \u0631\u0633\u06CC\u062F\u0647 \u0627\u0633\u062A.");
              if (Object.hasOwn(next.body.players, playerKey2)) return fail(409, "\u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0631\u0627\u06CC \u0648\u0631\u0648\u062F \u0627\u0642\u062F\u0627\u0645 \u06A9\u0646\u06CC\u062F.");
              if (Object.keys(next.body.players).length >= 150) return fail(409, "\u0638\u0631\u0641\u06CC\u062A \u062C\u0644\u0633\u0647 \u062A\u06A9\u0645\u06CC\u0644 \u0627\u0633\u062A.");
              next.body.players[playerKey2] = {
                name,
                answers: {},
                firstPosition: Math.max(0, next.body.position),
                studentKey,
                recoveryDigest: digest(recovery),
                entries: 1,
                lastSeen: next.body.position
              };
              newPlayer = true;
            }
            return { body: next.body };
          });
          return reply({ access, ...newPlayer ? { recovery } : {}, view: view(saved, playerFor(saved, playerKey2)) });
        }
        const playerKey = digest(key);
        const player = key && playerFor(room2, playerKey);
        if (!player) return fail(401, "\u0627\u0632 \u0644\u06CC\u0646\u06A9 \u0634\u0631\u06A9\u062A\u200C\u06A9\u0646\u0646\u062F\u06AF\u0627\u0646 \u062F\u0648\u0628\u0627\u0631\u0647 \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F.");
        if (get && action === "state") return reply(view(room2, player));
        if (get && action === "image") {
          const step = visibleStep(room2.body, timeline(room2.page_count, room2.body.questions), player);
          if (step.type === "slide" && String(step.page) === params.get("page")) return image(room2.id, step.page);
          return fail(404, "\u0627\u06CC\u0646 \u0627\u0633\u0644\u0627\u06CC\u062F \u062F\u0631 \u062D\u0627\u0644 \u0646\u0645\u0627\u06CC\u0634 \u0646\u06CC\u0633\u062A.");
        }
        if (!get && action === "checkpoint") {
          const data = await readBody(request, 2e3);
          if (typeof data.position !== "number" || !Number.isInteger(data.position)) return fail(422, "\u0645\u0631\u062D\u0644\u0647 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
          const position = data.position;
          await update(room2, (next) => {
            const current = playerFor(next, playerKey) ?? fail(401, "\u062F\u0648\u0628\u0627\u0631\u0647 \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F.");
            const steps = timeline(next.page_count, next.body.questions);
            if (visibleStep(next.body, steps, current) !== steps[position]) return {};
            current.lastSeen = position;
            return { body: next.body };
          });
          return reply({ ok: true });
        }
        if (!get && action === "resume-next") {
          const data = await readBody(request, 2e3);
          const saved = await update(room2, (next) => {
            const current = playerFor(next, playerKey) ?? fail(401, "\u062F\u0648\u0628\u0627\u0631\u0647 \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F.");
            const steps = timeline(next.page_count, next.body.questions);
            const step = visibleStep(next.body, steps, current);
            if (current.resumeAt === void 0 || data.position !== current.resumeAt || step !== steps[current.resumeAt]) return {};
            if (step.type === "question" && current.answers[step.index] === void 0) return fail(409, "\u0627\u0628\u062A\u062F\u0627 \u0628\u0647 \u0627\u06CC\u0646 \u0633\u0624\u0627\u0644 \u067E\u0627\u0633\u062E \u062F\u0647\u06CC\u062F.");
            current.lastSeen = Math.min(next.body.position, current.resumeAt + 1);
            if (current.resumeAt + 1 >= next.body.position) delete current.resumeAt;
            else current.resumeAt++;
            return { body: next.body };
          });
          return reply(view(saved, playerFor(saved, playerKey)));
        }
        if (!get && action === "answer") {
          const data = await readBody(request, 2e3);
          const saved = await update(room2, (next) => {
            const current = playerFor(next, playerKey) ?? fail(401, "\u062F\u0648\u0628\u0627\u0631\u0647 \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F.");
            const step = visibleStep(next.body, timeline(next.page_count, next.body.questions), current);
            if (step.type !== "question" || step.index !== data.index) return fail(409, "\u0627\u06CC\u0646 \u0633\u0624\u0627\u0644 \u062F\u0631 \u062D\u0627\u0644 \u0646\u0645\u0627\u06CC\u0634 \u0646\u06CC\u0633\u062A.");
            const choice = data.choice;
            if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= next.body.questions[step.index].options.length) return fail(422, "\u06AF\u0632\u06CC\u0646\u0647 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
            if (current.answers[step.index] !== void 0) return fail(409, "\u0627\u06CC\u0646 \u067E\u0627\u0633\u062E \u0642\u0628\u0644\u0627\u064B \u062B\u0628\u062A \u0634\u062F\u0647 \u0627\u0633\u062A.");
            current.answers[step.index] = choice;
            current.lastSeen = timeline(next.page_count, next.body.questions).findIndex((item) => item.type === "question" && item.index === step.index);
            return { body: next.body };
          });
          return reply(view(saved, playerFor(saved, playerKey)));
        }
        return fail(404, "\u0627\u06CC\u0646 \u0628\u062E\u0634 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
      }
      const profile = await currentProfile(request) ?? fail(401, "\u0627\u0628\u062A\u062F\u0627 \u0648\u0627\u0631\u062F \u062D\u0633\u0627\u0628 IEAUM \u0634\u0648\u06CC\u062F.");
      if (get && action === "list") {
        const [rooms, autoDelete] = await Promise.all([ownedPresentations(profile.id), automationReady()]);
        return reply({ rooms, autoDelete });
      }
      if (!get && action === "create") {
        await limit(`erae-create:${profile.id}`, 12);
        const data = await readBody(request, 4e3);
        const title = field(data, "title").trim();
        const caption = field(data, "caption").trim();
        const pageCount = data.pageCount;
        if (!title || title.length > 120 || caption.length > 800 || typeof pageCount !== "number" || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > maxPages) {
          return fail(422, "\u0639\u0646\u0648\u0627\u0646\u060C \u06A9\u067E\u0634\u0646 \u0648 \u062A\u0639\u062F\u0627\u062F \u0627\u0633\u0644\u0627\u06CC\u062F\u0647\u0627 \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F.");
        }
        const days = retention(data.retention);
        if (days && !await automationReady()) return fail(503, "\u062D\u0630\u0641 \u062E\u0648\u062F\u06A9\u0627\u0631 \u0647\u0646\u0648\u0632 \u0641\u0639\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A. \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u0627\u0631\u0627\u0626\u0647 \u0631\u0627 \u0628\u062F\u0648\u0646 \u0632\u0645\u0627\u0646 \u062D\u0630\u0641 \u0628\u0633\u0627\u0632\u06CC\u062F.");
        const code = token();
        const id = await rpc("erae_create_room", {
          p_owner: profile.id,
          p_title: title,
          p_caption: caption,
          p_page_count: pageCount,
          p_join: token(),
          p_admin: digest(code),
          p_days: days
        });
        if (!id) return fail(409, "\u062D\u062F\u0627\u06A9\u062B\u0631 \u06F3 \u0627\u0631\u0627\u0626\u0647 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646\u06CC\u062F \u062F\u0627\u0634\u062A\u0647 \u0628\u0627\u0634\u06CC\u062F. \u0628\u0631\u0627\u06CC \u0627\u0631\u0627\u0626\u0647\u0654 \u062C\u062F\u06CC\u062F \u06CC\u06A9\u06CC \u0631\u0627 \u062D\u0630\u0641 \u06A9\u0646\u06CC\u062F.");
        return reply({ id, code }, 201);
      }
      if (!uuidPattern.test(roomId)) return fail(404, "\u0627\u0631\u0627\u0626\u0647 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
      const room = await load({ id: `eq.${roomId}`, owner_id: `eq.${profile.id}` });
      if (!get && action === "delete") return reply({ ok: Boolean((await deletePresentation(profile.id, roomId)).length) });
      if (!get && action === "metadata") {
        const data = await readBody(request, 4e3);
        const title = field(data, "title").trim();
        const caption = field(data, "caption").trim();
        if (!title || title.length > 120 || caption.length > 800) return fail(422, "\u0639\u0646\u0648\u0627\u0646 \u0648 \u06A9\u067E\u0634\u0646 \u0631\u0627 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F.");
        const expires = expiration(data.retention);
        if (expires && !await automationReady()) return fail(503, "\u062D\u0630\u0641 \u062E\u0648\u062F\u06A9\u0627\u0631 \u0647\u0646\u0648\u0632 \u0641\u0639\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
        const saved = await editPresentation(profile.id, roomId, {
          title,
          caption,
          ...Object.hasOwn(data, "retention") ? { expires_at: expires } : {}
        });
        if (!saved.length) return fail(404, "\u0627\u0631\u0627\u0626\u0647 \u062F\u06CC\u06AF\u0631 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
        return reply({ ok: true });
      }
      if (!get && action === "cover-update") return upload(request, room, 0, true);
      if (!get && (action === "stage-slide" || action === "replace-slides")) {
        const batch = params.get("batch") ?? "";
        if (!uuidPattern.test(batch) || room.body.furthest >= 0) return fail(409, "\u0641\u0627\u06CC\u0644 \u0627\u0631\u0627\u0626\u0647 \u0641\u0642\u0637 \u067E\u06CC\u0634 \u0627\u0632 \u0634\u0631\u0648\u0639 \u062C\u0644\u0633\u0647 \u0642\u0627\u0628\u0644 \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646\u06CC \u0627\u0633\u062A.");
        if (action === "stage-slide") {
          const page = Number(params.get("page"));
          if (page < 1) return fail(422, "\u0634\u0645\u0627\u0631\u0647\u0654 \u0627\u0633\u0644\u0627\u06CC\u062F \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
          await limit(`erae-stage:${profile.id}`, 180);
          return upload(request, room, page, false, batch);
        }
        if (!await rpc("erae_replace_slides", { p_room: room.id, p_owner: profile.id, p_batch: batch, p_count: room.page_count })) {
          return fail(409, "\u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646\u06CC \u0627\u0633\u0644\u0627\u06CC\u062F\u0647\u0627 \u06A9\u0627\u0645\u0644 \u0646\u0634\u062F. \u0641\u0627\u06CC\u0644 \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.");
        }
        return reply({ ok: true });
      }
      if (!get && action === "delete-draft" && !room.published) {
        await write("erae_rooms", "DELETE", void 0, { id: `eq.${room.id}`, published: "eq.false", owner_id: `eq.${profile.id}` });
        return reply({ ok: true });
      }
      if (!get && action === "new-code") {
        await limit(`erae-code:${profile.id}`, 15);
        const code = token();
        await update(room, () => ({ admin_digest: digest(code) }));
        return reply({ code });
      }
      const isAdmin = (row) => {
        if (key && !equalSecret(digest(key), row.admin_digest)) return fail(401, "\u06A9\u062F \u0645\u062F\u06CC\u0631 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
      };
      isAdmin(room);
      if (get && action === "state") return reply(view(room, void 0, true));
      if (!get && action === "reset") {
        const data = await readBody(request, 2e3);
        if (typeof data.runId !== "string") return fail(422, "\u0628\u0631\u0627\u06CC \u0628\u0627\u0632\u0646\u0634\u0627\u0646\u06CC\u060C \u0648\u0636\u0639\u06CC\u062A \u0627\u0631\u0627\u0626\u0647 \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F.");
        if (!room.published) return fail(409, "\u0627\u0628\u062A\u062F\u0627 \u0627\u0631\u0627\u0626\u0647 \u0631\u0627 \u0622\u0645\u0627\u062F\u0647 \u06A9\u0646\u06CC\u062F.");
        const runKey = token();
        const saved = await update(room, (next) => {
          isAdmin(next);
          assertRun(next, room, data.runId);
          return { body: { position: -1, furthest: -1, players: {}, questions: next.body.questions, runKey } };
        });
        return reply(view(saved, void 0, true));
      }
      if (get && action === "image") {
        const step = timeline(room.page_count, room.body.questions)[room.body.position];
        if (step?.type === "slide" && String(step.page) === params.get("page")) return image(room.id, step.page);
        return fail(404, "\u0627\u06CC\u0646 \u0627\u0633\u0644\u0627\u06CC\u062F \u062F\u0631 \u062D\u0627\u0644 \u0646\u0645\u0627\u06CC\u0634 \u0646\u06CC\u0633\u062A.");
      }
      if (!get && action === "upload") return upload(request, room, Number(params.get("page") ?? "NaN"));
      if (!get && action === "publish") {
        const data = await readBody(request, 7e4);
        let questions;
        try {
          questions = readQuestions(data.questions, room.page_count).sort((a, b) => a.after - b.after);
        } catch (error) {
          return fail(422, error.message);
        }
        const pages = await query("erae_images", { room_id: `eq.${room.id}`, select: "page" });
        if (pages.length !== room.page_count + 1) return fail(409, "\u0647\u0645\u0647\u0654 \u0627\u0633\u0644\u0627\u06CC\u062F\u0647\u0627 \u0648 \u062C\u0644\u062F \u0647\u0646\u0648\u0632 \u0628\u0627\u0631\u06AF\u0630\u0627\u0631\u06CC \u0646\u0634\u062F\u0647\u200C\u0627\u0646\u062F.");
        const saved = await update(room, (next) => {
          isAdmin(next);
          if (next.published) return {};
          return { published: true, body: { ...next.body, questions } };
        });
        return reply({ joinCode: saved.join_code });
      }
      if (!get && action === "questions") {
        const data = await readBody(request, 7e4);
        let questions;
        try {
          questions = readQuestions(data.questions, room.page_count).sort((a, b) => a.after - b.after);
        } catch (error) {
          return fail(422, error.message);
        }
        const saved = await update(room, (next) => {
          isAdmin(next);
          assertRun(next, room, data.runId);
          const steps = timeline(next.page_count, next.body.questions);
          const shown = Math.max(0, ...steps.slice(0, next.body.furthest + 1).map((step) => step.type === "slide" ? step.page : 0));
          const fixed = next.body.questions.filter((question) => question.after <= shown);
          if (!next.published || questions.some((question) => question.after <= shown) || questions.length + fixed.length > 20) {
            return fail(409, "\u0641\u0642\u0637 \u0633\u0624\u0627\u0644\u200C\u0647\u0627\u06CC \u0628\u0639\u062F \u0627\u0632 \u0627\u0633\u0644\u0627\u06CC\u062F\u0647\u0627\u06CC \u0646\u0645\u0627\u06CC\u0634\u200C\u062F\u0627\u062F\u0647\u200C\u0646\u0634\u062F\u0647 \u0631\u0627 \u0645\u06CC\u200C\u062A\u0648\u0627\u0646 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u06A9\u0631\u062F.");
          }
          return { body: { ...next.body, questions: [...fixed, ...questions] } };
        });
        return reply(view(saved, void 0, true));
      }
      if (!get && action === "move") {
        const data = await readBody(request, 2e3);
        const saved = await update(room, (next) => {
          isAdmin(next);
          assertRun(next, room, data.runId);
          if (!next.published || data.position !== next.body.position || data.delta !== -1 && data.delta !== 1) return fail(409, "\u0648\u0636\u0639\u06CC\u062A \u062C\u0644\u0633\u0647 \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F\u0647 \u0627\u0633\u062A.");
          const position = Math.max(-1, Math.min(timeline(next.page_count, next.body.questions).length - 1, next.body.position + data.delta));
          return { body: { ...next.body, position, furthest: Math.max(position, next.body.furthest) } };
        });
        return reply(view(saved, void 0, true));
      }
      return fail(404, "\u0627\u06CC\u0646 \u0628\u062E\u0634 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
    } catch (error) {
      return error instanceof PortalError ? reply({ error: error.message }, error.status) : reply({ error: "\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u0627\u0631\u0627\u0626\u0647\u200C\u0637\u0648\u0631\u06CC \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062F." }, 500);
    }
  }
};
export {
  erae_tori_default as default
};
