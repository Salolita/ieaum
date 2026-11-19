import type { ReviewCallback } from './account-review.js';
export declare const myPresentationsLabel = "\u0627\u0631\u0627\u0626\u0647\u200C\u0647\u0627\u06CC \u0645\u0646";
export declare function showPresentations(chat: string): Promise<void>;
export declare function handlePresentationCallback(callback: ReviewCallback): Promise<void>;
export declare function handlePresentationEdit(chat: string, prompt: string | undefined, value: string): Promise<boolean>;
