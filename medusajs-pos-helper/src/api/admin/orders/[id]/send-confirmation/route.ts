import { MedusaRequest, MedusaResponse } from "@medusajs/framework"
import { sendOrderConfirmationWorkflow } from "../../../../../workflows/send-order-confirmation"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params

  try {
    const { result: notifications } = await sendOrderConfirmationWorkflow(req.scope)
      .run({
        input: {
          id,
        },
      })

    // Get order details to return the email
    const query = req.scope.resolve("query")
    const { data: [order] } = await query.graph({
      entity: "order",
      fields: ["email"],
      filters: {
        id,
      },
    })

    res.json({
      message: "Order confirmation sent successfully",
      email: order?.email,
      order_id: id,
    })
  } catch (error: any) {
    console.log("ERROR in send-confirmation:", error)
    res.status(500).json({
      message: "Failed to send order confirmation",
      error: error.message,
    })
  }
}
