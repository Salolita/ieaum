import { type Profile } from './portal-store.js';
export declare function issueLoginLink(profileId: string, chat: string, target: string): Promise<string>;
export declare const resetDigest: (code: string) => string;
export declare function issueResetCode(profileId: Profile['id'], chat: string): Promise<string>;
