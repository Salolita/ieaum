export declare const presenceMenuLabel = "\u0627\u0639\u0644\u0627\u0646 \u062E\u0631\u0648\u062C \u0627\u0632 \u062C\u0644\u0633\u0647";
export declare function presenceMenu(chat: string): Promise<void>;
export declare function updatePresence(chat: string, action: string): Promise<void>;
export declare function manageSite(request: Request, body?: Record<string, unknown>): Promise<Response>;
