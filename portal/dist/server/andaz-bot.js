import { andazCategories, andazDigits, andazIntro, andazStartLabel, andazSummary, andazTitle, courseRequirements, courses, coursesById } from "../andaz-courses.js";
import { accountForChat } from "./account-actions.js";
import { readAndaz, setAndazCourse } from "./andaz-store.js";
import { limit } from "./portal-store.js";
import { requireMembership } from "./required-channels.js";
import { telegram } from "./telegram-delivery.js";
const button = (text, action) => ({ text, callback_data: "andaz:" + action });
const pageSize = 5;
async function openAndaz(chat) {
  await telegram("sendMessage", {
    chat_id: chat,
    text: andazIntro,
    reply_markup: { inline_keyboard: [[button(andazStartLabel, "start")]] }
  });
}
async function andazCallback(callback) {
  const message = callback.message;
  const chatId = message?.chat?.id;
  if (message?.chat?.type !== "private" || !Number.isSafeInteger(chatId) || chatId !== callback.from?.id || typeof callback.id !== "string") return;
  const chat = String(chatId);
  await telegram("answerCallbackQuery", { callback_query_id: callback.id }).catch(() => {
  });
  if (!await requireMembership(chat, false)) return;
  const account = await accountForChat(chat);
  if (!account?.active || account.role !== "student") {
    await telegram("sendMessage", { chat_id: chat, text: "\u0628\u0631\u0627\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0627\u0632 \u0627\u0646\u062F\u0627\u0632 \u0628\u0631\u0627\u0646\u062F\u0627\u0632\u060C \u06CC\u06A9 \u062D\u0633\u0627\u0628 \u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC \u0641\u0639\u0627\u0644 \u0628\u0647 \u0647\u0645\u06CC\u0646 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u062A\u0635\u0644 \u06A9\u0646." });
    return;
  }
  await limit("andaz:telegram:" + chat, 200);
  const [, action, value, number] = String(callback.data).split(":");
  let categoryIndex = Number(value);
  let page = Number(number ?? 0);
  const course = coursesById.get(value);
  if (action === "set" || action === "units") {
    if (!course || action === "units" && course.id !== "65") return;
    categoryIndex = andazCategories.findIndex((category2) => category2.id === course.category);
    page = Math.floor(courses.filter((item) => item.category === course.category).findIndex((item) => item.id === course.id) / pageSize);
    if (action === "set") await setAndazCourse(account.id, course.id, Number(number));
  }
  const passed = await readAndaz(account.id);
  const render = async (text, keyboard2) => {
    const fields = { chat_id: chat, text, reply_markup: { inline_keyboard: keyboard2 } };
    if (message.message_id) {
      await telegram("editMessageText", { ...fields, message_id: message.message_id }).catch(() => {
      });
    } else await telegram("sendMessage", fields);
  };
  if (action === "start") {
    await render(
      andazTitle + "\n\n" + andazSummary(passed) + "\n\n\u0628\u0631\u0627\u06CC \u0627\u0646\u062A\u062E\u0627\u0628 \u06CC\u0627 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u062F\u0631\u0633\u200C\u0647\u0627\u060C \u06CC\u06A9 \u062F\u0633\u062A\u0647 \u0631\u0648 \u0628\u0627\u0632 \u06A9\u0646.",
      andazCategories.map((category2, index) => [button(category2.title, "list:" + index + ":0")])
    );
    return;
  }
  const category = andazCategories[categoryIndex];
  if (!category || !Number.isInteger(page) || page < 0) return;
  if (action === "units") {
    await render("\u062F\u0631\u0633 \u0627\u0646\u062A\u062E\u0627\u0628\u06CC \u0627\u0632 \u0631\u0634\u062A\u0647\u0654 \u062F\u06CC\u06AF\u0631 \u0686\u0646\u062F \u0648\u0627\u062D\u062F \u0628\u0648\u062F\u061F", [
      [1, 2, 3].map((credits) => button(andazDigits(credits) + " \u0648\u0627\u062D\u062F", "set:65:" + credits)),
      [button("\u0628\u0627\u0632\u06AF\u0634\u062A \u0628\u0647 \u062F\u0631\u0633\u200C\u0647\u0627", "list:" + categoryIndex + ":" + page)]
    ]);
    return;
  }
  if (action !== "list" && action !== "set") return;
  const section = courses.filter((course2) => course2.category === category.id);
  const last = Math.ceil(section.length / pageSize) - 1;
  if (page > last) return;
  const shown = section.slice(page * pageSize, (page + 1) * pageSize);
  const keyboard = shown.map((course2) => {
    const selected = Object.hasOwn(passed, course2.id);
    return [button(
      (selected ? "\u2705 " : "\u25AB\uFE0F ") + course2.title,
      course2.id === "65" && !selected ? "units:65" : "set:" + course2.id + ":" + (selected ? 0 : course2.credits)
    )];
  });
  const navigation = [];
  if (page > 0) navigation.push(button("\u0642\u0628\u0644\u06CC", "list:" + categoryIndex + ":" + (page - 1)));
  if (page < last) navigation.push(button("\u0628\u0639\u062F\u06CC", "list:" + categoryIndex + ":" + (page + 1)));
  if (navigation.length) keyboard.push(navigation);
  keyboard.push([button("\u067E\u06CC\u0634\u0631\u0641\u062A \u0648 \u062F\u0633\u062A\u0647\u200C\u0647\u0627\u06CC \u062F\u0631\u0633", "start")]);
  const description = shown.map((course2) => {
    const units = passed[course2.id] ?? course2.credits;
    return `${course2.title} \xB7 ${course2.id === "65" && !passed[course2.id] ? "\u06F1 \u062A\u0627 \u06F3" : andazDigits(units)} \u0648\u0627\u062D\u062F
${courseRequirements(course2, passed)}`;
  });
  await render(`${category.title} \xB7 \u0635\u0641\u062D\u0647\u0654 ${andazDigits(page + 1)} \u0627\u0632 ${andazDigits(last + 1)}

${description.join("\n\n")}`, keyboard);
}
export {
  andazCallback,
  openAndaz
};
