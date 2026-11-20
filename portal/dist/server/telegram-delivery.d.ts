export declare class TelegramDeliveryError extends Error {
    readonly status: number;
    readonly retryAfter?: number | undefined;
    constructor(status: number, retryAfter?: number | undefined);
}
export declare function telegram(method: string, body: object): Promise<void>;
export declare const panelButton: (text?: string) => {
    inline_keyboard: {
        text: string;
        url: string;
    }[][];
};
