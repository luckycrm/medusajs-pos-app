import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { generatePackingListPdfStep, GeneratePackingListPdfStepInput } from "./steps/generate-packing-list-pdf"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"

// Define explicit types to avoid complex union types
interface OrderData {
  id: string
  display_id?: number
  created_at?: string
  currency_code?: string
  total?: number
  email?: string
  items?: any[]
  billing_address?: any
  shipping_address?: any
  [key: string]: any
}

interface CountryData {
  iso_2: string
  display_name: string
}

interface TransformData {
  orders: OrderData[]
  countries: CountryData[]
}

interface PackingListTransformData {
  transformedOrder: OrderData
}

type WorkflowInput = {
  order_id: string
}

export const generatePackingListPdfWorkflow = createWorkflow(
  "generate-packing-list-pdf",
  (input: WorkflowInput) => {
    const { data: orders } = useQueryGraphStep({
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
        "payment_collections.*",
        "payment_collections.payments.*",
      ],
      filters: {
        id: input.order_id,
      },
      options: {
        throwIfKeyNotFound: true,
      },
    })

    const countryFilters = transform({
      orders,
    }, (data: any) => {
      const country_codes: string[] = []
      if (data.orders?.[0]?.billing_address?.country_code) {
        country_codes.push(data.orders[0].billing_address.country_code)
      }
      if (data.orders?.[0]?.shipping_address?.country_code) {
        country_codes.push(data.orders[0].shipping_address.country_code)
      }
      return country_codes
    })

    const { data: countries } = useQueryGraphStep({
      entity: "country",
      fields: ["display_name", "iso_2"],
      filters: {
        iso_2: countryFilters,
      },
    }).config({ name: "retrieve-countries" })

    const transformedOrder = transform({
      orders,
      countries,
    }, (data: any) => {
      const order = data.orders?.[0]

      if (!order) return order

      if (order.billing_address?.country_code) {
        order.billing_address.country_code = data.countries?.find(
          (country: any) => country.iso_2 === order.billing_address!.country_code
        )?.display_name || order.billing_address!.country_code
      }

      if (order.shipping_address?.country_code) {
        order.shipping_address.country_code = data.countries?.find(
          (country: any) => country.iso_2 === order.shipping_address!.country_code
        )?.display_name || order.shipping_address!.country_code
      }

      return order
    })

    const packingListData = transform({
      transformedOrder,
    }, (data: any) => {
      // Type guard to ensure display_id exists and is a number
      const displayId = data.transformedOrder?.display_id as number | undefined
      const packingListId = displayId ? `PK-${displayId.toString().padStart(6, "0")}` : "PK-000000"

      return {
        packingListId,
        order: data.transformedOrder || {},
        items: data.transformedOrder?.items || [],
      }
    })

    const { pdf_buffer } = generatePackingListPdfStep({
      order: packingListData.order,
      items: packingListData.items,
      packing_list_id: packingListData.packingListId,
    } as unknown as GeneratePackingListPdfStepInput)

    return new WorkflowResponse({
      pdf_buffer,
      packing_list_id: packingListData.packingListId,
    })
  }
)