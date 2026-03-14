import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { PACKING_LIST_MODULE } from "../../modules/packing-list-generator"
import { INVOICE_MODULE } from "../../modules/invoice-generator"
import { OrderDTO, OrderLineItemDTO } from "@medusajs/framework/types"
import type { MedusaContainer } from "@medusajs/framework/types"

export type GeneratePackingListPdfStepInput = {
  order: OrderDTO
  items: OrderLineItemDTO[]
  packing_list_id: string
}

export const generatePackingListPdfStep = createStep(
  "generate-packing-list-pdf",
  async (input: GeneratePackingListPdfStepInput, { container }: { container: MedusaContainer }) => {
    const packingListGeneratorService = container.resolve(PACKING_LIST_MODULE) as any

    // Fetch company branding from InvoiceConfig
    let companyConfig = {
      company_name: "BootsERP",
      company_address: "",
      company_email: "",
      company_logo: "",
    }
    try {
      const invoiceModuleService = container.resolve(INVOICE_MODULE) as any
      const [configs] = await invoiceModuleService.listInvoiceConfigs({}, { take: 1 })
      if (configs) {
        companyConfig = {
          company_name: configs.company_name || companyConfig.company_name,
          company_address: configs.company_address || "",
          company_email: configs.company_email || "",
          company_logo: configs.company_logo || "",
        }
      }
    } catch (e) {
      // InvoiceConfig not available — use defaults
    }

    const pdfBuffer = await packingListGeneratorService.generatePackingListPdf({
      order: input.order,
      items: input.items,
      packing_list_id: input.packing_list_id,
      company_name: companyConfig.company_name,
      company_address: companyConfig.company_address,
      company_email: companyConfig.company_email,
      company_logo: companyConfig.company_logo,
    })

    return new StepResponse({
      pdf_buffer: pdfBuffer,
    })
  }
)