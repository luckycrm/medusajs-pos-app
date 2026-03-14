import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { generatePackingListPdfWorkflow } from "../../../../../workflows/generate-packing-list-pdf"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params

  try {
    const { result: { pdf_buffer, packing_list_id } } = await generatePackingListPdfWorkflow(req.scope)
      .run({
        input: {
          order_id: id,
        },
      })

    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="packing-list-${packing_list_id}.pdf"`)
    res.send(Buffer.from(pdf_buffer))
  } catch (error) {
    console.log("ERROR in packing-list:", error)
    res.status(500).json({
      message: "Failed to generate packing list",
      error: error.message,
    })
  }
}