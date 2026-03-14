import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"
import { sendNotificationWithInvoiceStep } from "./steps/send-notification-with-invoice"

type WorkflowInput = {
  id: string
}

export const sendOrderConfirmationWorkflow = createWorkflow(
  "send-order-confirmation",
  ({ id }: WorkflowInput) => {
    const { data: orders } = useQueryGraphStep({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "total",
        "items.*",
        "shipping_address.*",
        "billing_address.*",
        "shipping_methods.*",
        "customer.*",
        "total",
        "subtotal",
        "discount_total",
        "shipping_total",
        "tax_total",
        "item_subtotal",
        "item_total",
        "item_tax_total",
      ],
      filters: {
        id,
      },
    })

    const notification = sendNotificationWithInvoiceStep([{
      to: orders[0].email || "",
      channel: "email",
      template: "order-placed",
      include_invoice: true,
      order_id: orders[0].id,
      data: {
        order: orders[0],
      },
    }])

    return new WorkflowResponse(notification)
  }
)
