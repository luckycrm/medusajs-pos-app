# Setting Up "Ready for Pickup" Email & SMS Notifications

This guide walks you through implementing the `POST /admin/orders/:id/send-ready-pickup` endpoint in your own Medusa backend using Medusa's built-in notification system.

The `medusajs-pos-helper` plugin intentionally does **not** include this feature because:
- Notification templates are business-specific (your content, your branding)
- Email/SMS provider selection varies per project (Resend, SendGrid, Twilio, etc.)
- SMS bodies often contain shop-specific addresses and contact info

---

## Prerequisites

- Medusa v2.3.0+
- A Notification provider installed (see options below)

---

## Step 1 — Install a Notification Provider

Medusa ships with provider integrations. Pick what fits your stack:

| Provider | Package | Channel |
|---|---|---|
| **Resend** | `@medusajs/medusa-notification-resend` | `email` |
| **SendGrid** | `@medusajs/medusa-notification-sendgrid` | `email` |
| **Twilio SMS** | *(community)* or custom | `sms` |
| **Postmark** | *(community)* or custom | `email` |
| **Local (dev)** | built-in | `feed` |

📖 [Notification Module Provider docs](https://docs.medusajs.com/resources/infrastructure-modules/notification/index.html.md)  
📖 [Core Workflows Reference](https://docs.medusajs.com/resources/medusa-workflows-reference/index.html.md)

### Example — register Resend + Twilio in `medusa-config.ts`

```ts
import { Modules } from "@medusajs/framework/utils"

modules: {
  [Modules.NOTIFICATION]: {
    resolve: "@medusajs/medusa/notification",
    options: {
      providers: [
        {
          resolve: "@medusajs/medusa-notification-resend", // npm: @medusajs/medusa-notification-resend
          id: "resend",
          options: {
            channels: ["email"],
            api_key: process.env.RESEND_API_KEY,
            from: "Your Shop <noreply@yourshop.com>",
          },
        },
        {
          // Custom Twilio SMS provider — see Step 2
          resolve: "./src/modules/twilio-sms",
          id: "twilio-sms",
          options: {
            channels: ["sms"],
            accountSid: process.env.TWILIO_ACCOUNT_SID,
            authToken: process.env.TWILIO_AUTH_TOKEN,
            from: process.env.TWILIO_FROM_PHONE,
          },
        },
      ],
    },
  },
},
```

---

## Step 2 — Create the Workflow

Create `src/workflows/send-order-ready-pickup.ts`:

```ts
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep, sendNotificationsStep } from "@medusajs/medusa/core-flows"
import { ProviderSendNotificationDTO } from "@medusajs/framework/types"

type WorkflowInput = { id: string }

const normalizePhone = (value?: string | null) => {
  if (!value) return null
  const digits = value.replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  return value.startsWith("+") ? value : null
}

export const sendOrderReadyPickupWorkflow = createWorkflow(
  "send-order-ready-pickup",
  ({ id }: WorkflowInput) => {
    const { data: orders } = useQueryGraphStep({
      entity: "order",
      fields: [
        "id", "display_id", "email",
        "customer.*",
        "shipping_address.*",
        "billing_address.*",
        "items.*",
        "shipping_methods.*",
        "total", "subtotal", "tax_total",
      ],
      filters: { id },
    })

    const notifications = transform({ orders }, ({ orders }) => {
      const order = orders[0]
      const notifs: ProviderSendNotificationDTO[] = []

      // ── Email ────────────────────────────────────────────────────
      if (order.email) {
        notifs.push({
          to: order.email,
          channel: "email",
          template: "ready-for-pickup",   // ← your template ID
          data: { order },
        })
      }

      // ── SMS ──────────────────────────────────────────────────────
      const phone = normalizePhone(
        order.customer?.phone ||
        order.shipping_address?.phone ||
        order.billing_address?.phone
      )
      if (phone) {
        notifs.push({
          to: phone,
          channel: "sms",
          template: "ready-for-pickup",   // ← your template ID
          data: {
            order,
            // Customise this message for your shop:
            smsBody: "Your order is ready for pickup! Come visit us at 123 Main St. Questions? Call us at 555-0100.",
          },
        })
      }

      return notifs
    })

    const notification = sendNotificationsStep(notifications)
    return new WorkflowResponse(notification)
  }
)
```

---

## Step 3 — Create the API Route

Create `src/api/admin/orders/[id]/send-ready-pickup/route.ts`:

```ts
import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { sendOrderReadyPickupWorkflow } from "../../../../../workflows/send-order-ready-pickup"

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params

  const { result } = await sendOrderReadyPickupWorkflow(req.scope).run({
    input: { id },
  })

  res.json({
    message: "Ready for pickup notifications sent",
    notification: result,
  })
}
```

---

## Step 4 — Create the Email Template

Medusa uses the template `id` you pass in `sendNotificationsStep` to look up the right template in your notification provider.

For **Resend**, create a React Email template with the ID `ready-for-pickup`.  
📖 [Medusa email templates guide](https://docs.medusajs.com/resources/architectural-modules/notification/send-notification#templates)

---

## Step 5 — Test It

```bash
curl -X POST http://localhost:9000/admin/orders/order_01JXX.../send-ready-pickup \
  -H "Authorization: Bearer <your-token>"
```

---

## Further Reading

- 📖 [Notification Module Provider](https://docs.medusajs.com/resources/infrastructure-modules/notification/index.html.md)  
- 📖 [Core Workflows Reference](https://docs.medusajs.com/resources/medusa-workflows-reference/index.html.md) — find `sendNotificationsStep` here  
- 📖 [Resend integration guide](https://docs.medusajs.com/resources/integrations/guides/resend/index.html.md)  
- 📖 [Twilio SMS integration tutorial](https://docs.medusajs.com/resources/tutorials/phone-auth/index.html.md)  
- 📖 [Workflows overview](https://docs.medusajs.com/learn/fundamentals/workflows/index.html.md)
