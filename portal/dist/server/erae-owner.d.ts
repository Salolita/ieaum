export declare const availableRoom: () => {
    or: string;
};
export declare function ownedPresentations(owner: string, id?: string): Promise<{
    id: string;
    title: string;
    caption: string;
    expires_at: string | null;
    published: boolean;
    page_count: number;
    furthest: number;
}[]>;
export declare function retention(value: unknown): 3 | 5 | null;
export declare function expiration(value: unknown): string | null;
export declare function editPresentation(owner: string, id: string, values: {
    title?: string;
    caption?: string;
    expires_at?: string | null;
}): Promise<unknown[]>;
export declare function deletePresentation(owner: string, id: string): Promise<unknown[]>;
