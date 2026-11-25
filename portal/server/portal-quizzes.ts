import { field, limit, PortalError, query, rpc, uuidPattern, write, type Profile } from './portal-store.js';
import { recordDeparture } from './presence.js';
import { panelButton, telegram } from './telegram-delivery.js';
import { endOfQuizDate, formatQuizTime, quizDate } from '../client/utils/quiz-time.js';

interface Question { prompt: string; options: string[]; correct: number }
interface Quiz {
  id: string; title: string; published: boolean; content: Question[]; audience: string[];
  course_name: string | null; deadline_at: string | null; duration_minutes: number | null;
}
interface Student { username: string; first_name: string; last_name: string; telegram_id?: string | null }
const quizFields = 'id,title,published,content,audience,course_name,deadline_at,duration_minutes';

const usernamePattern = /^[a-z0-9_][a-z0-9_.-]{2,31}$/;

async function activeStudents(usernames: string[], withTelegram = false) {
  if (!usernames.length) return [];
  return query<Student[]>('portal_profiles', {
    username: `in.(${usernames.map((username) => `"${username}"`).join(',')})`,
    role: 'eq.student', active: 'eq.true', select: 'username,first_name,last_name' + (withTelegram ? ',telegram_id' : ''),
  });
}

async function publishedNotice(quiz: Quiz, teacher: Profile) {
  const students = await activeStudents(quiz.audience, true);
  const contacts = students.flatMap((student) => student.telegram_id ? [student.telegram_id] : []);
  const course = quiz.course_name || teacher.course_name || 'نامرالب';
  const dueDate = quiz.deadline_at && new Date(Date.parse(quiz.deadline_at) - 1000);
  const deadline = dueDate ? quizDate(dueDate) === quizDate()
    ? 'تا پایان امروز به وقت تهران فرصت دارید.'
    : `مهلت پاسخ‌گویی تا ${formatQuizTime(dueDate.toISOString())} به وقت تهران است.`
    : 'برای پاسخ‌گویی وارد پنل شوید.';
  const text = [
    `دانشجوی گرامی، استاد ${teacher.first_name} ${teacher.last_name} برای شما در درس «${course}» کوییز «${quiz.title}» تعریف کرده است.`,
    `تعداد سؤال‌ها: ${quiz.content.length.toLocaleString('fa-IR')}`,
    deadline,
    quiz.duration_minutes ? `پس از شروع، ${quiz.duration_minutes.toLocaleString('fa-IR')} دقیقه برای پاسخ‌گویی دارید، تا سقف مهلت آزمون.` : '',
  ].filter(Boolean).join('\n');
  let sent = 0;
  // Batches fit Telegram's global send limit and avoid bursts from one publish.
  for (let index = 0; index < contacts.length; index += 25) {
    if (index) await new Promise((resolve) => setTimeout(resolve, 1050));
    const deliveries = await Promise.allSettled(contacts.slice(index, index + 25).map((chat_id) =>
      telegram('sendMessage', { chat_id, text, reply_markup: panelButton('باز کردن آزمون‌ها') })));
    sent += deliveries.filter(({ status }) => status === 'fulfilled').length;
  }
  return { sent, unlinked: students.length - contacts.length, failed: contacts.length - sent, inactive: quiz.audience.length - students.length };
}

export async function quizAction(action: string, body: Record<string, unknown>, profile: Profile) {
  const teacher = profile.role === 'teacher';
  const own = { owner_id: `eq.${profile.id}` };
  const visible = { published: 'eq.true', audience: `cs.{"${profile.username}"}` };
  if (action === 'quiz:departure' && !teacher) {
    const id = field(body, 'id');
    if (!uuidPattern.test(id)) throw new PortalError(422, 'آزمون معتبر نیست.');
    await limit('quiz-departure:' + profile.id, 40);
    const [quiz] = await query<Pick<Quiz, 'title' | 'deadline_at' | 'duration_minutes'>[]>('portal_quizzes',
      { id: 'eq.' + id, ...visible, select: 'title,deadline_at,duration_minutes', limit: '1' });
    if (!quiz || (quiz.deadline_at && Date.parse(quiz.deadline_at) <= Date.now())) return { ok: true };
    const [submitted, starts] = await Promise.all([
      query<unknown[]>('portal_submissions', { quiz_id: 'eq.' + id, student_id: 'eq.' + profile.id, select: 'quiz_id', limit: '1' }),
      quiz.duration_minutes ? query<unknown[]>('portal_quiz_starts', {
        quiz_id: 'eq.' + id, student_id: 'eq.' + profile.id, expires_at: 'gt.' + new Date().toISOString(), select: 'quiz_id', limit: '1',
      }) : [],
    ]);
    if (!submitted.length && (!quiz.duration_minutes || starts.length)) {
      await recordDeparture('quiz', id, profile.id, profile.first_name + ' ' + profile.last_name, quiz.title).catch(() => {});
    }
    return { ok: true };
  }
  await limit(`quiz:${profile.id}`, 100);
  if (action === 'quiz:students' && teacher) {
    const term = field(body, 'search').trim().toLowerCase();
    // PostgREST treats punctuation in an OR filter as syntax.
    if (term.length > 80 || /[^\p{L}\p{M}\p{N} ._\u200c-]/u.test(term)) return { students: [], more: false };
    const offset = Number(body.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new PortalError(422, 'صفحهٔ فهرست معتبر نیست.');
    const match = `ilike.*${term.replaceAll('_', '\\_')}*`;
    const students = await query<Student[]>('portal_profiles', {
      role: 'eq.student', active: 'eq.true', select: 'username,first_name,last_name', order: 'username.asc',
      ...(term ? { or: `(username.${match},first_name.${match},last_name.${match})` } : {}),
      limit: '31', offset: String(offset),
    });
    return { students: students.slice(0, 30), more: students.length > 30 };
  }
  if (action === 'quiz:student-lookup' && teacher) {
    const username = field(body, 'username').trim().toLowerCase();
    if (!usernamePattern.test(username)) throw new PortalError(422, 'نام کاربری دقیق دانشجو را وارد کنید.');
    const [student] = await activeStudents([username]);
    if (!student) throw new PortalError(404, 'دانشجوی فعالی با این نام کاربری پیدا نشد.');
    return { student };
  }
  if (action === 'quiz:list') {
    const quizzes = await query<Quiz[]>('portal_quizzes', {
      ...(teacher ? own : visible), select: quizFields,
      order: 'created_at.desc', limit: '50',
    });
    const results = teacher ? [] : await query('portal_submissions', { student_id: `eq.${profile.id}`, select: 'quiz_id,score' });
    if (teacher) return { quizzes, results, courseName: profile.course_name ?? '' };
    const starts = quizzes.some((quiz) => quiz.duration_minutes) ? await query<{ quiz_id: string; expires_at: string }[]>('portal_quiz_starts', {
      student_id: `eq.${profile.id}`, select: 'quiz_id,expires_at', quiz_id: `in.(${quizzes.map(({ id }) => id).join(',')})`,
    }) : [];
    const now = Date.now();
    return { quizzes: quizzes.map(({ audience: _audience, content, ...quiz }) => {
      const expiresAt = starts.find((start) => start.quiz_id === quiz.id)?.expires_at ?? null;
      const available = (!quiz.deadline_at || Date.parse(quiz.deadline_at) > now)
        && (!quiz.duration_minutes || (expiresAt && Date.parse(expiresAt) > now));
      return { ...quiz, expiresAt, questionCount: content.length,
        content: available ? content.map(({ prompt, options }) => ({ prompt, options })) : [] };
    }), results, serverNow: now };
  }
  if ((action === 'quiz:create' || action === 'quiz:update') && teacher) {
    const title = field(body, 'title').trim();
    const course_name = field(body, 'courseName').trim() || profile.course_name;
    if (!course_name || course_name.length > 120 || /[\p{Cc}\p{Cf}]/u.test(course_name.replaceAll('\u200c', ''))) {
      throw new PortalError(422, 'نام درس را وارد کنید.');
    }
    const date = field(body, 'dueDate');
    const deadline_at = date ? endOfQuizDate(date) : null;
    if (date && (!deadline_at || Date.parse(deadline_at) <= Date.now())) throw new PortalError(422, 'مهلت آزمون باید در آینده باشد.');
    const duration = field(body, 'durationMinutes');
    if (duration && (!/^\d{1,3}$/.test(duration) || Number(duration) < 1 || Number(duration) > 480)) {
      throw new PortalError(422, 'مدت آزمون باید بین ۱ تا ۴۸۰ دقیقه باشد.');
    }
    const duration_minutes = duration ? Number(duration) : null;
    const questions = body.questions as Question[];
    const audience = [...new Set(field(body, 'audience').toLowerCase().split(/[\s,،]+/).filter(Boolean))];
    if (audience.length < 1 || audience.length > 100 || audience.some((name) => !usernamePattern.test(name))) {
      throw new PortalError(422, 'نام کاربری ۱ تا ۱۰۰ دانشجو را وارد کنید.');
    }
    const found = new Set((await activeStudents(audience)).map(({ username }) => username));
    const missing = audience.filter((username) => !found.has(username));
    if (missing.length) throw new PortalError(422, `حساب دانشجویی فعال پیدا نشد: ${missing.join(', ')}`);
    if (!title || title.length > 120 || !Array.isArray(questions) || questions.length < 1 || questions.length > 15 ||
      questions.some((q) => !q || typeof q.prompt !== 'string' || !q.prompt.trim() || q.prompt.length > 1000
        || !Array.isArray(q.options) || q.options.length !== 4
        || q.options.some((option) => typeof option !== 'string' || !option.trim() || option.length > 200)
        || new Set(q.options.map((option) => option.trim())).size !== 4
        || !Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3)) {
      throw new PortalError(422, 'عنوان، مراحل و چهار گزینهٔ متفاوت برای هر مرحله را وارد کنید.');
    }
    const content = questions.map(({ prompt, options, correct }) => ({ prompt, options, correct }));
    const draft = { title, audience, content, course_name, deadline_at, duration_minutes };
    if (action === 'quiz:update') {
      const id = field(body, 'id');
      if (!uuidPattern.test(id)) throw new PortalError(422, 'آزمون معتبر نیست.');
      const updated = await write<{ id: string }[]>('portal_quizzes', 'PATCH', draft, {
        id: `eq.${id}`, ...own, published: 'eq.false', select: 'id',
      });
      if (!updated.length) throw new PortalError(409, 'فقط پیش‌نویس‌های خودتان قابل ویرایش‌اند.');
    } else {
      await write('portal_quizzes', 'POST', { owner_id: profile.id, ...draft });
    }
    return { ok: true };
  }

  const id = field(body, 'id');
  if (!uuidPattern.test(id)) throw new PortalError(422, 'آزمون معتبر نیست.');
  const [quiz] = await query<Quiz[]>('portal_quizzes', { id: `eq.${id}`, ...(teacher ? own : visible), select: quizFields });
  if (!quiz) throw new PortalError(404, 'آزمون در دسترس نیست.');
  if (action === 'quiz:publish' && teacher) {
    if (quiz.deadline_at && Date.parse(quiz.deadline_at) <= Date.now()) throw new PortalError(422, 'مهلت آزمون گذشته است. ابتدا پیش‌نویس را ویرایش کنید.');
    const [published] = await write<Quiz[]>('portal_quizzes', 'PATCH', { published: true }, {
      id: `eq.${id}`, ...own, published: 'eq.false', select: quizFields,
    });
    if (!published) return { ok: true };
    return { ok: true, delivery: await publishedNotice(published, profile).catch(() => null) };
  }
  if (action === 'quiz:start' && !teacher) {
    const expiresAt = await rpc<string | null>('portal_start_quiz', { p_quiz: id, p_student: profile.id });
    const serverNow = Date.now();
    if (!expiresAt || Date.parse(expiresAt) <= serverNow) throw new PortalError(409, 'آزمون بسته است یا مهلت پاسخ‌گویی تمام شده است.');
    return { expiresAt, serverNow, content: quiz.content.map(({ prompt, options }) => ({ prompt, options })) };
  }
  if (action === 'quiz:results' && teacher) {
    return { results: await query('portal_submissions', {
      quiz_id: `eq.${id}`, select: 'score,submitted_at,portal_profiles(first_name,last_name)', order: 'submitted_at.desc', limit: '100',
    }) };
  }
  if (action === 'quiz:submit' && !teacher) {
    const answers = body.answers as number[];
    if (!Array.isArray(answers) || answers.length !== quiz.content.length || answers.some((a) => !Number.isInteger(a) || a < 0 || a > 3)) {
      throw new PortalError(422, 'برای همهٔ مرحله‌ها گزینه انتخاب کنید.');
    }
    const score = quiz.content.reduce((total, question, index) => total + Number(question.correct === answers[index]), 0);
    const saved = await rpc<number | null>('portal_submit_quiz', { p_quiz: id, p_student: profile.id, p_answers: answers, p_score: score });
    if (saved === null) throw new PortalError(409, 'آزمون شروع نشده یا مهلت پاسخ‌گویی تمام شده است.');
    return { score: saved };
  }
  throw new PortalError(403, 'دسترسی به این عملیات مجاز نیست.');
}
