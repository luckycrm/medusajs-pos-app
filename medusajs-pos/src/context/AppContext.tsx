import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import { sdk } from '../lib/medusa';

interface User {
  email: string;
  firstName?: string;
  lastName?: string;
}

interface AppContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;
}

const AppContext = createContext<AppContextType>({
  user: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
});

export const useApp = () => useContext(AppContext);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('medusa_auth_token');
    if (token) {
      sdk.auth
        .getCurrentUser()
        .then(({ user }) => {
          setUser({
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
          });
        })
        .catch(() => {
          localStorage.removeItem('medusa_auth_token');
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = (userData: User) => {
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('medusa_auth_token');
    setUser(null);
    window.location.href = '/';
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AppContext.Provider>
  );
}
