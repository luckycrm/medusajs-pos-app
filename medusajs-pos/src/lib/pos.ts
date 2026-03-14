import { createAuthedSdk, sdk } from './medusa';

const medusaUrl = import.meta.env.PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000';

export const STORAGE_KEYS = {
  authToken: 'medusa_auth_token',
  salesChannelId: 'sales_channel_id',
  regionId: 'region_id',
  stockLocationId: 'stock_location_id',
  draftOrderId: 'draft_order_id',
} as const;

// Hardcoded defaults removed as requested. 
// App now relies on dynamic configuration from admin.invoiceConfig.

export const getDynamicSettings = async () => {
    try {
        const { invoice_config } = await sdk.admin.invoiceConfig.retrieve() as { invoice_config: any };
        if (!invoice_config) {
            console.error('[POS SDK] Critical: invoice_config not found. Please set it in Admin Settings.');
            throw new Error('Store configuration (invoice-config) is missing. Please set it in Settings -> Invoice Config.');
        }
        
        const rawEmail = invoice_config.company_email;
        if (!rawEmail) {
            throw new Error('Store email is missing in Invoice Config.');
        }

        const cleanEmail = rawEmail.split(' ')[0].trim();
        

        console.log('[POS SDK] Using dynamic config:', {
            email: cleanEmail,
            original: rawEmail
        });

        return {
            email: cleanEmail,
            logo: invoice_config.company_logo || '/logo.png',
            address: {
                first_name: (invoice_config.company_name?.split(' ')[0]?.trim() || '').trim(),
                last_name: (invoice_config.company_name?.split(' ').slice(1).join(' ')?.trim() || '').trim(),
                company: (invoice_config.company_name || '').trim(),
                address_1: (invoice_config.company_address || '').trim(),
                postal_code: (invoice_config.company_postal_code || '').trim(),
                city: (invoice_config.company_city || '').trim(),
                province: (invoice_config.company_province || '').trim(),
                country_code: (invoice_config.company_country_code || '').trim(),
                phone: (invoice_config.company_phone || '').trim(),
            }
        };
    } catch (error) {
        console.error('[POS SDK] Error fetching dynamic settings:', error);
        throw error;
    }
};

export const getStoredSettings = () => ({
  salesChannelId: localStorage.getItem(STORAGE_KEYS.salesChannelId),
  regionId: localStorage.getItem(STORAGE_KEYS.regionId),
  stockLocationId: localStorage.getItem(STORAGE_KEYS.stockLocationId),
});

export const clearDraftOrderId = () => {
  localStorage.removeItem(STORAGE_KEYS.draftOrderId);
};

export const getDraftOrderId = () => localStorage.getItem(STORAGE_KEYS.draftOrderId);

const setDraftOrderId = (id: string) => {
  localStorage.setItem(STORAGE_KEYS.draftOrderId, id);
};

export const ensureGuestCustomer = async (userDetails?: { email: string; firstName?: string; lastName?: string }) => {
  const sdk = await createAuthedSdk();
  
  // Prioritize passed user details, then dynamic settings
  let email = userDetails?.email;
  if (!email) {
    const settings = await getDynamicSettings();
    email = settings.email;
  }
  
  const existing = await sdk.admin.customer.list({
    email,
    fields: 'id,email,first_name,last_name',
    limit: 1,
  });

  if (existing.customers.length > 0) {
    return existing.customers[0];
  }

  const created = await sdk.admin.customer.create({ 
    email,
    first_name: userDetails?.firstName,
    last_name: userDetails?.lastName,
  }, { fields: 'id,email,first_name,last_name' });
  return created.customer;
};

export const createDraftOrder = async (customerId?: string, email?: string) => {
  const sdk = await createAuthedSdk();
  const { salesChannelId, regionId } = getStoredSettings();

  if (!salesChannelId || !regionId) {
    throw new Error('POS settings are incomplete. Please finish setup first.');
  }

  const fallbackCustomer = customerId ? undefined : await ensureGuestCustomer();
  const { address } = await getDynamicSettings();

  const response = await sdk.admin.draftOrder.create({
    region_id: regionId,
    sales_channel_id: salesChannelId,
    customer_id: customerId || fallbackCustomer?.id,
    email: email || fallbackCustomer?.email,
    shipping_address: address,
    billing_address: address,
  });

  setDraftOrderId(response.draft_order.id);
  return response.draft_order;
};

export const getOrCreateDraftOrder = async () => {
  const existingDraftOrder = await getCurrentDraftOrder();
  if (existingDraftOrder) {
    return existingDraftOrder;
  }

  return createDraftOrder();
};

export const getCurrentDraftOrder = async () => {
  const sdk = await createAuthedSdk();
  const draftOrderId = getDraftOrderId();

  if (!draftOrderId) {
    return null;
  }

  try {
    const { draft_order } = await sdk.admin.draftOrder.retrieve(draftOrderId, {
      fields:
        '+items.variant.options.*,+items.variant.options.option.*,+customer.*,+tax_total,+discount_total,+subtotal,+total,+shipping_methods.*,+shipping_address.*,+billing_address.*,+currency_code,+status,+display_id,+created_at',
    });
    return draft_order;
  } catch (err: any) {
    if (err?.message?.includes('not found') || err?.message?.includes('Order id not found')) {
      clearDraftOrderId();
    }
    return null;
  }
};

export const attachCustomerToNewDraftOrder = async (customer?: { id: string; email: string }) => {
  clearDraftOrderId();
  return createDraftOrder(customer?.id, customer?.email);
};

export const handleGuestCheckout = async (userDetails?: { email: string; firstName?: string; lastName?: string }) => {
  clearDraftOrderId();
  const customer = await ensureGuestCustomer(userDetails);
  return createDraftOrder(customer.id, customer.email);
};

export const addCustomItemToDraftOrder = async (payload: {
  title: string;
  quantity: number;
  unit_price: number;
  description?: string;
}) => {
  const sdk = await createAuthedSdk();
  const draftOrder = await getOrCreateDraftOrder();

  // Safety: Confirm any existing edit first
  try {
    await sdk.admin.draftOrder.confirmEdit(draftOrder.id);
  } catch {}

  await sdk.admin.draftOrder.beginEdit(draftOrder.id);
  try {
    await sdk.admin.draftOrder.addItems(draftOrder.id, {
      items: [
        {
          title: payload.title,
          quantity: payload.quantity,
          unit_price: payload.unit_price,
          ...(payload.description ? { metadata: { description: payload.description } } : {}),
        },
      ],
    });
    await sdk.admin.draftOrder.confirmEdit(draftOrder.id);
  } catch (error) {
    await sdk.admin.draftOrder.cancelEdit(draftOrder.id);
    throw error;
  }

  return getOrCreateDraftOrder();
};

export const updateDraftOrderItemQuantity = async (itemId: string, quantity: number) => {
  const sdk = await createAuthedSdk();
  const draftOrder = await getOrCreateDraftOrder();

  // Safety: Confirm any existing edit first
  try {
    await sdk.admin.draftOrder.confirmEdit(draftOrder.id);
  } catch {}

  await sdk.admin.draftOrder.beginEdit(draftOrder.id);
  try {
    await sdk.admin.draftOrder.updateItem(draftOrder.id, itemId, { quantity: Math.max(0, quantity) });
    await sdk.admin.draftOrder.confirmEdit(draftOrder.id);
  } catch (error) {
    await sdk.admin.draftOrder.cancelEdit(draftOrder.id);
    throw error;
  }

  return getOrCreateDraftOrder();
};

export const addPromotionToDraftOrder = async (code: string) => {
  const sdk = await createAuthedSdk();
  const draftOrder = await getOrCreateDraftOrder();

  // Safety: Confirm any existing edit first
  try {
    await sdk.admin.draftOrder.confirmEdit(draftOrder.id);
  } catch {}

  await sdk.admin.draftOrder.beginEdit(draftOrder.id);
  try {
    await sdk.admin.draftOrder.addPromotions(draftOrder.id, {
      promo_codes: [code],
    });
    await sdk.admin.draftOrder.confirmEdit(draftOrder.id);
  } catch (error) {
    await sdk.admin.draftOrder.cancelEdit(draftOrder.id);
    throw error;
  }

  return getOrCreateDraftOrder();
};

export const removePromotionFromDraftOrder = async (code: string) => {
  const sdk = await createAuthedSdk();
  const draftOrder = await getOrCreateDraftOrder();

  // Safety: Confirm any existing edit first
  try {
    await sdk.admin.draftOrder.confirmEdit(draftOrder.id);
  } catch {}

  await sdk.admin.draftOrder.beginEdit(draftOrder.id);
  try {
    await sdk.admin.draftOrder.removePromotions(draftOrder.id, {
      promo_codes: [code],
    });
    await sdk.admin.draftOrder.confirmEdit(draftOrder.id);
  } catch (error) {
    await sdk.admin.draftOrder.cancelEdit(draftOrder.id);
    throw error;
  }

  return getOrCreateDraftOrder();
};

export const cancelCurrentDraftOrder = async () => {
  const sdk = await createAuthedSdk();
  const draftOrderId = getDraftOrderId();

  if (!draftOrderId) return;

  clearDraftOrderId();
  await sdk.admin.draftOrder.delete(draftOrderId);
};

export const completeCurrentDraftOrder = async () => {
  const sdk = await createAuthedSdk();
  const draftOrder = await getOrCreateDraftOrder();
  const { stockLocationId } = getStoredSettings();

  // Safety: Confirm any existing edit first
  try {
    await sdk.admin.draftOrder.confirmEdit(draftOrder.id);
  } catch {}

  await sdk.admin.draftOrder.beginEdit(draftOrder.id);
  try {
    const { address } = await getDynamicSettings();
    await sdk.admin.draftOrder.update(draftOrder.id, {
      shipping_address: address,
      billing_address: address,
    });

    const shippingOptions = await sdk.admin.shippingOption.list({ limit: 20 });
    const shippingOptionId = shippingOptions.shipping_options?.[0]?.id;

    if (shippingOptionId) {
      await sdk.admin.draftOrder.addShippingMethod(draftOrder.id, {
        shipping_option_id: shippingOptionId,
      });
    }

    await sdk.admin.draftOrder.confirmEdit(draftOrder.id);

    const { order } = await sdk.admin.draftOrder.convertToOrder(draftOrder.id);

    try {
      await sdk.admin.order.complete(order.id, {});
    } catch {
      // Some environments already consider the converted order complete.
    }

    clearDraftOrderId();
    return order;
  } catch (error) {
    await sdk.admin.draftOrder.cancelEdit(draftOrder.id);
    throw error;
  }
};

export const listOrders = async (params?: Record<string, any>) => {
  const sdk = await createAuthedSdk();
  return sdk.admin.order.list({
    fields:
      '+customer.*,+total,+currency_code,+status,+payment_status,+fulfillment_status,+shipping_methods.*,+payment_collections.*',
    order: '-created_at',
    ...params,
  });
};

export const retrieveOrder = async (id: string) => {
  const sdk = await createAuthedSdk();
  return sdk.admin.order.retrieve(id, {
    fields:
      '+customer.*,+items.*,+items.variant.*,+items.variant.options.*,+items.variant.options.option.*,+items.product.*,+shipping_address.*,+billing_address.*,+summary,+total,+subtotal,+tax_total,+discount_total,+currency_code,+status,+payment_status,+fulfillment_status,+shipping_methods.*,+payment_collections.*,+credit_lines.*,+region.*,+fulfillments.*,+fulfillments.items.*',
  });
};

export const captureOrderPayment = async (orderId: string) => {
  const sdk = await createAuthedSdk();

  const orderResponse = await sdk.admin.order.retrieve(orderId, {
    fields: '+payment_collections.payments.*,+payment_collections.payment_sessions.*,+total',
  });
  const order = orderResponse.order || orderResponse;

  if (!order.total || order.total <= 0) {
    throw new Error(`Invalid order total: ${order.total}`);
  }

  const paymentCollections = [...(((order as any).payment_collections || []) as any[])];

  if (paymentCollections.length === 0) {
    const { payment_collection } = await (sdk.admin.paymentCollection.create as any)(
      {
        order_id: orderId,
        amount: order.total,
      },
      {},
      {},
    );

    paymentCollections.push(payment_collection);
  }

  const paymentCollection = paymentCollections.find((collection: any) => {
    const status = collection.status as string;
    return status !== 'captured' && status !== 'completed';
  });

  if (!paymentCollection) {
    throw new Error('All payment collections are already captured.');
  }

  const collectionStatus = paymentCollection.status as string;

  if (collectionStatus === 'not_paid' || collectionStatus === 'awaiting') {
    await (sdk.admin.paymentCollection.markAsPaid as any)(
      paymentCollection.id,
      {
        order_id: orderId,
      },
      {},
      {},
    );
    return;
  }

  if (collectionStatus === 'authorized' || collectionStatus === 'partially_authorized') {
    const payments = paymentCollection.payments || [];

    for (const payment of payments) {
      if (payment.captured_at) {
        continue;
      }

      try {
        await (sdk.admin.payment.capture as any)(payment.id, {}, {}, {});
        return;
      } catch {
        await (sdk.admin.payment.capture as any)(paymentCollection.id, {}, {}, {});
        return;
      }
    }

    throw new Error('No uncaptured payments found in the authorized collection.');
  }

  await (sdk.admin.paymentCollection.markAsPaid as any)(
    paymentCollection.id,
    {
      order_id: orderId,
    },
    {},
    {},
  );
};

export const createOrderFulfillment = async (orderId: string, fulfillmentType: 'pickup' | 'shipping') => {
  const sdk = await createAuthedSdk();
  const orderResponse = await sdk.admin.order.retrieve(orderId);
  const order = orderResponse.order || orderResponse;

  if (!order.items || order.items.length === 0) {
    throw new Error('No items found for fulfillment');
  }

  let itemsWithShipping: typeof order.items = [];
  let itemsWithoutShipping: typeof order.items = [];

  if (fulfillmentType === 'pickup') {
    itemsWithShipping = order.items.filter((item) => !!item.variant_id);
    itemsWithoutShipping = order.items.filter((item) => !item.variant_id);
  } else {
    itemsWithShipping = order.items.filter((item) => (item.variant as any)?.requires_shipping !== false);
    itemsWithoutShipping = order.items.filter((item) => (item.variant as any)?.requires_shipping === false);
  }

  if (itemsWithShipping.length > 0) {
    await (sdk.admin.order.createFulfillment as any)(
      orderId,
      {
        items: itemsWithShipping.map((item) => ({
          id: item.id,
          quantity: item.quantity,
        })),
        location_id: (order as any).location_id || undefined,
        no_notification: fulfillmentType === 'pickup',
      },
      {},
      {},
    );
  }

  if (itemsWithoutShipping.length > 0) {
    await (sdk.admin.order.createFulfillment as any)(
      orderId,
      {
        items: itemsWithoutShipping.map((item) => ({
          id: item.id,
          quantity: item.quantity,
        })),
        location_id: (order as any).location_id || undefined,
        no_notification: fulfillmentType === 'pickup',
      },
      {},
      {},
    );
  }
};

export const markFulfillmentAsShipped = async (
  fulfillmentId: string,
  trackingNumber?: string,
) => {
  const sdk = await createAuthedSdk();

  await (sdk.admin.fulfillment.createShipment as any)(
    fulfillmentId,
    {
      labels: trackingNumber
        ? [
            {
              tracking_number: trackingNumber,
              tracking_url: `https://tracking.example.com/${trackingNumber}`,
              label_url: 'https://label.example.com/label.pdf',
            },
          ]
        : [],
    },
    {},
    {},
  );
};

export const markFulfillmentAsDelivered = async (orderId: string, fulfillmentId: string) => {
  const sdk = await createAuthedSdk();
  await (sdk.admin.order.markAsDelivered as any)(orderId, fulfillmentId, {}, {});
};

export const markOrderAsCompleted = async (orderId: string) => {
  const sdk = await createAuthedSdk();
  await (sdk.admin.order.complete as any)(orderId, {}, {});
};

const getAuthHeaders = () => {
  const token = localStorage.getItem(STORAGE_KEYS.authToken);

  if (!token) {
    throw new Error('User is not authenticated');
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

const openPdfWindow = async (path: string, filename: string) => {
  const response = await fetch(`${medusaUrl}${path}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${filename}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');

  if (!openedWindow) {
    URL.revokeObjectURL(url);
    throw new Error('Unable to open preview tab. Please allow pop-ups for this site.');
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const printOrderInvoice = async (orderId: string) => {
  await openPdfWindow(`/admin/orders/${orderId}/invoices`, `invoice-${orderId}.pdf`);
};

export const printOrderPackingList = async (orderId: string) => {
  await openPdfWindow(`/admin/orders/${orderId}/packing-list`, `packing-list-${orderId}.pdf`);
};

export const sendReadyPickupEmail = async (orderId: string) => {
  const response = await fetch(`${medusaUrl}/admin/orders/${orderId}/send-ready-pickup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to send ready for pickup email: ${response.statusText}`);
  }

  return response.json();
};

export const changeOrderCustomer = async (
  orderId: string,
  payload: { customer_id: string },
) => {
  const response = await fetch(`${medusaUrl}/admin/orders/${orderId}/change-customer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Failed to change customer: ${response.statusText}`);
  }

  return response.json();
};

export const posScanAdd = async (barcode: string, quantity = 1) => {
  return posScanBatchAdd([{ barcode, quantity }]);
};

export const posScanBatchAdd = async (items: Array<{ barcode: string; quantity: number }>) => {
  if (!items.length) return null;

  const token = localStorage.getItem(STORAGE_KEYS.authToken);
  const draftOrder = await getOrCreateDraftOrder();
  const sdk = await createAuthedSdk();

  // Safety: Confirm any existing edit first
  try {
    await sdk.admin.draftOrder.confirmEdit(draftOrder.id);
  } catch {}

  const response = await fetch(`${medusaUrl}/admin/pos/scan-add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      draft_order_id: draftOrder.id,
      items,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.message || `Failed to scan ${items.length} item(s)`);
  }

  return payload as {
    draft_order: any;
    detected_code: string;
    matched_variant: {
      id: string;
      product_title: string;
      variant_title?: string | null;
      sku?: string | null;
      upc?: string | null;
      ean?: string | null;
      barcode?: string | null;
    };
    scans_processed: number;
  };
};
