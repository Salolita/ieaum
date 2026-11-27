import { type ReviewCallback } from './account-review.js';
export declare const notesLabel = "\u062C\u0632\u0648\u0627\u062A";
export declare function notesMenu(chat: string): Promise<void>;
export declare function openNotesSettings(callback: ReviewCallback): Promise<void>;
export declare function saveNotesLink(chat: string, replyTo: string | undefined, value: string): Promise<boolean>;
