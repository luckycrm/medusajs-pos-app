import type { ReactNode } from 'react';
import { ClipboardList, ShoppingCart } from 'lucide-react';
import './AppShell.css';

interface UserData {
  email: string;
  firstName?: string;
  lastName?: string;
}

interface AppShellProps {
  children: ReactNode;
  currentPage: string;
  user: UserData;
  storeName: string;
  storeLogo: string;
  onNavigate: (page: 'cart' | 'orders') => void;
  onLogout: () => void;
}

const navItems = [
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'cart', label: 'Cart', icon: ShoppingCart },
] as const;

export default function AppShell({ children, currentPage, user, storeName, storeLogo, onNavigate, onLogout }: AppShellProps) {
  const userName =
    user.firstName || user.lastName
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
      : user.email.split('@')[0];

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="top-nav__brand">
          <img className="top-nav__logo" src={storeLogo} alt={`${storeName} POS`} width={192} height={63} />
        </div>

        <nav className="top-nav__menu" aria-label="Primary">
          {navItems
            .filter((item) => {
              if (currentPage === 'select-customer' && item.id === 'cart') {
                return false;
              }
              return true;
            })
            .map((item) => {
              const isActive = currentPage === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`top-nav__item ${isActive ? 'is-active' : ''}`}
                  onClick={() => onNavigate(item.id)}
                >
                  <Icon size={18} strokeWidth={1.9} />
                  <span>{item.label}</span>
                </button>
              );
            })}
        </nav>

        <div className="top-nav__actions">
          <div className="top-nav__user">
            <div className="top-nav__avatar">{userName.charAt(0).toUpperCase()}</div>
            <div className="top-nav__user-meta">
              <span className="top-nav__user-name">{userName}</span>
              <span className="top-nav__user-email">{user.email}</span>
            </div>
          </div>
          <button className="top-nav__logout" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="app-shell__content">{children}</main>
    </div>
  );
}
