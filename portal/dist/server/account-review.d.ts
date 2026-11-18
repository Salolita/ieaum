type AccountRole = 'student' | 'teacher';
interface AccountRequest {
    id: string;
    role: AccountRole;
    first_name: string;
    last_name: string;
    student_number: string | null;
    course_name: string | null;
    telegram_id: string | null;
}
export declare const admins: () => string[];
export declare const isMembershipReviewer: (chat: string) => chat is "8592192595";
type Application = Pick<AccountRequest, 'first_name' | 'last_name' | 'telegram_id'> & {
    username: string;
    phone: string;
} & ({
    role: 'student';
    student_number: string;
    birth_date: string;
} | {
    role: 'teacher';
    course_name: string;
});
export declare function queueAccount(application: Application, password: string): Promise<AccountRequest | null>;
export declare const reviewStatusText: {
    approved: string;
    pending: string;
    rejected: string;
};
export declare function notifyReview(account: AccountRequest): Promise<boolean>;
export declare function pendingReviews(chat: string): Promise<void>;
export interface ReviewCallback {
    id?: string;
    from?: {
        id?: number;
    };
    data?: string;
    message?: {
        message_id?: number;
        chat?: {
            id?: number;
            type?: string;
        };
    };
}
export declare function decideReview(callback: ReviewCallback): Promise<void>;
export {};
