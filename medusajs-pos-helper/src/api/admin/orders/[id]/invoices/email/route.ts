import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { generateInvoicePdfWorkflow } from "../../../../../../workflows/generate-invoice-pdf"
import { z } from "zod"

export const PostEmailInvoiceSchema = z.object({
  email: z.string().email().optional(),
}).strict()

type PostEmailInvoice = z.infer<typeof PostEmailInvoiceSchema>

export async function POST(
  req: MedusaRequest<PostEmailInvoice>,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const { email } = req.validatedBody || {}

  const query = req.scope.resolve("query")
  const notificationModuleService = req.scope.resolve("notification")

  // Get order details
  const { data: [order] } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "created_at",
      "currency_code",
      "total",
      "email",
      "items.*",
      "items.variant.*",
      "items.variant.product.*",
      "shipping_address.*",
      "billing_address.*",
      "shipping_methods.*",
      "tax_total",
      "subtotal",
      "discount_total",
    ],
    filters: {
      id: id,
    },
  })

  if (!order) {
    res.status(404).json({ message: "Order not found" })
    return
  }

  // Generate invoice PDF
  const { result: { pdf_buffer } } = await generateInvoicePdfWorkflow(req.scope)
    .run({
      input: {
        order_id: id,
      },
    })

  const buffer = Buffer.from(pdf_buffer)

  // Convert to base64 for email attachment
  const base64Content = buffer.toString('base64')

  // Send email to specified address or order email
  const recipientEmail = email || order.email

  if (!recipientEmail) {
    res.status(400).json({ message: "No email address provided" })
    return
  }

  const invoiceId = (() => {
    const displayId = (order as { display_id?: number }).display_id
    return displayId != null
      ? `INV-${displayId.toString().padStart(6, "0")}`
      : `INV-${order.id}`
  })()

  await notificationModuleService.createNotifications([{
    to: recipientEmail,
    template: "invoice-email",
    channel: "email",
    data: {
      order,
      invoice_id: invoiceId,
    },
    attachments: [
      {
        content: base64Content,
        filename: `invoice-${order.id}.pdf`,
        content_type: "application/pdf",
        disposition: "attachment",
      },
    ],
  }])

  res.json({
    message: "Invoice sent successfully",
    email: recipientEmail,
    order_id: order.id,
  })
}