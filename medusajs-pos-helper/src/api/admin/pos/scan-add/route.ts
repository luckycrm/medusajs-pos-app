import {
  addDraftOrderItemsWorkflow,
  beginDraftOrderEditWorkflow,
  cancelDraftOrderEditWorkflow,
  confirmDraftOrderEditWorkflow,
  getOrderDetailWorkflow,
  updateDraftOrderItemWorkflow,
} from "@medusajs/core-flows"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "zod"

export const PostAdminPosScanAddSchema = z.object({
  draft_order_id: z.string().min(1),
  // Batch support
  items: z
    .array(
      z.object({
        barcode: z.string().min(1),
        quantity: z.coerce.number().int().positive().default(1),
      })
    )
    .optional(),
  // Single item legacy support
  barcode: z.string().optional(),
  quantity: z.coerce.number().int().positive().optional(),
})

type PosScanAddRequestBody = z.infer<typeof PostAdminPosScanAddSchema>

const POS_DRAFT_ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "version",
  "email",
  "metadata",
  "currency_code",
  "region_id",
  "subtotal",
  "tax_total",
  "discount_total",
  "total",
  "customer.id",
  "customer.email",
  "customer.first_name",
  "customer.last_name",
  "items.id",
  "items.title",
  "items.subtitle",
  "items.thumbnail",
  "items.quantity",
  "items.unit_price",
  "items.compare_at_unit_price",
  "items.is_tax_inclusive",
  "items.variant_id",
  "items.product_id",
  "items.product_title",
  "items.product_description",
  "items.product_subtitle",
  "items.product_type",
  "items.product_collection",
  "items.product_handle",
  "items.variant_sku",
  "items.variant_barcode",
  "items.variant_title",
  "items.metadata",
  "items.created_at",
  "items.updated_at",
  "items.adjustments.id",
  "items.adjustments.code",
  "items.adjustments.amount",
  "items.tax_lines.id",
  "items.tax_lines.code",
  "items.tax_lines.rate",
  "items.detail.id",
  "items.detail.quantity",
  "items.variant.id",
  "items.variant.title",
  "items.variant.sku",
  "items.variant.barcode",
  "items.variant.upc",
  "items.variant.ean",
  "items.variant.product.id",
  "items.variant.product.title",
  "items.variant.product.thumbnail",
  "items.variant.product.images.id",
  "items.variant.product.images.url",
  "items.variant.options.id",
  "items.variant.options.value",
  "items.variant.options.option_id",
  "items.variant.options.option.id",
  "items.variant.options.option.title",
  "shipping_address.id",
  "shipping_address.first_name",
  "shipping_address.last_name",
  "shipping_address.company",
  "shipping_address.address_1",
  "shipping_address.address_2",
  "shipping_address.city",
  "shipping_address.postal_code",
  "shipping_address.country_code",
  "shipping_address.region_code",
  "shipping_address.province",
  "shipping_address.phone",
  "billing_address.id",
  "billing_address.first_name",
  "billing_address.last_name",
  "billing_address.company",
  "billing_address.address_1",
  "billing_address.address_2",
  "billing_address.city",
  "billing_address.postal_code",
  "billing_address.country_code",
  "billing_address.region_code",
  "billing_address.province",
  "billing_address.phone",
  "summary",
  "created_at",
  "updated_at",
] as const

type MatchedVariantRow = {
  id: string
  product_id: string
  product_title: string
  variant_title: string | null
  sku: string | null
  upc: string | null
  ean: string | null
  barcode: string | null
}

const getMatchedVariant = async (
  req: AuthenticatedMedusaRequest,
  code: string
): Promise<MatchedVariantRow | null> => {
  const pgConnection = req.scope.resolve<any>(ContainerRegistrationKeys.PG_CONNECTION)
  const normalizedCode = code.trim()

  const result = await pgConnection.raw(
    `
      SELECT
        pv.id,
        pv.product_id,
        p.title AS product_title,
        pv.title AS variant_title,
        pv.sku,
        pv.upc,
        pv.ean,
        pv.barcode
      FROM product_variant pv
      INNER JOIN product p
        ON p.id = pv.product_id
       AND p.deleted_at IS NULL
      WHERE pv.deleted_at IS NULL
        AND (
          pv.barcode = ?
          OR pv.upc = ?
          OR pv.ean = ?
          OR pv.sku = ?
          OR LOWER(COALESCE(pv.sku, '')) = LOWER(?)
        )
      ORDER BY
        CASE
          WHEN pv.barcode = ? THEN 1
          WHEN pv.upc = ? THEN 2
          WHEN pv.ean = ? THEN 3
          WHEN pv.sku = ? OR LOWER(COALESCE(pv.sku, '')) = LOWER(?) THEN 4
          ELSE 5
        END,
        pv.updated_at DESC
      LIMIT 1
    `,
    [
      normalizedCode,
      normalizedCode,
      normalizedCode,
      normalizedCode,
      normalizedCode,
      normalizedCode,
      normalizedCode,
      normalizedCode,
      normalizedCode,
      normalizedCode,
    ]
  )

  return (result.rows?.[0] as MatchedVariantRow | undefined) ?? null
}

const getDraftOrder = async (req: AuthenticatedMedusaRequest, orderId: string) => {
  const workflow = getOrderDetailWorkflow(req.scope)
  const { result: draftOrder } = await workflow.run({
    input: {
      fields: [...POS_DRAFT_ORDER_FIELDS],
      order_id: orderId,
      filters: {
        is_draft_order: true,
      },
    },
  })

  if (!draftOrder) {
    throw new Error(`Draft order ${orderId} was not found`)
  }

  return draftOrder
}

const getLineItemQuantity = (item: {
  quantity?: number | string | null
  detail?: { quantity?: number | string | null } | null
}) => {
  const rawQuantity = item.quantity ?? item.detail?.quantity
  const parsedQuantity =
    typeof rawQuantity === "number" ? rawQuantity : Number.parseInt(String(rawQuantity ?? ""), 10)

  return Number.isFinite(parsedQuantity) ? parsedQuantity : null
}

export const POST = async (
  req: AuthenticatedMedusaRequest<PosScanAddRequestBody>,
  res: MedusaResponse
) => {
  const { draft_order_id, barcode, quantity: singleQuantity, items: batchItems } = req.validatedBody

  // Harmonize inputs into a single list of scans
  const scans: Array<{ barcode: string; quantity: number }> = []
  if (batchItems?.length) {
    scans.push(...batchItems)
  } else if (barcode) {
    scans.push({ barcode, quantity: singleQuantity ?? 1 })
  }

  if (scans.length === 0) {
    return res.status(400).json({
      type: "invalid_data",
      message: "No barcodes provided for scanning",
    })
  }

  console.log("[POS Scan Add] Request received", {
    draft_order_id,
    scan_count: scans.length,
    scans: scans.map((s) => `${s.barcode}x${s.quantity}`).join(", "),
    actor_id: req.auth_context?.actor_id,
  })

  // 1. Resolve all variants and check for missing ones
  const resolvedScans: Array<{
    barcode: string
    quantity: number
    variant: MatchedVariantRow
  }> = []

  for (const scan of scans) {
    const matchedVariant = await getMatchedVariant(req, scan.barcode)
    if (!matchedVariant) {
      console.warn("[POS Scan Add] No variant matched barcode", {
        draft_order_id,
        barcode: scan.barcode,
      })

      return res.status(404).json({
        type: "not_found",
        message: `No product variant found for barcode ${scan.barcode}`,
      })
    }
    resolvedScans.push({ ...scan, variant: matchedVariant })
  }

  let editStarted = false

  try {
    // 2. Safety: Try to confirm any existing active edit first to prevent collision
    try {
      await confirmDraftOrderEditWorkflow(req.scope).run({
        input: {
          order_id: draft_order_id,
          confirmed_by: req.auth_context?.actor_id,
        },
      })
      console.log("[POS Scan Add] Forced confirmation of existing edit session", { draft_order_id })
    } catch {
      // Ignore errors if there was no active edit
    }

    // 3. Fetch the latest state of the draft order PRE-edit
    const draftOrder = await getDraftOrder(req, draft_order_id)
    const existingItems = (draftOrder.items ?? []) as Array<any>

    // 4. Group scans by variant_id to handle multiple scans of same product in one request
    const aggregatedBatches = new Map<string, { variant: MatchedVariantRow; quantity: number }>()
    for (const scan of resolvedScans) {
      const existing = aggregatedBatches.get(scan.variant.id)
      if (existing) {
        existing.quantity += scan.quantity
      } else {
        aggregatedBatches.set(scan.variant.id, { variant: scan.variant, quantity: scan.quantity })
      }
    }

    // 5. Prepare the edit updates
    const itemsToAdd: Array<{ variant_id: string; quantity: number }> = []
    const itemsToUpdate: Array<{ id: string; quantity: number }> = []

    for (const [variantId, scanInfo] of aggregatedBatches.entries()) {
      // Check both variant_id and nested variant.id for robustness
      const existingItem = existingItems.find(
        (item) => item.variant_id === variantId || item.variant?.id === variantId
      )

      if (existingItem) {
        const currentQty = getLineItemQuantity(existingItem) ?? 0
        itemsToUpdate.push({
          id: existingItem.id,
          quantity: currentQty + scanInfo.quantity,
        })
      } else {
        itemsToAdd.push({
          variant_id: variantId,
          quantity: scanInfo.quantity,
        })
      }
    }

    // 6. Begin a new edit session
    console.log("[POS Scan Add] Beginning batch draft order edit", {
      draft_order_id,
      adds: itemsToAdd.length,
      updates: itemsToUpdate.length,
    })

    await beginDraftOrderEditWorkflow(req.scope).run({
      input: {
        order_id: draft_order_id,
        created_by: req.auth_context?.actor_id,
      },
    })
    editStarted = true

    // 7. Apply additions
    if (itemsToAdd.length > 0) {
      console.log("[POS Scan Add] Adding new items to draft order", { itemsToAdd })
      await addDraftOrderItemsWorkflow(req.scope).run({
        input: {
          order_id: draft_order_id,
          items: itemsToAdd,
        },
      })
    }

    // 8. Apply updates
    if (itemsToUpdate.length > 0) {
      console.log("[POS Scan Add] Updating existing items in draft order", { itemsToUpdate })
      await updateDraftOrderItemWorkflow(req.scope).run({
        input: {
          order_id: draft_order_id,
          items: itemsToUpdate,
        },
      })
    }

    // 9. Confirm the edit
    console.log("[POS Scan Add] Confirming batch draft order edit", { draft_order_id })
    await confirmDraftOrderEditWorkflow(req.scope).run({
      input: {
        order_id: draft_order_id,
        confirmed_by: req.auth_context?.actor_id,
      },
    })
    editStarted = false

    // 10. Fetch final state
    const updatedDraftOrder = await getDraftOrder(req, draft_order_id)
    
    // For single-item response compatibility, use first resolved scan
    const firstScan = resolvedScans[0]
    const detectedCode = [
      firstScan.variant.barcode,
      firstScan.variant.upc,
      firstScan.variant.ean,
      firstScan.variant.sku,
    ].find((value) => value?.toLowerCase() === firstScan.barcode.toLowerCase()) ?? firstScan.barcode

    console.log("[POS Scan Add] Batch scan add succeeded", {
      draft_order_id,
      processed_scans: resolvedScans.length,
      final_item_count: updatedDraftOrder.items?.length ?? 0,
      total: updatedDraftOrder.total,
    })

    return res.status(200).json({
      draft_order: updatedDraftOrder,
      detected_code: detectedCode,
      matched_variant: firstScan.variant,
      scans_processed: resolvedScans.length,
    })
  } catch (error) {
    if (editStarted) {
      try {
        console.warn("[POS Scan Add] Cancelling draft order edit after failure", { draft_order_id })
        await cancelDraftOrderEditWorkflow(req.scope).run({
          input: { order_id: draft_order_id },
        })
      } catch {
        // Ignore
      }
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    console.error("[POS Scan Add] Batch scan add failed", {
      draft_order_id,
      error_message: errorMessage,
      raw_error: error,
    })

    const statusCode =
      errorMessage.includes("already has an existing active order change") ||
      errorMessage.includes("not active") ||
      (error &&
        typeof error === "object" &&
        "raw_error" in (error as any) &&
        String((error as any).raw_error?.message || "").includes(
          "already has an existing active order change"
        ))
        ? 409
        : errorMessage.includes("does not have the required inventory") ||
          errorMessage.includes("out of stock")
        ? 400
        : 500

    return res.status(statusCode).json({
      type: "pos_scan_add_error",
      message: errorMessage,
    })
  }
}
