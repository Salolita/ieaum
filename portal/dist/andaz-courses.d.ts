export declare const andazTitle = "\u0627\u0646\u062F\u0627\u0632 \u0628\u0631\u0627\u0646\u062F\u0627\u0632";
export declare const andazPath = "/andaz/";
export declare const andazIntro = "\u0627\u06CC\u0646 \u0646\u0633\u062E\u0647\u0654 \u062F\u0645\u0648\u06CC \u0627\u0646\u062F\u0627\u0632 \u0628\u0631\u0627\u0646\u062F\u0627\u0632\u0647. \u062F\u0631\u0633\u200C\u0647\u0627\u06CC\u06CC \u0631\u0648 \u06A9\u0647 \u067E\u0627\u0633 \u06A9\u0631\u062F\u06CC \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646 \u062A\u0627 \u0628\u0628\u06CC\u0646\u06CC \u0686\u0646\u062F \u0648\u0627\u062D\u062F \u06AF\u0630\u0631\u0648\u0646\u062F\u06CC\u060C \u0686\u0642\u062F\u0631 \u062A\u0627 \u067E\u0627\u06CC\u0627\u0646 \u0645\u0648\u0646\u062F\u0647 \u0648 \u0647\u0631 \u062F\u0631\u0633 \u0686\u0647 \u067E\u06CC\u0634\u200C\u0646\u06CC\u0627\u0632\u06CC \u062F\u0627\u0631\u0647. \u0647\u0631 \u0648\u0642\u062A \u062E\u0648\u0627\u0633\u062A\u06CC \u0645\u06CC\u200C\u062A\u0648\u0646\u06CC \u0627\u0646\u062A\u062E\u0627\u0628\u200C\u0647\u0627\u062A \u0631\u0648 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u06A9\u0646\u06CC!";
export declare const andazStartLabel = "\u0628\u0631\u0627\u06CC \u0634\u0631\u0648\u0639 \u0627\u06CC\u0646\u062C\u0627 \u06A9\u0644\u06CC\u06A9 \u06A9\u0646";
export declare const andazCategories: readonly [{
    readonly id: 'general';
    readonly title: 'عمومی و معارف';
    readonly credits: 28;
}, {
    readonly id: 'basic';
    readonly title: 'پایه';
    readonly credits: 21;
}, {
    readonly id: 'specialty';
    readonly title: 'تخصصی الزامی';
    readonly credits: 66;
}, {
    readonly id: 'skills';
    readonly title: 'مهارتی و پروژه';
    readonly credits: 9;
}, {
    readonly id: 'elective';
    readonly title: 'انتخابی';
    readonly credits: 22;
}, {
    readonly id: 'prep';
    readonly title: 'پیش‌دانشگاهی';
    readonly credits: 6;
}];
type Category = typeof andazCategories[number]['id'];
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
export declare const courses: Course[];
export declare const coursesById: Map<string, Course>;
export declare const andazDigits: (value: number) => string;
export declare function courseRequirements(course: Course, passed: PassedCourses): string;
export declare function andazProgress(passed: PassedCourses): {
    sections: {
        id: "basic" | "elective" | "general" | "prep" | "skills" | "specialty";
        title: "انتخابی" | "تخصصی الزامی" | "عمومی و معارف" | "مهارتی و پروژه" | "پایه" | "پیش‌دانشگاهی";
        selected: number;
        counted: number;
        required: 6 | 9 | 21 | 22 | 28 | 66;
    }[];
    total: number;
    completed: number;
    remaining: number;
    percent: number;
    electives: number;
};
export declare function andazSummary(passed: PassedCourses): string;
export {};
