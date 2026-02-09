import { apiClient } from './api';

interface AuthTokens {
  access: string;
  refresh: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
}

interface LoginResponse {
  access: string;
  refresh: string;
}

interface RegisterResponse {
  user: User;
  tokens: AuthTokens;
}

const TOKEN_KEY = 'auth_tokens';
const USER_KEY = 'user_data';

class AuthService {
  // Salva tokens in localStorage
  private saveTokens(tokens: AuthTokens) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
    apiClient.setToken(tokens.access);
  }

  // Recupera tokens da localStorage
  private getTokens(): AuthTokens | null {
    const tokens = localStorage.getItem(TOKEN_KEY);
    return tokens ? JSON.parse(tokens) : null;
  }

  // Salva user in localStorage
  private saveUser(user: User) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  // Recupera user da localStorage
  getUser(): User | null {
    const user = localStorage.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  }

  // Inizializza auth (da chiamare all'avvio dell'app)
  async initialize() {
    const tokens = this.getTokens();
    if (tokens) {
      apiClient.setToken(tokens.access);
      
      try {
        // Verifica se il token è ancora valido
        const user = await this.getCurrentUser();
        this.saveUser(user);
        return user;
      } catch (error) {
        // Token scaduto, prova a refreshare
        try {
          await this.refreshToken();
          const user = await this.getCurrentUser();
          this.saveUser(user);
          return user;
        } catch {
          // Refresh fallito, logout
          this.logout();
          return null;
        }
      }
    }
    return null;
  }

  // Login con email invece di username
  async login(email: string, password: string): Promise<User> {
    // Django JWT richiede username, usiamo email come username
    const response = await fetch(`${apiClient.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Credenziali non valide');
    }

    const data: LoginResponse = await response.json();
    
    this.saveTokens({
      access: data.access,
      refresh: data.refresh,
    });

    const user = await this.getCurrentUser();
    this.saveUser(user);
    
    return user;
  }

  // Register
  async register(data: {
    username: string;
    email: string;
    password: string;
    password2: string;
    full_name: string;
    role?: string;
  }): Promise<User> {
    const response = await fetch(`${apiClient.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      const errorMessage = Object.entries(error)
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
        .join('; ');
      throw new Error(errorMessage || 'Registrazione fallita');
    }

    const result: RegisterResponse = await response.json();
    
    this.saveTokens(result.tokens);
    this.saveUser(result.user);
    
    return result.user;
  }

  // Logout
  async logout() {
    const tokens = this.getTokens();
    
    if (tokens?.refresh) {
      try {
        await fetch(`${apiClient.baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokens.access}`,
          },
          body: JSON.stringify({ refresh: tokens.refresh }),
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    apiClient.setToken(null);
  }

  // Refresh token
  async refreshToken(): Promise<void> {
    const tokens = this.getTokens();
    
    if (!tokens?.refresh) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${apiClient.baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: tokens.refresh }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    
    this.saveTokens({
      access: data.access,
      refresh: tokens.refresh,
    });
  }

  // Get current user
  async getCurrentUser(): Promise<User> {
    const response = await fetch(`${apiClient.baseUrl}/api/auth/profile`, {
      headers: {
        'Authorization': `Bearer ${this.getTokens()?.access}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user profile');
    }

    return response.json();
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!this.getTokens();
  }
}

export const authService = new AuthService();