import { Router } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { storage } from "../storage";
import { isAuthenticated } from "../customAuth";
import { requireRole } from "../rbac";
import { insertProductSchema } from "@shared/schema";
import { saveQRCode, saveProductImage } from "../fileStorage";
import { logger } from "../logger";

const router = Router();

// Configure multer for CSV uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
});

// Configure multer for image uploads
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, and WebP images are allowed"));
    }
  },
});

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

// Strip CSV injection characters
function sanitizeCsvValue(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return "'" + value;
  }
  return value;
}

// GET /api/products
router.get("/api/products", isAuthenticated, async (req, res) => {
  try {
    const { page = "1", limit = "20", search, category, size, stockLevel } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const result = await storage.getAllProducts({
      limit: parseInt(limit as string),
      offset,
      search: search as string,
      category: category as string,
      size: size as string,
      stockLevel: stockLevel as string,
    });

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error fetching products");
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

// GET /api/products/by-product-id/:productId
router.get("/api/products/by-product-id/:productId", isAuthenticated, async (req, res) => {
  try {
    const product = await storage.getProductByProductId(req.params.productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    logger.error({ err: error }, "Error fetching product by productId");
    res.status(500).json({ message: "Failed to fetch product" });
  }
});

// GET /api/products/:id
router.get("/api/products/:id", isAuthenticated, async (req, res) => {
  try {
    const product = await storage.getProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (error) {
    logger.error({ err: error }, "Error fetching product");
    res.status(500).json({ message: "Failed to fetch product" });
  }
});

// POST /api/products
router.post("/api/products", isAuthenticated, requireRole("Admin", "Manager", "Staff"), async (req: any, res) => {
  try {
    const validatedProduct = insertProductSchema.parse({
      ...req.body,
      createdBy: req.user.id,
    });

    // Validate selling price > 0
    if (!validatedProduct.price || parseFloat(validatedProduct.price) <= 0) {
      return res.status(400).json({ message: "Selling price must be greater than 0" });
    }
    // Validate cost price >= 0 (if provided)
    if (validatedProduct.costPrice != null && parseFloat(validatedProduct.costPrice) < 0) {
      return res.status(400).json({ message: "Cost price must be 0 or greater" });
    }
    if (validatedProduct.quantity != null && validatedProduct.quantity < 0) {
      return res.status(400).json({ message: "Quantity must be non-negative" });
    }

    // Check for duplicate product ID
    const existingProduct = await storage.getProductByProductId(validatedProduct.productId);
    if (existingProduct) {
      return res.status(400).json({ message: "Product ID already exists" });
    }

    const product = await storage.createProduct(validatedProduct);

    // Generate QR code
    try {
      const appUrl = process.env.APP_URL || "http://localhost:5000";
      const qrCodeData = `${appUrl}/products/${product.id}`;
      const qrCodeBuffer = await QRCode.toBuffer(qrCodeData, {
        type: "png",
        width: 300,
        margin: 2,
      });

      const qrCodeUrl = await saveQRCode(product.id, qrCodeBuffer);
      await storage.updateProductQRCode(product.id, qrCodeUrl);
    } catch (qrError) {
      logger.error({ err: qrError }, "Error generating QR code");
    }

    await logActivity(req, `Created product "${product.productName}"`, "Products", product.id, product.productName);

    res.status(201).json(product);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid product data", errors: error.errors });
    }
    logger.error({ err: error }, "Error creating product");
    res.status(500).json({ message: "Failed to create product" });
  }
});

// POST /api/products/bulk-upload (CSV)
router.post("/api/products/bulk-upload", isAuthenticated, requireRole("Admin", "Manager"), upload.single("csvFile"), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No CSV file provided" });
    }

    const csvData = req.file.buffer.toString("utf8");

    // Use proper CSV parser
    let records: any[];
    try {
      records = parse(csvData, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (parseError) {
      return res.status(400).json({ message: "Invalid CSV format" });
    }

    if (records.length === 0) {
      return res.status(400).json({ message: "CSV file must contain at least one product row" });
    }

    // Check required headers
    const requiredHeaders = ["Product ID", "Product Name", "Color", "Size", "Quantity", "Price"];
    const headers = Object.keys(records[0]);
    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));

    if (missingHeaders.length > 0) {
      return res.status(400).json({
        message: `Missing required headers: ${missingHeaders.join(", ")}`,
      });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      try {
        const row = records[i];
        const rowNum = i + 2; // +2 because CSV is 1-indexed and header is row 1

        // Sanitize values to prevent CSV injection
        const productData: any = {
          productId: sanitizeCsvValue(row["Product ID"] || ""),
          productName: sanitizeCsvValue(row["Product Name"] || ""),
          color: sanitizeCsvValue(row["Color"] || ""),
          size: sanitizeCsvValue(row["Size"] || ""),
          quantity: parseInt(row["Quantity"]) || 0,
          price: row["Price"],
          category: row["Category"] ? sanitizeCsvValue(row["Category"]) : null,
          description: row["Description"] ? sanitizeCsvValue(row["Description"]) : null,
        };

        // Validate required fields
        if (!productData.productId || !productData.productName || !productData.color || !productData.size || !productData.price) {
          errors.push(`Row ${rowNum}: Missing required fields`);
          errorCount++;
          continue;
        }

        // Validate price
        if (isNaN(parseFloat(productData.price)) || parseFloat(productData.price) < 0) {
          errors.push(`Row ${rowNum}: Invalid price value`);
          errorCount++;
          continue;
        }

        // Validate quantity
        if (productData.quantity < 0) {
          errors.push(`Row ${rowNum}: Quantity must be non-negative`);
          errorCount++;
          continue;
        }

        // Check for duplicate
        const existingProduct = await storage.getProductByProductId(productData.productId);
        if (existingProduct) {
          errors.push(`Row ${rowNum}: Product ID ${productData.productId} already exists`);
          errorCount++;
          continue;
        }

        const validatedProduct = insertProductSchema.parse(productData);
        const product = await storage.createProduct({
          ...validatedProduct,
          imageUrl: null,
        });

        await storage.createActivityLog({
          userId: req.user.id,
          action: "create",
          module: "Products",
          targetId: product.id,
          targetName: product.productName,
          details: { message: `Bulk uploaded product: ${product.productName}` },
        });

        successCount++;
      } catch (error) {
        logger.error({ err: error, row: i + 2 }, "Error processing CSV row");
        errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : "Unknown error"}`);
        errorCount++;
      }
    }

    res.json({
      message: "Bulk upload completed",
      successCount,
      errorCount,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    logger.error({ err: error }, "Error in bulk upload");
    res.status(500).json({ message: "Failed to process bulk upload" });
  }
});

// PUT /api/products/:id
router.put("/api/products/:id", isAuthenticated, requireRole("Admin", "Manager", "Staff"), async (req: any, res) => {
  try {
    const productId = req.params.id;
    const updates = insertProductSchema.partial().parse(req.body);

    // Validate selling price > 0 (if provided)
    if (updates.price != null && parseFloat(updates.price) <= 0) {
      return res.status(400).json({ message: "Selling price must be greater than 0" });
    }
    // Validate cost price >= 0 (if provided)
    if (updates.costPrice != null && parseFloat(updates.costPrice) < 0) {
      return res.status(400).json({ message: "Cost price must be 0 or greater" });
    }
    if (updates.quantity != null && updates.quantity < 0) {
      return res.status(400).json({ message: "Quantity must be non-negative" });
    }

    const product = await storage.updateProduct(productId, updates, req.user.id);

    await logActivity(req, `Updated product "${product.productName}"`, "Products", product.id, product.productName);

    res.json(product);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid product data", errors: error.errors });
    }
    logger.error({ err: error }, "Error updating product");
    res.status(500).json({ message: "Failed to update product" });
  }
});

// DELETE /api/products/:id
router.delete("/api/products/:id", isAuthenticated, requireRole("Admin", "Manager"), async (req: any, res) => {
  try {
    const product = await storage.getProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    await storage.deleteProduct(req.params.id);

    await logActivity(req, `Deleted product "${product.productName}"`, "Products", product.id, product.productName);

    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, "Error deleting product");
    res.status(500).json({ message: "Failed to delete product" });
  }
});

// POST /api/products/bulk (JSON)
router.post("/api/products/bulk", isAuthenticated, requireRole("Admin", "Manager"), async (req: any, res) => {
  try {
    const { products: productData } = req.body;

    if (!Array.isArray(productData) || productData.length === 0) {
      return res.status(400).json({ message: "Invalid product data" });
    }

    const validatedProducts = productData.map((p: any) =>
      insertProductSchema.parse({ ...p, createdBy: req.user.id })
    );

    // Check for duplicate product IDs
    const duplicates: string[] = [];
    const uniqueProducts: typeof validatedProducts = [];

    for (const product of validatedProducts) {
      const existing = await storage.getProductByProductId(product.productId);
      if (existing) {
        duplicates.push(product.productId);
      } else {
        uniqueProducts.push(product);
      }
    }

    const createdProducts = uniqueProducts.length > 0
      ? await storage.createBulkProducts(uniqueProducts)
      : [];

    await logActivity(req, `Bulk imported ${createdProducts.length} products`, "Products", undefined, undefined, {
      imported: createdProducts.length,
      duplicates: duplicates.length,
    });

    res.json({
      imported: createdProducts.length,
      duplicates,
      products: createdProducts,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid product data", errors: error.errors });
    }
    logger.error({ err: error }, "Error bulk importing products");
    res.status(500).json({ message: "Failed to import products" });
  }
});

// PUT /api/products/:id/image — accepts multipart file upload
router.put("/api/products/:id/image", isAuthenticated, requireRole("Admin", "Manager", "Staff"), imageUpload.single("image"), async (req: any, res) => {
  try {
    const productId = req.params.id;

    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    // Save image file to disk
    const ext = req.file.originalname.split(".").pop() || "png";
    const imageUrl = await saveProductImage(productId, req.file.buffer, ext);
    await storage.updateProduct(productId, { imageUrl });

    // Generate QR code
    const appUrl = process.env.APP_URL || "http://localhost:5000";
    const qrCodeData = `${appUrl}/products/${productId}`;
    const qrCodeBuffer = await QRCode.toBuffer(qrCodeData, {
      type: "png",
      width: 300,
      margin: 2,
    });

    const qrCodeUrl = await saveQRCode(productId, qrCodeBuffer);
    const updatedProduct = await storage.updateProductQRCode(productId, qrCodeUrl);

    await logActivity(req, `Updated image for product "${updatedProduct.productName}"`, "Products", productId, updatedProduct.productName);

    res.json({ product: updatedProduct });
  } catch (error) {
    logger.error({ err: error }, "Error updating product image");
    res.status(500).json({ message: "Failed to update product image" });
  }
});

// POST /api/products/:id/adjust-stock
router.post("/api/products/:id/adjust-stock", isAuthenticated, requireRole("Admin", "Manager"), async (req: any, res) => {
  try {
    const { quantity, type, reason } = req.body;

    if (!quantity || !type || !reason) {
      return res.status(400).json({ message: "Quantity, type, and reason are required" });
    }

    if (!["in", "out"].includes(type)) {
      return res.status(400).json({ message: "Type must be 'in' or 'out'" });
    }

    if (quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be positive" });
    }

    const adjustment = await storage.adjustStock(req.params.id, quantity, type, reason, req.user.id);

    const product = await storage.getProduct(req.params.id);
    await logActivity(
      req,
      `Stock ${type === "in" ? "added" : "removed"}: ${quantity} units for "${product?.productName}"`,
      "Products",
      req.params.id,
      product?.productName,
      { type, quantity, reason }
    );

    res.json(adjustment);
  } catch (error) {
    logger.error({ err: error }, "Error adjusting stock");
    res.status(500).json({ message: error instanceof Error ? error.message : "Failed to adjust stock" });
  }
});

// GET /api/products/:id/adjustments
router.get("/api/products/:id/adjustments", isAuthenticated, async (req, res) => {
  try {
    const adjustments = await storage.getStockAdjustments(req.params.id);
    res.json(adjustments);
  } catch (error) {
    logger.error({ err: error }, "Error fetching stock adjustments");
    res.status(500).json({ message: "Failed to fetch stock adjustments" });
  }
});

// GET /api/products/:id/changes
router.get("/api/products/:id/changes", isAuthenticated, async (req, res) => {
  try {
    const changes = await storage.getProductChanges(req.params.id);
    res.json(changes);
  } catch (error) {
    logger.error({ err: error }, "Error fetching product changes");
    res.status(500).json({ message: "Failed to fetch product changes" });
  }
});

export default router;
