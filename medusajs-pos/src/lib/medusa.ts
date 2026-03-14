const medusaUrl = import.meta.env.PUBLIC_MEDUSA_BACKEND_URL || 'http://localhost:9000';
const tokenStorageKey = 'medusa_auth_token';

const getToken = () => localStorage.getItem(tokenStorageKey);

const getMedusaClient = async () => {
  const mod = await import('@medusajs/js-sdk');
  return mod.default;
};

export const createLoginSdk = async () => {
  const Medusa = await getMedusaClient();
  return new Medusa({
    baseUrl: medusaUrl,
    debug: false,
    auth: {
      type: 'jwt',
      jwtTokenStorageMethod: 'nostore',
    },
  });
};

export const createAuthedSdk = async () => {
  const Medusa = await getMedusaClient();
  return new Medusa({
    baseUrl: medusaUrl,
    debug: false,
    auth: {
      type: 'jwt',
      jwtTokenStorageMethod: 'custom',
      storage: {
        getItem: () => getToken() || '',
        setItem: () => {},
        removeItem: () => {},
      },
    },
  });
};

export const sdk = {
  auth: {
    login: async (entity: string, method: string, body: { email: string; password: string }) => {
      const loginSdk = await createLoginSdk();
      return loginSdk.auth.login(entity, method, body);
    },
    getCurrentUser: async () => {
      const authedSdk = await createAuthedSdk();
      return authedSdk.admin.user.me();
    },
  },
  admin: {
    user: {
      me: async () => {
        const authedSdk = await createAuthedSdk();
        return authedSdk.admin.user.me();
      },
    },
    customer: {
      list: async (params?: Record<string, any>) => {
        const authedSdk = await createAuthedSdk();
        return authedSdk.admin.customer.list(params);
      },
      create: async (body: Record<string, any>) => {
        const authedSdk = await createAuthedSdk();
        return authedSdk.admin.customer.create(body);
      },
    },
    order: {
      list: async (params?: Record<string, any>) => {
      const authedSdk = await createAuthedSdk();
      return authedSdk.admin.order.list(params);
    },
      retrieve: async (id: string, params?: Record<string, any>) => {
        const authedSdk = await createAuthedSdk();
        return authedSdk.admin.order.retrieve(id, params);
      },
    },
    salesChannel: {
      list: async (params?: Record<string, any>) => {
        const authedSdk = await createAuthedSdk();
        return authedSdk.admin.salesChannel.list(params);
      },
      create: async (body: Record<string, any>) => {
        const authedSdk = await createAuthedSdk();
        return authedSdk.admin.salesChannel.create(body);
      },
    },
    region: {
      list: async (params?: Record<string, any>) => {
        const authedSdk = await createAuthedSdk();
        return authedSdk.admin.region.list(params);
      },
      create: async (body: Record<string, any>) => {
        const authedSdk = await createAuthedSdk();
        return authedSdk.admin.region.create(body);
      },
    },
    stockLocation: {
      list: async (params?: Record<string, any>) => {
        const authedSdk = await createAuthedSdk();
        return authedSdk.admin.stockLocation.list(params);
      },
      create: async (body: Record<string, any>) => {
        const authedSdk = await createAuthedSdk();
        return authedSdk.admin.stockLocation.create(body);
      },
    },
    draftOrder: {
      list: async (params?: Record<string, any>) => {
        const authedSdk = await createAuthedSdk();
        return authedSdk.admin.draftOrder.list(params);
      },
      retrieve: async (id: string, params?: Record<string, any>) => {
        const authedSdk = await createAuthedSdk();
        return authedSdk.admin.draftOrder.retrieve(id, params);
      },
    },
    invoiceConfig: {
      retrieve: async () => {
        const authedSdk = await createAuthedSdk();
        // Since this is a custom endpoint, we use the client.fetch method
        return authedSdk.client.fetch("/admin/invoice-config");
      },
    },
  },
};
