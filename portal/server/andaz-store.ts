import {coursesById, type PassedCourses} from '../andaz-courses.js';
import {PortalError, query, supabase, write} from './portal-store.js';

const table = 'portal_andaz_passed_courses';

export async function readAndaz(profileId: string): Promise<PassedCourses> {
  const rows = await query<{course_id: string; credits: number}[]>(table, {
    profile_id:'eq.' + profileId, select:'course_id,credits',
  });
  return Object.fromEntries(rows.filter(row => coursesById.has(row.course_id)).map(row => [row.course_id,row.credits]));
}

export async function setAndazCourse(profileId: string, id: string, credits: unknown) {
  const course = coursesById.get(id);
  if (!course || (credits !== 0 && (id === '65' ? ![1,2,3].includes(credits as number) : credits !== course.credits))) {
    throw new PortalError(422, 'درس یا تعداد واحد معتبر نیست.');
  }
  if (credits === 0) {
    await write(table,'DELETE',undefined,{profile_id:'eq.' + profileId, slot:'eq.' + course.slot, course_id:'eq.' + course.id});
  } else {
    await supabase('/rest/v1/' + table + '?on_conflict=profile_id,slot','POST',
      {profile_id:profileId,slot:course.slot,course_id:course.id,credits},false,undefined,'resolution=merge-duplicates');
  }
}
