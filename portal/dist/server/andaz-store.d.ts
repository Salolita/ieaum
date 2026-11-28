import { type PassedCourses } from '../andaz-courses.js';
export declare function readAndaz(profileId: string): Promise<PassedCourses>;
export declare function setAndazCourse(profileId: string, id: string, credits: unknown): Promise<void>;
