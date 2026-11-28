import { field, limit, PortalError, query, rpc, uuidPattern, write } from "./portal-store.js";
import { ownerAccount, recordDeparture } from "./presence.js";
import { telegram } from "./telegram-delivery.js";
import { endOfQuizDate, formatQuizTime, quizDate } from "../client/utils/quiz-time.js";
const quizFields = "id,title,published,content,audience,course_name,deadline_at,duration_minutes";
const usernamePattern = /^[a-z0-9_][a-z0-9_.-]{2,31}$/;
async function activeStudents(usernames, extra = "") {
  if (!usernames.length) return [];
  return query("portal_profiles", {
    username: `in.(${usernames.map((username) => `"${username}"`).join(",")})`,
    role: "eq.student",
    active: "eq.true",
    select: "username,first_name,last_name" + extra
  });
}
async function validateAudience(raw, includeIds = false) {
  const audience = [...new Set(raw.toLowerCase().split(/[\s,،]+/).filter(Boolean))];
  if (audience.length < 1 || audience.length > 100 || audience.some((name) => !usernamePattern.test(name))) {
    throw new PortalError(422, "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06F1 \u062A\u0627 \u06F1\u06F0\u06F0 \u062F\u0627\u0646\u0634\u062C\u0648 \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
  }
  const students = await activeStudents(audience, includeIds ? ",id" : "");
  const found = new Set(students.map(({ username }) => username));
  const missing = audience.filter((username) => !found.has(username));
  if (missing.length) throw new PortalError(422, `\u062D\u0633\u0627\u0628 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC \u0641\u0639\u0627\u0644 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F: ${missing.join(", ")}`);
  return { audience, students };
}
async function studentGroups(action, body, ownerId) {
  const table = "portal_quiz_student_groups";
  const owner = { owner_id: "eq." + ownerId };
  if (action === "quiz:groups") {
    const groups = await query(table, { ...owner, select: "id,name", order: "name.asc,id.asc" });
    return { groups };
  }
  const id = field(body, "id");
  if ((action !== "quiz:group-save" || id) && !uuidPattern.test(id)) throw new PortalError(422, "\u06AF\u0631\u0648\u0647 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  const scoped = { ...owner, id: "eq." + id };
  if (action === "quiz:group-members") {
    const [group2] = await query(table, { ...scoped, select: "id,name,student_ids", limit: "1" });
    if (!group2) throw new PortalError(404, "\u06AF\u0631\u0648\u0647 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    const students2 = await query("portal_profiles", {
      id: "in.(" + group2.student_ids.join(",") + ")",
      role: "eq.student",
      active: "eq.true",
      select: "username,first_name,last_name",
      order: "username.asc"
    });
    return { group: { id: group2.id, name: group2.name, students: students2 } };
  }
  if (action !== "quiz:group-save") throw new PortalError(400, "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06AF\u0631\u0648\u0647 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  const name = field(body, "name").trim();
  if (!name || name.length > 80 || /[\p{Cc}\p{Cf}]/u.test(name.replaceAll("\u200C", ""))) {
    throw new PortalError(422, "\u0628\u0631\u0627\u06CC \u06AF\u0631\u0648\u0647 \u0646\u0627\u0645\u06CC \u0645\u0639\u062A\u0628\u0631 \u0648 \u062D\u062F\u0627\u06A9\u062B\u0631 \u06F8\u06F0 \u0646\u0648\u06CC\u0633\u0647\u200C\u0627\u06CC \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
  }
  const { students } = await validateAudience(field(body, "audience"), true);
  const values = { name, student_ids: students.map((student) => student.id) };
  const [group] = id ? await write(table, "PATCH", values, { ...scoped, select: "id,name" }) : await write(table, "POST", { owner_id: ownerId, ...values }, { select: "id,name" });
  if (!group) throw new PortalError(404, "\u06AF\u0631\u0648\u0647 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  return { group };
}
async function publishedNotice(quiz, teacher) {
  const students = await activeStudents(quiz.audience, ",telegram_id");
  const contacts = students.flatMap((student) => student.telegram_id ? [student.telegram_id] : []);
  const course = quiz.course_name || teacher.course_name || "\u0646\u0627\u0645\u0631\u0627\u0644\u0628";
  const dueDate = quiz.deadline_at && new Date(Date.parse(quiz.deadline_at) - 1e3);
  const deadline = dueDate ? quizDate(dueDate) === quizDate() ? "\u067E\u0627\u06CC\u0627\u0646 \u0627\u0645\u0631\u0648\u0632 \u0628\u0647 \u0648\u0642\u062A \u062A\u0647\u0631\u0627\u0646" : formatQuizTime(dueDate.toISOString()) + " \u0628\u0647 \u0648\u0642\u062A \u062A\u0647\u0631\u0627\u0646" : null;
  const text = [
    `\u0622\u0632\u0645\u0648\u0646 \xAB${quiz.title}\xBB\u060C \u062A\u0648\u0633\u0637 \u0627\u0633\u062A\u0627\u062F ${teacher.first_name} ${teacher.last_name} \u0628\u0631\u0627\u06CC \u0634\u0645\u0627 \u062F\u0631 \u0633\u0627\u06CC\u062A \u062A\u0639\u0631\u06CC\u0641 \u0634\u062F.`,
    deadline ? `\u0645\u0647\u0644\u062A \u067E\u0627\u0633\u062E\u200C\u06AF\u0648\u06CC\u06CC \u0628\u0647 \u0622\u0632\u0645\u0648\u0646 \u062A\u0627 ${deadline} \u0627\u0633\u062A.` : "\u0622\u0632\u0645\u0648\u0646 \u0645\u0647\u0644\u062A \u062A\u0642\u0648\u06CC\u0645\u06CC \u0645\u0634\u062E\u0635\u06CC \u0646\u062F\u0627\u0631\u062F.",
    `\u062F\u0631\u0633 \xAB${course}\xBB \xB7 \u062A\u0639\u062F\u0627\u062F \u0633\u0624\u0627\u0644\u200C\u0647\u0627: ${quiz.content.length.toLocaleString("fa-IR")}`,
    quiz.duration_minutes ? `\u067E\u0633 \u0627\u0632 \u0634\u0631\u0648\u0639\u060C ${quiz.duration_minutes.toLocaleString("fa-IR")} \u062F\u0642\u06CC\u0642\u0647 \u0628\u0631\u0627\u06CC \u067E\u0627\u0633\u062E\u200C\u06AF\u0648\u06CC\u06CC \u062F\u0627\u0631\u06CC\u062F\u060C \u062A\u0627 \u0633\u0642\u0641 \u0645\u0647\u0644\u062A \u0622\u0632\u0645\u0648\u0646.` : ""
  ].filter(Boolean).join("\n");
  const reply_markup = { inline_keyboard: [[{ text: "\u0648\u0631\u0648\u062F \u0628\u0647 \u0622\u0632\u0645\u0648\u0646", url: "https://ieaum.ir/panel/?quiz=" + quiz.id + "#quiz-" + quiz.id }]] };
  let sent = 0;
  for (let index = 0; index < contacts.length; index += 25) {
    if (index) await new Promise((resolve) => setTimeout(resolve, 1050));
    const deliveries = await Promise.allSettled(contacts.slice(index, index + 25).map((chat_id) => telegram("sendMessage", { chat_id, text, reply_markup })));
    sent += deliveries.filter(({ status }) => status === "fulfilled").length;
  }
  return { sent, unlinked: students.length - contacts.length, failed: contacts.length - sent, inactive: quiz.audience.length - students.length };
}
async function quizAction(action, body, profile) {
  const manager = body.management === true && ownerAccount(profile);
  if (body.management === true && !manager) throw new PortalError(403, "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062F\u06CC\u0631 IEAUM \u0644\u0627\u0632\u0645 \u0627\u0633\u062A.");
  const teacher = profile.role === "teacher" || manager;
  const own = manager ? {} : { owner_id: `eq.${profile.id}` };
  const visible = { published: "eq.true", audience: `cs.{"${profile.username}"}` };
  if (action === "quiz:departure" && !teacher) {
    const id2 = field(body, "id");
    if (!uuidPattern.test(id2)) throw new PortalError(422, "\u0622\u0632\u0645\u0648\u0646 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    await limit("quiz-departure:" + profile.id, 40);
    const [quiz2] = await query(
      "portal_quizzes",
      { id: "eq." + id2, ...visible, select: "title,deadline_at,duration_minutes", limit: "1" }
    );
    if (!quiz2 || quiz2.deadline_at && Date.parse(quiz2.deadline_at) <= Date.now()) return { ok: true };
    const [submitted, starts] = await Promise.all([
      query("portal_submissions", { quiz_id: "eq." + id2, student_id: "eq." + profile.id, select: "quiz_id", limit: "1" }),
      quiz2.duration_minutes ? query("portal_quiz_starts", {
        quiz_id: "eq." + id2,
        student_id: "eq." + profile.id,
        expires_at: "gt." + (/* @__PURE__ */ new Date()).toISOString(),
        select: "quiz_id",
        limit: "1"
      }) : []
    ]);
    if (!submitted.length && (!quiz2.duration_minutes || starts.length)) {
      await recordDeparture("quiz", id2, profile.id, profile.first_name + " " + profile.last_name, quiz2.title).catch(() => {
      });
    }
    return { ok: true };
  }
  await limit(`quiz:${profile.id}`, 100);
  if (action.startsWith("quiz:group")) {
    if (!teacher) throw new PortalError(403, "\u06AF\u0631\u0648\u0647\u200C\u0647\u0627\u06CC \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC \u062F\u0631 \u067E\u0646\u0644 \u0627\u0633\u062A\u0627\u062F \u062F\u0631 \u062F\u0633\u062A\u0631\u0633\u200C\u0627\u0646\u062F.");
    return studentGroups(action, body, profile.id);
  }
  if (action === "quiz:students" && teacher) {
    const term = field(body, "search").trim().toLowerCase();
    if (term.length > 80 || /[^\p{L}\p{M}\p{N} ._\u200c-]/u.test(term)) return { students: [], more: false };
    const offset = Number(body.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new PortalError(422, "\u0635\u0641\u062D\u0647\u0654 \u0641\u0647\u0631\u0633\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    const match = `ilike.*${term.replaceAll("_", "\\_")}*`;
    const students = await query("portal_profiles", {
      role: "eq.student",
      active: "eq.true",
      select: "username,first_name,last_name",
      order: "username.asc",
      ...term ? { or: `(username.${match},first_name.${match},last_name.${match})` } : {},
      limit: "31",
      offset: String(offset)
    });
    return { students: students.slice(0, 30), more: students.length > 30 };
  }
  if (action === "quiz:student-lookup" && teacher) {
    const username = field(body, "username").trim().toLowerCase();
    if (!usernamePattern.test(username)) throw new PortalError(422, "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u062F\u0642\u06CC\u0642 \u062F\u0627\u0646\u0634\u062C\u0648 \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
    const [student] = await activeStudents([username]);
    if (!student) throw new PortalError(404, "\u062F\u0627\u0646\u0634\u062C\u0648\u06CC \u0641\u0639\u0627\u0644\u06CC \u0628\u0627 \u0627\u06CC\u0646 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    return { student };
  }
  if (action === "quiz:list") {
    const offset = manager ? Number(body.offset ?? 0) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 5e3) throw new PortalError(422, "\u0635\u0641\u062D\u0647\u0654 \u0622\u0632\u0645\u0648\u0646\u200C\u0647\u0627 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    const quizzes = await query("portal_quizzes", {
      ...teacher ? own : visible,
      select: quizFields,
      order: manager ? "created_at.desc,id.desc" : "created_at.desc",
      limit: manager ? "51" : "50",
      ...offset ? { offset: String(offset) } : {}
    });
    const results = teacher ? [] : await query("portal_submissions", { student_id: `eq.${profile.id}`, select: "quiz_id,score" });
    if (teacher) return { quizzes: quizzes.slice(0, 50), results, courseName: profile.course_name ?? "", ...manager ? { more: quizzes.length > 50 && offset < 5e3 } : {} };
    const requested = field(body, "quiz");
    if (uuidPattern.test(requested) && !quizzes.some((quiz2) => quiz2.id === requested)) {
      const [linked] = await query("portal_quizzes", { id: "eq." + requested, ...visible, select: quizFields, limit: "1" });
      if (linked) quizzes.unshift(linked);
    }
    const starts = quizzes.some((quiz2) => quiz2.duration_minutes) ? await query("portal_quiz_starts", {
      student_id: `eq.${profile.id}`,
      select: "quiz_id,expires_at",
      quiz_id: `in.(${quizzes.map(({ id: id2 }) => id2).join(",")})`
    }) : [];
    const now = Date.now();
    return { quizzes: quizzes.map(({ audience: _audience, content, ...quiz2 }) => {
      const expiresAt = starts.find((start) => start.quiz_id === quiz2.id)?.expires_at ?? null;
      const available = (!quiz2.deadline_at || Date.parse(quiz2.deadline_at) > now) && (!quiz2.duration_minutes || expiresAt && Date.parse(expiresAt) > now);
      return {
        ...quiz2,
        expiresAt,
        questionCount: content.length,
        content: available ? content.map(({ prompt, options }) => ({ prompt, options })) : []
      };
    }), results, serverNow: now };
  }
  if ((action === "quiz:create" || action === "quiz:update") && teacher) {
    const title = field(body, "title").trim();
    const course_name = field(body, "courseName").trim() || profile.course_name;
    if (!course_name || course_name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(course_name.replaceAll("\u200C", ""))) {
      throw new PortalError(422, "\u0646\u0627\u0645 \u062F\u0631\u0633 \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
    }
    const date = field(body, "dueDate");
    const deadline_at = date ? endOfQuizDate(date) : null;
    if (date && (!deadline_at || Date.parse(deadline_at) <= Date.now())) throw new PortalError(422, "\u0645\u0647\u0644\u062A \u0622\u0632\u0645\u0648\u0646 \u0628\u0627\u06CC\u062F \u062F\u0631 \u0622\u06CC\u0646\u062F\u0647 \u0628\u0627\u0634\u062F.");
    const duration = field(body, "durationMinutes");
    if (duration && (!/^\d{1,3}$/.test(duration) || Number(duration) < 1 || Number(duration) > 480)) {
      throw new PortalError(422, "\u0645\u062F\u062A \u0622\u0632\u0645\u0648\u0646 \u0628\u0627\u06CC\u062F \u0628\u06CC\u0646 \u06F1 \u062A\u0627 \u06F4\u06F8\u06F0 \u062F\u0642\u06CC\u0642\u0647 \u0628\u0627\u0634\u062F.");
    }
    const duration_minutes = duration ? Number(duration) : null;
    const questions = body.questions;
    const { audience } = await validateAudience(field(body, "audience"));
    if (!title || title.length > 120 || !Array.isArray(questions) || questions.length < 1 || questions.length > 15 || questions.some((q) => !q || typeof q.prompt !== "string" || !q.prompt.trim() || q.prompt.length > 1e3 || !Array.isArray(q.options) || q.options.length !== 4 || q.options.some((option) => typeof option !== "string" || !option.trim() || option.length > 200) || new Set(q.options.map((option) => option.trim())).size !== 4 || !Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3)) {
      throw new PortalError(422, "\u0639\u0646\u0648\u0627\u0646\u060C \u0645\u0631\u0627\u062D\u0644 \u0648 \u0686\u0647\u0627\u0631 \u06AF\u0632\u06CC\u0646\u0647\u0654 \u0645\u062A\u0641\u0627\u0648\u062A \u0628\u0631\u0627\u06CC \u0647\u0631 \u0645\u0631\u062D\u0644\u0647 \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
    }
    const content = questions.map(({ prompt, options, correct }) => ({ prompt, options, correct }));
    const draft = { title, audience, content, course_name, deadline_at, duration_minutes };
    if (action === "quiz:update") {
      const id2 = field(body, "id");
      if (!uuidPattern.test(id2)) throw new PortalError(422, "\u0622\u0632\u0645\u0648\u0646 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
      const updated = await write("portal_quizzes", "PATCH", draft, {
        id: `eq.${id2}`,
        ...own,
        published: "eq.false",
        select: "id"
      });
      if (!updated.length) throw new PortalError(409, manager ? "\u0627\u06CC\u0646 \u0622\u0632\u0645\u0648\u0646 \u062F\u06CC\u06AF\u0631 \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 \u0646\u06CC\u0633\u062A." : "\u0641\u0642\u0637 \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633\u200C\u0647\u0627\u06CC \u062E\u0648\u062F\u062A\u0627\u0646 \u0642\u0627\u0628\u0644 \u0648\u06CC\u0631\u0627\u06CC\u0634\u200C\u0627\u0646\u062F.");
    } else {
      await write("portal_quizzes", "POST", { owner_id: profile.id, ...draft });
    }
    return { ok: true };
  }
  const id = field(body, "id");
  if (!uuidPattern.test(id)) throw new PortalError(422, "\u0622\u0632\u0645\u0648\u0646 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  const [quiz] = await query("portal_quizzes", { id: `eq.${id}`, ...teacher ? own : visible, select: quizFields });
  if (!quiz) throw new PortalError(404, "\u0622\u0632\u0645\u0648\u0646 \u062F\u0631 \u062F\u0633\u062A\u0631\u0633 \u0646\u06CC\u0633\u062A.");
  if (action === "quiz:publish" && teacher) {
    if (quiz.deadline_at && Date.parse(quiz.deadline_at) <= Date.now()) throw new PortalError(422, "\u0645\u0647\u0644\u062A \u0622\u0632\u0645\u0648\u0646 \u06AF\u0630\u0634\u062A\u0647 \u0627\u0633\u062A. \u0627\u0628\u062A\u062F\u0627 \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 \u0631\u0627 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u06A9\u0646\u06CC\u062F.");
    const [published] = await write("portal_quizzes", "PATCH", { published: true }, {
      id: `eq.${id}`,
      ...own,
      published: "eq.false",
      select: manager ? quizFields + ",owner_id" : quizFields
    });
    if (!published) return { ok: true };
    const author = manager && published.owner_id && published.owner_id !== profile.id ? (await query("portal_profiles", { id: "eq." + published.owner_id, select: "first_name,last_name,course_name", limit: "1" }).catch(() => []))[0] ?? profile : profile;
    return { ok: true, delivery: await publishedNotice(published, author).catch(() => null) };
  }
  if (manager && action === "quiz:close") {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const closed = await write("portal_quizzes", "PATCH", { deadline_at: now }, {
      id: "eq." + id,
      published: "eq.true",
      or: `(deadline_at.is.null,deadline_at.gt.${now})`,
      select: "id"
    });
    if (!closed.length) throw new PortalError(409, "\u0627\u06CC\u0646 \u0622\u0632\u0645\u0648\u0646 \u062F\u06CC\u06AF\u0631 \u0628\u0627\u0632 \u0646\u06CC\u0633\u062A.");
    return { ok: true };
  }
  if (manager && action === "quiz:delete-draft") {
    const removed = await write("portal_quizzes", "DELETE", void 0, {
      id: "eq." + id,
      published: "eq.false",
      select: "id"
    });
    if (!removed.length) throw new PortalError(409, "\u0627\u06CC\u0646 \u0622\u0632\u0645\u0648\u0646 \u062F\u06CC\u06AF\u0631 \u067E\u06CC\u0634\u200C\u0646\u0648\u06CC\u0633 \u0646\u06CC\u0633\u062A.");
    return { ok: true };
  }
  if (action === "quiz:start" && !teacher) {
    const expiresAt = await rpc("portal_start_quiz", { p_quiz: id, p_student: profile.id });
    const serverNow = Date.now();
    if (!expiresAt || Date.parse(expiresAt) <= serverNow) throw new PortalError(409, "\u0622\u0632\u0645\u0648\u0646 \u0628\u0633\u062A\u0647 \u0627\u0633\u062A \u06CC\u0627 \u0645\u0647\u0644\u062A \u067E\u0627\u0633\u062E\u200C\u06AF\u0648\u06CC\u06CC \u062A\u0645\u0627\u0645 \u0634\u062F\u0647 \u0627\u0633\u062A.");
    return { expiresAt, serverNow, content: quiz.content.map(({ prompt, options }) => ({ prompt, options })) };
  }
  if (action === "quiz:results" && teacher) {
    return { results: await query("portal_submissions", {
      quiz_id: `eq.${id}`,
      select: "score,submitted_at,portal_profiles(first_name,last_name)",
      order: "submitted_at.desc",
      limit: "100"
    }) };
  }
  if (action === "quiz:submit" && !teacher) {
    const answers = body.answers;
    if (!Array.isArray(answers) || answers.length !== quiz.content.length || answers.some((a) => !Number.isInteger(a) || a < 0 || a > 3)) {
      throw new PortalError(422, "\u0628\u0631\u0627\u06CC \u0647\u0645\u0647\u0654 \u0645\u0631\u062D\u0644\u0647\u200C\u0647\u0627 \u06AF\u0632\u06CC\u0646\u0647 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.");
    }
    const score = quiz.content.reduce((total, question, index) => total + Number(question.correct === answers[index]), 0);
    const saved = await rpc("portal_submit_quiz", { p_quiz: id, p_student: profile.id, p_answers: answers, p_score: score });
    if (saved === null) throw new PortalError(409, "\u0622\u0632\u0645\u0648\u0646 \u0634\u0631\u0648\u0639 \u0646\u0634\u062F\u0647 \u06CC\u0627 \u0645\u0647\u0644\u062A \u067E\u0627\u0633\u062E\u200C\u06AF\u0648\u06CC\u06CC \u062A\u0645\u0627\u0645 \u0634\u062F\u0647 \u0627\u0633\u062A.");
    return { score: saved };
  }
  throw new PortalError(403, "\u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0627\u06CC\u0646 \u0639\u0645\u0644\u06CC\u0627\u062A \u0645\u062C\u0627\u0632 \u0646\u06CC\u0633\u062A.");
}
export {
  quizAction
};
