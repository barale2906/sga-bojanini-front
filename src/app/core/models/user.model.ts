export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  roles: { id: number; name: string }[];
  permissions: string[];
  created_at: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}
