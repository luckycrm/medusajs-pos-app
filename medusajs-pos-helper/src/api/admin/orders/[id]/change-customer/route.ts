import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import { z } from "zod"
import { changeOrderCustomerWorkflow } from "../../../../../workflows/order/workflows/change-order-customer"

export const PostAdminChangeOrderCustomerSchema = z.object({
  customer_id: z.string().min(1),
})

export type PostAdminChangeOrderCustomerType = z.infer<
  typeof PostAdminChangeOrderCustomerSchema
>

export async function POST(
  req: AuthenticatedMedusaRequest<PostAdminChangeOrderCustomerType>,
  res: MedusaResponse
): Promise<void> {
  const { id } = req.params
  const { customer_id } = req.validatedBody
  const query = req.scope.resolve("query")

  const { data: [customer] } = await query.graph({
    entity: "customer",
    fields: ["id", "email"],
    filters: {
      id: customer_id,
    },
  })

  if (!customer?.email) {
    res.status(404).json({
      message: "Customer not found",
    })
    return
  }

  const { result } = await changeOrderCustomerWorkflow(req.scope).run({
    input: {
      id,
      customer_id,
      email: customer.email,
    },
  })

  res.json(result)
}
