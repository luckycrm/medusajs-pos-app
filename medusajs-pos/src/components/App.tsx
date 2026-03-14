import { useState, useEffect } from 'react';
import Login from './Login';
import AppShell from './AppShell';
import SelectCustomer from './SelectCustomer';
import Cart from './Cart';
import Orders from './Orders';
import Onboarding from './Onboarding';
import { sdk } from '../lib/medusa';
import { getDraftOrderId, getDynamicSettings } from '../lib/pos';

interface Customer {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

type Page = 'select-customer' | 'cart' | 'orders' | 'onboarding';

const SETTINGS_KEYS = {
  salesChannelId: 'sales_channel_id',
  regionId: 'region_id',
  stockLocationId: 'stock_location_id',
} as const;

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('select-customer');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [storeName, setStoreName] = useState('POS');
  const [storeLogo, setStoreLogo] = useState('/logo.png');

  useEffect(() => {
    getDynamicSettings().then((settings) => {
      if (settings.address.company) {
        setStoreName(settings.address.company);
      }
      if (settings.logo) {
        setStoreLogo(settings.logo);
      }
    }).catch(() => { });
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('medusa_auth_token');
    if (token) {
      sdk.auth.getCurrentUser()
      .then(async ({ user }) => {
        setUser({
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
        });
        const setupComplete = await checkSetupStatus();
        setIsSetupComplete(setupComplete);
        if (setupComplete) {
          syncPageFromPath(true);
        } else {
          setCurrentPage('onboarding');
          window.history.replaceState({}, '', '/onboarding');
        }
      })
      .catch(() => {
        localStorage.removeItem('medusa_auth_token');
      })
      .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => syncPageFromPath(isSetupComplete);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedCustomer, isSetupComplete]);

  const checkSetupStatus = async () => {
    const salesChannelId = localStorage.getItem(SETTINGS_KEYS.salesChannelId);
    const regionId = localStorage.getItem(SETTINGS_KEYS.regionId);
    const stockLocationId = localStorage.getItem(SETTINGS_KEYS.stockLocationId);

    return Boolean(salesChannelId && regionId && stockLocationId);
  };

  const syncPageFromPath = (setupComplete = isSetupComplete) => {
    const path = (window.location.pathname.replace('/', '') || 'select-customer') as Page;

    if (!setupComplete && path !== 'onboarding') {
      setCurrentPage('onboarding');
      return;
    }

    if (path === 'cart' && !selectedCustomer && !getDraftOrderId()) {
      setCurrentPage('select-customer');
      return;
    }

    if (path) {
      setCurrentPage(path);
    }
  };

  const handleLogin = async (userData: any) => {
    setUser(userData);
    const setupComplete = await checkSetupStatus();
    setIsSetupComplete(setupComplete);
    setCurrentPage(setupComplete ? 'select-customer' : 'onboarding');
    window.history.pushState({}, '', setupComplete ? '/select-customer' : '/onboarding');
  };

  const navigate = (page: Page | 'cart' | 'orders') => {
    if (!isSetupComplete && page !== 'onboarding') {
      setCurrentPage('onboarding');
      window.history.pushState({}, '', '/onboarding');
      return;
    }
    if (page === 'cart' && !selectedCustomer && !getDraftOrderId()) {
      setCurrentPage('select-customer');
      window.history.pushState({}, '', '/select-customer');
      return;
    }
    setCurrentPage(page);
    window.history.pushState({}, '', `/${page}`);
  };

  const handleLogout = () => {
    localStorage.removeItem('medusa_auth_token');
    setSelectedCustomer(null);
    setUser(null);
    window.history.pushState({}, '', '/');
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <Login onSuccess={handleLogin} storeLogo={storeLogo} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'select-customer':
        return (
          <SelectCustomer
            user={user}
            selectedCustomer={selectedCustomer}
            onSelectCustomer={setSelectedCustomer}
            onComplete={() => navigate('cart')}
            onViewOrders={() => navigate('orders')}
            onClearSelection={() => setSelectedCustomer(null)}
          />
        );
      case 'cart':
        return (
          <Cart
            storeName={storeName}
            storeLogo={storeLogo}
            guestEmail={user.email}
            onBack={() => navigate('select-customer')}
            onComplete={() => {
              setSelectedCustomer(null);
              navigate('orders');
            }}
          />
        );
      case 'orders':
        return <Orders storeName={storeName} storeLogo={storeLogo} guestEmail={user.email} />;
      case 'onboarding':
        return (
          <Onboarding
            onComplete={async () => {
              setIsSetupComplete(true);
              setCurrentPage('select-customer');
              window.history.pushState({}, '', '/select-customer');
            }}
          />
        );
      default:
        return (
          <SelectCustomer
            user={user}
            selectedCustomer={selectedCustomer}
            onSelectCustomer={setSelectedCustomer}
            onComplete={() => navigate('cart')}
            onViewOrders={() => navigate('orders')}
            onClearSelection={() => setSelectedCustomer(null)}
          />
        );
    }
  };

  if (currentPage === 'select-customer' || currentPage === 'cart' || currentPage === 'orders') {
    return (
      <AppShell currentPage={currentPage} user={user} storeName={storeName} storeLogo={storeLogo} onNavigate={navigate} onLogout={handleLogout}>
        {renderPage()}
      </AppShell>
    );
  }

  return renderPage();
}
