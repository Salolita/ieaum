export declare function telegram(method: string, body: object): Promise<void>;
export declare const panelButton: (text?: string) => {
    inline_keyboard: {
        text: string;
        url: string;
    }[][];
};
