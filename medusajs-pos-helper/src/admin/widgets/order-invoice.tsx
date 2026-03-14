import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { sdk } from "../lib/sdk"
import { useState } from "react"

const OrderInvoiceWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const [isDownloading, setIsDownloading] = useState(false)
  const [isEmailing, setIsEmailing] = useState(false)
  const [isSendingConfirmation, setIsSendingConfirmation] = useState(false)
  const [isDownloadingPackingList, setIsDownloadingPackingList] = useState(false)

  const emailInvoice = async () => {
    setIsEmailing(true)
    
    try {
      const response: Response = await sdk.client.fetch(
        `/admin/orders/${order.id}/invoices/email`, 
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: {},
        }
      )
      
      const result = await response.json()
      setIsEmailing(false)
      
      if (response.ok) {
        toast.success(`Invoice emailed successfully to ${result.email}`)
      } else {
        toast.error(result.message || "Failed to email invoice")
      }
    } catch (error) {
      toast.error(`Failed to email invoice: ${error}`)
      setIsEmailing(false)
    }
  }

  const sendOrderConfirmation = async () => {
    setIsSendingConfirmation(true)

    try {
      const response: Response = await sdk.client.fetch(
        `/admin/orders/${order.id}/send-confirmation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: {},
        }
      )

      const result = await response.json()
      setIsSendingConfirmation(false)

      if (response.ok) {
        toast.success(`Order confirmation sent successfully to ${result.email}`)
      } else {
        toast.error(result.message || "Failed to send order confirmation")
      }
    } catch (error) {
      toast.error(`Failed to send order confirmation: ${error}`)
      setIsSendingConfirmation(false)
    }
  }

  const downloadPackingList = async () => {
    setIsDownloadingPackingList(true)

    try {
      const response: Response = await sdk.client.fetch(
        `/admin/orders/${order.id}/packing-list`,
        {
          method: "GET",
          headers: {
            "accept": "application/pdf",
          },
        }
      )

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `packing-list-${order.id}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      setIsDownloadingPackingList(false)
      toast.success("Packing list generated and downloaded successfully")
    } catch (error) {
      toast.error(`Failed to generate packing list: ${error}`)
      setIsDownloadingPackingList(false)
    }
  }

  const downloadInvoice = async () => {
    setIsDownloading(true)
    
    try {
      const response: Response = await sdk.client.fetch(
        `/admin/orders/${order.id}/invoices`, 
        {
          method: "GET",
          headers: {
            "accept": "application/pdf",
          },
        }
      )
  
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `invoice-${order.id}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      setIsDownloading(false)
      toast.success("Invoice generated and downloaded successfully")
    } catch (error) {
      toast.error(`Failed to generate invoice: ${error}`)
      setIsDownloading(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Documents</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Generate invoice, packing list, and send order confirmation emails
          </Text>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            disabled={isDownloading || isEmailing || isSendingConfirmation}
            onClick={downloadInvoice}
            isLoading={isDownloading}
          >
            Download Invoice
          </Button>
          <Button
            variant="secondary"
            disabled={isDownloading || isEmailing || isSendingConfirmation || isDownloadingPackingList}
            onClick={emailInvoice}
            isLoading={isEmailing}
          >
            Email Invoice
          </Button>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            disabled={isDownloading || isEmailing || isSendingConfirmation || isDownloadingPackingList}
            onClick={downloadPackingList}
            isLoading={isDownloadingPackingList}
          >
            Download Packing List
          </Button>
        </div>
        <div className="flex items-center justify-end">
          <Button
            variant="primary"
            disabled={isDownloading || isEmailing || isSendingConfirmation}
            onClick={sendOrderConfirmation}
            isLoading={isSendingConfirmation}
          >
            Send Order Confirmation
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.side.before",
})

export default OrderInvoiceWidget
