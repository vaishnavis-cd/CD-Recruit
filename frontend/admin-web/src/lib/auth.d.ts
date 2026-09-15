export interface StaffLoginResponse {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresIn: number;
    staff?: {
        id: string;
        email: string;
        name: string;
        role: "ADMIN" | "HR_LEAD" | "HR_ASSOCIATE" | "REVIEWER" | "RECRUITER";
        createdAt?: string;
    };
}
export interface StaffRefreshResponse {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresIn: number;
}
export interface UserProfile {
    sub: string;
    email: string;
    name: string;
    username: string;
    role: "ADMIN" | "HR_LEAD" | "HR_ASSOCIATE" | "REVIEWER" | "RECRUITER";
}
export declare function login(email: string, pw: string): Promise<StaffLoginResponse>;
export declare function refreshTokens(): Promise<string | null>;
export declare function logout(): Promise<void>;
export declare function getStoredToken(): string | null;
export declare function getStoredRefreshToken(): string | null;
export declare function clearStoredToken(): void;
export declare function parseJwtPayload(token: string): any;
export declare function getUserProfile(): UserProfile | null;
export declare function isAuthenticated(): boolean;
