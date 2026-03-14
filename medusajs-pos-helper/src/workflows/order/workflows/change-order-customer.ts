import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { useRemoteQueryStep } from "@medusajs/medusa/core-flows"
import { changeOrderCustomerStep } from "../steps/change-order-customer"

export type ChangeOrderCustomerWorkflowInput = {
  id: string
  customer_id: string
  email: string
}

export const changeOrderCustomerWorkflow = createWorkflow(
  "change-order-customer-workflow",
  function (input: ChangeOrderCustomerWorkflowInput) {
    useRemoteQueryStep({
      entry_point: "order",
      fields: ["id"],
      variables: { id: input.id },
      list: false,
      throw_if_key_not_found: true,
    })

    useRemoteQueryStep({
      entry_point: "customer",
      fields: ["id", "email"],
      variables: { id: input.customer_id },
      list: false,
      throw_if_key_not_found: true,
    }).config({
      name: "validate-customer-for-order-change",
    })

    const order = changeOrderCustomerStep(input)

    return new WorkflowResponse({
      order,
    })
  }
)
