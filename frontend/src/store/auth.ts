// mapsprove/frontend/src/store/auth.ts
import { create } from 'zustand';

type User = { email: string; role: 'admin'|'viewer' };
type AuthState = {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  clear: () => void;
};

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  setAuth: (token, user) => set({ token, user }),
  clear: () => set({ token: null, user: null }),
}));
