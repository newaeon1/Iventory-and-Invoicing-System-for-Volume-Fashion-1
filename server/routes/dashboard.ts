import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../customAuth";
import { logger } from "../logger";
import { db } from "../db";
import { products, invoices, invoiceItems, customers, manufacturers } from "@shared/schema";
import { eq, and, sql, desc, count, sum, gte } from "drizzle-orm";

const router = Router();

// Dashboard metrics
router.get("/api/dashboard/metrics", isAuthenticated, async (_req, res) => {
  try {
    const metrics = await storage.getDashboardMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error({ err: error }, "Error fetching dashboard metrics");
    res.status(500).json({ message: "Failed to fetch dashboard metrics" });
  }
});

// Extended dashboard data for the redesigned dashboard
router.get("/api/dashboard/extended", isAuthenticated, async (_req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalProductsResult,
      lowStockResult,
      pendingInvoicesResult,
      monthlyRevenueResult,
      lastMonthRevenueResult,
      totalInvoicesResult,
      processedInvoicesResult,
      cancelledInvoicesResult,
      totalCustomersResult,
      totalManufacturersResult,
      totalInventoryValueResult,
      revenueByDayResult,
      topProductsResult,
      recentInvoicesResult,
      categoryBreakdownResult,
    ] = await Promise.all([
      // Basic metrics
      db.select({ count: count() }).from(products).where(eq(products.isActive, true)),
      db.select({ count: count() }).from(products).where(
        and(eq(products.isActive, true), sql`${products.quantity} <= 5`)
      ),
      db.select({ count: count() }).from(invoices).where(eq(invoices.status, "Pending")),
      db.select({ total: sql<number>`COALESCE(SUM(CAST(${invoices.total} AS numeric)), 0)` })
        .from(invoices).where(and(
          eq(invoices.status, "Processed"),
          sql`${invoices.createdAt} >= ${startOfMonth}`
        )),
      // Last month revenue for comparison
      db.select({ total: sql<number>`COALESCE(SUM(CAST(${invoices.total} AS numeric)), 0)` })
        .from(invoices).where(and(
          eq(invoices.status, "Processed"),
          sql`${invoices.createdAt} >= ${startOfLastMonth}`,
          sql`${invoices.createdAt} <= ${endOfLastMonth}`
        )),
      // Total invoices this month
      db.select({ count: count() }).from(invoices)
        .where(sql`${invoices.createdAt} >= ${startOfMonth}`),
      db.select({ count: count() }).from(invoices).where(eq(invoices.status, "Processed")),
      db.select({ count: count() }).from(invoices).where(eq(invoices.status, "Cancelled")),
      // Totals
      db.select({ count: count() }).from(customers),
      db.select({ count: count() }).from(manufacturers),
      // Inventory value
      db.select({
        total: sql<number>`COALESCE(SUM(CAST(${products.price} AS numeric) * ${products.quantity}), 0)`
      }).from(products).where(eq(products.isActive, true)),
      // Revenue by day (last 14 days)
      db.select({
        date: sql<string>`TO_CHAR(${invoices.createdAt}, 'YYYY-MM-DD')`,
        revenue: sql<number>`COALESCE(SUM(CAST(${invoices.total} AS numeric)), 0)`,
        orders: count(),
      }).from(invoices)
        .where(and(
          eq(invoices.status, "Processed"),
          sql`${invoices.createdAt} >= NOW() - INTERVAL '14 days'`
        ))
        .groupBy(sql`TO_CHAR(${invoices.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${invoices.createdAt}, 'YYYY-MM-DD')`),
      // Top selling products (by quantity sold)
      db.select({
        productName: products.productName,
        productId: products.productId,
        totalSold: sql<number>`COALESCE(SUM(${invoiceItems.quantity}), 0)`,
        revenue: sql<number>`COALESCE(SUM(CAST(${invoiceItems.totalPrice} AS numeric)), 0)`,
      }).from(invoiceItems)
        .innerJoin(products, eq(invoiceItems.productId, products.id))
        .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
        .where(eq(invoices.status, "Processed"))
        .groupBy(products.productName, products.productId)
        .orderBy(sql`SUM(${invoiceItems.quantity}) DESC`)
        .limit(5),
      // Recent invoices
      db.select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerName: invoices.customerName,
        total: invoices.total,
        status: invoices.status,
        currency: invoices.currency,
        createdAt: invoices.createdAt,
      }).from(invoices)
        .orderBy(desc(invoices.createdAt))
        .limit(5),
      // Category breakdown
      db.select({
        category: products.category,
        count: count(),
        value: sql<number>`COALESCE(SUM(CAST(${products.price} AS numeric) * ${products.quantity}), 0)`,
      }).from(products)
        .where(eq(products.isActive, true))
        .groupBy(products.category)
        .orderBy(sql`SUM(CAST(${products.price} AS numeric) * ${products.quantity}) DESC`)
        .limit(6),
    ]);

    const monthlyRevenue = Number(monthlyRevenueResult[0]?.total) || 0;
    const lastMonthRevenue = Number(lastMonthRevenueResult[0]?.total) || 0;
    const revenueChange = lastMonthRevenue > 0
      ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : monthlyRevenue > 0 ? 100 : 0;

    // Fill in missing days for chart
    const dailyRevenue: { date: string; revenue: number; orders: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const found = revenueByDayResult.find((r) => r.date === dateStr);
      dailyRevenue.push({
        date: dateStr,
        revenue: found ? Number(found.revenue) : 0,
        orders: found ? Number(found.orders) : 0,
      });
    }

    res.json({
      totalProducts: totalProductsResult[0].count,
      lowStockItems: lowStockResult[0].count,
      pendingInvoices: pendingInvoicesResult[0].count,
      monthlyRevenue,
      lastMonthRevenue,
      revenueChange: Math.round(revenueChange * 10) / 10,
      totalInvoicesThisMonth: totalInvoicesResult[0].count,
      processedInvoices: processedInvoicesResult[0].count,
      cancelledInvoices: cancelledInvoicesResult[0].count,
      totalCustomers: totalCustomersResult[0].count,
      totalManufacturers: totalManufacturersResult[0].count,
      totalInventoryValue: Number(totalInventoryValueResult[0]?.total) || 0,
      dailyRevenue,
      topProducts: topProductsResult.map((p) => ({
        ...p,
        totalSold: Number(p.totalSold),
        revenue: Number(p.revenue),
      })),
      recentInvoices: recentInvoicesResult,
      categoryBreakdown: categoryBreakdownResult.map((c) => ({
        category: c.category,
        count: Number(c.count),
        value: Number(c.value),
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching extended dashboard metrics");
    res.status(500).json({ message: "Failed to fetch extended dashboard" });
  }
});

export default router;
