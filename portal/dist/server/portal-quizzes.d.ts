import { type Profile } from './portal-store.js';
interface Question {
    prompt: string;
    options: string[];
    correct: number;
}
interface Quiz {
    id: string;
    title: string;
    published: boolean;
    content: Question[];
    audience: string[];
    course_name: string | null;
    deadline_at: string | null;
    duration_minutes: number | null;
}
interface Student {
    username: string;
    first_name: string;
    last_name: string;
    telegram_id?: string | null;
}
export declare function quizAction(action: string, body: Record<string, unknown>, profile: Profile): Promise<{
    ok: boolean;
    students?: undefined;
    more?: undefined;
    student?: undefined;
    quizzes?: undefined;
    delivery?: undefined;
    expiresAt?: undefined;
    serverNow?: undefined;
    content?: undefined;
    results?: undefined;
    score?: undefined;
} | {
    students: Student[];
    more: boolean;
    student?: undefined;
    quizzes?: undefined;
    ok?: undefined;
    delivery?: undefined;
    expiresAt?: undefined;
    serverNow?: undefined;
    content?: undefined;
    results?: undefined;
    score?: undefined;
} | {
    students?: undefined;
    more?: undefined;
    student: Student;
    quizzes?: undefined;
    ok?: undefined;
    delivery?: undefined;
    expiresAt?: undefined;
    serverNow?: undefined;
    content?: undefined;
    results?: undefined;
    score?: undefined;
} | {
    students?: undefined;
    student?: undefined;
    quizzes: Quiz[];
    results: unknown;
    courseName: string;
    more?: boolean | undefined;
    ok?: undefined;
    delivery?: undefined;
    expiresAt?: undefined;
    serverNow?: undefined;
    content?: undefined;
    score?: undefined;
} | {
    students?: undefined;
    more?: undefined;
    student?: undefined;
    quizzes: {
        id: string;
        title: string;
        published: boolean;
        course_name: string | null;
        deadline_at: string | null;
        duration_minutes: number | null;
        expiresAt: string | null;
        questionCount: number;
        content: {
            prompt: string;
            options: string[];
        }[];
    }[];
    results: unknown;
    serverNow: number;
    ok?: undefined;
    delivery?: undefined;
    expiresAt?: undefined;
    content?: undefined;
    score?: undefined;
} | {
    students?: undefined;
    more?: undefined;
    student?: undefined;
    quizzes?: undefined;
    ok: boolean;
    delivery: {
        sent: number;
        unlinked: number;
        failed: number;
        inactive: number;
    } | null;
    expiresAt?: undefined;
    serverNow?: undefined;
    content?: undefined;
    results?: undefined;
    score?: undefined;
} | {
    students?: undefined;
    more?: undefined;
    student?: undefined;
    quizzes?: undefined;
    ok?: undefined;
    delivery?: undefined;
    expiresAt: string;
    serverNow: number;
    content: {
        prompt: string;
        options: string[];
    }[];
    results?: undefined;
    score?: undefined;
} | {
    students?: undefined;
    more?: undefined;
    student?: undefined;
    quizzes?: undefined;
    ok?: undefined;
    delivery?: undefined;
    expiresAt?: undefined;
    serverNow?: undefined;
    content?: undefined;
    results: unknown;
    score?: undefined;
} | {
    students?: undefined;
    more?: undefined;
    student?: undefined;
    quizzes?: undefined;
    ok?: undefined;
    delivery?: undefined;
    expiresAt?: undefined;
    serverNow?: undefined;
    content?: undefined;
    results?: undefined;
    score: number;
}>;
export {};
