import { api } from './api';
import type { AuthUser } from '@/store/authStore';

export interface SignupRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export const authService = {
  signup: async (data: SignupRequest): Promise<AuthResponse> => {
    const res = await api.post<AuthResponse>('/auth/signup', data);
    return res.data;
  },
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const res = await api.post<AuthResponse>('/auth/login', data);
    return res.data;
  },
  me: async (): Promise<AuthUser> => {
    const res = await api.get<AuthUser>('/auth/me');
    return res.data;
  },
};
