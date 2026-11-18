import { reviewStatusText, type ReviewCallback } from './account-review.js';
export declare const profileLabel = "\u0646\u0645\u0627\u06CC\u0647 \u0645\u0646";
export declare const statusLabel = "\u0648\u0636\u0639\u06CC\u062A \u062D\u0633\u0627\u0628 \u0648 \u0627\u062A\u0635\u0627\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645";
export declare const resetLabel = "\u0641\u0631\u0627\u0645\u0648\u0634\u06CC \u0631\u0645\u0632 \u0639\u0628\u0648\u0631";
export declare const withdrawalLabel = "\u062D\u0630\u0641 \u062D\u0633\u0627\u0628";
export interface AccountDetails {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    role: 'student' | 'teacher';
    active: boolean;
    review_status: keyof typeof reviewStatusText;
    approved_at: string | null;
    telegram_id: string | null;
    former_telegram_id: string | null;
    phone: string | null;
    birth_date: string | null;
    student_number: string | null;
    course_name: string | null;
}
export declare function accountForChat(chat: string): Promise<AccountDetails>;
export declare function statusMessage(account: AccountDetails): string;
export declare function showProfile(chat: string, account: AccountDetails, editUrl: string): Promise<void>;
export declare function manageAccountRow(chat: string, id: string): Promise<void>;
export declare function handleAccountReason(chat: string, prompt: string | undefined, text: string): Promise<boolean>;
export declare function handleAccountCallback(callback: ReviewCallback, refresh: (chat: string, hasAccount: boolean) => Promise<void>, reset: (chat: string) => Promise<void>): Promise<void>;
