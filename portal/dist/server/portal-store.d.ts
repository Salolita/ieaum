export declare const digest: (value: string) => string;
export declare const token: () => string;
export declare const tokenPattern: RegExp;
export declare const uuidPattern: RegExp;
export declare const internalEmail: (username: string) => string;
export declare const studentNumber: (value: string) => string;
export declare class PortalError extends Error {
    readonly status: number;
    readonly field?: string | undefined;
    readonly code?: string | undefined;
    constructor(status: number, message: string, field?: string | undefined, code?: string | undefined);
}
export declare class MissingRelationError extends PortalError {
    constructor();
}
export declare class AuthAccountExists extends PortalError {
    constructor();
}
export declare function setting(name: string): string;
export declare function equalSecret(left: string, right: string): boolean;
export declare function supabase<T>(path: string, method?: string, body?: unknown, publicKey?: boolean, userToken?: string, preference?: string): Promise<T>;
export declare function query<T>(table: string, filters?: Record<string, string>): Promise<T>;
export declare function write<T>(table: string, method: string, body?: unknown, filters?: Record<string, string>): Promise<T>;
export declare const rpc: <T>(name: string, body: unknown) => Promise<T>;
export declare function limit(bucket: string, max: number): Promise<void>;
export declare function verifyPassword(username: string, password: string): Promise<string>;
export interface Profile {
    id: string;
    username: string;
    role: 'student' | 'teacher';
    first_name: string;
    last_name: string;
    active: boolean;
    course_name?: string | null;
    telegram_id?: string | null;
}
export declare function cookieValue(request: Request): string | null;
export declare function currentProfile(request: Request): Promise<Profile | null>;
export declare function reply(body: unknown, status?: number, session?: string | null): Response;
export declare function readBody(request: Request, maxBytes?: number): Promise<Record<string, unknown>>;
export declare const field: (body: Record<string, unknown>, name: string) => string;
