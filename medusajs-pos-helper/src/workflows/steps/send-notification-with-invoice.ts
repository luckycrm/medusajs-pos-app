import { Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { CreateNotificationDTO } from "@medusajs/framework/types"
import { generateInvoicePdfWorkflow } from "../generate-invoice-pdf"
import type { MedusaContainer } from "@medusajs/framework/types";

type CreateNotificationWithInvoiceDTO = CreateNotificationDTO & {
  order_id?: string
  include_invoice?: boolean
}

export const sendNotificationWithInvoiceStep = createStep(
  "send-notification-with-invoice",
  async (data: CreateNotificationWithInvoiceDTO[], { container }: { container: MedusaContainer }) => {
    const notificationModuleService = container.resolve(
      Modules.NOTIFICATION
    )

    const notifications: any[] = []

    for (const notification of data) {
      const { include_invoice, order_id, ...notificationData } = notification

      let attachments = notificationData.attachments || []

      // Generate and attach invoice PDF if requested
      if (include_invoice && order_id && notification.template === "order-placed") {
        try {
          const { result: { pdf_buffer } } = await generateInvoicePdfWorkflow(container)
            .run({
              input: {
                order_id: order_id,
              },
            })

          const buffer = Buffer.from(pdf_buffer)
          const base64Content = buffer.toString('base64')

          const invoiceId = (() => {
            const displayId = order_id.includes('order_') ? parseInt(order_id.split('_')[1]) : null
            return displayId != null
              ? `INV-${displayId.toString().padStart(6, "0")}`
              : `INV-${order_id}`
          })()

          attachments.push({
            content: base64Content,
            filename: `invoice-${order_id}.pdf`,
            content_type: "application/pdf",
            disposition: "attachment",
          })

          // Add invoice ID to notification data
          notificationData.data = {
            ...notificationData.data,
            invoice_id: invoiceId,
          }
        } catch (error) {
          // Continue without invoice if generation fails
          console.log("Failed to generate invoice PDF:", error)
        }
      }

      const notificationResult = await notificationModuleService.createNotifications([{
        ...notificationData,
        attachments,
      }])

      notifications.push(...notificationResult)
    }

    return new StepResponse(notifications)
  }
)
