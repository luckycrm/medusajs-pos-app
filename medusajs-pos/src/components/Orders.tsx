import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CalendarRange,
  Check,
  CircleAlert,
  Edit,
  CreditCard,
  FilePen,
  HelpCircle,
  Mail,
  Package,
  PackageOpen,
  Printer,
  Search,
  Truck,
  UserRound,
  X,
} from 'lucide-react';
import { sdk } from '../lib/medusa';
import {
  captureOrderPayment,
  changeOrderCustomer,
  createOrderFulfillment,
  listOrders,
  markFulfillmentAsDelivered,
  markFulfillmentAsShipped,
  markOrderAsCompleted,
  printOrderInvoice,
  printOrderPackingList,
  retrieveOrder,
  sendReadyPickupEmail,
} from '../lib/pos';
import './Orders.css';

interface OrderLineItem {
  id: string;
  title: string;
  quantity: number;
  total?: number;
  unit_price?: number;
  thumbnail?: string;
  product_title?: string;
  product_id?: string;
  variant_id?: string;
  variant?: {
    title?: string;
    sku?: string;
    upc?: string;
    barcode?: string;
    ean?: string;
    requires_shipping?: boolean;
    options?: Array<{
      id?: string;
      value?: string;
      option?: {
        title?: string;
      };
    }>;
  };
  product?: {
    thumbnail?: string;
    images?: Array<{ url?: string }>;
  };
}

interface Order {
  id: string;
  display_id?: number;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  created_at: string;
  total: number;
  subtotal?: number;
  tax_total?: number;
  discount_total?: number;
  item_total?: number;
  shipping_total?: number;
  shipping_subtotal?: number;
  currency_code: string;
  summary?: {
    pending_difference?: number;
  };
  credit_lines?: Array<{
    amount?: number;
  }>;
  region?: {
    automatic_taxes?: boolean;
    currency_code?: string;
  };
  customer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
  };
  items?: OrderLineItem[];
  payment_collections?: Array<{
    id: string;
    status?: string;
    captured_amount?: number;
    refunded_amount?: number;
    payments?: Array<{
      id: string;
      provider_id?: string;
      captured_at?: string | null;
    }>;
  }>;
  shipping_methods?: Array<{
    id: string;
    name?: string;
    amount?: number;
  }>;
  fulfillments?: Array<{
    id: string;
    shipped_at?: string | null;
    delivered_at?: string | null;
    items?: Array<{ item_id?: string }>;
  }>;
  shipping_address?: {
    address_1?: string;
    address_2?: string;
    city?: string;
    province?: string;
    postal_code?: string;
    country_code?: string;
    country?: {
      display_name?: string;
    };
  };
}

interface CustomerOption {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

type ActionState =
  | 'capture-payment'
  | 'mark-completed'
  | 'send-ready-pickup'
  | 'fulfill-items'
  | 'mark-shipped'
  | 'mark-delivered'
  | 'print-invoice'
  | 'print-packing-list'
  | 'change-customer'
  | null;

// Hardcoded branding removed.
const STATUS_OPTIONS = ['pending', 'completed', 'canceled'];

const formatDate = (value: string) =>
  new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatCurrency = (amount?: number, currencyCode = 'CAD') =>
  (typeof amount === 'number' ? amount : 0).toLocaleString('en-US', {
    style: 'currency',
    currency: currencyCode.toUpperCase(),
    currencyDisplay: 'narrowSymbol',
  });

// Redundant formatCustomerName removed.

const formatCustomerAddress = (order: Order) =>
  order.shipping_address
    ? [
        order.shipping_address.address_1,
        order.shipping_address.address_2,
        [order.shipping_address.postal_code, order.shipping_address.city].filter(Boolean).join(' '),
        order.shipping_address.province,
        order.shipping_address.country?.display_name || order.shipping_address.country_code,
      ]
        .filter(Boolean)
        .join(', ')
    : undefined;

const formatListDate = (value: string) =>
  new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const hasShippingItems = (order?: Order | null) =>
  Boolean(order?.items?.some((item) => item.variant?.requires_shipping !== false));

const isPickupOrder = (order?: Order | null) => {
  const shippingMethodName = order?.shipping_methods?.[0]?.name?.toLowerCase() || '';
  return (
    shippingMethodName.includes('pickup') ||
    shippingMethodName.includes('store pickup') ||
    shippingMethodName.includes('collection')
  );
};

const getShippingFulfillmentStatus = (order?: Order | null) => {
  if (!order?.fulfillments?.length) return null;

  const shippingFulfillments = order.fulfillments.filter((fulfillment) => {
    if (!fulfillment.items?.length || !order.items?.length) return true;

    return fulfillment.items.some((entry) => {
      const lineItem = order.items?.find((item) => item.id === entry.item_id);
      return lineItem?.variant?.requires_shipping !== false;
    });
  });

  if (shippingFulfillments.some((fulfillment) => fulfillment.delivered_at)) return 'delivered';
  if (shippingFulfillments.some((fulfillment) => fulfillment.shipped_at)) return 'shipped';
  if (shippingFulfillments.length > 0) return 'fulfilled';

  return null;
};

const isFulfillmentProcessed = (order?: Order | null) => {
  const shippingStatus = getShippingFulfillmentStatus(order);
  return (
    order?.fulfillment_status === 'fulfilled' ||
    order?.fulfillment_status === 'shipped' ||
    order?.fulfillment_status === 'delivered' ||
    shippingStatus === 'shipped' ||
    shippingStatus === 'delivered'
  );
};

const isFullyCompleted = (order?: Order | null) => {
  if (!order) return false;

  const isPaid = order.payment_status === 'captured';
  const isFulfilled = order.fulfillment_status === 'fulfilled';

  if (hasShippingItems(order)) {
    return isPaid && isFulfilled && getShippingFulfillmentStatus(order) === 'delivered';
  }

  return isPaid && isFulfilled;
};

const getBadgeMeta = (kind: 'list' | 'order' | 'payment' | 'fulfillment', value?: string) => {
  if (kind === 'list') {
    if (value === 'canceled') return { label: 'Canceled', tone: 'red', icon: X };
    if (value === 'requires_action') return { label: 'Requires action', tone: 'yellow', icon: CircleAlert };
    if (value === 'draft') return { label: 'Draft', tone: 'blue', icon: FilePen };
    if (value === 'archived') return { label: 'Archived', tone: 'gray', icon: Archive };
    return getBadgeMeta('fulfillment', value);
  }

  const tables = {
    order: {
      archived: { label: 'Archived', tone: 'red', icon: Archive },
      canceled: { label: 'Canceled', tone: 'red', icon: X },
      completed: { label: 'Completed', tone: 'green', icon: Check },
      draft: { label: 'Draft', tone: 'yellow', icon: FilePen },
      pending: { label: 'Pending', tone: 'yellow', icon: CircleAlert },
      requires_action: { label: 'Requires action', tone: 'yellow', icon: CircleAlert },
    },
    payment: {
      authorized: { label: 'Authorized', tone: 'yellow', icon: CircleAlert },
      awaiting: { label: 'Awaiting', tone: 'yellow', icon: CircleAlert },
      canceled: { label: 'Canceled', tone: 'red', icon: X },
      captured: { label: 'Captured', tone: 'green', icon: Check },
      not_paid: { label: 'Not paid', tone: 'red', icon: X },
      partially_authorized: { label: 'Partially authorized', tone: 'yellow', icon: CircleAlert },
      partially_captured: { label: 'Partially captured', tone: 'yellow', icon: CircleAlert },
      partially_refunded: { label: 'Partially refunded', tone: 'yellow', icon: CircleAlert },
      refunded: { label: 'Refunded', tone: 'red', icon: X },
      requires_action: { label: 'Requires action', tone: 'yellow', icon: CircleAlert },
    },
    fulfillment: {
      not_fulfilled: { label: 'Not fulfilled', tone: 'red', icon: Package },
      partially_fulfilled: { label: 'Partially fulfilled', tone: 'yellow', icon: PackageOpen },
      fulfilled: { label: 'Fulfilled', tone: 'green', icon: Check },
      partially_shipped: { label: 'Partially shipped', tone: 'yellow', icon: Truck },
      shipped: { label: 'Shipped', tone: 'green', icon: Truck },
      delivered: { label: 'Delivered', tone: 'green', icon: Truck },
      partially_delivered: { label: 'Partially delivered', tone: 'yellow', icon: Truck },
      canceled: { label: 'Canceled', tone: 'red', icon: X },
    },
  } as const;

  const table = tables[kind];
  return table[value as keyof typeof table] || { label: 'Unknown', tone: 'gray', icon: HelpCircle };
};

const getListStatusValue = (order: Order) => {
  if (order.status === 'canceled') return 'canceled';
  if (order.status === 'requires_action') return 'requires_action';
  if (order.status === 'draft') return 'draft';
  if (order.status === 'archived') return 'archived';

  if (order.fulfillment_status) {
    return order.fulfillment_status;
  }

  if (order.status === 'completed') {
    return 'fulfilled';
  }

  return 'pending';
};

function StatusBadge({
  kind,
  value,
  className = '',
}: {
  kind: 'list' | 'order' | 'payment' | 'fulfillment';
  value?: string;
  className?: string;
}) {
  const meta = getBadgeMeta(kind, value);
  const Icon = meta.icon;

  return (
    <span className={`orders-status-badge orders-status-badge--${meta.tone} ${className}`.trim()}>
      <Icon size={14} strokeWidth={1.9} />
      <span>{meta.label}</span>
    </span>
  );
}

interface OrdersProps {
  storeName?: string;
  storeLogo: string;
  guestEmail: string;
}

export default function Orders({ storeName = 'POS', storeLogo, guestEmail }: OrdersProps) {
  const formatCustomerName = (order: Order) => {
    const name = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ').trim();
    if (name) return name;
    if (order.customer?.email === guestEmail || !order.customer?.email) return 'POS';
    return order.customer.email;
  };

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<ActionState>(null);
  const [isFulfillmentTypeOpen, setIsFulfillmentTypeOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [isCustomerTransferOpen, setIsCustomerTransferOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);

  const searchCustomers = async (query: string) => {
    setIsSearchingCustomers(true);

    try {
      const params = query && query.length > 1 ? { q: query, limit: 50, order: 'email' } : { limit: 50, order: 'email' };
      const response = await sdk.admin.customer.list(params);
      setCustomerOptions((response.customers || []) as CustomerOption[]);
    } catch (err) {
      console.error('Error searching customers:', err);
      setError(err instanceof Error ? err.message : 'Failed to search customers');
    } finally {
      setIsSearchingCustomers(false);
    }
  };

  const loadOrders = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const created_at =
        dateRange.startDate && dateRange.endDate
          ? {
              $gte: new Date(`${dateRange.startDate}T00:00:00`).toISOString(),
              $lte: new Date(`${dateRange.endDate}T23:59:59`).toISOString(),
            }
          : undefined;

      const response = await listOrders({
        q: searchQuery || undefined,
        status: statusFilter.length > 0 ? statusFilter : undefined,
        created_at,
        limit: 50,
      });

      const nextOrders = (response.orders || []) as Order[];
      setOrders(nextOrders);

      if (nextOrders.length > 0) {
        const preservedSelection = nextOrders.find((order) => order.id === selectedOrderId);
        setSelectedOrderId(preservedSelection?.id || nextOrders[0].id);
      } else {
        setSelectedOrderId(null);
        setSelectedOrder(null);
      }
    } catch (err) {
      console.error('Error loading orders:', err);
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  const loadOrderDetails = async (orderId: string) => {
    setIsLoadingDetails(true);

    try {
      const response = await retrieveOrder(orderId);
      setSelectedOrder(response.order as Order);
    } catch (err) {
      console.error('Error loading order details:', err);
      setError(err instanceof Error ? err.message : 'Failed to load order details');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadOrders();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery, statusFilter, dateRange.startDate, dateRange.endDate]);

  useEffect(() => {
    if (selectedOrderId) {
      loadOrderDetails(selectedOrderId);
    }
  }, [selectedOrderId]);

  useEffect(() => {
    if (!isCustomerTransferOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void searchCustomers(customerSearch);
    }, 200);

    return () => window.clearTimeout(timeoutId);
  }, [customerSearch, isCustomerTransferOpen]);

  const selectedListOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId],
  );

  const detailOrder = selectedOrder?.id === selectedOrderId ? selectedOrder : selectedListOrder;
  const currencyCode = detailOrder?.currency_code || 'CAD';
  const automaticTaxesOn = !!detailOrder?.region?.automatic_taxes;
  const shippingTotal = automaticTaxesOn ? detailOrder?.shipping_total : detailOrder?.shipping_subtotal;
  const paidTotal =
    detailOrder?.payment_collections?.reduce(
      (acc, collection) => acc + (collection.captured_amount ?? 0) - (collection.refunded_amount ?? 0),
      0,
    ) || 0;
  const creditLinesTotal =
    detailOrder?.credit_lines?.reduce((acc, line) => acc + (Number(line.amount) || 0), 0) || 0;

  const refreshAfterAction = async () => {
    await loadOrders();
    if (selectedOrderId) {
      await loadOrderDetails(selectedOrderId);
    }
  };

  const runOrderAction = async (state: ActionState, callback: () => Promise<void>) => {
    setError(null);
    setActionState(state);

    try {
      await callback();
      await refreshAfterAction();
    } catch (err) {
      console.error('Order action failed:', err);
      setError(err instanceof Error ? err.message : 'Order action failed');
    } finally {
      setActionState(null);
    }
  };

  const handleFulfillmentTypeSelect = async (type: 'pickup' | 'shipping') => {
    if (!detailOrder) return;

    setIsFulfillmentTypeOpen(false);
    await runOrderAction('fulfill-items', async () => {
      await createOrderFulfillment(detailOrder.id, type);
    });
  };

  const handleTrackingSubmit = async () => {
    if (!detailOrder) return;

    const fulfillment = detailOrder.fulfillments?.find((entry) => !entry.shipped_at);
    if (!fulfillment) {
      setError('No unshipped fulfillment found.');
      return;
    }

    setIsTrackingOpen(false);
    await runOrderAction('mark-shipped', async () => {
      await markFulfillmentAsShipped(fulfillment.id, trackingNumber.trim() || undefined);
    });
    setTrackingNumber('');
  };

  return (
    <section className="orders-screen">
      <div className="orders-screen__sidebar">
        <div className="orders-header">
          <h1>My Orders</h1>
        </div>

        <div className="orders-toolbar">
          <label className="orders-search-field">
            <Search size={18} strokeWidth={1.9} />
            <input
              className="orders-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search for a specific order..."
            />
          </label>

          <div className="orders-filters">
            {STATUS_OPTIONS.map((status) => {
              const isActive = statusFilter.includes(status);
              return (
                <button
                  key={status}
                  className={`orders-filter-chip ${isActive ? 'is-active' : ''}`}
                  onClick={() =>
                    setStatusFilter((current) =>
                      current.includes(status) ? current.filter((value) => value !== status) : [...current, status],
                    )
                  }
                >
                  {status}
                </button>
              );
            })}
          </div>

          <div className="orders-date-range">
            <label>
              <span>
                <CalendarRange size={14} strokeWidth={1.9} />
                <strong>From</strong>
              </span>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(event) => setDateRange((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>
            <label>
              <span>
                <CalendarRange size={14} strokeWidth={1.9} />
                <strong>To</strong>
              </span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(event) => setDateRange((current) => ({ ...current, endDate: event.target.value }))}
              />
            </label>
          </div>
        </div>

        {error ? <div className="orders-banner orders-banner--error">{error}</div> : null}

        <div className="orders-list-panel">
          {isLoading ? (
            <div className="orders-loading">
              <div className="loading-spinner"></div>
            </div>
          ) : null}

          {!isLoading && orders.length === 0 ? (
            <div className="orders-empty-state">
              <CircleAlert size={24} strokeWidth={1.9} />
              <h2>No orders match the search</h2>
            </div>
          ) : null}

          {!isLoading ? (
            <div className="orders-list">
              {orders.map((order) => {
                const isSelected = selectedOrderId === order.id;

                return (
                  <button
                    key={order.id}
                    className={`order-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                    <div className="order-card__main">
                      <div className="order-card__copy">
                        <strong>Order #{order.display_id || order.id.slice(-6)}</strong>
                        <div className="order-card__customer">
                          <UserRound size={16} strokeWidth={1.9} />
                          <span>{formatCustomerName(order)}</span>
                        </div>
                        <span className="order-card__total">{formatCurrency(order.total, order.currency_code)}</span>
                      </div>

                      <div className="order-card__meta">
                        <small>{formatListDate(order.created_at)}</small>
                        <StatusBadge kind="list" value={getListStatusValue(order)} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="orders-screen__details">
        {!detailOrder && !isLoadingDetails ? (
          <div className="order-details-empty">
            <h2>Select an order to view details</h2>
          </div>
        ) : null}

        {isLoadingDetails ? (
          <div className="orders-loading orders-loading--details">
            <div className="loading-spinner"></div>
          </div>
        ) : null}

        {detailOrder && !isLoadingDetails ? (
          <div className="order-details-panel">
            <div className="order-details-panel__topbar">
              <h2>Order #{detailOrder.display_id || detailOrder.id.slice(-6)}</h2>
              <span>{formatDate(detailOrder.created_at)}</span>
            </div>

            <section className="order-info-section order-info-section--actions order-info-section--actions-bar">
              <h3>Actions</h3>

              <div className="order-actions">
                {detailOrder.payment_status !== 'captured' ? (
                  <button
                    className="order-action-button order-action-button--primary"
                    onClick={() =>
                      runOrderAction('capture-payment', async () => {
                        await captureOrderPayment(detailOrder.id);
                      })
                    }
                    disabled={actionState !== null}
                  >
                    <CreditCard size={16} strokeWidth={1.9} />
                    <span>{actionState === 'capture-payment' ? 'Processing...' : 'Mark as Paid'}</span>
                  </button>
                ) : null}

                {detailOrder.status === 'pending' ? (
                  <button
                    className="order-action-button order-action-button--primary"
                    onClick={() =>
                      runOrderAction('mark-completed', async () => {
                        await markOrderAsCompleted(detailOrder.id);
                      })
                    }
                    disabled={actionState !== null}
                  >
                    <Check size={16} strokeWidth={1.9} />
                    <span>{actionState === 'mark-completed' ? 'Completing...' : 'Mark as Completed'}</span>
                  </button>
                ) : null}

                {isPickupOrder(detailOrder) && detailOrder.fulfillment_status !== 'not_fulfilled' ? (
                  <button
                    className="order-action-button order-action-button--secondary"
                    onClick={() =>
                      runOrderAction('send-ready-pickup', async () => {
                        await sendReadyPickupEmail(detailOrder.id);
                      })
                    }
                    disabled={actionState !== null}
                  >
                    <Mail size={16} strokeWidth={1.9} />
                    <span>{actionState === 'send-ready-pickup' ? 'Sending...' : 'Send Ready for Pickup Notification'}</span>
                  </button>
                ) : null}

                {!isFulfillmentProcessed(detailOrder) ? (
                  <button
                    className="order-action-button order-action-button--secondary"
                    onClick={() => setIsFulfillmentTypeOpen(true)}
                    disabled={actionState !== null}
                  >
                    <PackageOpen size={16} strokeWidth={1.9} />
                    <span>{actionState === 'fulfill-items' ? 'Creating Fulfillment...' : 'Fulfill Items'}</span>
                  </button>
                ) : null}

                {hasShippingItems(detailOrder) &&
                !isPickupOrder(detailOrder) &&
                getShippingFulfillmentStatus(detailOrder) === 'fulfilled' ? (
                  <button
                    className="order-action-button order-action-button--secondary"
                    onClick={() => setIsTrackingOpen(true)}
                    disabled={actionState !== null}
                  >
                    <Truck size={16} strokeWidth={1.9} />
                    <span>{actionState === 'mark-shipped' ? 'Marking as Shipped...' : 'Mark as Shipped'}</span>
                  </button>
                ) : null}

                {getShippingFulfillmentStatus(detailOrder) === 'shipped' ? (
                  <button
                    className="order-action-button order-action-button--secondary"
                    onClick={() => {
                      const fulfillment = detailOrder.fulfillments?.find(
                        (entry) => entry.shipped_at && !entry.delivered_at,
                      );

                      if (!fulfillment) {
                        setError('No shipped fulfillment found.');
                        return;
                      }

                      runOrderAction('mark-delivered', async () => {
                        await markFulfillmentAsDelivered(detailOrder.id, fulfillment.id);
                      });
                    }}
                    disabled={actionState !== null}
                  >
                    <Truck size={16} strokeWidth={1.9} />
                    <span>{actionState === 'mark-delivered' ? 'Marking as Delivered...' : 'Mark as Delivered'}</span>
                  </button>
                ) : null}

                <button
                  className="order-action-button order-action-button--secondary"
                  onClick={() => {
                    setCustomerSearch('');
                    setIsCustomerTransferOpen(true);
                    void searchCustomers('');
                  }}
                  disabled={actionState !== null}
                >
                  <Edit size={16} strokeWidth={1.9} />
                  <span>Change Customer</span>
                </button>

                <button
                  className="order-action-button order-action-button--secondary"
                  onClick={() =>
                    runOrderAction('print-invoice', async () => {
                      await printOrderInvoice(detailOrder.id);
                    })
                  }
                  disabled={actionState !== null}
                >
                  <Printer size={16} strokeWidth={1.9} />
                  <span>{actionState === 'print-invoice' ? 'Printing...' : 'Print Invoice'}</span>
                </button>

                <button
                  className="order-action-button order-action-button--secondary"
                  onClick={() =>
                    runOrderAction('print-packing-list', async () => {
                      await printOrderPackingList(detailOrder.id);
                    })
                  }
                  disabled={actionState !== null}
                >
                  <Printer size={16} strokeWidth={1.9} />
                  <span>{actionState === 'print-packing-list' ? 'Printing...' : 'Print Packing List'}</span>
                </button>

                {isFullyCompleted(detailOrder) ? (
                  <div className="order-complete-banner">Order has been paid and fulfilled</div>
                ) : null}
              </div>
            </section>

            <div className="order-details-layout">
              <div className="order-items-column">
                <h3>Cart Items</h3>

                <div className="order-items-list">
                  {detailOrder.items?.map((item, index) => {
                    const thumbnail =
                      item.thumbnail || item.product?.thumbnail || item.product?.images?.[0]?.url;
                    const optionText = item.variant?.options?.map((option) => option.value).filter(Boolean).join(', ');

                    return (
                      <div key={item.id} className={`order-item-row ${index === detailOrder.items!.length - 1 ? 'is-last' : ''}`}>
                        <div className="order-item-row__media">
                          {thumbnail ? <img src={thumbnail} alt={item.title} /> : null}
                        </div>

                        <div className="order-item-row__content">
                          <strong>{item.title}</strong>
                          <span>{optionText || item.variant?.title || item.variant?.sku || 'Default variant'}</span>
                        </div>

                        <div className="order-item-row__meta">
                          <strong>{formatCurrency(item.total ?? (item.unit_price || 0) * item.quantity, currencyCode)}</strong>
                          <span>Qty: {item.quantity.toLocaleString('en-US')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <aside className="order-summary-column">
                <section className="order-info-section">
                  <h3>Order Details</h3>

                  <div className="order-info-rows">
                    <div className="order-info-row">
                      <span>Order Status</span>
                      <StatusBadge kind="order" value={detailOrder.status} />
                    </div>

                    <div className="order-info-row">
                      <span>Payment Status</span>
                      <StatusBadge kind="payment" value={detailOrder.payment_status} />
                    </div>

                    {detailOrder.payment_collections?.[0]?.payments?.[0]?.provider_id ? (
                      <div className="order-info-row">
                        <span>Payment Method</span>
                        <strong className="order-info-row__text">
                          {detailOrder.payment_collections[0].payments[0].provider_id?.replace(/_/g, ' ')}
                        </strong>
                      </div>
                    ) : null}

                    <div className="order-info-row">
                      <span>Shipping Method</span>
                      <strong className="order-info-row__text">
                        {detailOrder.shipping_methods?.[0]?.name || 'Standard Shipping'}
                      </strong>
                    </div>

                    <div className="order-info-row">
                      <span>Fulfillment Status</span>
                      <StatusBadge kind="fulfillment" value={detailOrder.fulfillment_status} />
                    </div>

                    {detailOrder.shipping_methods?.[0]?.name ? (
                      <div className="order-info-row">
                        <span>Shipping Charge</span>
                        <strong className="order-info-row__text">
                          {detailOrder.shipping_methods[0].amount
                            ? `${detailOrder.shipping_methods[0].name} - ${formatCurrency(
                                detailOrder.shipping_methods[0].amount,
                                currencyCode,
                              )}`
                            : detailOrder.shipping_methods[0].name}
                        </strong>
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="order-info-section">
                  <h3>Customer</h3>

                  {detailOrder.customer?.email && detailOrder.customer.email !== guestEmail ? (
                    <div className="order-info-rows">
                      <div className="order-info-row">
                        <span>Full Name</span>
                        <strong className="order-info-row__text">{formatCustomerName(detailOrder)}</strong>
                      </div>
                      <div className="order-info-row">
                        <span>Mail</span>
                        <strong className="order-info-row__text">{detailOrder.customer.email}</strong>
                      </div>
                      {formatCustomerAddress(detailOrder) ? (
                        <div className="order-info-row">
                          <span>Address</span>
                          <strong className="order-info-row__text">{formatCustomerAddress(detailOrder)}</strong>
                        </div>
                      ) : null}
                      {detailOrder.customer?.phone ? (
                        <div className="order-info-row">
                          <span>Phone</span>
                          <strong className="order-info-row__text">{detailOrder.customer.phone}</strong>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="order-info-empty">
                      No customer information available. This order was created on POS without a customer.
                    </p>
                  )}
                </section>

                <section className="order-info-section">
                  <h3>Summary</h3>

                  <div className="order-info-rows">
                    <div className="order-info-row">
                      <span>{automaticTaxesOn ? 'Subtotal (incl. taxes)' : 'Subtotal'}</span>
                      <strong className="order-info-row__text">
                        {formatCurrency(detailOrder.item_total ?? detailOrder.subtotal, currencyCode)}
                      </strong>
                    </div>

                    {typeof shippingTotal === 'number' && shippingTotal > 0 ? (
                      <div className="order-info-row">
                        <span>{automaticTaxesOn ? 'Shipping (incl. taxes)' : 'Shipping'}</span>
                        <strong className="order-info-row__text">{formatCurrency(shippingTotal, currencyCode)}</strong>
                      </div>
                    ) : null}

                    {typeof detailOrder.discount_total === 'number' && detailOrder.discount_total > 0 ? (
                      <div className="order-info-row">
                        <span>Discount</span>
                        <strong className="order-info-row__text">
                          {formatCurrency(detailOrder.discount_total * -1, currencyCode)}
                        </strong>
                      </div>
                    ) : null}

                    <div className="order-info-row">
                      <span>Tax Total{automaticTaxesOn ? ' (included)' : ''}</span>
                      <strong className="order-info-row__text">{formatCurrency(detailOrder.tax_total, currencyCode)}</strong>
                    </div>

                    <div className="order-info-divider"></div>

                    <div className="order-info-row">
                      <span>Paid Total</span>
                      <strong className="order-info-row__text">{formatCurrency(paidTotal, currencyCode)}</strong>
                    </div>

                    <div className="order-info-row">
                      <span>Credit Lines Total</span>
                      <strong className="order-info-row__text">{formatCurrency(creditLinesTotal, currencyCode)}</strong>
                    </div>

                    <div className="order-info-row">
                      <span>Outstanding Amount</span>
                      <strong className="order-info-row__text">
                        {formatCurrency(detailOrder.summary?.pending_difference, currencyCode)}
                      </strong>
                    </div>

                    <div className="order-info-divider"></div>

                    <div className="order-info-row order-info-row--total">
                      <span>Total</span>
                      <strong>{formatCurrency(detailOrder.total, currencyCode)}</strong>
                    </div>
                  </div>
                </section>

              </aside>
            </div>
          </div>
        ) : null}
      </div>

      {isFulfillmentTypeOpen ? (
        <div className="orders-modal-overlay" onClick={() => setIsFulfillmentTypeOpen(false)}>
          <div className="orders-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Select Fulfillment Type</h3>
            <p>Choose how this order should be fulfilled.</p>
            <div className="orders-modal__actions orders-modal__actions--stack">
              <button className="order-action-button order-action-button--secondary" onClick={() => handleFulfillmentTypeSelect('pickup')}>
                <PackageOpen size={16} strokeWidth={1.9} />
                <span>Pickup</span>
              </button>
              <button className="order-action-button order-action-button--secondary" onClick={() => handleFulfillmentTypeSelect('shipping')}>
                <Truck size={16} strokeWidth={1.9} />
                <span>Shipping</span>
              </button>
              <button className="order-action-button order-action-button--ghost" onClick={() => setIsFulfillmentTypeOpen(false)}>
                <span>Cancel</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isTrackingOpen ? (
        <div className="orders-modal-overlay" onClick={() => setIsTrackingOpen(false)}>
          <div className="orders-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Add Tracking Number</h3>
            <p>Optional. Leave blank to mark the fulfillment as shipped without a tracking code.</p>
            <input
              className="orders-search"
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value)}
              placeholder="Tracking number"
            />
            <div className="orders-modal__actions">
              <button className="order-action-button order-action-button--ghost" onClick={() => setIsTrackingOpen(false)}>
                <span>Cancel</span>
              </button>
              <button className="order-action-button order-action-button--secondary" onClick={handleTrackingSubmit}>
                <Truck size={16} strokeWidth={1.9} />
                <span>Confirm Shipment</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCustomerTransferOpen && detailOrder ? (
        <div className="orders-modal-overlay" onClick={() => setIsCustomerTransferOpen(false)}>
          <div className="orders-modal orders-modal--customer" onClick={(event) => event.stopPropagation()}>
            <h3>Change Customer</h3>
            <p>
              Choose a customer to directly reassign this order.
            </p>

            <label className="orders-search-field">
              <Search size={18} strokeWidth={1.9} />
              <input
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Search customers by name or email"
              />
            </label>

            <div className="orders-customer-list">
              {isSearchingCustomers ? <div className="orders-customer-empty">Searching customers...</div> : null}

              {!isSearchingCustomers && customerOptions.length === 0 ? (
                <div className="orders-customer-empty">No customers found.</div>
              ) : null}

              {!isSearchingCustomers
                ? customerOptions
                    .filter((customer) => customer.email !== detailOrder.customer?.email)
                    .map((customer) => {
                      const customerName =
                        [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() || customer.email;

                      return (
                        <button
                          key={customer.id}
                          className="orders-customer-option"
                          onClick={() => {
                            runOrderAction('change-customer', async () => {
                              await changeOrderCustomer(detailOrder.id, {
                                customer_id: customer.id,
                              });
                            });
                            setIsCustomerTransferOpen(false);
                          }}
                        >
                          <div>
                            <strong>{customerName}</strong>
                            <span>{customer.email}</span>
                          </div>
                          <span>Transfer</span>
                        </button>
                      );
                    })
                : null}
            </div>

            <div className="orders-modal__actions">
              <button className="order-action-button order-action-button--ghost" onClick={() => setIsCustomerTransferOpen(false)}>
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
