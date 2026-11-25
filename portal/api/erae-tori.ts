import { createHmac } from 'node:crypto';
import { currentProfile, digest, equalSecret, field, limit, PortalError, query, readBody, reply, rpc, setting, studentNumber, supabase, token, tokenPattern, uuidPattern, write } from '../server/portal-store.js';
import { maxImageBytes, maxPages, ranking, readQuestions, timeline, visibleStep, type Player, type RoomState } from '../client/utils/erae-model.js';
import { availableRoom, deletePresentation, editPresentation, expiration, ownedPresentations, retention } from '../server/erae-owner.js';
import { automationReady } from '../server/weekly-worker.js';

interface Room {
  id: string; owner_id: string; join_code: string; admin_digest: string; title: string; caption: string;
  page_count: number; published: boolean; revision: number; body: RoomState;
}
const fail = (status: number, message: string): never => { throw new PortalError(status, message); };
const roomFields = 'id,owner_id,join_code,admin_digest,title,caption,page_count,published,revision,body';
const runId = (room: Room) => room.body.runKey ? digest(room.body.runKey).slice(0, 32) : 'initial';
const roomInfo = (room: Room) => ({
  title: room.title, caption: room.caption, pageCount: room.page_count, studentEntry: true, runId: runId(room),
});
function assertRun(current: Room, loaded: Room, requested?: unknown) {
  if (runId(current) !== runId(loaded) || (requested !== undefined && requested !== runId(current))) {
    return fail(409, 'اجرا بازنشانی شده است. دوباره اقدام کنید.');
  }
}
const playerFor = (room: Room, key: string): Player | undefined => Object.hasOwn(room.body.players, key) ? room.body.players[key] : undefined;

function view(room: Room, player?: Player, admin = false) {
  const steps = timeline(room.page_count, room.body.questions);
  const step = visibleStep(room.body, steps, player);
  const question = step.type === 'question' ? room.body.questions[step.index] : undefined;
  return { ...roomInfo(room), revision: room.revision, step, resumeAt: player?.resumeAt,
    stepPosition: step.type === 'waiting' ? -1 : steps.findIndex((item) => item === step),
    ...(question ? { question: { text: question.text, options: question.options }, answer: player?.answers[step.type === 'question' ? step.index : -1] } : {}),
    ...(step.type === 'ranking' ? { ranking: ranking(room.body), questionCount: room.body.questions.length } : {}),
    ...(admin ? { published: room.published, position: room.body.position, total: steps.length, participants: Object.keys(room.body.players).length,
      questions: room.body.questions, lastShownPage: Math.max(0, ...steps.slice(0, room.body.furthest + 1).map((item) => item.type === 'slide' ? item.page : 0)),
      joinCode: room.join_code, answered: step.type === 'question' ? Object.values(room.body.players).filter((p) => p.answers[step.index] !== undefined).length : null } : {}),
  };
}

async function load(filters: Record<string, string>) {
  const [room] = await query<Room[]>('erae_rooms', { ...availableRoom(), ...filters, select: roomFields, limit: '1' });
  return room ?? fail(404, 'ارائه پیدا نشد یا دیگر در دسترس نیست.');
}

async function update(room: Room, change: (room: Room) => Partial<Room>) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const [saved] = await write<Room[]>('erae_rooms', 'PATCH', { ...change(room), revision: room.revision + 1 }, {
      ...availableRoom(), id: `eq.${room.id}`, revision: `eq.${room.revision}`, select: roomFields,
    });
    if (saved) return saved;
    room = await load({ id: `eq.${room.id}` });
  }
  return fail(409, 'وضعیت ارائه تغییر کرد. دوباره تلاش کنید.');
}

async function image(roomId: string, page: number) {
  const [record] = await query<{ jpeg: string }[]>('erae_images', { room_id: `eq.${roomId}`, page: `eq.${page}`, select: 'jpeg' });
  if (!record?.jpeg.startsWith('\\x')) return fail(404, 'تصویر آماده نیست.');
  return new Response(new Uint8Array(Buffer.from(record.jpeg.slice(2), 'hex')), { headers: {
    'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}

async function upload(request: Request, room: Room, page: number, replaceCover = false, batch = '') {
  if (!Number.isInteger(page) || page < 0 || page > room.page_count) return fail(409, 'اسلاید قابل بارگذاری نیست.');
  if (room.published && !replaceCover && !batch) return reply({ ok: true });
  if (request.headers.get('content-type') !== 'image/jpeg' || Number(request.headers.get('content-length')) > maxImageBytes) {
    return fail(413, 'حجم تصویر بیش از حد است یا قالب آن معتبر نیست.');
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length > maxImageBytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    return fail(400, 'تصویر JPEG معتبر نیست.');
  }
  const endpoint = batch ? 'erae_replacement_images?on_conflict=room_id,batch_id,page' : 'erae_images?on_conflict=room_id,page';
  await supabase(`/rest/v1/${endpoint}&select=page`, 'POST', {
    room_id: room.id, page, jpeg: `\\x${bytes.toString('hex')}`, ...(batch ? { batch_id: batch } : {}),
  }, false, undefined, replaceCover || batch ? 'resolution=merge-duplicates' : 'resolution=ignore-duplicates');
  return reply({ ok: true });
}

export default {
  async fetch(request: Request) {
    try {
      const params = new URL(request.url).searchParams;
      const action = params.get('action');
      const get = request.method === 'GET';
      if (!get && request.method !== 'POST') return fail(405, 'درخواست معتبر نیست.');
      const origin = request.headers.get('origin');
      if (!get && origin !== 'https://ieaum.ir' && origin !== setting('PORTAL_ORIGIN')) return fail(403, 'درخواست معتبر نیست.');
      const key = request.headers.get('authorization')?.match(/^Bearer ([\w-]{32})$/)?.[1] ?? '';
      const roomId = params.get('id') ?? '';
      const joinCode = params.get('s') ?? '';
      const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

      if (joinCode) {
        if (!tokenPattern.test(joinCode)) return fail(404, 'لینک ارائه معتبر نیست.');
        const room = await load({ join_code: `eq.${joinCode}`, published: 'eq.true' });
        if (get && action === 'info') return reply(roomInfo(room));
        if (get && action === 'cover') return image(room.id, 0);
        if (!get && action === 'join') {
          await limit(`erae-join:${ip}`, 200);
          const data = await readBody(request, 2000);
          const name = field(data, 'name').trim();
          if (!name || name.length > 60 || /\p{Cc}/u.test(name)) return fail(422, 'نام را تا ۶۰ نویسه وارد کنید.');
          const number = studentNumber(field(data, 'studentNumber'));
          if (!/^[0-9]{6,20}$/.test(number)) return fail(422, 'شمارهٔ دانشجویی را با ۶ تا ۲۰ رقم وارد کنید.');
          const provided = field(data, 'recovery').trim();
          const studentKey = digest(room.id + ':' + number);
          const requestedAccess = field(data, 'attempt');
          const attempt = tokenPattern.test(requestedAccess) ? requestedAccess : token();
          const access = room.body.runKey
            ? createHmac('sha256', room.body.runKey).update(attempt).digest('base64url').slice(0, 32) : attempt;
          const recovery = tokenPattern.test(provided) ? provided : token();
          const playerKey = digest(access);
          let newPlayer = false;
          const saved = await update(room, (next) => {
            assertRun(next, room, data.runId);
            const previous = Object.entries(next.body.players).find(([, p]) => p.studentKey === studentKey);
            if (previous) {
              const [oldKey, player] = previous;
              if (!tokenPattern.test(provided) || !player.recoveryDigest || !equalSecret(digest(provided), player.recoveryDigest)) {
                return fail(409, 'برای ادامهٔ این نشست، کد بازیابی همان ارائه را وارد کنید.');
              }
              if (oldKey === playerKey) return {};
              if (Object.hasOwn(next.body.players, playerKey)) return fail(409, 'دوباره برای ورود اقدام کنید.');
              if ((player.entries ?? 1) >= 3) return fail(403, 'سقف سه ورود با این شمارهٔ دانشجویی در این ارائه تکمیل شده است.');
              player.entries = (player.entries ?? 1) + 1;
              const checkpoint = typeof data.lastSeen === 'number' && Number.isInteger(data.lastSeen) ? data.lastSeen : player.lastSeen;
              if (checkpoint !== undefined && checkpoint >= player.firstPosition
                && checkpoint < next.body.position && checkpoint <= next.body.furthest) player.resumeAt = checkpoint;
              delete next.body.players[oldKey];
              next.body.players[playerKey] = player;
              newPlayer = false;
            } else {
              if (next.body.position >= timeline(next.page_count, next.body.questions).length - 1) return fail(409, 'ارائه به پایان رسیده است.');
              if (Object.hasOwn(next.body.players, playerKey)) return fail(409, 'دوباره برای ورود اقدام کنید.');
              if (Object.keys(next.body.players).length >= 150) return fail(409, 'ظرفیت جلسه تکمیل است.');
              next.body.players[playerKey] = { name, answers: {}, firstPosition: Math.max(0, next.body.position),
                studentKey, recoveryDigest: digest(recovery), entries: 1, lastSeen: next.body.position };
              newPlayer = true;
            }
            return { body: next.body };
          });
          return reply({ access, ...(newPlayer ? { recovery } : {}), view: view(saved, playerFor(saved, playerKey)) });
        }
        const playerKey = digest(key);
        const player = key && playerFor(room, playerKey);
        if (!player) return fail(401, 'از لینک شرکت‌کنندگان دوباره وارد شوید.');
        if (get && action === 'state') return reply(view(room, player));
        if (get && action === 'image') {
          const step = visibleStep(room.body, timeline(room.page_count, room.body.questions), player);
          if (step.type === 'slide' && String(step.page) === params.get('page')) return image(room.id, step.page);
          return fail(404, 'این اسلاید در حال نمایش نیست.');
        }
        if (!get && action === 'checkpoint') {
          const data = await readBody(request, 2000);
          if (typeof data.position !== 'number' || !Number.isInteger(data.position)) return fail(422, 'مرحله معتبر نیست.');
          const position = data.position;
          await update(room, (next) => {
            const current = playerFor(next, playerKey) ?? fail(401, 'دوباره وارد شوید.');
            const steps = timeline(next.page_count, next.body.questions);
            if (visibleStep(next.body, steps, current) !== steps[position]) return {};
            current.lastSeen = position;
            return { body: next.body };
          });
          return reply({ ok: true });
        }
        if (!get && action === 'resume-next') {
          const data = await readBody(request, 2000);
          const saved = await update(room, (next) => {
            const current = playerFor(next, playerKey) ?? fail(401, 'دوباره وارد شوید.');
            const steps = timeline(next.page_count, next.body.questions);
            const step = visibleStep(next.body, steps, current);
            if (current.resumeAt === undefined || data.position !== current.resumeAt || step !== steps[current.resumeAt]) return {};
            if (step.type === 'question' && current.answers[step.index] === undefined) return fail(409, 'ابتدا به این سؤال پاسخ دهید.');
            current.lastSeen = Math.min(next.body.position, current.resumeAt + 1);
            if (current.resumeAt + 1 >= next.body.position) delete current.resumeAt;
            else current.resumeAt++;
            return { body: next.body };
          });
          return reply(view(saved, playerFor(saved, playerKey)));
        }
        if (!get && action === 'answer') {
          const data = await readBody(request, 2000);
          const saved = await update(room, (next) => {
            const current = playerFor(next, playerKey) ?? fail(401, 'دوباره وارد شوید.');
            const step = visibleStep(next.body, timeline(next.page_count, next.body.questions), current);
            if (step.type !== 'question' || step.index !== data.index) return fail(409, 'این سؤال در حال نمایش نیست.');
            const choice = data.choice;
            if (typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice >= next.body.questions[step.index].options.length) return fail(422, 'گزینه معتبر نیست.');
            if (current.answers[step.index] !== undefined) return fail(409, 'این پاسخ قبلاً ثبت شده است.');
            current.answers[step.index] = choice;
            current.lastSeen = timeline(next.page_count, next.body.questions).findIndex((item) => item.type === 'question' && item.index === step.index);
            return { body: next.body };
          });
          return reply(view(saved, playerFor(saved, playerKey)));
        }
        return fail(404, 'این بخش در دسترس نیست.');
      }

      const profile = await currentProfile(request) ?? fail(401, 'ابتدا وارد حساب IEAUM شوید.');
      if (get && action === 'list') {
        const [rooms, autoDelete] = await Promise.all([ownedPresentations(profile.id), automationReady()]);
        return reply({ rooms, autoDelete });
      }
      if (!get && action === 'create') {
        await limit(`erae-create:${profile.id}`, 12);
        const data = await readBody(request, 4000);
        const title = field(data, 'title').trim();
        const caption = field(data, 'caption').trim();
        const pageCount = data.pageCount;
        if (!title || title.length > 120 || caption.length > 800 || typeof pageCount !== 'number' || !Number.isInteger(pageCount) || pageCount < 1 || pageCount > maxPages) {
          return fail(422, 'عنوان، کپشن و تعداد اسلایدها را بررسی کنید.');
        }
        const days = retention(data.retention);
        if (days && !await automationReady()) return fail(503, 'حذف خودکار هنوز فعال نشده است. می‌توانید ارائه را بدون زمان حذف بسازید.');
        const code = token();
        const id = await rpc<string | null>('erae_create_room', { p_owner: profile.id, p_title: title, p_caption: caption,
          p_page_count: pageCount, p_join: token(), p_admin: digest(code), p_days: days });
        if (!id) return fail(409, 'حداکثر ۳ ارائه می‌توانید داشته باشید. برای ارائهٔ جدید یکی را حذف کنید.');
        return reply({ id, code }, 201);
      }
      if (!uuidPattern.test(roomId)) return fail(404, 'ارائه پیدا نشد.');
      const room = await load({ id: `eq.${roomId}`, owner_id: `eq.${profile.id}` });
      if (!get && action === 'delete') return reply({ ok: Boolean((await deletePresentation(profile.id, roomId)).length) });
      if (!get && action === 'metadata') {
        const data = await readBody(request, 4000);
        const title = field(data, 'title').trim();
        const caption = field(data, 'caption').trim();
        if (!title || title.length > 120 || caption.length > 800) return fail(422, 'عنوان و کپشن را بررسی کنید.');
        const expires = expiration(data.retention);
        if (expires && !await automationReady()) return fail(503, 'حذف خودکار هنوز فعال نشده است.');
        const saved = await editPresentation(profile.id, roomId, { title, caption,
          ...(Object.hasOwn(data, 'retention') ? { expires_at: expires } : {}) });
        if (!saved.length) return fail(404, 'ارائه دیگر در دسترس نیست.');
        return reply({ ok: true });
      }
      if (!get && action === 'cover-update') return upload(request, room, 0, true);
      if (!get && (action === 'stage-slide' || action === 'replace-slides')) {
        const batch = params.get('batch') ?? '';
        if (!uuidPattern.test(batch) || room.body.furthest >= 0) return fail(409, 'فایل ارائه فقط پیش از شروع جلسه قابل جایگزینی است.');
        if (action === 'stage-slide') {
          const page = Number(params.get('page'));
          if (page < 1) return fail(422, 'شمارهٔ اسلاید معتبر نیست.');
          await limit(`erae-stage:${profile.id}`, 180);
          return upload(request, room, page, false, batch);
        }
        if (!await rpc<boolean>('erae_replace_slides', { p_room: room.id, p_owner: profile.id, p_batch: batch, p_count: room.page_count })) {
          return fail(409, 'جایگزینی اسلایدها کامل نشد. فایل را دوباره انتخاب کنید.');
        }
        return reply({ ok: true });
      }
      if (!get && action === 'delete-draft' && !room.published) {
        await write('erae_rooms', 'DELETE', undefined, { id: `eq.${room.id}`, published: 'eq.false', owner_id: `eq.${profile.id}` });
        return reply({ ok: true });
      }
      if (!get && action === 'new-code') {
        await limit(`erae-code:${profile.id}`, 15);
        const code = token();
        await update(room, () => ({ admin_digest: digest(code) }));
        return reply({ code });
      }
      const isAdmin = (row: Room) => {
        if (key && !equalSecret(digest(key), row.admin_digest)) return fail(401, 'کد مدیر معتبر نیست.');
      };
      isAdmin(room);
      if (get && action === 'state') return reply(view(room, undefined, true));
      if (!get && action === 'reset') {
        const data = await readBody(request, 2000);
        if (typeof data.runId !== 'string') return fail(422, 'برای بازنشانی، وضعیت ارائه را دوباره باز کنید.');
        if (!room.published) return fail(409, 'ابتدا ارائه را آماده کنید.');
        const runKey = token();
        const saved = await update(room, (next) => {
          isAdmin(next);
          assertRun(next, room, data.runId);
          return { body: { position: -1, furthest: -1, players: {}, questions: next.body.questions, runKey } };
        });
        return reply(view(saved, undefined, true));
      }
      if (get && action === 'image') {
        const step = timeline(room.page_count, room.body.questions)[room.body.position];
        if (step?.type === 'slide' && String(step.page) === params.get('page')) return image(room.id, step.page);
        return fail(404, 'این اسلاید در حال نمایش نیست.');
      }
      if (!get && action === 'upload') return upload(request, room, Number(params.get('page') ?? 'NaN'));
      if (!get && action === 'publish') {
        const data = await readBody(request, 70_000);
        let questions;
        try { questions = readQuestions(data.questions, room.page_count).sort((a, b) => a.after - b.after); }
        catch (error) { return fail(422, (error as Error).message); }
        const pages = await query<{ page: number }[]>('erae_images', { room_id: `eq.${room.id}`, select: 'page' });
        if (pages.length !== room.page_count + 1) return fail(409, 'همهٔ اسلایدها و جلد هنوز بارگذاری نشده‌اند.');
        const saved = await update(room, (next) => {
          isAdmin(next);
          if (next.published) return {};
          return { published: true, body: { ...next.body, questions } };
        });
        return reply({ joinCode: saved.join_code });
      }
      if (!get && action === 'questions') {
        const data = await readBody(request, 70_000);
        let questions;
        try { questions = readQuestions(data.questions, room.page_count).sort((a, b) => a.after - b.after); }
        catch (error) { return fail(422, (error as Error).message); }
        const saved = await update(room, (next) => {
          isAdmin(next);
          assertRun(next, room, data.runId);
          const steps = timeline(next.page_count, next.body.questions);
          const shown = Math.max(0, ...steps.slice(0, next.body.furthest + 1).map((step) => step.type === 'slide' ? step.page : 0));
          const fixed = next.body.questions.filter((question) => question.after <= shown);
          if (!next.published || questions.some((question) => question.after <= shown) || questions.length + fixed.length > 20) {
            return fail(409, 'فقط سؤال‌های بعد از اسلایدهای نمایش‌داده‌نشده را می‌توان ویرایش کرد.');
          }
          return { body: { ...next.body, questions: [...fixed, ...questions] } };
        });
        return reply(view(saved, undefined, true));
      }
      if (!get && action === 'move') {
        const data = await readBody(request, 2000);
        const saved = await update(room, (next) => {
          isAdmin(next);
          assertRun(next, room, data.runId);
          if (!next.published || data.position !== next.body.position || (data.delta !== -1 && data.delta !== 1)) return fail(409, 'وضعیت جلسه تغییر کرده است.');
          const position = Math.max(-1, Math.min(timeline(next.page_count, next.body.questions).length - 1, next.body.position + data.delta));
          return { body: { ...next.body, position, furthest: Math.max(position, next.body.furthest) } };
        });
        return reply(view(saved, undefined, true));
      }
      return fail(404, 'این بخش در دسترس نیست.');
    } catch (error) {
      return error instanceof PortalError ? reply({ error: error.message }, error.status) : reply({ error: 'ارتباط با ارائه‌طوری برقرار نشد.' }, 500);
    }
  },
};
