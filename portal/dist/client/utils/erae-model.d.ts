export declare const maxPages = 40;
export declare const maxImageBytes = 550000;
export interface Question {
    after: number;
    text: string;
    options: string[];
    correct: number;
}
export interface Player {
    name: string;
    firstPosition: number;
    answers: Record<number, number>;
    studentKey?: string;
    recoveryDigest?: string;
    entries?: number;
    lastSeen?: number;
    resumeAt?: number;
}
export interface RoomState {
    position: number;
    furthest: number;
    players: Record<string, Player>;
    questions: Question[];
    runKey?: string;
}
export type Step = {
    type: 'slide';
    page: number;
} | {
    type: 'question';
    index: number;
} | {
    type: 'waiting' | 'ranking' | 'end';
};
export declare function timeline(pageCount: number, questions: Question[]): Step[];
export declare function visibleStep(state: RoomState, steps: Step[], player?: Player): Step;
export declare function ranking(state: RoomState): {
    name: string;
    score: number;
    rank: number;
}[];
export declare function readQuestions(value: unknown, pageCount: number): Question[];
