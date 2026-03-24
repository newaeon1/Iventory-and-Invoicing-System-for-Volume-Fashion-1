import { Router } from "express";
import { db } from "../db";
import { products, invoices, invoiceItems } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { isAuthenticated } from "../customAuth";
import { logger } from "../logger";

const router = Router();

// ─── P0: Profitability Report ────────────────────────────────────────────────
router.get("/api/reports/profitability", isAuthenticated, async (_req, res) => {
  try {
    // --- Summary & by-category & by-manufacturer from processed invoices ---
    const [summaryResult, byCategoryResult, byManufacturerResult, productMarginsResult] =
      await Promise.all([
        // Overall summary
        db.select({
          totalRevenue: sql<string>`COALESCE(SUM(CAST(${invoiceItems.totalPrice} AS numeric)), 0)`,
          totalCOGS: sql<string>`COALESCE(SUM(
            CASE WHEN ${products.costPrice} IS NOT NULL
              THEN CAST(${products.costPrice} AS numeric) * ${invoiceItems.quantity}
              ELSE 0
            END
          ), 0)`,
          totalUnits: sql<string>`COALESCE(SUM(${invoiceItems.quantity}), 0)`,
          withCost: sql<string>`COUNT(CASE WHEN ${products.costPrice} IS NOT NULL THEN 1 END)`,
          withoutCost: sql<string>`COUNT(CASE WHEN ${products.costPrice} IS NULL THEN 1 END)`,
        })
          .from(invoiceItems)
          .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
          .innerJoin(products, eq(invoiceItems.productId, products.id))
          .where(eq(invoices.status, "Processed")),

        // By category
        db.select({
          category: products.category,
          revenue: sql<string>`COALESCE(SUM(CAST(${invoiceItems.totalPrice} AS numeric)), 0)`,
          cogs: sql<string>`COALESCE(SUM(
            CASE WHEN ${products.costPrice} IS NOT NULL
              THEN CAST(${products.costPrice} AS numeric) * ${invoiceItems.quantity}
              ELSE 0
            END
          ), 0)`,
          units: sql<string>`COALESCE(SUM(${invoiceItems.quantity}), 0)`,
        })
          .from(invoiceItems)
          .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
          .innerJoin(products, eq(invoiceItems.productId, products.id))
          .where(eq(invoices.status, "Processed"))
          .groupBy(products.category)
          .orderBy(sql`SUM(CAST(${invoiceItems.totalPrice} AS numeric)) DESC`),

        // By manufacturer
        db.select({
          manufacturer: products.manufacturer,
          revenue: sql<string>`COALESCE(SUM(CAST(${invoiceItems.totalPrice} AS numeric)), 0)`,
          cogs: sql<string>`COALESCE(SUM(
            CASE WHEN ${products.costPrice} IS NOT NULL
              THEN CAST(${products.costPrice} AS numeric) * ${invoiceItems.quantity}
              ELSE 0
            END
          ), 0)`,
          units: sql<string>`COALESCE(SUM(${invoiceItems.quantity}), 0)`,
        })
          .from(invoiceItems)
          .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
          .innerJoin(products, eq(invoiceItems.productId, products.id))
          .where(eq(invoices.status, "Processed"))
          .groupBy(products.manufacturer)
          .orderBy(sql`SUM(CAST(${invoiceItems.totalPrice} AS numeric)) DESC`),

        // Product margins — LEFT JOIN so all active products appear even with 0 sales
        db.select({
          productId: products.productId,
          productName: products.productName,
          category: products.category,
          sellingPrice: products.price,
          costPrice: products.costPrice,
          currentStock: products.quantity,
          soldQty: sql<string>`COALESCE(SUM(
            CASE WHEN ${invoices.id} IS NOT NULL THEN ${invoiceItems.quantity} ELSE 0 END
          ), 0)`,
          revenue: sql<string>`COALESCE(SUM(
            CASE WHEN ${invoices.id} IS NOT NULL THEN CAST(${invoiceItems.totalPrice} AS numeric) ELSE 0 END
          ), 0)`,
          cogs: sql<string>`CASE WHEN ${products.costPrice} IS NOT NULL THEN
            CAST(${products.costPrice} AS numeric) * COALESCE(SUM(
              CASE WHEN ${invoices.id} IS NOT NULL THEN ${invoiceItems.quantity} ELSE 0 END
            ), 0) ELSE NULL END`,
        })
          .from(products)
          .leftJoin(invoiceItems, eq(invoiceItems.productId, products.id))
          .leftJoin(
            invoices,
            and(eq(invoiceItems.invoiceId, invoices.id), eq(invoices.status, "Processed")),
          )
          .where(eq(products.isActive, true))
          .groupBy(products.id, products.productId, products.productName, products.category, products.price, products.costPrice, products.quantity)
          .orderBy(sql`COALESCE(SUM(
            CASE WHEN ${invoices.id} IS NOT NULL THEN CAST(${invoiceItems.totalPrice} AS numeric) ELSE 0 END
          ), 0) DESC`)
          .limit(50),
      ]);

    const totalRevenue = Number(summaryResult[0]?.totalRevenue) || 0;
    const totalCOGS = Number(summaryResult[0]?.totalCOGS) || 0;
    const grossProfit = totalRevenue - totalCOGS;
    const marginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const totalUnits = Number(summaryResult[0]?.totalUnits) || 0;

    const formatGroupRow = (row: any) => {
      const rev = Number(row.revenue) || 0;
      const cogs = Number(row.cogs) || 0;
      const profit = rev - cogs;
      return {
        category: row.category ?? row.manufacturer ?? "Unknown",
        revenue: rev,
        cogs,
        profit,
        marginPct: rev > 0 ? (profit / rev) * 100 : 0,
        units: Number(row.units) || 0,
      };
    };

    const byCategory = byCategoryResult.map((row) => formatGroupRow(row));
    const byManufacturer = byManufacturerResult.map((row) => {
      const formatted = formatGroupRow(row);
      return {
        manufacturer: (row as any).manufacturer ?? "Unknown",
        revenue: formatted.revenue,
        cogs: formatted.cogs,
        profit: formatted.profit,
        marginPct: formatted.marginPct,
        units: formatted.units,
      };
    });

    const productMargins = productMarginsResult.map((row) => {
      const rev = Number(row.revenue) || 0;
      const soldQty = Number(row.soldQty) || 0;
      const rawCogs = row.cogs;
      const cogs = rawCogs !== null && rawCogs !== undefined ? Number(rawCogs) : null;
      const profit = cogs !== null ? rev - cogs : null;
      const mp = profit !== null && rev > 0 ? (profit / rev) * 100 : null;
      return {
        productId: row.productId,
        productName: row.productName,
        category: row.category,
        sellingPrice: Number(row.sellingPrice),
        costPrice: row.costPrice !== null ? Number(row.costPrice) : null,
        currentStock: Number(row.currentStock),
        soldQty,
        revenue: rev,
        cogs,
        profit,
        marginPct: mp,
      };
    });

    res.json({
      summary: {
        totalRevenue,
        totalCOGS,
        grossProfit,
        marginPct,
        totalUnits,
        costCoverage: {
          withCost: Number(summaryResult[0]?.withCost) || 0,
          withoutCost: Number(summaryResult[0]?.withoutCost) || 0,
        },
      },
      byCategory,
      byManufacturer,
      productMargins,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching profitability report");
    res.status(500).json({ message: "Failed to fetch profitability report" });
  }
});

// ─── P1: Inventory Health Report ─────────────────────────────────────────────
router.get("/api/reports/inventory-health", isAuthenticated, async (_req, res) => {
  try {
    // 1. Products sold in the last 60 days (from processed invoices)
    const recentlySoldResult = await db
      .selectDistinct({ productId: invoiceItems.productId })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .where(
        and(
          eq(invoices.status, "Processed"),
          sql`${invoices.createdAt} >= NOW() - INTERVAL '60 days'`,
        ),
      );

    const recentlySoldIds = new Set(recentlySoldResult.map((r) => r.productId));

    // 2. All active products with stock
    const activeProducts = await db
      .select({
        id: products.id,
        productId: products.productId,
        productName: products.productName,
        category: products.category,
        color: products.color,
        quantity: products.quantity,
        price: products.price,
        costPrice: products.costPrice,
        createdAt: products.createdAt,
      })
      .from(products)
      .where(and(eq(products.isActive, true), sql`${products.quantity} > 0`));

    // 3. Dead stock — not sold in last 60 days
    const now = new Date();
    const deadStock = activeProducts
      .filter((p) => !recentlySoldIds.has(p.id))
      .map((p) => {
        const createdDate = p.createdAt ? new Date(p.createdAt) : now;
        const daysSinceCreated = Math.floor(
          (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        const price = Number(p.price);
        const qty = Number(p.quantity);
        return {
          productId: p.productId,
          productName: p.productName,
          category: p.category,
          color: p.color,
          quantity: qty,
          price,
          costPrice: p.costPrice !== null ? Number(p.costPrice) : null,
          daysSinceCreated,
          stockValue: price * qty,
        };
      })
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 50);

    // 4. Turnover — sales in last 90 days per product
    const salesLast90Result = await db
      .select({
        productId: invoiceItems.productId,
        totalSold: sql<string>`COALESCE(SUM(${invoiceItems.quantity}), 0)`,
      })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .where(
        and(
          eq(invoices.status, "Processed"),
          sql`${invoices.createdAt} >= NOW() - INTERVAL '90 days'`,
        ),
      )
      .groupBy(invoiceItems.productId);

    const salesMap = new Map(
      salesLast90Result.map((r) => [r.productId, Number(r.totalSold) || 0]),
    );

    // All active products for turnover
    const allActive = await db
      .select({
        id: products.id,
        productId: products.productId,
        productName: products.productName,
        category: products.category,
        quantity: products.quantity,
      })
      .from(products)
      .where(eq(products.isActive, true));

    const turnover = allActive
      .map((p) => {
        const currentStock = Number(p.quantity);
        const soldLast90Days = salesMap.get(p.id) || 0;
        const turnoverRate =
          currentStock > 0 ? soldLast90Days / currentStock : soldLast90Days > 0 ? Infinity : 0;
        return {
          productId: p.productId,
          productName: p.productName,
          category: p.category,
          currentStock,
          soldLast90Days,
          turnoverRate,
        };
      })
      .sort((a, b) => {
        // Sort ascending by turnoverRate; Infinity goes to end
        if (a.turnoverRate === b.turnoverRate) return 0;
        if (a.turnoverRate === Infinity) return 1;
        if (b.turnoverRate === Infinity) return -1;
        return a.turnoverRate - b.turnoverRate;
      })
      .slice(0, 50);

    res.json({ deadStock, turnover });
  } catch (error) {
    logger.error({ err: error }, "Error fetching inventory health report");
    res.status(500).json({ message: "Failed to fetch inventory health report" });
  }
});

// ─── P1: Invoice Aging Report ────────────────────────────────────────────────
router.get("/api/reports/invoice-aging", isAuthenticated, async (_req, res) => {
  try {
    const pendingInvoices = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerName: invoices.customerName,
        customerPhone: invoices.customerPhone,
        total: invoices.total,
        createdAt: invoices.createdAt,
      })
      .from(invoices)
      .where(eq(invoices.status, "Pending"));

    const now = new Date();

    let currentCount = 0,
      currentAmount = 0;
    let thirtyCount = 0,
      thirtyAmount = 0;
    let sixtyCount = 0,
      sixtyAmount = 0;
    let ninetyPlusCount = 0,
      ninetyPlusAmount = 0;

    const invoiceRows = pendingInvoices.map((inv) => {
      const createdDate = inv.createdAt ? new Date(inv.createdAt) : now;
      const daysPending = Math.floor(
        (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const total = Number(inv.total) || 0;

      let bucket: string;
      if (daysPending <= 30) {
        bucket = "current";
        currentCount++;
        currentAmount += total;
      } else if (daysPending <= 60) {
        bucket = "30-60";
        thirtyCount++;
        thirtyAmount += total;
      } else if (daysPending <= 90) {
        bucket = "60-90";
        sixtyCount++;
        sixtyAmount += total;
      } else {
        bucket = "90+";
        ninetyPlusCount++;
        ninetyPlusAmount += total;
      }

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        customerPhone: inv.customerPhone,
        total,
        createdAt: inv.createdAt,
        daysPending,
        bucket,
      };
    });

    const totalPendingCount = invoiceRows.length;
    const totalPendingAmount = currentAmount + thirtyAmount + sixtyAmount + ninetyPlusAmount;

    res.json({
      summary: {
        currentCount,
        currentAmount,
        thirtyCount,
        thirtyAmount,
        sixtyCount,
        sixtyAmount,
        ninetyPlusCount,
        ninetyPlusAmount,
        totalPendingCount,
        totalPendingAmount,
      },
      invoices: invoiceRows,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching invoice aging report");
    res.status(500).json({ message: "Failed to fetch invoice aging report" });
  }
});

// ─── P2: Fashion Analytics Report ────────────────────────────────────────────
router.get("/api/reports/fashion-analytics", isAuthenticated, async (_req, res) => {
  try {
    const [salesByColorResult, seasonalTrendsResult] = await Promise.all([
      // Sales by color
      db.select({
        color: products.color,
        unitsSold: sql<string>`COALESCE(SUM(${invoiceItems.quantity}), 0)`,
        revenue: sql<string>`COALESCE(SUM(CAST(${invoiceItems.totalPrice} AS numeric)), 0)`,
        productCount: sql<string>`COUNT(DISTINCT ${products.id})`,
      })
        .from(invoiceItems)
        .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
        .innerJoin(products, eq(invoiceItems.productId, products.id))
        .where(eq(invoices.status, "Processed"))
        .groupBy(products.color)
        .orderBy(sql`SUM(CAST(${invoiceItems.totalPrice} AS numeric)) DESC`),

      // Seasonal trends — monthly revenue across all time
      db.select({
        month: sql<string>`TO_CHAR(${invoices.createdAt}, 'YYYY-MM')`,
        revenue: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS numeric)), 0)`,
        orderCount: sql<string>`COUNT(*)`,
      })
        .from(invoices)
        .where(eq(invoices.status, "Processed"))
        .groupBy(sql`TO_CHAR(${invoices.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${invoices.createdAt}, 'YYYY-MM') ASC`),
    ]);

    const salesByColor = salesByColorResult.map((row) => ({
      color: row.color,
      unitsSold: Number(row.unitsSold) || 0,
      revenue: Number(row.revenue) || 0,
      productCount: Number(row.productCount) || 0,
    }));

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    const seasonalTrends = seasonalTrendsResult.map((row) => {
      const [year, monthNum] = row.month.split("-");
      const monthLabel = `${monthNames[parseInt(monthNum, 10) - 1]} ${year}`;
      return {
        month: row.month,
        monthLabel,
        revenue: Number(row.revenue) || 0,
        orderCount: Number(row.orderCount) || 0,
      };
    });

    res.json({ salesByColor, seasonalTrends });
  } catch (error) {
    logger.error({ err: error }, "Error fetching fashion analytics report");
    res.status(500).json({ message: "Failed to fetch fashion analytics report" });
  }
});

export default router;
