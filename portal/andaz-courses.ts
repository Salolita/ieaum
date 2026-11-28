export const andazTitle = 'انداز برانداز';
export const andazPath = '/andaz/';
export const andazIntro = 'این نسخهٔ دموی انداز براندازه. درس‌هایی رو که پاس کردی انتخاب کن تا ببینی چند واحد گذروندی، چقدر تا پایان مونده و هر درس چه پیش‌نیازی داره. هر وقت خواستی می‌تونی انتخاب‌هات رو ویرایش کنی.';
export const andazStartLabel = 'برای شروع اینجا کلیک کن';
export const andazCategories = [
  {id:'general', title:'عمومی و معارف', credits:28},
  {id:'basic', title:'پایه', credits:21},
  {id:'specialty', title:'تخصصی الزامی', credits:66},
  {id:'skills', title:'مهارتی و پروژه', credits:9},
  {id:'elective', title:'انتخابی', credits:22},
  {id:'prep', title:'پیش‌دانشگاهی', credits:6},
] as const;

type Category = typeof andazCategories[number]['id'];
type Row = [id: string, title: string, credits: number, prerequisites?: string[], corequisites?: string[], note?: string];
export type Course = {
  id: string;
  slot: string;
  title: string;
  credits: number;
  category: Category;
  prerequisites: string[];
  corequisites: string[];
  note?: string;
};
export type PassedCourses = Record<string, number>;

// Industrial Engineering curriculum for entrants from 1404, edition 1405/02/08.
// The ids start with the printed row number. Alternatives share the same slot.
const rows: Record<Category, Row[]> = {
  general: [
    ['1','فارسی عمومی',3],
    ['2-1','زبان انگلیسی عمومی ترکیبی ۱',1,['24-1'],[],'با قبولی در آزمون تعیین سطح دانشگاه، پیش‌دانشگاهی زبان معاف می‌شود.'],
    ['2-2','زبان انگلیسی عمومی ترکیبی ۲',1,['2-1']],
    ['2-3','زبان انگلیسی عمومی ترکیبی ۳',1,['2-2']],
    ['3','تربیت بدنی',1], ['4','ورزش ۱',1,['3']],
    ['5','انس با قرآن کریم',1,[],[],'طبق چارت باید در نیمسال اول اخذ شود.'],
    ['6','اندیشه‌ها و وصایای حضرت امام',1],
    ['7','علوم و معارف دفاع مقدس و مقاومت',2],
    ['8','اندیشه اسلامی ۱',2],
    ['9a','اندیشه اسلامی ۲',2,['8']], ['9b','انسان در اسلام',2], ['9c','حقوق اجتماعی و سیاسی در اسلام',2],
    ['10a','اخلاق اسلامی',2], ['10b','آیین زندگی',2], ['10c','فلسفه اخلاق',2], ['10d','عرفان عملی اسلام',2],
    ['11a','انقلاب اسلامی ایران',2], ['11b','آشنایی با قانون اساسی',2], ['11c','اندیشه سیاسی امام خمینی',2],
    ['12a','تاریخ تحلیلی صدر اسلام',2], ['12b','تاریخ امامت',2],
    ['13a','تفسیر موضوعی قرآن کریم',2], ['13b','تفسیر موضوعی نهج‌البلاغه',2],
    ['14','تاریخ فرهنگ و تمدن اسلام و ایران',2],
    ['15','دانش خانواده و جمعیت',2,[],[],'طبق چارت باید در سال اول اخذ شود.'],
  ],
  basic: [
    ['16','ریاضی عمومی ۱',3], ['17','ریاضی عمومی ۲',3,['16']],
    ['18','معادلات دیفرانسیل',3,[],['17']], ['19','نظریه احتمال و کاربردها',3,[],['17']],
    ['20','برنامه‌سازی کامپیوتری',3], ['21','کاربست کامپیوتر در محاسبات عددی',2,['16','20']],
    ['22','فیزیک ۱',3], ['23','آزمایشگاه فیزیک ۱',1,[],['22']],
  ],
  specialty: [
    ['25','جبر خطی',3,['16']], ['26','تحقیق در عملیات ۱',3,['16','25']], ['27','تحقیق در عملیات ۲',3,['26']],
    ['28','آمار مهندسی',3,['19']], ['29','طراحی و نقشه‌کشی مهندسی',2], ['30','مبانی مهندسی برق و کارگاه',3,['22']],
    ['31','اقتصاد خرد',2], ['32','اقتصاد کلان',2,['31']], ['33','اقتصاد مهندسی',3,['32']],
    ['34','اصول حسابداری و هزینه‌یابی',3,[],[],'پس از گذراندن ۶۰ واحد'],
    ['35','اصول شبیه‌سازی',3,['20','28']], ['36','برنامه‌ریزی و مدیریت پروژه',3,['26']],
    ['37','کارگاه ماشین‌افزار',1,[],['29']], ['38','روش‌های ساخت و تولید',3,['37']],
    ['39','روش‌های کارسنجی و مدیریت کار',3,['38']], ['40','کنترل کیفیت آماری',3,['28']],
    ['41','کارگاه عمومی جوش، ریخته‌گری و …',1,['29']],
    ['42','اصول و مبانی فناوری اطلاعات',2,['20']], ['43','هوش مصنوعی و تحول دیجیتال',2,['28','42']],
    ['44','زبان تخصصی مهندسی صنایع و سیستم‌ها',2,[],[],'پس از گذراندن ۸۰ واحد'],
    ['45','طراحی و برنامه‌ریزی سیستم‌های خدماتی',3,['52']], ['46','طرح‌ریزی واحدهای صنعتی',3,['29','39']],
    ['47','روش تحقیق و گزارش‌نویسی مهندسی',2,[],[],'ترم ۵'],
    ['48','اصول مدیریت و نظریه سازمان',2,['34'],[],'پس از گذراندن ۵۰ واحد'],
    ['49','مبانی مدیریت انبار و موجودی',3,['26']], ['50','برنامه‌ریزی سیستم‌های تولید',3,['49']],
  ],
  skills: [
    ['51','مهارت‌های نرم شغلی',2], ['52','کارآفرینی',2,[],[],'ترم ۶'],
    ['53','کارآموزی (۱۲۸ ساعت)',2,[],[],'پس از گذراندن ۸۰ واحد'],
    ['54','پروژه',3,[],[],'پس از گذراندن ۱۰۰ واحد'],
  ],
  elective: [
    ['55','مبانی تصمیم‌سازی و تصمیم‌گیری',3,['26']], ['56','طراحی ایجاد صنایع',3,['33','46']],
    ['57','مهندسی عوامل انسانی',3,['39']], ['58','برنامه‌ریزی حمل و نقل',3,['26']],
    ['59','سیستم‌های اطلاعات مدیریت',3,['20']],
    ['60','آشنایی با استانداردهای تخصصی، ملی و بین‌المللی',2,[],[],'پس از گذراندن ۸۰ واحد'],
    ['61','برنامه‌ریزی نگهداری و تعمیرات',3,['19','33']], ['62','مدیریت کیفیت و بهره‌وری',3,['40']],
    ['63','عارضه‌یابی و تحلیل سیستم‌ها',3,['18'],[],'ترم ۶'],
    ['64','اصول فروش و بازاریابی کلاسیک و دیجیتال',2,[],[],'پس از گذراندن ۸۰ واحد'],
    ['65','یک درس از سایر رشته‌های کارشناسی',1,[],[],'بنا به درس اخذشده، ۱ تا ۳ واحد'],
  ],
  prep: [
    ['24-1','زبان پیش‌دانشگاهی ترکیبی',2,[],[],'ترم اول؛ با قبولی در آزمون تعیین سطح دانشگاه، معاف می‌شود.'],
    ['24-2','ریاضی پیش‌دانشگاهی',2,[],[],'ترم اول'],
    ['24-3','فیزیک پیش‌دانشگاهی',2,[],[],'ترم اول'],
  ],
};

export const courses: Course[] = andazCategories.flatMap(({id:category}) => rows[category].map(
  ([id,title,credits,prerequisites = [],corequisites = [],note]) => ({
    id, slot:id.replace(/[a-d]$/, ''), title, credits, category, prerequisites, corequisites, note,
  })));
export const coursesById = new Map(courses.map(course => [course.id,course]));
export const andazDigits = (value: number) => value.toLocaleString('fa-IR');
export function courseRequirements(course: Course, passed: PassedCourses) {
  const parts: string[] = [];
  function related(ids: string[]) {
    return ids.map(id => (Object.hasOwn(passed,id) ? '✓ ' : '') + coursesById.get(id)!.title).join('، ');
  }
  if (course.prerequisites.length) parts.push('پیش‌نیاز ' + related(course.prerequisites));
  if (course.corequisites.length) parts.push('هم‌نیاز ' + related(course.corequisites));
  if (course.note) parts.push(course.note);
  return parts.join(' · ') || 'پیش‌نیاز ثبت‌شده ندارد';
}

export function andazProgress(passed: PassedCourses) {
  const selection = courses.filter(course => Object.hasOwn(passed,course.id));
  const sections = andazCategories.map(({id, credits, title}) => {
    const selected = selection.filter(course => course.category === id)
      .reduce((total,course) => total + passed[course.id], 0);
    return { id, title, selected, counted:Math.min(selected,credits), required:credits };
  });
  const degree = sections.filter(section => section.id !== 'prep');
  const total = degree.reduce((sum,section) => sum + section.required,0);
  const completed = degree.reduce((sum,section) => sum + section.counted,0);
  const electives = selection.filter(course => course.category === 'elective').length;
  return { sections, total, completed, remaining:total - completed, percent:Math.round(completed * 1000 / total) / 10, electives };
}
export function andazSummary(passed: PassedCourses) {
  const result = andazProgress(passed);
  return [
    `${andazDigits(result.completed)} از ${andazDigits(result.total)} واحد دوره گذرانده شده · ${andazDigits(result.percent)}٪`,
    `واحد باقی‌ماندهٔ دوره ${andazDigits(result.remaining)}`,
    ...result.sections.map(({title,selected,counted,required,id}) =>
      `${title} · ${andazDigits(counted)} از ${andazDigits(required)} واحد${selected > counted ? ` (${andazDigits(selected)} واحد ثبت‌شده)` : ''}${id === 'prep' ? ' (جدا از واحدهای دوره)' : ''}`),
    `دروس انتخابی ${andazDigits(result.electives)} درس ثبت شده · حداقل ۸ درس و ۲۲ واحد لازم است.`,
  ].join('\n');
}
