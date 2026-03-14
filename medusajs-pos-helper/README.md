# medusajspos (Backend Plugin)

<p align="center">
  <img src="https://pub-620bed9621004e9591b68c342a9d8004.r2.dev/public/logo.png" alt="MedusaJS POS Logo" />
</p>

The backend engine and Medusa v2 plugin for the [`medusajs-pos`](../medusajs-pos) frontend. This plugin extends the Medusa framework with POS-specific business logic, automated workflows, and admin customizations required for physical store operations.

---

## Screenshots

<p align="center">
  <img src="https://pub-620bed9621004e9591b68c342a9d8004.r2.dev/public/screenshot/LOGINPAGE.png" alt="Login Page" width="45%" />
  <img src="https://pub-620bed9621004e9591b68c342a9d8004.r2.dev/public/screenshot/CARTPAGE.png" alt="Cart Page" width="45%" />
</p>
<p align="center">
  <img src="https://pub-620bed9621004e9591b68c342a9d8004.r2.dev/public/screenshot/ORDERSPAGE.png" alt="Orders Page" width="90%" />
</p>

---

## Features

| Route | Method | Description |
|---|---|---|
| `/admin/pos/scan-add` | `POST` | Scan a barcode and add the matching variant to a draft order |
| `/admin/orders/:id/invoices` | `GET` | Generate and download a PDF invoice for an order |
| `/admin/orders/:id/packing-list` | `GET` | Generate and download a PDF packing list for an order |
| `/admin/orders/:id/change-customer` | `POST` | Reassign an order to a different customer |

> **Note:** The "Ready for Pickup" email/SMS notification route (`POST /admin/orders/:id/send-ready-pickup`) is **not included** in the plugin. Notification templates and providers are business-specific. See [docs/send-pickup-email-sms.md](./docs/send-pickup-email-sms.md) to implement it in your own backend.

---

## Requirements

- Medusa v2.3.0+
- Node.js >= 20

---

## Installation

### 1. Install from npm

```bash
npm install medusajspos
# or
yarn add medusajspos
```

### 2. Register in `medusa-config.ts`

```ts
import { defineConfig } from "@medusajs/framework/utils"

module.exports = defineConfig({
  // ...
  plugins: [
    {
      resolve: "medusajspos",
      options: {},
    },
  ],
})
```

### 4. Run database migrations

```bash
npx medusa db:migrate
```

This creates the `invoice` and `invoice_config` tables used by the `invoiceGenerator` module.

---

## Modules

### `invoiceGenerator`

Stores invoice records and generates PDF invoices using `pdfmake`. Supports configurable company branding (logo, name, address, notes) stored in `invoice_config`.

### `packingListGeneratorService`

Generates PDF packing lists for orders. Includes item images (with WebP→PNG conversion via `sharp`), shipping method type detection, and payment status display.

---

## Notifications (Email & SMS)

This plugin does **not** bundle a "Ready for Pickup" notification workflow because email/SMS templates and provider credentials are unique to every business.

To implement it yourself:

1. **Follow the guide** → [`docs/send-pickup-email-sms.md`](./docs/send-pickup-email-sms.md) — complete code for the workflow, route, and provider setup.
2. **Pick a Notification provider:**
   - [Resend integration guide](https://docs.medusajs.com/resources/integrations/guides/resend/index.html.md) — email
   - [Twilio SMS tutorial](https://docs.medusajs.com/resources/tutorials/phone-auth/index.html.md) — SMS via Twilio
   - [Notification Module Provider](https://docs.medusajs.com/resources/infrastructure-modules/notification/index.html.md) — build your own provider
3. **How notifications work in Medusa** → [Notification Module Provider docs](https://docs.medusajs.com/resources/infrastructure-modules/notification/index.html.md)

---

## API Reference

### `POST /admin/pos/scan-add`

Looks up a product variant by barcode, UPC, EAN, or SKU and adds it to a draft order. Supports batch scanning.

**Body:**
```json
{
  "draft_order_id": "order_01JXX...",
  "items": [
    { "barcode": "012345678901", "quantity": 1 }
  ]
}
```

**Response:**
```json
{
  "draft_order": { ... },
  "detected_code": "012345678901",
  "matched_variant": { "id": "...", "product_title": "...", "sku": "..." },
  "scans_processed": 1
}
```

---

### `GET /admin/orders/:id/invoices`

Returns a PDF file (`application/pdf`) for the given order. The invoice is stored and reused on subsequent calls.

---

### `GET /admin/orders/:id/packing-list`

Returns a PDF packing list for the given order, including product images, SKUs, and quantities.

---

### `POST /admin/orders/:id/change-customer`

Reassigns an order to a different customer. Updates both `customer_id` and `email` on the order.

**Body:**
```json
{
  "customer_id": "cus_01JXX..."
}
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `pdfmake` | PDF generation for invoices and packing lists |
| `axios` | Fetching product images and barcode fonts from remote URLs |
| `sharp` | Converting WebP images to PNG (pdfmake doesn't support WebP) |

---

## 🤝 Contributors

We appreciate all contributions! See [CONTRIBUTING.md](../CONTRIBUTING.md) for more info.

- [Lakhwinder Singh (Lucky)](https://github.com/luckycrm)

---

## 💖 Funding

Help fund the future of Medusa POS via:

[![BuyMeACoffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/luckycrm)
[![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/@thatlucifer)

---

## 📄 License

MIT
