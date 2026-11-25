export type ContactLink = {
    label: string;
    url: string;
};
export type ContactGroup = {
    title: string;
    links: ContactLink[];
};
export type ContactContent = {
    title: string;
    groups: ContactGroup[];
};
export declare const contactLimits: {
    readonly groups: 12;
    readonly links: 6;
    readonly title: 100;
    readonly label: 100;
    readonly url: 300;
};
export declare const defaultContacts: ContactContent;
export declare function contactUrl(raw: string): string | null;
