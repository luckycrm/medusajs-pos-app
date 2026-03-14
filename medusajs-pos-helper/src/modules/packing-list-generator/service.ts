import { MedusaService } from "@medusajs/framework/utils"
const PdfPrinter = require("pdfmake")
import {
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

type GeneratePackingListPdfParams = {
  order: OrderDTO
  items: OrderLineItemDTO[]
  packing_list_id: string
  // Optional company branding — read from InvoiceConfig by the step
  company_name?: string
  company_address?: string
  company_email?: string
  company_logo?: string
}

class PackingListGeneratorService extends MedusaService({}) {
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
      console.log("✓ Barcode font loaded from bundle")

      ;(global as any).printer = new PdfPrinter(fonts)
    } catch (error) {
      console.error("Failed to load bundled barcode font:", error)
    }
  }

  private getShippingMethodType(shippingMethods: any[]): string {
    if (!shippingMethods || shippingMethods.length === 0) {
      return "N/A"
    }

    const shippingMethod = shippingMethods[0]

    // Check multiple fields for pickup indicators
    const shippingOptionId = (shippingMethod.shipping_option_id || "").toLowerCase()
    const name = (shippingMethod.name || "").toLowerCase()
    const data = shippingMethod.data || {}

    // Check if it's a pickup method based on various indicators
    const pickupKeywords = [
      "pickup", "pick-up", "pick up", "collect", "collection",
      "in-store", "instore", "store", "local", "self-serve"
    ]

    // Check in various fields that might contain shipping method info
    const fieldsToCheck = [
      shippingOptionId,
      name,
      data.name || "",
      data.display_name || "",
      JSON.stringify(data).toLowerCase()
    ]

    const hasPickupKeyword = pickupKeywords.some(keyword =>
      fieldsToCheck.some(field => field.includes(keyword))
    )

    if (hasPickupKeyword) {
      return "Pickup"
    }

    // Default to shipping
    return "Shipping"
  }

  private getPaymentStatus(paymentCollections: any[]): string {
    if (!paymentCollections || paymentCollections.length === 0) {
      return "Unpaid"
    }

    // Check if any payment has been captured
    const hasCapturedPayment = paymentCollections.some(collection => {
      const payments = collection.payments || []
      return payments.some((payment: any) => payment.captured_at !== null && payment.captured_at !== undefined)
    })

    return hasCapturedPayment ? "Paid" : "Unpaid"
  }

  private getShippingMethodColor(shippingMethodType: string): string {
    switch (shippingMethodType.toLowerCase()) {
      case "pickup":
        return "#2E7D32" // Green for pickup
      case "shipping":
        return "#1976D2" // Blue for shipping
      default:
        return "#616161" // Gray for N/A
    }
  }

  private getPaymentStatusColor(paymentStatus: string): string {
    switch (paymentStatus.toLowerCase()) {
      case "paid":
        return "#2E7D32" // Green for paid
      case "unpaid":
        return "#D32F2F" // Red for unpaid
      default:
        return "#616161" // Gray for N/A
    }
  }

  private async formatQuantity(quantity: any): Promise<string> {
    if (typeof quantity === "number") {
      return quantity.toString()
    }
    if (typeof quantity === "string") {
      return quantity
    }
    if (quantity && typeof quantity === "object") {
      if (quantity.numeric_ !== undefined) {
        return quantity.numeric_.toString()
      }
      if (quantity.raw_ && quantity.raw_.value !== undefined) {
        return quantity.raw_.value.toString()
      }
    }
    return quantity?.toString() || "1"
  }

  private async imageUrlToBase64(url: string): Promise<string> {
    try {
      if (!url) {
        console.log(`Image URL is empty`)
        return ""
      }

      console.log(`Attempting to load image: ${url}`)
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 5000 // 5 second timeout
      })

      let imageBuffer = Buffer.from(response.data)
      let mimeType = response.headers["content-type"] || "image/png"

      // Check if the buffer looks like valid image data
      const firstBytes = imageBuffer.subarray(0, 8).toString('hex')
      console.log(`Original image header bytes for ${url}: ${firstBytes}, MimeType: ${mimeType}`)

      // Convert WebP images to PNG since pdfmake doesn't support WebP
      if (mimeType === 'image/webp' || firstBytes.startsWith('52494646')) {
        console.log(`Converting WebP to PNG for ${url}`)
        try {
          // Use sharp to convert WebP to PNG
          imageBuffer = await sharp(imageBuffer)
            .png({ quality: 80, compressionLevel: 6 })
            .toBuffer()
          mimeType = 'image/png'
          console.log(`✓ WebP converted to PNG: ${imageBuffer.length} bytes`)
        } catch (sharpError) {
          console.error(`Failed to convert WebP to PNG: ${sharpError.message}`)
          // If sharp conversion fails, return empty string to use fallback
          return ""
        }
      }

      const base64 = imageBuffer.toString("base64")

      // Validate image data before creating data URL
      if (!base64 || base64.length === 0) {
        console.error(`Empty base64 data for URL: ${url}`)
        return ""
      }

      // Validate that we have a supported format
      const supportedFormats = ['image/png', 'image/jpeg', 'image/jpg']
      if (!supportedFormats.includes(mimeType)) {
        console.warn(`Unsupported image format: ${mimeType} for ${url}`)
        return ""
      }

      const dataUrl = `data:${mimeType};base64,${base64}`
      console.log(`✓ Successfully processed image: URL=${url}, FinalMimeType=${mimeType}, Base64Length=${base64.length}`)
      return dataUrl
    } catch (error) {
      // Log the error for debugging but don't fail the PDF generation
      console.error(`Failed to load image from URL: ${url}`, error)
      console.error(`Error details:`, {
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

  private async createPackingListContent(
    params: GeneratePackingListPdfParams
  ): Promise<Record<string, any>> {
    // Create table for packing list items
    console.log(`Processing ${params.items.length} items for packing list...`)
    const itemsTable = [
      [
        { text: "Image", style: "tableHeader", alignment: "center" },
        { text: "Product Name", style: "tableHeader" },
        { text: "SKU", style: "tableHeader" },
        { text: "Quantity", style: "tableHeader", alignment: "center" },
      ],
      ...(await Promise.all(params.items.map(async (item, index) => {
        try {
          const thumbnailUrl = item.thumbnail || ""
          console.log(`\n=== Processing Item ${index + 1}/${params.items.length} ===`)
          console.log(`Title: ${item.product_title}`)
          console.log(`Thumbnail URL: ${thumbnailUrl}`)

          const imageBase64 = thumbnailUrl ? await this.imageUrlToBase64(thumbnailUrl) : ""

          console.log(`Item ${index}: Thumbnail=${thumbnailUrl}, Base64Length=${imageBase64.length}, Success=${imageBase64.length > 0}`)

          // Validate the image data before including in table
          let imageCell
          if (imageBase64 && imageBase64.length > 0) {
            if (imageBase64.startsWith('data:image/')) {
              imageCell = {
                image: imageBase64,
                width: 40,
                height: 40,
                alignment: "center",
              }
              console.log(`✓ Image cell created for item ${index}`)
            } else {
              console.warn(`⚠ Invalid image data format for item ${index}, using fallback`)
              imageCell = {
                text: "No Image",
                style: "noImageText",
                alignment: "center",
                width: 40,
                height: 40,
                margin: [10, 0],
              }
            }
          } else {
            console.log(`⚠ No image data for item ${index}, using fallback`)
            imageCell = {
              text: "No Image",
              style: "noImageText",
              alignment: "center",
              width: 40,
              height: 40,
              margin: [10, 0],
            }
          }

          const row = [
            imageCell,
            { text: item.product_title || "Unknown Product", style: "tableRow" },
            { text: item.variant_sku || "N/A", style: "tableRow" },
            { text: await this.formatQuantity(item.quantity), style: "tableRow", alignment: "center" },
          ]

          console.log(`✓ Row created for item ${index}`)
          return row
        } catch (error) {
          console.error(`❌ Error processing item ${index}:`, error)
          // Return a safe fallback row
          return [
            {
              text: "No Image",
              style: "noImageText",
              alignment: "center",
              width: 40,
              height: 40,
              margin: [10, 0],
            },
            { text: item.product_title || "Unknown Product", style: "tableRow" },
            { text: item.variant_sku || "N/A", style: "tableRow" },
            { text: await this.formatQuantity(item.quantity), style: "tableRow", alignment: "center" },
          ]
        }
      }))),
    ]
    console.log(`✓ Items table created with ${itemsTable.length - 1} product rows`)

    const packingListId = `PK-${params.order.display_id.toString().padStart(6, "0")}`
    const packingListDate = new Date().toLocaleDateString()

    // Company branding — from InvoiceConfig (passed by step), fallback to defaults
    const companyName = params.company_name || "BootsERP"
    const companyAddress = params.company_address || ""
    const companyEmail = params.company_email || ""
    const companyLogoUrl = params.company_logo || ""
    const companyLogoBase64 = companyLogoUrl ? await this.imageUrlToBase64(companyLogoUrl) : ""
    console.log(`Company: ${companyName}, Logo: ${companyLogoUrl || 'none'}`)

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
              ...(companyLogoBase64 ? [{
                image: companyLogoBase64,
                width: 120,
                height: 50,
                fit: [120, 50],
                margin: [0, 0, 0, 10],
              }] : []),
              {
                text: companyName,
                style: "companyName",
                margin: [0, 0, 0, 0],
              },
            ],
          },
          /** Packing List Title */
          {
            width: "auto",
            stack: [
              {
                text: "PACKING LIST",
                style: "packingListTitle",
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
                  text: "SHIPPER",
                  style: "sectionHeader",
                  margin: [0, 0, 0, 8],
                },
                {
                  text: [companyName, companyAddress, companyEmail]
                    .filter(Boolean)
                    .join("\n") || companyName,
                  style: "companyInfo",
                  margin: [0, 0, 0, 0],
                },
              ],
            },
            /** Packing List Details */
            {
              width: "auto",
              table: {
                widths: [100, 120],
                body: [
                  [
                    { text: "Packing List ID:", style: "label" },
                    { text: packingListId, style: "value" },
                  ],
                  [
                    { text: "Date:", style: "label" },
                    { text: packingListDate, style: "value" },
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
        /** Customer Information */
        {
          columns: [
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
${params.order.shipping_address.address_1 || ""}${params.order.shipping_address.address_2 ? `\n${params.order.shipping_address.address_2}` : ""}
${params.order.shipping_address.city || ""}, ${params.order.shipping_address.province || ""} ${params.order.shipping_address.postal_code || ""}
${params.order.shipping_address.country_code || ""}${params.order.shipping_address.phone ? `\nPhone: ${params.order.shipping_address.phone}` : ""}
Email: ${params.order.email || ""}` :
                    "No shipping address provided",
                  style: "addressText",
                },
              ],
            },
            {
              width: "*",
              stack: [
                {
                  text: "ORDER INFORMATION",
                  style: "sectionHeader",
                  margin: [0, 0, 0, 8],
                },
                {
                  text: [
                    { text: `Customer: ${params.order.email || "N/A"}\n` },
                    {
                      text: `Shipping Method: ${this.getShippingMethodType(params.order.shipping_methods || [])}\n`,
                      color: this.getShippingMethodColor(this.getShippingMethodType(params.order.shipping_methods || [])),
                      bold: true,
                    },
                    {
                      text: `Payment Status: ${this.getPaymentStatus([])}\n`,
                      color: this.getPaymentStatusColor(this.getPaymentStatus([])),
                      bold: true,
                    },
                    { text: `Currency: ${params.order.currency_code?.toUpperCase() || "N/A"}` },
                  ],
                  style: "orderInfo",
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
            widths: [60, "*", "auto", "auto"],
            body: itemsTable,
          },
          layout: {
            fillColor: function (rowIndex: number) {
              return (rowIndex === 0) ? "#2c3e50" : null
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
        /** Summary Section */
        {
          columns: [
            {
              width: "*",
              stack: [
                {
                  text: "SUMMARY",
                  style: "sectionHeader",
                  margin: [0, 0, 0, 8],
                },
                {
                  text: `Total Items: ${params.items.length}
Total Quantity: ${await Promise.all(params.items.map(item => this.formatQuantity(item.quantity))).then(qty => qty.reduce((sum, q) => sum + parseInt(q), 0))}`,
                  style: "summaryText",
                },
              ],
            },
            {
              width: "*",
              stack: [
                {
                  text: "NOTES",
                  style: "sectionHeader",
                  margin: [0, 0, 0, 8],
                },
                {
                  text: "• Please check items carefully before shipping\n• Ensure all items are properly packaged\n• Include any accessories or manuals\n• Double-check shipping address",
                  style: "notesText",
                },
              ],
            },
          ],
        },
        {
          text: "\n\n",
        },
        /** Footer */
        {
          text: "This packing list is automatically generated. Please verify all items before shipment.",
          style: "footerText",
          alignment: "center",
          margin: [0, 10, 0, 0],
        },
        {
          text: "Order ID Barcode:",
          style: "footerText",
          alignment: "center",
          margin: [0, 5, 0, 0],
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
          fontSize: 20,
          bold: true,
          color: "#1a365d",
          margin: [0, 0, 0, 5],
        },
        packingListTitle: {
          fontSize: 22,
          bold: true,
          color: "#2c3e50",
        },
        companyInfo: {
          fontSize: 10,
          color: "#4a5568",
          lineHeight: 1.3,
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
          color: "#ffffff",
          backgroundColor: "#2c3e50",
          padding: [8, 12],
        },
        addressText: {
          fontSize: 10,
          color: "#495057",
          lineHeight: 1.3,
        },
        orderInfo: {
          fontSize: 10,
          color: "#495057",
          lineHeight: 1.4,
        },
        tableHeader: {
          fontSize: 9,
          bold: true,
          color: "#ffffff",
          fillColor: "#2c3e50",
        },
        tableRow: {
          fontSize: 9,
          color: "#495057",
        },
        noImageText: {
          fontSize: 8,
          color: "#999999",
          italics: true,
        },
        summaryText: {
          fontSize: 10,
          color: "#495057",
          lineHeight: 1.4,
        },
        notesText: {
          fontSize: 9,
          color: "#6c757d",
          lineHeight: 1.4,
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

  async generatePackingListPdf(params: GeneratePackingListPdfParams): Promise<Buffer> {
    try {
      console.log("Starting PDF generation for packing list...")

      // Load barcode font before generating PDF
      this.loadBarcodeFont()

      // Generate new content with barcode
      const pdfContent = await this.createPackingListContent(params)
      console.log("PDF content created successfully")

      // Validate PDF content before generating
      const hasImages = pdfContent.content.some((section: any) => {
        if (section.table && section.table.body) {
          return section.table.body.some((row: any) =>
            row.some((cell: any) => cell && cell.image)
          )
        }
        return false
      })
      console.log(`PDF contains images: ${hasImages}`)


      // Use the appropriate printer (global if font was loaded, default otherwise)
      const currentPrinter = (global as any).printer || printer

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
          console.log("PDF document created, setting up event handlers")

          pdfDoc.on("data", (chunk) => {
            chunks.push(chunk)
            console.log(`PDF data chunk received: ${chunk.length} bytes`)
          })

          pdfDoc.on("end", () => {
            cleanup()
            try {
              const result = Buffer.concat(chunks)
              console.log(`PDF generation completed: ${result.length} bytes total`)
              resolve(result)
            } catch (err) {
              console.error("Error in PDF end handler:", err)
              reject(err)
            }
          })

          pdfDoc.on("error", (err) => {
            cleanup()
            console.error("PDF generation error:", err)
            console.error("Error details:", {
              message: err.message,
              stack: err.stack
            })
            reject(err)
          })

          // Add timeout to prevent hanging
          timeoutId = setTimeout(() => {
            cleanup()
            console.error("PDF generation timeout after 30 seconds")
            reject(new Error("PDF generation timeout"))
          }, 30000)

          console.log("Starting PDF stream...")
          pdfDoc.end() // Finalize PDF stream
        } catch (err) {
          cleanup()
          console.error("Error creating PDF document:", err)
          reject(err)
        }
      })
    } catch (error) {
      console.error("Error in generatePackingListPdf:", error)
      throw error
    }
  }
}

export default PackingListGeneratorService