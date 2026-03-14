import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { INVOICE_MODULE } from "../../modules/invoice-generator"
import { OrderDTO, OrderLineItemDTO } from "@medusajs/framework/types"
import type { MedusaContainer } from "@medusajs/framework/types";

export type GenerateInvoicePdfStepInput = {
  order: OrderDTO
  items: OrderLineItemDTO[]
  invoice_id: string
}

export const generateInvoicePdfStep = createStep(
  "generate-invoice-pdf",
  async (input: GenerateInvoicePdfStepInput, { container }: { container: MedusaContainer }) => {
    const invoiceGeneratorService = container.resolve(INVOICE_MODULE) as any

    const previousInv = await invoiceGeneratorService.retrieveInvoice(
      input.invoice_id
    )

    const pdfBuffer = await invoiceGeneratorService.generatePdf({
      order: input.order,
      items: input.items,
      invoice_id: input.invoice_id,
    })

    return new StepResponse({
      pdf_buffer: pdfBuffer,
    }, previousInv)
  },
  async (previousInv, { container }: { container: MedusaContainer }) => {
    if (!previousInv) {
      return
    }

    const invoiceGeneratorService = container.resolve(INVOICE_MODULE) as any

    await invoiceGeneratorService.updateInvoices({
      id: previousInv.id,
      pdfContent: previousInv.pdfContent,
    })
  }
)