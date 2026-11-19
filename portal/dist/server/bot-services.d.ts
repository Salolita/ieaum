export declare const usersLabel = "\u0641\u0647\u0631\u0633\u062A \u062D\u0633\u0627\u0628\u200C\u0647\u0627";
export declare const legacyUsersLabel = "\u06A9\u0627\u0631\u0628\u0631\u0627\u0646 \u0648\u0627\u0631\u062F\u0634\u062F\u0647";
export declare const weekLabel = "\u0627\u0639\u0644\u0627\u0646 \u0647\u0641\u062A\u0647\u0654 \u0632\u0648\u062C \u0648 \u0641\u0631\u062F";
export declare const weekSettingsLabel = "\u062A\u0646\u0638\u06CC\u0645 \u0647\u0641\u062A\u0647\u0654 \u0632\u0648\u062C \u0648 \u0641\u0631\u062F";
export declare const weekPrompt = "\u062A\u0627\u0631\u06CC\u062E \u0634\u0631\u0648\u0639 \u0647\u0641\u062A\u0647 \u0648 \u0648\u0636\u0639\u06CC\u062A\u0634 \u0631\u0627 \u0628\u0641\u0631\u0633\u062A\u06CC\u062F. \u0646\u0645\u0648\u0646\u0647: \u06F1\u06F4\u06F0\u06F5/\u06F0\u06F8/\u06F3\u06F0 \u0641\u0631\u062F";
export declare function listAccounts(chat: string): Promise<void>;
export declare function manageListedUser(chat: string, input: string): Promise<void>;
export declare const noticesLabel = "\u0627\u0639\u0644\u0627\u0646\u200C\u0647\u0627";
export declare const todayWeekLabel = "\u0627\u06CC\u0646 \u0647\u0641\u062A\u0647 \u0632\u0648\u062C \u0627\u0633\u062A \u06CC\u0627 \u0641\u0631\u062F\u061F";
export declare const weekTimePrompt = "\u0631\u0648\u0632 \u0648 \u0633\u0627\u0639\u062A \u0627\u0639\u0644\u0627\u0646 \u0631\u0627 \u0628\u0647 \u0648\u0642\u062A \u062A\u0647\u0631\u0627\u0646 \u062F\u0631 \u067E\u0627\u0633\u062E \u0628\u0647 \u0647\u0645\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F. \u0646\u0645\u0648\u0646\u0647: \u067E\u0646\u062C\u0634\u0646\u0628\u0647 \u06F1\u06F8:\u06F3\u06F0";
export declare function showCurrentWeek(chat: string): Promise<void>;
export declare function weekMenu(chat: string): Promise<void>;
export declare function setWeekSubscription(chat: string, enabled: boolean, schedule?: {
    weekday: number;
    minute_of_day: number;
}): Promise<void>;
export declare function askWeekTime(chat: string): Promise<void>;
export declare function setCustomWeekTime(chat: string, input: string): Promise<void>;
export declare function setWeekAnchor(chat: string, input: string): Promise<void>;
export declare function currentWeek(anchor: string, odd: boolean, today: string, includeBeforeAnchor?: boolean): {
    date: string;
    odd: boolean;
} | null;
export declare function deliverWeekNotices(request: Request): Promise<Response>;
