import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

type ChangeOrderCustomerStepInput = {
  id: string
  customer_id: string
  email: string
}

type ChangeOrderCustomerCompensationInput = {
  id: string
  previous_customer_id: string | null
  previous_email: string | null
}

export const changeOrderCustomerStep = createStep(
  "change-order-customer",
  async (
    input: ChangeOrderCustomerStepInput,
    { container }: { container: MedusaContainer }
  ) => {
    const orderModule: any = container.resolve(Modules.ORDER)

    const [existingOrder] = await orderModule.listOrders(
      { id: input.id },
      {
        select: ["id", "customer_id", "email"],
      }
    )

    if (!existingOrder) {
      throw new Error("Order not found")
    }

    const updatedOrders = await orderModule.updateOrders(input.id, {
      customer_id: input.customer_id,
      email: input.email,
    })

    return new StepResponse(updatedOrders, {
      id: input.id,
      previous_customer_id: existingOrder.customer_id ?? null,
      previous_email: existingOrder.email ?? null,
    } satisfies ChangeOrderCustomerCompensationInput)
  },
  async (
    compensationInput,
    { container }: { container: MedusaContainer }
  ) => {
    if (!compensationInput) {
      return
    }

    const orderModule: any = container.resolve(Modules.ORDER)

    await orderModule.updateOrders(compensationInput.id, {
      customer_id: compensationInput.previous_customer_id,
      email: compensationInput.previous_email,
    })
  }
)
