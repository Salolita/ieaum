export declare const availableRoom: () => {
    or: string;
};
export declare function ownedPresentations(owner: string, id?: string, includeLink?: boolean): Promise<{
    id: string;
    title: string;
    caption: string;
    expires_at: string | null;
    published: boolean;
    moderation_disabled: boolean;
    page_count: number;
    furthest: number;
    join_code?: string;
}[]>;
export declare function rotatePresentationCode(owner: string, id: string): Promise<string>;
export declare function retention(value: unknown): 3 | 5 | null;
export declare function expiration(value: unknown): string | null;
export declare function editPresentation(owner: string, id: string, values: {
    title?: string;
    caption?: string;
    expires_at?: string | null;
}): Promise<unknown[]>;
export declare function deletePresentation(owner: string, id: string): Promise<unknown[]>;
