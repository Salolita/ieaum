import { type ReviewCallback } from './account-review.js';
export declare const channelsLabel = "\u0639\u0636\u0648\u06CC\u062A \u0627\u062C\u0628\u0627\u0631\u06CC";
export declare function requireMembership(chat: string, isAdmin: boolean): Promise<boolean>;
export declare function channelMenu(chat: string): Promise<void>;
export declare function handleSharedChannel(chat: string, data: unknown, restoreMenu: () => Promise<unknown>): Promise<void>;
export declare function handleChannelReply(chat: string, reply: string | undefined, input: string): Promise<boolean>;
export declare function channelCallback(callback: ReviewCallback, onMember: (chat: string) => Promise<unknown>): Promise<void>;
