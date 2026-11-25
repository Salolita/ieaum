export declare const ownerTelegram = "1484056418";
export declare const ownerAccount: (profile: {
    telegram_id?: string | null;
    username: string;
} | null) => boolean;
export type DepartureService = 'presentation' | 'quiz' | 'livecode';
export declare const serviceNames: Record<DepartureService, string>;
export declare function presenceDay(now?: Date): string;
export declare function presenceSettings(): Promise<{
    active_day: string | null;
    mode: 'telegram' | 'report';
}>;
export declare function recordDeparture(service: DepartureService, session: string, person: string, name: string, title: string): Promise<void>;
