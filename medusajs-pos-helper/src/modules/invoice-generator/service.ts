import { MedusaService } from "@medusajs/framework/utils"
import { InvoiceConfig } from "./models/invoice-config"
import { Invoice, InvoiceStatus } from "./models/invoice"
const PdfPrinter = require("pdfmake")
import {
  InferTypeOf,
  OrderDTO,
  OrderLineItemDTO,
} from "@medusajs/framework/types"
import axios from "axios"
import sharp from "sharp"
import * as fs from "fs"
import * as path from "path"

// Font definitions - barcode font will be loaded dynamically
const fonts = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
}

const printer = new PdfPrinter(fonts)

type GeneratePdfParams = {
  order: OrderDTO
  items: OrderLineItemDTO[]
}

class InvoiceGeneratorService extends MedusaService({
  InvoiceConfig,
  Invoice,
}) {
  private barcodeFontLoaded = false

  private loadBarcodeFont(): void {
    if (this.barcodeFontLoaded) {
      return
    }

    try {
      const fontPath = path.join(__dirname, "../../assets/fonts/LibreBarcode128-Regular.ttf")
      const fontBuffer = fs.readFileSync(fontPath)

      ;(fonts as any).LibreBarcode128 = {
        normal: fontBuffer,
        bold: fontBuffer,
        italics: fontBuffer,
        bolditalics: fontBuffer,
      }

      this.barcodeFontLoaded = true
      console.log("✓ Invoice barcode font loaded from bundle")

      ;(global as any).invoicePrinter = new PdfPrinter(fonts)
    } catch (error) {
      console.error("Failed to load bundled barcode font:", error)
    }
  }

  private async formatAmount(amount: number, currency: string): Promise<string> {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount)
  }

  private async imageUrlToBase64(url: string): Promise<string> {
    try {
      if (!url) {
        console.log(`Invoice image URL is empty`)
        return ""
      }

      console.log(`Invoice attempting to load image: ${url}`)
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 5000 // 5 second timeout
      })

      let imageBuffer = Buffer.from(response.data)
      let mimeType = response.headers["content-type"] || "image/png"

      // Check if the buffer looks like valid image data
      const firstBytes = imageBuffer.subarray(0, 8).toString('hex')
      console.log(`Invoice original image header bytes for ${url}: ${firstBytes}, MimeType: ${mimeType}`)

      // Convert WebP images to PNG since pdfmake doesn't support WebP
      if (mimeType === 'image/webp' || firstBytes.startsWith('52494646')) {
        console.log(`Invoice converting WebP to PNG for ${url}`)
        try {
          // Use sharp to convert WebP to PNG
          imageBuffer = await sharp(imageBuffer)
            .png({ quality: 80, compressionLevel: 6 })
            .toBuffer()
          mimeType = 'image/png'
          console.log(`✓ Invoice WebP converted to PNG: ${imageBuffer.length} bytes`)
        } catch (sharpError) {
          console.error(`Invoice failed to convert WebP to PNG: ${sharpError.message}`)
          // If sharp conversion fails, return empty string to use fallback
          return ""
        }
      }

      const base64 = imageBuffer.toString("base64")

      // Validate image data before creating data URL
      if (!base64 || base64.length === 0) {
        console.error(`Invoice empty base64 data for URL: ${url}`)
        return ""
      }

      // Validate that we have a supported format
      const supportedFormats = ['image/png', 'image/jpeg', 'image/jpg']
      if (!supportedFormats.includes(mimeType)) {
        console.warn(`Invoice unsupported image format: ${mimeType} for ${url}`)
        return ""
      }

      const dataUrl = `data:${mimeType};base64,${base64}`
      console.log(`✓ Invoice successfully processed image: URL=${url}, FinalMimeType=${mimeType}, Base64Length=${base64.length}`)
      return dataUrl
    } catch (error) {
      // Log the error for debugging but don't fail the PDF generation
      console.error(`Invoice failed to load image from URL: ${url}`, error)
      console.error(`Invoice error details:`, {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText
      })
      return ""
    }
  }

  private formatOrderIdForBarcode(orderId: string): string {
    // Format the order ID for Code128 barcode
    // LibreBarcode128 font will render this as a proper scannable barcode
    // Remove "order_" prefix and use a reasonable length
    const displayId = orderId.replace(/^order_/, '').substring(0, 15)
    return displayId
  }

  private async createInvoiceContent(
    params: GeneratePdfParams,
    invoice: InferTypeOf<typeof Invoice>
  ): Promise<Record<string, any>> {
    // Get invoice configuration
    const invoiceConfigs = await this.listInvoiceConfigs()
    const config = invoiceConfigs[0] || {}

    // Pre-load company logo if it exists
    const companyLogoBase64 = config.company_logo ? await this.imageUrlToBase64(config.company_logo) : ""

    // Create table for order items
    const itemsTable = [
      [
        { text: "Item", style: "tableHeader" },
        { text: "Quantity", style: "tableHeader" },
        { text: "Unit Price", style: "tableHeader" },
        { text: "Total", style: "tableHeader" },
      ],
      ...(await Promise.all(params.items.map(async (item) => [
        { text: item.title || "Unknown Item", style: "tableRow" },
        { text: item.quantity.toString(), style: "tableRow" },
        {
          text: await this.formatAmount(
            item.unit_price,
            params.order.currency_code
          ), style: "tableRow"
        },
        {
          text: await this.formatAmount(
            Number(item.total),
            params.order.currency_code
          ), style: "tableRow"
        },
      ]))),
    ]

    const invoiceId = `INV-${invoice.display_id.toString().padStart(6, "0")}`
    const invoiceDate = new Date(invoice.created_at).toLocaleDateString()

    // return the PDF content structure
    return {
      pageSize: "A4",
      pageMargins: [40, 60, 40, 60],
      header: {
        margin: [40, 20, 40, 0],
        columns: [
          /** Company Logo */
          {
            width: "*",
            stack: [
              ...(companyLogoBase64 ? [
                {
                  image: companyLogoBase64,
                  width: 120,
                  height: 50,
                  fit: [120, 50],
                  margin: [0, 0, 0, 10],
                },
              ] : []),
              {
                text: config.company_name || "Your Company Name",
                style: "companyName",
                margin: [0, 0, 0, 0],
              },
            ],
          },
          /** Invoice Title */
          {
            width: "auto",
            stack: [
              {
                text: "INVOICE",
                style: "invoiceTitle",
                alignment: "right",
                margin: [0, 0, 0, 0],
              },
            ],
          },
        ],
      },
      content: [
        {
          margin: [0, 20, 0, 0],
          columns: [
            /** Company Details */
            {
              width: "*",
              stack: [
                {
                  text: "COMPANY DETAILS",
                  style: "sectionHeader",
                  margin: [0, 0, 0, 8],
                },
                config.company_address && {
                  text: config.company_address,
                  style: "companyAddress",
                  margin: [0, 0, 0, 4],
                },
                config.company_phone && {
                  text: config.company_phone,
                  style: "companyContact",
                  margin: [0, 0, 0, 4],
                },
                config.company_email && {
                  text: config.company_email,
                  style: "companyContact",
                  margin: [0, 0, 0, 0],
                },
              ],
            },
            /** Invoice Details */
            {
              width: "auto",
              table: {
                widths: [80, 120],
                body: [
                  [
                    { text: "Invoice ID:", style: "label" },
                    { text: invoiceId, style: "value" },
                  ],
                  [
                    { text: "Invoice Date:", style: "label" },
                    { text: invoiceDate, style: "value" },
                  ],
                  [
                    { text: "Order ID:", style: "label" },
                    {
                      text: params.order.display_id.toString().padStart(6, "0"),
                      style: "value",
                    },
                  ],
                  [
                    { text: "Order Date:", style: "label" },
                    {
                      text: new Date(params.order.created_at).toLocaleDateString(),
                      style: "value",
                    },
                  ],
                ],
              },
              layout: "noBorders",
              margin: [0, 0, 0, 20],
            },
          ],
        },
        {
          text: "\n",
        },
        /** Billing and Shipping Addresses */
        {
          columns: [
            {
              width: "*",
              stack: [
                {
                  text: "BILL TO",
                  style: "sectionHeader",
                  margin: [0, 0, 0, 8],
                },
                {
                  text: params.order.billing_address ?
                    `${params.order.billing_address.first_name || ""} ${params.order.billing_address.last_name || ""}
${params.order.billing_address.address_1 || ""}${params.order.billing_address.address_2 ? `\n${params.order.billing_address.address_2}` : ""}
${params.order.billing_address.city || ""}, ${params.order.billing_address.province || ""} ${params.order.billing_address.postal_code || ""}
${params.order.billing_address.country_code || ""}${params.order.billing_address.phone ? `\n${params.order.billing_address.phone}` : ""}` :
                    "No billing address provided",
                  style: "addressText",
                },
              ],
            },
            {
              width: "*",
              stack: [
                {
                  text: "SHIP TO",
                  style: "sectionHeader",
                  margin: [0, 0, 0, 8],
                },
                {
                  text: params.order.shipping_address ?
                    `${params.order.shipping_address.first_name || ""} ${params.order.shipping_address.last_name || ""}
${params.order.shipping_address.address_1 || ""} ${params.order.shipping_address.address_2 ? `\n${params.order.shipping_address.address_2}` : ""}
${params.order.shipping_address.city || ""}, ${params.order.shipping_address.province || ""} ${params.order.shipping_address.postal_code || ""}
${params.order.shipping_address.country_code || ""}${params.order.shipping_address.phone ? `\n${params.order.shipping_address.phone}` : ""}` :
                    "No shipping address provided",
                  style: "addressText",
                },
              ],
            },
          ],
        },
        {
          text: "\n\n",
        },
        /** Items Table */
        {
          table: {
            headerRows: 1,
            widths: ["*", "auto", "auto", "auto"],
            body: itemsTable,
          },
          layout: {
            fillColor: function (rowIndex: number) {
              return (rowIndex === 0) ? "#f8f9fa" : null
            },
            hLineWidth: function (i: number, node: any) {
              return (i === 0 || i === node.table.body.length) ? 0.8 : 0.3
            },
            vLineWidth: function (i: number, node: any) {
              return 0.3
            },
            hLineColor: function (i: number, node: any) {
              return (i === 0 || i === node.table.body.length) ? "#cbd5e0" : "#e2e8f0"
            },
            vLineColor: function () {
              return "#e2e8f0"
            },
            paddingLeft: function () {
              return 8
            },
            paddingRight: function () {
              return 8
            },
            paddingTop: function () {
              return 6
            },
            paddingBottom: function () {
              return 6
            },
          },
        },
        {
          text: "\n",
        },
        /** Totals Section */
        {
          columns: [
            { width: "*", text: "" },
            {
              width: "auto",
              table: {
                widths: ["auto", "auto"],
                body: [
                  [
                    { text: "Subtotal:", style: "totalLabel" },
                    {
                      text: await this.formatAmount(
                        Number(params.order.subtotal),
                        params.order.currency_code),
                      style: "totalValue",
                    },
                  ],
                  [
                    { text: "Tax:", style: "totalLabel" },
                    {
                      text: await this.formatAmount(
                        Number(params.order.tax_total),
                        params.order.currency_code),
                      style: "totalValue",
                    },
                  ],
                  [
                    { text: "Shipping:", style: "totalLabel" },
                    {
                      text: await this.formatAmount(
                        Number(params.order.shipping_methods?.[0]?.total || 0),
                        params.order.currency_code),
                      style: "totalValue",
                    },
                  ],
                  [
                    { text: "Discount:", style: "totalLabel" },
                    {
                      text: await this.formatAmount(
                        Number(params.order.discount_total),
                        params.order.currency_code),
                      style: "totalValue",
                    },
                  ],
                  [
                    { text: "Total:", style: "totalLabel" },
                    {
                      text: await this.formatAmount(
                        Number(params.order.total),
                        params.order.currency_code),
                      style: "totalValue",
                    },
                  ],
                ],
              },
              layout: {
                fillColor: function (rowIndex: number) {
                  return (rowIndex === 3) ? "#f8f9fa" : null
                },
                hLineWidth: function (i: number, node: any) {
                  return (i === 0 || i === node.table.body.length) ? 0.8 : 0.3
                },
                vLineWidth: function () {
                  return 0.3
                },
                hLineColor: function (i: number, node: any) {
                  return (i === 0 || i === node.table.body.length) ? "#cbd5e0" : "#e2e8f0"
                },
                vLineColor: function () {
                  return "#e2e8f0"
                },
                paddingLeft: function () {
                  return 8
                },
                paddingRight: function () {
                  return 8
                },
                paddingTop: function () {
                  return 6
                },
                paddingBottom: function () {
                  return 6
                },
              },
            },
          ],
        },
        {
          text: "\n\n",
        },
        /** Notes Section */
        ...(config.notes ? [
          {
            text: "Notes",
            style: "sectionHeader",
            margin: [0, 20, 0, 10],
          },
          {
            text: config.notes,
            style: "notesText",
            margin: [0, 0, 0, 20],
          },
        ] : []),
        {
          text: "Thank you for your business!",
          style: "thankYouText",
          alignment: "center",
          margin: [0, 30, 0, 0],
        },
        {
          text: "Order ID Barcode:",
          style: "footerText",
          alignment: "center",
          margin: [0, 20, 0, 5],
        },
        {
          text: this.formatOrderIdForBarcode(params.order.id),
          style: "barcodeText",
          alignment: "center",
          margin: [0, 0, 0, 0],
        },
      ],
      styles: {
        companyName: {
          fontSize: 22,
          bold: true,
          color: "#1a365d",
          margin: [0, 0, 0, 5],
        },
        companyAddress: {
          fontSize: 11,
          color: "#4a5568",
          lineHeight: 1.3,
        },
        companyContact: {
          fontSize: 10,
          color: "#4a5568",
        },
        invoiceTitle: {
          fontSize: 24,
          bold: true,
          color: "#2c3e50",
        },
        label: {
          fontSize: 10,
          color: "#6c757d",
          margin: [0, 0, 8, 0],
        },
        value: {
          fontSize: 10,
          bold: true,
          color: "#2c3e50",
        },
        sectionHeader: {
          fontSize: 12,
          bold: true,
          color: "#2c3e50",
          backgroundColor: "#f8f9fa",
          padding: [8, 12],
        },
        addressText: {
          fontSize: 10,
          color: "#495057",
          lineHeight: 1.3,
        },
        tableHeader: {
          fontSize: 10,
          bold: true,
          color: "#ffffff",
          fillColor: "#495057",
        },
        tableRow: {
          fontSize: 9,
          color: "#495057",
        },
        totalLabel: {
          fontSize: 10,
          bold: true,
          color: "#495057",
        },
        totalValue: {
          fontSize: 10,
          bold: true,
          color: "#2c3e50",
        },
        notesText: {
          fontSize: 10,
          color: "#6c757d",
          italics: true,
          lineHeight: 1.4,
        },
        thankYouText: {
          fontSize: 12,
          color: "#28a745",
          italics: true,
        },
        footerText: {
          fontSize: 9,
          color: "#6c757d",
          italics: true,
        },
        barcodeText: {
          fontSize: 48,
          color: "#000000",
          background: "#ffffff",
          border: "2px solid #dee2e6",
          padding: [15, 20, 15, 20],
          borderRadius: 4,
          font: "LibreBarcode128",
          alignment: "center",
        },
      },
      defaultStyle: {
        font: "Helvetica",
      },
    }
  }

  async generatePdf(params: GeneratePdfParams & {
    invoice_id: string
  }): Promise<Buffer> {
    try {
      console.log("Starting invoice PDF generation...")

      // Load barcode font before generating PDF
      this.loadBarcodeFont()

      const invoice = await this.retrieveInvoice(params.invoice_id)
      console.log("Invoice retrieved successfully")

      // Generate new content
      const pdfContent = Object.keys(invoice.pdfContent).length ?
        invoice.pdfContent :
        await this.createInvoiceContent(params, invoice)
      console.log("Invoice PDF content created successfully")

      await this.updateInvoices({
        id: invoice.id,
        pdfContent,
      })

      // Use the appropriate printer (global if font was loaded, default otherwise)
      const currentPrinter = (global as any).invoicePrinter || printer

      // get PDF as a Buffer
      return new Promise(async (resolve, reject) => {
        const chunks: Buffer[] = []
        let timeoutId: NodeJS.Timeout | null = null

        const cleanup = () => {
          if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
          }
        }

        try {
          // v0.3: createPdfKitDocument is now async and returns a Promise<PDFDocument>
          const pdfDoc = await currentPrinter.createPdfKitDocument(pdfContent as any)
          console.log("Invoice PDF document created, setting up event handlers")

          pdfDoc.on("data", (chunk) => {
            chunks.push(chunk)
            console.log(`Invoice PDF data chunk received: ${chunk.length} bytes`)
          })

          pdfDoc.on("end", () => {
            cleanup()
            try {
              const result = Buffer.concat(chunks)
              console.log(`Invoice PDF generation completed: ${result.length} bytes total`)
              resolve(result)
            } catch (err) {
              console.error("Error in invoice PDF end handler:", err)
              reject(err)
            }
          })

          pdfDoc.on("error", (err) => {
            cleanup()
            console.error("Invoice PDF generation error:", err)
            console.error("Invoice error details:", {
              message: err.message,
              stack: err.stack
            })
            reject(err)
          })

          // Add timeout to prevent hanging
          timeoutId = setTimeout(() => {
            cleanup()
            console.error("Invoice PDF generation timeout after 30 seconds")
            reject(new Error("Invoice PDF generation timeout"))
          }, 30000)

          console.log("Starting invoice PDF stream...")
          pdfDoc.end() // Finalize PDF stream
        } catch (err) {
          cleanup()
          console.error("Error creating invoice PDF document:", err)
          reject(err)
        }
      })
    } catch (error) {
      console.error("Error in invoice generatePdf:", error)
      throw error
    }
  }
}

export default InvoiceGeneratorService