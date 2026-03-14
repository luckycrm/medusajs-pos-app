import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ShoppingCart, Tag, Trash2, UserRound } from 'lucide-react';
import {
  addCustomItemToDraftOrder,
  addPromotionToDraftOrder,
  cancelCurrentDraftOrder,
  completeCurrentDraftOrder,
  getCurrentDraftOrder,
  getDraftOrderId,
  posScanAdd,
  posScanBatchAdd,
  removePromotionFromDraftOrder,
  updateDraftOrderItemQuantity,
} from '../lib/pos';
import './Cart.css';

interface Customer {
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

interface DraftOrderItem {
  id: string;
  title: string;
  subtitle?: string;
  quantity: number;
  variant_id?: string | null;
  unit_price?: number;
  total?: number;
  thumbnail?: string;
  adjustments?: Array<{
    code?: string | null;
  }>;
  metadata?: {
    description?: string;
  };
  variant?: {
    title?: string;
    sku?: string;
    options?: Array<{
      id?: string;
      value?: string;
      option?: {
        title?: string;
      };
    }>;
  };
}

interface DraftOrder {
  id: string;
  display_id?: number;
  customer?: Customer;
  items: DraftOrderItem[];
  subtotal?: number;
  tax_total?: number;
  discount_total?: number;
  total?: number;
  currency_code?: string;
}

interface CartProps {
  storeName?: string;
  storeLogo: string;
  guestEmail: string;
  onBack: () => void;
  onComplete: () => void;
}

// Hardcoded branding removed.

const emptyCustomItem = {
  title: '',
  quantity: 1,
  unitPrice: '',
  description: '',
};

const formatCurrency = (amount?: number, currencyCode = 'CAD') => {
  const value = typeof amount === 'number' ? amount : 0;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: 'narrowSymbol',
  });
};

const getCustomerName = (customer?: Customer) => {
  if (!customer) return '';
  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim();
  return fullName || customer.email || '';
};

export default function Cart({ storeName = 'POS', storeLogo, guestEmail, onBack, onComplete }: CartProps) {
  const scannerCommitTimeoutRef = useRef<number | null>(null);
  const scanTimeoutRef = useRef<number | null>(null);
  const scanBufferRef = useRef<Map<string, number>>(new Map());
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const [draftOrder, setDraftOrder] = useState<DraftOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isCustomItemOpen, setIsCustomItemOpen] = useState(false);
  const [isPromotionOpen, setIsPromotionOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [scannerInput, setScannerInput] = useState('');
  const [bufferedScanCount, setBufferedScanCount] = useState(0);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const isProcessingScanRef = useRef(false);
  const [promotionCode, setPromotionCode] = useState('');
  const [customItem, setCustomItem] = useState(emptyCustomItem);

  const loadDraftOrder = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const order = await getCurrentDraftOrder();
      if (!order) {
        onBack();
        return;
      }
      setDraftOrder(order as DraftOrder);
    } catch (err) {
      console.error('Error loading draft order:', err);
      setError(err instanceof Error ? err.message : 'Failed to load cart');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDraftOrder();
  }, []);

  useEffect(() => {
    // Focus on mount
    const timer = setTimeout(() => scannerInputRef.current?.focus(), 100);

    // Periodically check focus to ensure scanner is always ready
    // unless a modal is open
    const focusInterval = setInterval(() => {
      if (!isCheckoutOpen && !isCustomItemOpen && !isPromotionOpen) {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
          scannerInputRef.current?.focus();
        }
      }
    }, 2000);

    return () => {
      clearTimeout(timer);
      clearInterval(focusInterval);
      if (scannerCommitTimeoutRef.current) {
        window.clearTimeout(scannerCommitTimeoutRef.current);
      }
      if (scanTimeoutRef.current) {
        window.clearTimeout(scanTimeoutRef.current);
      }
    };
  }, [isCheckoutOpen, isCustomItemOpen, isPromotionOpen]);

  const currencyCode = draftOrder?.currency_code?.toUpperCase() || 'CAD';
  const customerName = getCustomerName(draftOrder?.customer);
  const customerEmail = draftOrder?.customer?.email;
  const customerPhone = draftOrder?.customer?.phone;
  const isGuestCheckout = !customerEmail || customerEmail === guestEmail;
  const customerPrimaryLabel = customerName || customerEmail || 'No customer selected';
  const customerSecondaryLabel = customerEmail || customerPhone || '';

  const itemCount = useMemo(
    () => draftOrder?.items?.reduce((count, item) => count + item.quantity, 0) ?? 0,
    [draftOrder],
  );
  const promotionCodes = useMemo(() => {
    const codes = new Set<string>();
    draftOrder?.items?.forEach((item) => {
      item.adjustments?.forEach((adjustment) => {
        if (adjustment.code) {
          codes.add(adjustment.code);
        }
      });
    });
    return Array.from(codes);
  }, [draftOrder]);

  const handleQuantityChange = async (itemId: string, nextQuantity: number) => {
    if (!draftOrder) return;

    setIsSaving(true);
    setError(null);
    try {
      const updatedDraftOrder = await updateDraftOrderItemQuantity(itemId, nextQuantity);
      setDraftOrder(updatedDraftOrder as DraftOrder);
    } catch (err) {
      console.error('Error updating draft order item:', err);
      setError(err instanceof Error ? err.message : 'Failed to update item');
    } finally {
      setIsSaving(false);
    }
  };

const handleAddCustomItem = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const updatedDraftOrder = await addCustomItemToDraftOrder({
        title: customItem.title,
        quantity: Number(customItem.quantity),
        unit_price: Number(customItem.unitPrice),
        description: customItem.description || undefined,
      });
      setDraftOrder(updatedDraftOrder as DraftOrder);
      setCustomItem(emptyCustomItem);
      setIsCustomItemOpen(false);
    } catch (err) {
      console.error('Error adding custom item:', err);
      setError(err instanceof Error ? err.message : 'Failed to add custom item');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPromotion = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!promotionCode.trim()) return;

    setIsSaving(true);
    setError(null);
    try {
      const updatedDraftOrder = await addPromotionToDraftOrder(promotionCode.trim());
      setDraftOrder(updatedDraftOrder as DraftOrder);
      setPromotionCode('');
      setIsPromotionOpen(false);
    } catch (err) {
      console.error('Error adding promotion:', err);
      setError(err instanceof Error ? err.message : 'Failed to add promotion');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemovePromotion = async (code: string) => {
    setIsSaving(true);
    setError(null);
    try {
      const updatedDraftOrder = await removePromotionFromDraftOrder(code);
      setDraftOrder(updatedDraftOrder as DraftOrder);
    } catch (err) {
      console.error('Error removing promotion:', err);
      setError(err instanceof Error ? err.message : 'Failed to remove promotion');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelCart = async () => {
    setIsCancelling(true);
    setError(null);

    try {
      await cancelCurrentDraftOrder();
      onBack();
    } catch (err) {
      console.error('Error cancelling draft order:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel cart');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCompleteOrder = async () => {
    setIsSaving(true);
    setError(null);

    try {
      await completeCurrentDraftOrder();
      setIsCheckoutOpen(false);
      onComplete();
    } catch (err) {
      console.error('Error completing draft order:', err);
      setError(err instanceof Error ? err.message : 'Failed to complete order');
    } finally {
      setIsSaving(false);
    }
  };

  const processScanBuffer = async () => {
    if (isProcessingScanRef.current || scanBufferRef.current.size === 0) {
      return;
    }

    isProcessingScanRef.current = true;
    setIsProcessingScan(true);
    setError(null);

    const barcodeCounts = new Map(scanBufferRef.current);
    scanBufferRef.current.clear();
    setBufferedScanCount(0);

    if (scanTimeoutRef.current) {
      window.clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    try {
      if (barcodeCounts.size > 0) {
        const batchItems = Array.from(barcodeCounts.entries()).map(([barcode, quantity]) => ({
          barcode,
          quantity,
        }));

        console.log('[POS Cart] Sending batch scan-add', { items: batchItems });
        await posScanBatchAdd(batchItems);

        const refreshedDraftOrder = await getCurrentDraftOrder();
        if (refreshedDraftOrder) {
          setDraftOrder(refreshedDraftOrder as DraftOrder);
        }
      }
    } catch (err) {
      console.error('Error in batch scanning:', err);
      setError(err instanceof Error ? err.message : 'Failed to process batch scans');
    } finally {
      isProcessingScanRef.current = false;
      setIsProcessingScan(false);

      if (scanBufferRef.current.size > 0) {
        scanTimeoutRef.current = window.setTimeout(() => {
          void processScanBuffer();
        }, 150);
      }
    }
  };

  const scheduleBatchProcessing = (mode: 'debounced' | 'immediate' = 'debounced') => {
    if (scanTimeoutRef.current) {
      window.clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    if (mode === 'immediate') {
      void processScanBuffer();
      return;
    }

    scanTimeoutRef.current = window.setTimeout(() => {
      void processScanBuffer();
    }, 150);
  };

  const queueBarcode = (barcode: string, mode: 'debounced' | 'immediate' = 'debounced') => {
    const cleanBarcode = barcode.trim().replace(/[\n\r]/g, '');
    if (!cleanBarcode) return;

    const currentCount = scanBufferRef.current.get(cleanBarcode) || 0;
    scanBufferRef.current.set(cleanBarcode, currentCount + 1);
    setBufferedScanCount(Array.from(scanBufferRef.current.values()).reduce((sum, count) => sum + count, 0));
    setScannerInput('');
    scheduleBatchProcessing(mode);
  };

  const handleScannerInputChange = (value: string) => {
    setScannerInput(value);

    const trimmedValue = value.trim();
    const cleanBarcode = trimmedValue.replace(/[\n\r]/g, '');
    const hasNewline = value.includes('\n') || value.includes('\r');
    const isTypicalScanLength = cleanBarcode.length >= 3 && cleanBarcode.length <= 64;
    const isValidScanValue = /^[a-z0-9._\-\/]+$/i.test(cleanBarcode);

    if (scannerCommitTimeoutRef.current) {
      window.clearTimeout(scannerCommitTimeoutRef.current);
      scannerCommitTimeoutRef.current = null;
    }

    if (!isTypicalScanLength || !isValidScanValue) {
      return;
    }

    scannerCommitTimeoutRef.current = window.setTimeout(() => {
      queueBarcode(cleanBarcode);
      scannerCommitTimeoutRef.current = null;
    }, 150);
  };

  const handleScannerSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (scannerCommitTimeoutRef.current) {
      window.clearTimeout(scannerCommitTimeoutRef.current);
      scannerCommitTimeoutRef.current = null;
    }
    queueBarcode(scannerInput, 'immediate');
  };

  if (isLoading) {
    return (
      <section className="cart-screen">
        <div className="cart-screen__loading">
          <div className="loading-spinner"></div>
          <p>Loading cart...</p>
        </div>
      </section>
    );
  }

  if (!draftOrder || !getDraftOrderId()) {
    return (
      <section className="cart-screen">
        <div className="cart-screen__empty">
          <h1>Cart</h1>
          <p>Redirecting to customer selection...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="cart-screen">
      <div className="cart-screen__grid">
        <aside className="cart-sidebar">
          <div className="cart-panel">
            <div className="cart-panel__eyebrow">Customer</div>
            <h2>{customerPrimaryLabel}</h2>
            {customerSecondaryLabel ? <p>{customerSecondaryLabel}</p> : null}
          </div>

          <div className="cart-sidebar__actions">
            <div className="cart-action-row">
              <button className="cart-action-tile" onClick={onBack}>
                <UserRound size={28} strokeWidth={1.9} />
                <strong>Change Customer</strong>
                <span>Select or switch</span>
              </button>
              <button className="cart-action-tile cart-action-tile--blue" onClick={() => setIsCustomItemOpen(true)}>
                <Plus size={30} strokeWidth={1.9} />
                <strong>Custom Item</strong>
                <span>Add manual line</span>
              </button>
            </div>
            <div className="cart-action-row">
              <button className="cart-action-tile cart-action-tile--emerald" onClick={() => setIsPromotionOpen(true)}>
                <Tag size={28} strokeWidth={1.9} />
                <strong>Promotion</strong>
                <span>Apply discount</span>
              </button>
              <button
                className="cart-action-tile cart-action-tile--danger"
                onClick={handleCancelCart}
                disabled={isCancelling || isSaving}
              >
                <Trash2 size={26} strokeWidth={1.9} />
                <strong>{isCancelling ? 'Cancelling...' : 'Delete Cart'}</strong>
                <span>Remove all items</span>
              </button>
            </div>
            <button
              className="cart-action-tile cart-action-tile--success cart-action-tile--primary cart-action-tile--complete"
              onClick={() => setIsCheckoutOpen(true)}
              disabled={draftOrder.items.length === 0 || isSaving}
            >
              <ShoppingCart size={30} strokeWidth={1.9} />
              <strong>Complete Order</strong>
              <span>{draftOrder.items.length > 0 ? 'Open payment' : 'Cart is empty'}</span>
            </button>
          </div>
        </aside>

        <div className="cart-main">
          <div className="cart-workbench">
            <div className="cart-main__header">
              <form className="cart-scanner-form" onSubmit={handleScannerSubmit}>
                <input
                  ref={scannerInputRef}
                  type="text"
                  value={scannerInput}
                  onChange={(event) => handleScannerInputChange(event.target.value)}
                  placeholder="Scan or enter UPC / barcode"
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  inputMode="text"
                  autoFocus
                />
                <button
                  type="button"
                  className="cart-scanner-button cart-scanner-button--ghost"
                  onClick={() => setScannerInput('')}
                  disabled={!scannerInput}
                >
                  Clear
                </button>
              </form>

              <div className="cart-heading-row">
                <h1>Cart</h1>
                <p>{itemCount > 0 ? `${draftOrder.items.length} item(s)` : 'No items yet'}</p>
              </div>
            </div>

            {(isProcessingScan || bufferedScanCount > 0) ? (
              <div className={`cart-scan-status ${isProcessingScan ? 'is-processing' : ''}`}>
                <div className="cart-scan-status__loader" aria-hidden="true"></div>
              </div>
            ) : null}

            {error ? <div className="cart-banner cart-banner--error">{error}</div> : null}

            <div className="cart-items-panel">
              <div className="cart-section-label">
                <span>Draft Order</span>
              </div>
              {draftOrder.items.length === 0 ? (
                <div className="cart-empty-state">
                  <img className="cart-empty-state__logo" src={storeLogo} alt={`${storeName} Logo`} width={384} height={126} />
                  <h2>Your cart is empty</h2>
                  <p>Add products from the left side</p>
                </div>
              ) : (
                <div className="cart-items-list">
                  {draftOrder.items.map((item) => (
                    <article key={item.id} className="cart-line-item">
                      <div className="cart-line-item__media">
                        {item.thumbnail ? <img src={item.thumbnail} alt={item.title} /> : <span>{item.title.slice(0, 2).toUpperCase()}</span>}
                      </div>
                      <div className="cart-line-item__details">
                        <h2>{item.title}</h2>
                        {item.metadata?.description ? <p>{item.metadata.description}</p> : null}
                        {item.subtitle || item.variant?.title ? (
                          <p>{item.subtitle || item.variant?.title}</p>
                        ) : null}
                        {item.variant?.sku ? <span>SKU: {item.variant.sku}</span> : null}
                        {item.variant?.options?.length ? (
                          <div className="cart-line-item__options">
                            {item.variant.options.map((option) => (
                              <span key={option.id || `${option.option?.title}-${option.value}`}>
                                {option.option?.title || 'Option'}: {option.value}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="cart-line-item__controls">
                        <div className="quantity-stepper">
                          <button onClick={() => handleQuantityChange(item.id, item.quantity - 1)} disabled={isSaving}>
                            -
                          </button>
                          <span>{item.quantity}</span>
                          <button onClick={() => handleQuantityChange(item.id, item.quantity + 1)} disabled={isSaving}>
                            +
                          </button>
                        </div>

                        <div className="cart-line-item__pricing">
                          <strong>{formatCurrency(item.total ?? (item.unit_price || 0) * item.quantity, currencyCode)}</strong>
                          <span>{formatCurrency(item.unit_price, currencyCode)} each</span>
                        </div>
                        <button
                          className="cart-line-item__remove"
                          onClick={() => handleQuantityChange(item.id, 0)}
                          disabled={isSaving}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="cart-summary-panel">
                <div className="cart-totals">
                  <div className="cart-totals__row">
                    <span>Taxes</span>
                    <span>{formatCurrency(draftOrder.tax_total, currencyCode)}</span>
                  </div>
                  <div className="cart-totals__row">
                    <span>Subtotal</span>
                    <span>{formatCurrency(draftOrder.subtotal, currencyCode)}</span>
                  </div>
                  {typeof draftOrder.discount_total === 'number' && draftOrder.discount_total > 0 ? (
                    <div className="cart-totals__row">
                      <span>Discount</span>
                      <span>-{formatCurrency(draftOrder.discount_total, currencyCode)}</span>
                    </div>
                  ) : null}
                </div>

                {promotionCodes.length > 0 ? (
                  <div className="cart-promotions">
                    <div className="cart-promotions__list">
                      {promotionCodes.map((code) => (
                        <div key={code} className="cart-promotion-chip">
                          <span>{code}</span>
                          <button onClick={() => handleRemovePromotion(code)} disabled={isSaving}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="cart-summary-panel__divider"></div>
                <div className="cart-totals">
                  <div className="cart-totals__row cart-totals__row--total">
                    <span>Total</span>
                    <strong>{formatCurrency(draftOrder.total, currencyCode)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isCustomItemOpen ? (
        <div className="cart-modal-overlay" onClick={() => setIsCustomItemOpen(false)}>
          <div className="cart-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Add Custom Item</h2>
            <p>Create a manual line item exactly like the Expo POS flow.</p>
            <form className="cart-modal__form" onSubmit={handleAddCustomItem}>
              <label>
                <span>Title</span>
                <input
                  type="text"
                  value={customItem.title}
                  onChange={(event) => setCustomItem((current) => ({ ...current, title: event.target.value }))}
                  required
                />
              </label>
              <div className="cart-modal__grid">
                <label>
                  <span>Quantity</span>
                  <input
                    type="number"
                    min="1"
                    value={customItem.quantity}
                    onChange={(event) =>
                      setCustomItem((current) => ({ ...current, quantity: Number(event.target.value) || 1 }))
                    }
                    required
                  />
                </label>
                <label>
                  <span>Unit Price</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={customItem.unitPrice}
                    onChange={(event) => setCustomItem((current) => ({ ...current, unitPrice: event.target.value }))}
                    required
                  />
                </label>
              </div>
              <label>
                <span>Description</span>
                <textarea
                  rows={3}
                  value={customItem.description}
                  onChange={(event) => setCustomItem((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <div className="cart-modal__actions">
                <button type="button" className="cart-button cart-button--secondary" onClick={() => setIsCustomItemOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="cart-button cart-button--primary" disabled={isSaving}>
                  {isSaving ? 'Adding...' : 'Add Custom Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isPromotionOpen ? (
        <div className="cart-modal-overlay" onClick={() => setIsPromotionOpen(false)}>
          <div className="cart-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Add Promotion</h2>
            <p>Apply a promotion code to this draft order.</p>
            <form className="cart-modal__form" onSubmit={handleAddPromotion}>
              <label>
                <span>Promotion Code</span>
                <input
                  type="text"
                  value={promotionCode}
                  onChange={(event) => setPromotionCode(event.target.value)}
                  placeholder="Enter code"
                  required
                />
              </label>
              <div className="cart-modal__actions">
                <button type="button" className="cart-button cart-button--secondary" onClick={() => setIsPromotionOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="cart-button cart-button--primary" disabled={isSaving}>
                  {isSaving ? 'Applying...' : 'Apply Promotion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isCheckoutOpen ? (
        <div className="cart-modal-overlay" onClick={() => setIsCheckoutOpen(false)}>
          <div className="cart-modal cart-modal--checkout" onClick={(event) => event.stopPropagation()}>
            <h2>Complete Order</h2>
            <div className="cart-checkout-callout">
              <strong>Review cart and confirm payment.</strong>
              <span>{draftOrder.items.length} item(s) ready for checkout</span>
            </div>

            {!isGuestCheckout ? (
              <div className="cart-checkout-block">
                <h3>Customer</h3>
                <strong>{customerName}</strong>
                {customerEmail ? <span>{customerEmail}</span> : null}
                {customerPhone ? <span>{customerPhone}</span> : null}
              </div>
            ) : null}

            <div className="cart-checkout-block">
              <div className="cart-totals__row">
                <span>Subtotal</span>
                <strong>{formatCurrency(draftOrder.subtotal, currencyCode)}</strong>
              </div>
              <div className="cart-totals__row">
                <span>Taxes</span>
                <strong>{formatCurrency(draftOrder.tax_total, currencyCode)}</strong>
              </div>
              {typeof draftOrder.discount_total === 'number' && draftOrder.discount_total > 0 ? (
                <div className="cart-totals__row">
                  <span>Discount</span>
                  <strong>-{formatCurrency(draftOrder.discount_total, currencyCode)}</strong>
                </div>
              ) : null}
              <div className="cart-totals__row cart-totals__row--total">
                <span>Total</span>
                <strong>{formatCurrency(draftOrder.total, currencyCode)}</strong>
              </div>
            </div>

            <div className="cart-modal__actions">
              <button type="button" className="cart-button cart-button--secondary" onClick={() => setIsCheckoutOpen(false)}>
                Back
              </button>
              <button type="button" className="cart-button cart-button--success" onClick={handleCompleteOrder} disabled={isSaving}>
                {isSaving ? 'Completing...' : 'Complete Order'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
