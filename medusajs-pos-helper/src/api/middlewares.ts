import { defineMiddlewares } from "@medusajs/medusa"
import { validateAndTransformBody } from "@medusajs/framework"
import { PostAdminPosScanAddSchema } from "./admin/pos/scan-add/route"
import { PostAdminChangeOrderCustomerSchema } from "./admin/orders/[id]/change-customer/route"
import { PostInvoiceConfigSchema } from "./admin/invoice-config/route"
import { PostEmailInvoiceSchema } from "./admin/orders/[id]/invoices/email/route"

export default defineMiddlewares({
  routes: [
    {
      matcher: "/admin/pos/scan-add",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(PostAdminPosScanAddSchema as any),
      ],
    },
    {
      matcher: "/admin/invoice-config",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(PostInvoiceConfigSchema as any),
      ],
    },
    {
      matcher: "/admin/orders/:id/invoices/email",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(PostEmailInvoiceSchema as any),
      ],
    },
    {
      matcher: "/admin/orders/:id/change-customer",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(PostAdminChangeOrderCustomerSchema as any),
      ],
    },
  ],
})
