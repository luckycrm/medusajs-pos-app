import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { INVOICE_MODULE } from "../../modules/invoice-generator"
import type { MedusaContainer } from "@medusajs/framework/types";

type StepInput = {
  id?: string
  company_name?: string
  company_address?: string
  company_phone?: string
  company_email?: string
  company_logo?: string
  notes?: string
}

export const updateInvoiceConfigStep = createStep(
  "update-invoice-config",
  async ({ id, ...updateData }: StepInput, { container }: { container: MedusaContainer }) => {
    const invoiceGeneratorService = container.resolve(INVOICE_MODULE) as any

    const prevData = id ? 
      await invoiceGeneratorService.retrieveInvoiceConfig(id) : 
      (await invoiceGeneratorService.listInvoiceConfigs())[0]

    const updatedData = await invoiceGeneratorService.updateInvoiceConfigs({
      id: prevData.id,
      ...updateData,
    })

    return new StepResponse(updatedData, prevData)
  },
  async (prevInvoiceConfig, { container }: { container: MedusaContainer }) => {
    if (!prevInvoiceConfig) {
      return
    }

    const invoiceGeneratorService = container.resolve(INVOICE_MODULE) as any

    await invoiceGeneratorService.updateInvoiceConfigs({
      id: prevInvoiceConfig.id,
      company_name: prevInvoiceConfig.company_name,
      company_address: prevInvoiceConfig.company_address,
      company_phone: prevInvoiceConfig.company_phone,
      company_email: prevInvoiceConfig.company_email,
      company_logo: prevInvoiceConfig.company_logo,
    })
  }
)
