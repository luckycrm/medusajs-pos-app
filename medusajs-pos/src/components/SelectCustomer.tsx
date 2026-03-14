import { useEffect, useMemo, useState } from 'react';
import { sdk } from '../lib/medusa';
import { attachCustomerToNewDraftOrder, clearDraftOrderId, getDynamicSettings, handleGuestCheckout } from '../lib/pos';
import './SelectCustomer.css';

interface Customer {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

interface SelectCustomerProps {
  user: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
  selectedCustomer: Customer | null;
  onSelectCustomer: (customer: Customer | null) => void;
  onComplete: () => void;
  onViewOrders: () => void;
  onClearSelection: () => void;
  storeName?: string;
}

// Hardcoded defaults removed. Identification now relies on the authenticated user's email.

const getCustomerName = (customer: Customer) => {
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : customer.email;
};

const getCustomerInitials = (customer: Customer) => {
  const initials = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .map((value) => value?.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);

  return initials.length > 0 ? initials : customer.email.slice(0, 2).toUpperCase();
};

const isGuestCustomer = (customer: Customer, guestEmail: string) => customer.email === guestEmail;

export default function SelectCustomer({
  user,
  selectedCustomer,
  onSelectCustomer,
  onComplete,
  onViewOrders,
  onClearSelection,
  storeName = 'POS',
}: SelectCustomerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ email: '', first_name: '', last_name: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isProceeding, setIsProceeding] = useState(false);

  const [guestEmail, setGuestEmail] = useState(user.email);

  useEffect(() => {
    void getDynamicSettings().then((settings) => {
      const cleanEmail = settings.email.split(' ')[0].trim();
      setGuestEmail(cleanEmail);
    });
  }, []);

  const guestCustomer = useMemo(
    () => customers.find((customer) => customer.email === guestEmail),
    [customers, guestEmail],
  );

  useEffect(() => {
    searchCustomers(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    searchCustomers('');
  }, []);

  const searchCustomers = async (query: string) => {
    setIsSearching(true);
    try {
      const params = query && query.length > 1 ? { q: query, limit: 50, order: 'email' } : { limit: 50, order: 'email' };
      const { customers: results } = await sdk.admin.customer.list(params);
      const sortedCustomers = [...(results || [])].sort((a, b) => {
        const aIsGuest = isGuestCustomer(a as Customer, guestEmail);
        const bIsGuest = isGuestCustomer(b as Customer, guestEmail);
        if (aIsGuest === bIsGuest) return getCustomerName(a as Customer).localeCompare(getCustomerName(b as Customer));
        return aIsGuest ? 1 : -1;
      });
      setCustomers(sortedCustomers as Customer[]);
    } catch (err) {
      console.error('Error searching customers:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);
    try {
      const { customer } = await sdk.admin.customer.create(newCustomer);
      onSelectCustomer(customer as Customer);
      setShowNewCustomer(false);
      setNewCustomer({ email: '', first_name: '', last_name: '', phone: '' });
      await searchCustomers(searchQuery);
    } catch (err: any) {
      setError(err.message || 'Failed to create customer');
    } finally {
      setIsCreating(false);
    }
  };

  const handleProceedToCart = async (customerOverride?: Customer) => {
    const customerToUse = customerOverride || selectedCustomer;
    if (!customerToUse) return;

    setIsProceeding(true);
    try {
      await attachCustomerToNewDraftOrder(customerToUse);
      onSelectCustomer(customerToUse);
      onComplete();
    } catch (error) {
      console.error('Error creating draft order for customer:', error);
      setError(error instanceof Error ? error.message : 'Failed to prepare cart');
    } finally {
      setIsProceeding(false);
    }
  };

  const onGuestCheckout = async () => {
    setIsProceeding(true);
    try {
      const draftOrder = await handleGuestCheckout({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      });
      onSelectCustomer(draftOrder.customer as Customer);
      onComplete();
    } catch (error) {
      console.error('Error in guest checkout:', error);
      setError(error instanceof Error ? error.message : 'Failed to prepare guest cart');
    } finally {
      setIsProceeding(false);
    }
  };

  return (
    <div className="customer-select-screen">
      <section className="customer-select-intro">
        <div className="customer-select-card">
          <h1>Select Customer</h1>
          <p>Follow the quick guide to select a customer.</p>
        </div>

        <div className="customer-select-card">
          <h2>Quick guide</h2>
          <div className="customer-select-guide">
            <div className="customer-select-guide-item">
              <strong>1. Search</strong>
              <span>Find by name, email, or phone.</span>
            </div>
            <div className="customer-select-guide-item">
              <strong>2. Confirm</strong>
              <span>Review the customer details in the summary panel.</span>
            </div>
            <div className="customer-select-guide-item">
              <strong>3. Continue</strong>
              <span>Use the large action buttons for fast handling.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="customer-select-results">
        <div className="customer-select-search-card">
          <h2>Find a customer</h2>
          <div className="customer-select-search">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customers by name, email, or phone..."
            />
          </div>
        </div>

        <div className="customer-select-list-card">
          {isSearching ? <div className="customer-select-empty">Searching customers…</div> : null}

          {!isSearching && customers.length === 0 ? (
            <div className="customer-select-empty">
              {searchQuery.length > 1 ? 'No customers match the search.' : 'No customers found.'}
            </div>
          ) : null}

          <div className="customer-select-list">
            {customers
              .filter((customer) => !isGuestCustomer(customer, guestEmail))
              .map((customer) => {
                const isSelected = selectedCustomer?.id === customer.id;
                return (
                  <button
                    key={customer.id}
                    className={`customer-list-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => onSelectCustomer(customer)}
                  >
                    <div className={`customer-list-item__avatar ${isSelected ? 'is-selected' : ''}`}>
                      {getCustomerInitials(customer)}
                    </div>
                    <div className="customer-list-item__content">
                      <div className="customer-list-item__name">{getCustomerName(customer)}</div>
                      <div className="customer-list-item__email">{customer.email}</div>
                      {customer.phone ? <div className="customer-list-item__phone">{customer.phone}</div> : null}
                    </div>
                    <div className="customer-list-item__meta">
                      <span>{isSelected ? 'Selected' : 'Tap to select'}</span>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      </section>

      <section className="customer-select-actions">
        <div className="customer-select-card customer-select-summary">
          {!selectedCustomer ? (
            <>
              <div className="customer-select-summary__avatar waiting">CS</div>
              <h2>Waiting for selection</h2>
              <p>Pick a customer from the list, or use Guest Checkout for a fast walk-in order.</p>
              <div className="customer-select-tip">
                Tip: keep one hand on search and one on the action buttons for faster counter flow.
              </div>
            </>
          ) : (
            <>
              <div className="customer-select-summary__header">
                <div className="customer-select-summary__avatar">
                  {isGuestCustomer(selectedCustomer, guestEmail) ? 'GO' : getCustomerInitials(selectedCustomer)}
                </div>
                <div className="customer-select-summary__info">
                  <h2>{isGuestCustomer(selectedCustomer, guestEmail) ? 'Make a Guest Order' : getCustomerName(selectedCustomer)}</h2>
                  {!isGuestCustomer(selectedCustomer, guestEmail) ? <p>{selectedCustomer.email}</p> : null}
                </div>
                <div className="customer-select-summary__tag">Ready</div>
              </div>

              {selectedCustomer.phone && !isGuestCustomer(selectedCustomer, guestEmail) ? (
                <div className="customer-select-detail">
                  <span>Phone</span>
                  <strong>{selectedCustomer.phone}</strong>
                </div>
              ) : null}

              <div className="customer-select-next-step">
                <span>Next Step</span>
                <strong>Attach customer to a fresh draft order and continue to cart</strong>
              </div>
            </>
          )}
        </div>

        <div className="customer-select-card customer-select-quick-actions">
          <h2>Quick actions</h2>
          <div className="customer-select-button-stack">
            <button
              className="quick-action-btn quick-action-btn--guest"
              disabled={isProceeding}
              onClick={onGuestCheckout}
            >
              <span>{isProceeding ? 'Opening Cart…' : 'Guest Checkout'}</span>
            </button>

            <button
              className="quick-action-btn quick-action-btn--primary"
              disabled={!selectedCustomer || isProceeding}
              onClick={() => handleProceedToCart()}
            >
              <span>{isProceeding ? 'Opening Cart…' : 'Proceed to Cart'}</span>
            </button>

            <button
              className="quick-action-btn quick-action-btn--secondary"
              onClick={() => setShowNewCustomer(true)}
            >
              <span>Create New Customer</span>
            </button>

            <button className="quick-action-btn quick-action-btn--secondary" onClick={onViewOrders}>
              <span>View Orders</span>
            </button>

            <button
              className="quick-action-btn quick-action-btn--secondary"
              onClick={() => {
                setSearchQuery('');
                clearDraftOrderId();
                onClearSelection();
              }}
            >
              <span>Clear Selection</span>
            </button>
          </div>
        </div>
      </section>

      {showNewCustomer ? (
        <div className="customer-modal-overlay" onClick={() => setShowNewCustomer(false)}>
          <div className="customer-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create New Customer</h2>
            {error ? <div className="customer-modal__error">{error}</div> : null}
            <form onSubmit={handleCreateCustomer} className="customer-modal__form">
              <input
                type="email"
                placeholder="Email Address"
                value={newCustomer.email}
                onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="First Name"
                value={newCustomer.first_name}
                onChange={(e) => setNewCustomer({ ...newCustomer, first_name: e.target.value })}
              />
              <input
                type="text"
                placeholder="Last Name"
                value={newCustomer.last_name}
                onChange={(e) => setNewCustomer({ ...newCustomer, last_name: e.target.value })}
              />
              <input
                type="tel"
                placeholder="Phone Number"
                value={newCustomer.phone}
                onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
              />
              <div className="customer-modal__actions">
                <button type="button" className="quick-action-btn quick-action-btn--secondary" onClick={() => setShowNewCustomer(false)}>
                  Cancel
                </button>
                <button type="submit" className="quick-action-btn quick-action-btn--primary" disabled={isCreating}>
                  {isCreating ? 'Creating…' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
