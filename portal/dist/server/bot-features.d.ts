import { type ReviewCallback } from './account-review.js';
export declare const birthdayLabel = "\u062A\u0628\u0631\u06CC\u06A9 \u062A\u0648\u0644\u062F";
export declare const birthdayPrompt = "\u0645\u062A\u0646 \u062C\u062F\u06CC\u062F \u0631\u0627 \u062F\u0631 \u067E\u0627\u0633\u062E \u0628\u0647 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F. \u0628\u0631\u0627\u06CC \u062C\u0627\u06CC \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u060C \u0639\u0628\u0627\u0631\u062A {name} \u0631\u0627 \u062F\u0631 \u0645\u062A\u0646 \u0642\u0631\u0627\u0631 \u062F\u0647\u06CC\u062F.";
export declare function birthdayMenu(chat: string): Promise<void>;
export declare function handleBirthdayCallback(callback: ReviewCallback): Promise<void>;
export declare function saveBirthdayTemplate(chat: string, text: string): Promise<void>;
export declare function matchesBirthday(iso: string | null, today: string): boolean;
export declare function deliverPersonalNotices(now?: Date): Promise<void>;
