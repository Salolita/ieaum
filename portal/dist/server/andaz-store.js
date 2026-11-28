import { coursesById } from "../andaz-courses.js";
import { PortalError, query, supabase, write } from "./portal-store.js";
const table = "portal_andaz_passed_courses";
async function readAndaz(profileId) {
  const rows = await query(table, {
    profile_id: "eq." + profileId,
    select: "course_id,credits"
  });
  return Object.fromEntries(rows.filter((row) => coursesById.has(row.course_id)).map((row) => [row.course_id, row.credits]));
}
async function setAndazCourse(profileId, id, credits) {
  const course = coursesById.get(id);
  if (!course || credits !== 0 && (id === "65" ? ![1, 2, 3].includes(credits) : credits !== course.credits)) {
    throw new PortalError(422, "\u062F\u0631\u0633 \u06CC\u0627 \u062A\u0639\u062F\u0627\u062F \u0648\u0627\u062D\u062F \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  }
  if (credits === 0) {
    await write(table, "DELETE", void 0, { profile_id: "eq." + profileId, slot: "eq." + course.slot, course_id: "eq." + course.id });
  } else {
    await supabase(
      "/rest/v1/" + table + "?on_conflict=profile_id,slot",
      "POST",
      { profile_id: profileId, slot: course.slot, course_id: course.id, credits },
      false,
      void 0,
      "resolution=merge-duplicates"
    );
  }
}
export {
  readAndaz,
  setAndazCourse
};
