import { Router } from "express";
import { z } from "zod";
import nodemailer from "nodemailer";
import PDFDocument from "pdfkit";
import { storage } from "../storage";
import { isAuthenticated } from "../customAuth";
import { requireRole } from "../rbac";
import { insertInvoiceSchema, insertInvoiceItemSchema, formatCurrency, SUPPORTED_CURRENCIES } from "@shared/schema";
import { logger } from "../logger";
import { messagingRateLimit } from "../rateLimits";
import { getEmailTransporter } from "./auth";

const router = Router();

// Activity logging helper
const logActivity = async (req: any, action: string, module: string, targetId?: string, targetName?: string, details?: any) => {
  try {
    const userId = req.user?.id;
    await storage.createActivityLog({
      userId,
      action,
      module,
      targetId,
      targetName,
      details,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to log activity");
  }
};

// PDF generation with professional layout
const generateInvoicePDF = async (invoice: any, items: any[]): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 40, bottom: 40, left: 50, right: 50 } });
    const buffers: Buffer[] = [];
    const currency = invoice.currency || "USD";
    const pageWidth = 595.28; // A4 width in points
    const leftMargin = 50;
    const rightMargin = 545;
    const contentWidth = rightMargin - leftMargin;

    // Brand colors
    const brandDark = "#1a1a2e";
    const brandAccent = "#e94560";
    const brandGray = "#6b7280";
    const brandLightBg = "#f8f9fa";
    const white = "#ffffff";

    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });

    // ── Top accent bar ──
    doc.rect(0, 0, pageWidth, 6).fill(brandAccent);

    // ── Company Header Section ──
    let y = 30;

    // Company name
    doc.font("Helvetica-Bold").fontSize(22).fillColor(brandDark)
      .text("VOLUME FASHION", leftMargin, y);
    doc.font("Helvetica").fontSize(10).fillColor(brandAccent)
      .text("COLLECTION", leftMargin + doc.font("Helvetica-Bold").fontSize(22).widthOfString("VOLUME FASHION  ") - 48, y + 13);
    doc.font("Helvetica").fontSize(10);

    // Company address — right aligned
    doc.font("Helvetica").fontSize(8).fillColor(brandGray);
    doc.text("4006-4008 Room, 5th Floor, Changjiang International", rightMargin - 220, y, { width: 220, align: "right" });
    doc.text("Garment Building, No.931 Renmingbei Road", rightMargin - 220, y + 10, { width: 220, align: "right" });
    doc.text("Yuexiu District, Guangzhou, China", rightMargin - 220, y + 20, { width: 220, align: "right" });
    doc.text("+86 132 8868 9165", rightMargin - 220, y + 34, { width: 220, align: "right" });

    y = 80;
    // Thin separator line
    doc.moveTo(leftMargin, y).lineTo(rightMargin, y).lineWidth(0.5).strokeColor("#e0e0e0").stroke();

    // ── INVOICE Title + Details ──
    y += 15;
    doc.font("Helvetica-Bold").fontSize(28).fillColor(brandDark)
      .text("INVOICE", leftMargin, y);

    // Invoice meta — right side in a light box
    const metaBoxX = 370;
    const metaBoxW = rightMargin - metaBoxX;
    doc.rect(metaBoxX, y - 2, metaBoxW, 58).fill(brandLightBg);

    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(brandGray);
    doc.text("INVOICE NO.", metaBoxX + 12, y + 5);
    doc.text("DATE", metaBoxX + 12, y + 22);
    doc.text("CURRENCY", metaBoxX + 12, y + 39);

    doc.font("Helvetica-Bold").fontSize(9).fillColor(brandDark);
    doc.text(invoice.invoiceNumber, metaBoxX + 85, y + 5);
    doc.text(new Date(invoice.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), metaBoxX + 85, y + 22);
    doc.text(currency, metaBoxX + 85, y + 39);

    // Status badge
    const status = invoice.status || "Pending";
    const statusColor = status === "Processed" ? "#059669" : status === "Cancelled" ? "#dc2626" : "#d97706";
    y += 62;
    doc.roundedRect(metaBoxX + 12, y, 70, 18, 3).fill(statusColor);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(white)
      .text(status.toUpperCase(), metaBoxX + 14, y + 5, { width: 66, align: "center" });

    // ── Bill To Section ──
    y = 170;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(brandAccent)
      .text("BILL TO", leftMargin, y);
    y += 14;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(brandDark)
      .text(invoice.customerName, leftMargin, y);
    y += 16;
    doc.font("Helvetica").fontSize(9).fillColor(brandGray);
    if (invoice.customerPhone) { doc.text(invoice.customerPhone, leftMargin, y); y += 13; }
    if (invoice.customerEmail) { doc.text(invoice.customerEmail, leftMargin, y); y += 13; }
    if (invoice.customerAddress) {
      doc.text(invoice.customerAddress, leftMargin, y, { width: 280 });
      y += doc.heightOfString(invoice.customerAddress, { width: 280 }) + 5;
    }

    // ── Items Table ──
    const tableTop = Math.max(y + 20, 260);

    // Table column definitions
    const cols = {
      num:     { x: leftMargin,       w: 30 },
      product: { x: leftMargin + 30,  w: 160 },
      size:    { x: leftMargin + 190, w: 60 },
      qty:     { x: leftMargin + 250, w: 50 },
      price:   { x: leftMargin + 300, w: 90 },
      total:   { x: leftMargin + 390, w: 105 },
    };

    // Table header background
    doc.rect(leftMargin, tableTop, contentWidth, 22).fill(brandDark);

    // Table header text
    doc.font("Helvetica-Bold").fontSize(8).fillColor(white);
    doc.text("#", cols.num.x + 8, tableTop + 7, { width: cols.num.w });
    doc.text("PRODUCT", cols.product.x + 5, tableTop + 7, { width: cols.product.w });
    doc.text("SIZE", cols.size.x + 5, tableTop + 7, { width: cols.size.w });
    doc.text("QTY", cols.qty.x + 5, tableTop + 7, { width: cols.qty.w, align: "center" });
    doc.text("UNIT PRICE", cols.price.x + 5, tableTop + 7, { width: cols.price.w, align: "right" });
    doc.text("TOTAL", cols.total.x + 5, tableTop + 7, { width: cols.total.w - 10, align: "right" });

    // Table rows
    let rowY = tableTop + 22;
    const rowHeight = 24;
    items.forEach((item, index) => {
      // Alternating row backgrounds
      if (index % 2 === 0) {
        doc.rect(leftMargin, rowY, contentWidth, rowHeight).fill(brandLightBg);
      }

      doc.font("Helvetica").fontSize(8.5).fillColor(brandGray);
      doc.text((index + 1).toString(), cols.num.x + 8, rowY + 7, { width: cols.num.w });

      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(brandDark);
      doc.text(item.product?.productName || "Unknown", cols.product.x + 5, rowY + 7, { width: cols.product.w - 5, lineBreak: false });

      doc.font("Helvetica").fontSize(8.5).fillColor(brandGray);
      doc.text(item.product?.size || "-", cols.size.x + 5, rowY + 7, { width: cols.size.w });
      doc.text(item.quantity.toString(), cols.qty.x + 5, rowY + 7, { width: cols.qty.w, align: "center" });

      doc.fillColor(brandDark);
      doc.text(formatCurrency(item.unitPrice, currency), cols.price.x + 5, rowY + 7, { width: cols.price.w, align: "right" });
      doc.font("Helvetica-Bold")
        .text(formatCurrency(item.totalPrice, currency), cols.total.x + 5, rowY + 7, { width: cols.total.w - 10, align: "right" });

      rowY += rowHeight;
    });

    // Bottom border of table
    doc.moveTo(leftMargin, rowY).lineTo(rightMargin, rowY).lineWidth(0.5).strokeColor("#e0e0e0").stroke();

    // ── Totals Section (right-aligned box) ──
    const totalsX = 350;
    const totalsW = rightMargin - totalsX;
    let totalsY = rowY + 20;

    // Subtotal
    doc.font("Helvetica").fontSize(9).fillColor(brandGray);
    doc.text("Subtotal", totalsX, totalsY, { width: 90, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(brandDark);
    doc.text(formatCurrency(invoice.subtotal, currency), totalsX + 95, totalsY, { width: totalsW - 95, align: "right" });
    totalsY += 18;

    // Discount
    if (invoice.discountAmount && parseFloat(invoice.discountAmount) > 0) {
      doc.font("Helvetica").fontSize(9).fillColor(brandGray);
      doc.text(`Discount (${(parseFloat(invoice.discountPercentage) * 100).toFixed(1)}%)`, totalsX, totalsY, { width: 90, align: "right" });
      doc.font("Helvetica").fontSize(9).fillColor("#059669");
      doc.text(`-${formatCurrency(invoice.discountAmount, currency)}`, totalsX + 95, totalsY, { width: totalsW - 95, align: "right" });
      totalsY += 18;
    }

    // Tax
    doc.font("Helvetica").fontSize(9).fillColor(brandGray);
    doc.text(`Tax (${(parseFloat(invoice.taxRate) * 100).toFixed(1)}%)`, totalsX, totalsY, { width: 90, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor(brandDark);
    doc.text(formatCurrency(invoice.taxAmount, currency), totalsX + 95, totalsY, { width: totalsW - 95, align: "right" });
    totalsY += 6;

    // Total — highlighted bar
    totalsY += 8;
    doc.rect(totalsX, totalsY, totalsW, 28).fill(brandDark);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(white);
    doc.text("TOTAL DUE", totalsX + 10, totalsY + 8, { width: 80, align: "right" });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(white);
    doc.text(formatCurrency(invoice.total, currency), totalsX + 95, totalsY + 7, { width: totalsW - 105, align: "right" });

    totalsY += 38;

    // ── Notes Section ──
    if (invoice.notes) {
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor(brandAccent)
        .text("NOTES", leftMargin, totalsY);
      totalsY += 14;
      doc.rect(leftMargin, totalsY, contentWidth, 1).fill("#e0e0e0");
      totalsY += 8;
      doc.font("Helvetica").fontSize(9).fillColor(brandGray)
        .text(invoice.notes, leftMargin, totalsY, { width: contentWidth });
      totalsY += doc.heightOfString(invoice.notes, { width: contentWidth }) + 15;
    }

    // ── Footer ──
    const footerY = Math.max(totalsY + 40, 720);
    doc.rect(leftMargin, footerY, contentWidth, 0.5).fill("#e0e0e0");

    doc.font("Helvetica").fontSize(8).fillColor(brandGray);
    doc.text("Volume Fashion Collection  |  Guangzhou, China  |  +86 132 8868 9165", leftMargin, footerY + 10, { width: contentWidth, align: "center" });

    doc.font("Helvetica-Bold").fontSize(9).fillColor(brandDark);
    doc.text("Thank you for your business!", leftMargin, footerY + 26, { width: contentWidth, align: "center" });

    // Bottom accent bar
    doc.rect(0, 835, pageWidth, 6).fill(brandAccent);

    doc.end();
  });
};

// WhatsApp integration (using Twilio)
const sendWhatsAppMessage = async (to: string, pdfUrl: string, invoiceNumber: string, total: string, currency: string) => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.");
  }

  const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";

  // Dynamic import for Twilio
  const twilio = await import("twilio");
  const client = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  await client.messages.create({
    body: `Your invoice ${invoiceNumber} is ready! Total: ${formatCurrency(total, currency)}. Download it here: ${pdfUrl}`,
    from: twilioNumber,
    to: `whatsapp:${to}`,
  });
};

// GET /api/invoices
router.get("/api/invoices", isAuthenticated, async (req, res) => {
  try {
    const { page = "1", limit = "20", status, startDate, endDate, customerName } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const result = await storage.getAllInvoices({
      limit: parseInt(limit as string),
      offset,
      status: status as string,
      startDate: startDate as string,
      endDate: endDate as string,
      customerName: customerName as string,
    });

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error fetching invoices");
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
});

// GET /api/invoices/:id
router.get("/api/invoices/:id", isAuthenticated, async (req, res) => {
  try {
    const invoice = await storage.getInvoiceWithItems(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    res.json(invoice);
  } catch (error) {
    logger.error({ err: error }, "Error fetching invoice");
    res.status(500).json({ message: "Failed to fetch invoice" });
  }
});

// POST /api/invoices
router.post("/api/invoices", isAuthenticated, requireRole("Admin", "Manager", "Staff"), async (req: any, res) => {
  try {
    const { invoice: invoiceData, items: itemsData } = req.body;

    // Auto-save customer to customer list
    let customerId: string | undefined;
    if (invoiceData.customerPhone) {
      try {
        const existingCustomer = await storage.findCustomerByPhone(invoiceData.customerPhone);
        if (existingCustomer) {
          // Update existing customer with latest details
          const updated = await storage.updateCustomer(existingCustomer.id, {
            name: invoiceData.customerName,
            email: invoiceData.customerEmail || existingCustomer.email,
            address: invoiceData.customerAddress || existingCustomer.address,
          });
          customerId = updated.id;
        } else {
          // Create new customer
          const newCustomer = await storage.createCustomer({
            name: invoiceData.customerName,
            email: invoiceData.customerEmail || null,
            phone: invoiceData.customerPhone,
            address: invoiceData.customerAddress || null,
          });
          customerId = newCustomer.id;
        }
      } catch (custErr) {
        logger.warn({ err: custErr }, "Failed to auto-save customer, continuing with invoice creation");
      }
    }

    const validatedInvoice = insertInvoiceSchema.parse({
      ...invoiceData,
      customerId: customerId || invoiceData.customerId,
      createdBy: req.user.id,
    });

    const validatedItems = itemsData.map((item: any) => insertInvoiceItemSchema.parse(item));

    const invoice = await storage.createInvoice(validatedInvoice, validatedItems);

    await logActivity(req, `Created invoice ${invoice.invoiceNumber}`, "Invoices", invoice.id, invoice.invoiceNumber);

    res.status(201).json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid invoice data", errors: error.errors });
    }
    logger.error({ err: error }, "Error creating invoice");
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to create invoice" });
  }
});

// PUT /api/invoices/:id/status
router.put("/api/invoices/:id/status", isAuthenticated, requireRole("Admin", "Manager"), async (req: any, res) => {
  try {
    const { status } = req.body;
    const userId = req.user.id;

    const validStatuses = ["Pending", "Processed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }

    const invoice = await storage.updateInvoiceStatus(req.params.id, status, userId);

    await logActivity(req, `Updated invoice ${invoice.invoiceNumber} status to ${status}`, "Invoices", invoice.id, invoice.invoiceNumber);

    res.json(invoice);
  } catch (error) {
    logger.error({ err: error }, "Error updating invoice status");
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to update invoice status" });
  }
});

// PUT /api/invoices/:id/cancel
router.put("/api/invoices/:id/cancel", isAuthenticated, requireRole("Admin", "Manager"), async (req: any, res) => {
  try {
    const userId = req.user.id;

    const invoice = await storage.cancelInvoice(req.params.id, userId);

    await logActivity(req, `Cancelled invoice ${invoice.invoiceNumber}`, "Invoices", invoice.id, invoice.invoiceNumber);

    res.json(invoice);
  } catch (error) {
    logger.error({ err: error }, "Error cancelling invoice");
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to cancel invoice" });
  }
});

// PUT /api/invoices/:id/discount
router.put("/api/invoices/:id/discount", isAuthenticated, requireRole("Admin", "Manager"), async (req: any, res) => {
  try {
    const { discountPercentage } = req.body;

    const discountSchema = z.object({
      discountPercentage: z.number().min(0).max(100),
    });

    const { discountPercentage: validatedDiscount } = discountSchema.parse({ discountPercentage });

    const invoice = await storage.updateInvoiceDiscount(req.params.id, validatedDiscount);

    await logActivity(req, `Updated invoice ${invoice.invoiceNumber} discount to ${validatedDiscount}%`, "Invoices", invoice.id, invoice.invoiceNumber);

    res.json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid discount percentage", errors: error.errors });
    }
    logger.error({ err: error }, "Error updating invoice discount");
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to update invoice discount" });
  }
});

// POST /api/invoices/:id/pdf
router.post("/api/invoices/:id/pdf", isAuthenticated, async (req: any, res) => {
  try {
    const invoice = await storage.getInvoiceWithItems(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (invoice.status !== "Processed") {
      return res.status(400).json({ message: "Can only generate PDF for processed invoices" });
    }

    const pdfBuffer = await generateInvoicePDF(invoice, invoice.items);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    res.send(pdfBuffer);
  } catch (error) {
    logger.error({ err: error }, "Error generating PDF");
    res.status(500).json({ message: "Failed to generate PDF" });
  }
});

// POST /api/invoices/:id/email
router.post("/api/invoices/:id/email", isAuthenticated, requireRole("Admin", "Manager"), messagingRateLimit, async (req: any, res) => {
  try {
    const invoice = await storage.getInvoiceWithItems(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (invoice.status !== "Processed") {
      return res.status(400).json({ message: "Can only email processed invoices" });
    }

    if (!invoice.customerEmail) {
      return res.status(400).json({ message: "Customer email is required to send invoice" });
    }

    const pdfBuffer = await generateInvoicePDF(invoice, invoice.items);
    const currency = invoice.currency || "USD";
    const transporter = getEmailTransporter();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: invoice.customerEmail,
      subject: `Invoice ${invoice.invoiceNumber} - Volume Fashion`,
      html: `
        <h2>Your Invoice is Ready</h2>
        <p>Dear ${invoice.customerName},</p>
        <p>Please find your invoice ${invoice.invoiceNumber} attached.</p>
        <p>Total Amount: ${formatCurrency(invoice.total, currency)}</p>
        <p>Thank you for your business!</p>
        <p>Best regards,<br>Volume Fashion Team</p>
      `,
      attachments: [
        {
          filename: `invoice-${invoice.invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    await logActivity(req, `Sent invoice ${invoice.invoiceNumber} via email to ${invoice.customerEmail}`, "Invoices", invoice.id, invoice.invoiceNumber);

    res.json({ message: "Email sent successfully" });
  } catch (error) {
    logger.error({ err: error }, "Error sending email");
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to send email" });
  }
});

// POST /api/invoices/:id/whatsapp
router.post("/api/invoices/:id/whatsapp", isAuthenticated, requireRole("Admin", "Manager"), messagingRateLimit, async (req: any, res) => {
  try {
    const invoice = await storage.getInvoiceWithItems(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (invoice.status !== "Processed") {
      return res.status(400).json({ message: "Can only send processed invoices via WhatsApp" });
    }

    if (!invoice.customerPhone) {
      return res.status(400).json({ message: "Customer phone number is required for WhatsApp" });
    }

    const appUrl = process.env.APP_URL || "http://localhost:5000";
    const pdfUrl = `${appUrl}/api/invoices/${invoice.id}/pdf`;
    const currency = invoice.currency || "USD";

    await sendWhatsAppMessage(invoice.customerPhone, pdfUrl, invoice.invoiceNumber, invoice.total, currency);

    await logActivity(req, `Sent invoice ${invoice.invoiceNumber} via WhatsApp to ${invoice.customerPhone}`, "Invoices", invoice.id, invoice.invoiceNumber);

    res.json({ message: "WhatsApp message sent successfully" });
  } catch (error) {
    logger.error({ err: error }, "Error sending WhatsApp");
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to send WhatsApp message" });
  }
});

// GET /api/currencies
router.get("/api/currencies", isAuthenticated, (_req, res) => {
  res.json(SUPPORTED_CURRENCIES);
});

export default router;
