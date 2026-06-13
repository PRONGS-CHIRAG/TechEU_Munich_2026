export type UserRole = "root" | "buyer" | "seller";

export interface AuthSession {
  username: string;
  role: UserRole;
  displayName: string;
}

