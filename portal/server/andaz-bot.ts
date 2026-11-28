import {andazCategories, andazDigits, andazIntro, andazStartLabel, andazSummary, andazTitle, courseRequirements, courses, coursesById} from '../andaz-courses.js';
import {type ReviewCallback} from './account-review.js';
import {accountForChat} from './account-actions.js';
import {readAndaz, setAndazCourse} from './andaz-store.js';
import {limit} from './portal-store.js';
import {requireMembership} from './required-channels.js';
import {telegram} from './telegram-delivery.js';

type Button = {text: string; callback_data: string};
const button = (text: string, action: string): Button => ({text,callback_data:'andaz:' + action});
const startButtons = [[button(andazStartLabel,'start')]];
const pageSize = 5;

export async function openAndaz(chat: string) {
  await telegram('sendMessage', {
    chat_id:chat, text:andazIntro, reply_markup:{inline_keyboard:startButtons},
  });
}

export async function andazCallback(callback: ReviewCallback) {
  const message = callback.message;
  const chatId = message?.chat?.id;
  if (message?.chat?.type !== 'private' || !Number.isSafeInteger(chatId) || chatId !== callback.from?.id || typeof callback.id !== 'string') return;
  const chat = String(chatId);
  await telegram('answerCallbackQuery',{callback_query_id:callback.id}).catch(() => {});
  const [,action,value,number] = String(callback.data).split(':');
  const render = async (text: string, keyboard: Button[][]) => {
    const fields = {chat_id:chat,text,reply_markup:{inline_keyboard:keyboard}};
    if (message.message_id) {
      await telegram('editMessageText',{...fields,message_id:message.message_id}).catch(() => {});
    } else await telegram('sendMessage',fields);
  };
  if (action === 'cancel') return render(andazIntro,startButtons);

  if (!await requireMembership(chat,false)) return;
  const account = await accountForChat(chat);
  if (!account?.active || account.role !== 'student') {
    await telegram('sendMessage',{chat_id:chat,text:'برای استفاده از انداز برانداز، یک حساب دانشجویی فعال به همین تلگرام متصل کن.'});
    return;
  }
  await limit('andaz:telegram:' + chat,200);
  let categoryIndex = Number(value);
  let page = Number(number ?? 0);
  const course = coursesById.get(value);
  if (action === 'set' || action === 'units') {
    if (!course || (action === 'units' && course.id !== '65')) return;
    categoryIndex = andazCategories.findIndex(category => category.id === course.category);
    page = Math.floor(courses.filter(item => item.category === course.category).findIndex(item => item.id === course.id) / pageSize);
    if (action === 'set') await setAndazCourse(account.id,course.id,Number(number));
  }
  const passed = await readAndaz(account.id);
  if (action === 'start') {
    await render(andazTitle + '\n\n' + andazSummary(passed) + '\n\nبرای انتخاب یا ویرایش درس‌ها، یک دسته رو باز کن.',
      [...andazCategories.map((category,index) => [button(category.title,'list:' + index + ':0')]),
        [button('لغو و بازگشت','cancel')]]);
    return;
  }
  const category = andazCategories[categoryIndex];
  if (!category || !Number.isInteger(page) || page < 0) return;
  if (action === 'units') {
    await render('درس انتخابی از رشتهٔ دیگر چند واحد بود؟', [
      [1,2,3].map(credits => button(andazDigits(credits) + ' واحد','set:65:' + credits)),
      [button('بازگشت به درس‌ها','list:' + categoryIndex + ':' + page)],
    ]);
    return;
  }
  if (action !== 'list' && action !== 'set') return;
  const section = courses.filter(course => course.category === category.id);
  const last = Math.ceil(section.length / pageSize) - 1;
  if (page > last) return;
  const shown = section.slice(page * pageSize,(page + 1) * pageSize);
  const keyboard = shown.map(course => {
    const selected = Object.hasOwn(passed,course.id);
    return [button((selected ? '✅ ' : '▫️ ') + course.title,
      course.id === '65' && !selected ? 'units:65' : 'set:' + course.id + ':' + (selected ? 0 : course.credits))];
  });
  const navigation: Button[] = [];
  if (page > 0) navigation.push(button('قبلی','list:' + categoryIndex + ':' + (page - 1)));
  if (page < last) navigation.push(button('بعدی','list:' + categoryIndex + ':' + (page + 1)));
  if (navigation.length) keyboard.push(navigation);
  keyboard.push([button('پیشرفت و دسته‌های درس','start')]);
  const description = shown.map(course => {
    const units = passed[course.id] ?? course.credits;
    return `${course.title} · ${course.id === '65' && !passed[course.id] ? '۱ تا ۳' : andazDigits(units)} واحد\n${courseRequirements(course,passed)}`;
  });
  await render(`${category.title} · صفحهٔ ${andazDigits(page + 1)} از ${andazDigits(last + 1)}\n\n${description.join('\n\n')}`,keyboard);
}
