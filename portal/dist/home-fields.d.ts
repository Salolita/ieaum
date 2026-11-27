export declare const homeFields: {
    readonly heroLabel: 'معرفی بالای عنوان';
    readonly heroTitle: 'عنوان اصلی';
    readonly heroSubtitle: 'زیرعنوان اصلی';
    readonly heroIntro: 'متن معرفی';
    readonly entryGuide: 'راهنمای ورود';
    readonly servicesTitle: 'عنوان سرویس‌ها';
    readonly solverTitle: 'عنوان نامرالب';
    readonly solverText: 'معرفی نامرالب';
    readonly botTitle: 'عنوان ربات';
    readonly botText: 'معرفی ربات';
    readonly panelTitle: 'عنوان پنل';
    readonly panelText: 'معرفی پنل';
    readonly presentationTitle: 'عنوان ارائه‌طوری';
    readonly presentationText: 'معرفی ارائه‌طوری';
    readonly aboutTitle: 'عنوان دربارهٔ ما';
    readonly aboutText: 'متن دربارهٔ ما';
    readonly footerText: 'متن فوتر';
    readonly commentsTitle: 'عنوان بخش نظرات';
};
export type HomeField = keyof typeof homeFields;
export type HomeService = {
    icon: string;
    kind: string;
    title: string;
    detail: string;
    text: string;
    action: string;
    href: string;
};
export declare const homeServiceFields: {
    readonly icon: 'نشان سرویس';
    readonly kind: 'دسته‌بندی';
    readonly title: 'عنوان';
    readonly detail: 'نام کوتاه یا انگلیسی';
    readonly text: 'توضیحات';
    readonly action: 'متن دکمه';
    readonly href: 'نشانی لینک';
};
export declare const homeServiceLimits: {
    icon: number;
    kind: number;
    title: number;
    detail: number;
    text: number;
    action: number;
    href: number;
};
export declare const maxHomeServices = 16;
export declare const homeSectionPlaces: {
    readonly intro: 'بعد از معرفی';
    readonly services: 'بعد از سرویس‌ها';
    readonly about: 'بعد از دربارهٔ ما';
};
export type HomeSection = {
    place: keyof typeof homeSectionPlaces;
    title: string;
    text: string;
};
export declare const maxHomeSections = 6;
export type HomeContent = Partial<Record<HomeField, string>> & {
    services?: HomeService[];
    sections?: HomeSection[];
};
export declare function readHomeSections(input: unknown): HomeSection[] | null;
export declare function homeLink(value: string): string | null;
export declare function readHomeServices(input: unknown): HomeService[] | null;
export declare function homeServices(content: HomeContent): HomeService[];
export declare const homeFieldKeys: HomeField[];
export declare const longHomeField: (key: HomeField) => boolean;
export declare const homeFieldLimit: (key: HomeField) => 120 | 600;
