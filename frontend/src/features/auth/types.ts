export type UserRole = 'admin' | 'user';

export interface AuthUser {
  id: string;
  email: string | null;
  phone_e164: string | null;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface AuthSession {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: AuthUser;
}

export interface ProviderAvailability {
  google: boolean;
  facebook: boolean;
  phone: boolean;
}
