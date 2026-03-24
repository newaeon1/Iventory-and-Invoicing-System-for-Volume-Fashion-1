import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import type { DashboardMetrics, ProductsResponse, InvoicesResponse, Invoice, Product } from "@shared/schema";

const PIE_COLORS = ["#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function Reports() {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const { data: metrics, isLoading: metricsLoading } = useQuery<DashboardMetrics>({
    queryKey: ["/api/dashboard/metrics"],
  });

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery<InvoicesResponse>({
    queryKey: ["/api/invoices", { limit: 1000 }],
  });

  const { data: lowStockData, isLoading: lowStockLoading } = useQuery<ProductsResponse>({
    queryKey: ["/api/products", { stockLevel: "low", limit: 100 }],
  });

  const { data: allProductsData, isLoading: productsLoading } = useQuery<ProductsResponse>({
    queryKey: ["/api/products", { limit: 1000 }],
  });

  const { data: profitabilityData, isLoading: profitabilityLoading } = useQuery<any>({
    queryKey: ["/api/reports/profitability"],
  });

  const { data: inventoryHealthData, isLoading: inventoryHealthLoading } = useQuery<any>({
    queryKey: ["/api/reports/inventory-health"],
  });

  const { data: invoiceAgingData, isLoading: invoiceAgingLoading } = useQuery<any>({
    queryKey: ["/api/reports/invoice-aging"],
  });

  const { data: fashionAnalyticsData, isLoading: fashionAnalyticsLoading } = useQuery<any>({
    queryKey: ["/api/reports/fashion-analytics"],
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  // ── Filter invoices by date range ──
  const filteredInvoices = useMemo(() => {
    if (!invoicesData?.invoices) return [];
    return invoicesData.invoices.filter((inv: Invoice) => {
      const invDate = new Date(inv.createdAt || "");
      if (dateFrom && invDate < dateFrom) return false;
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (invDate > endOfDay) return false;
      }
      return true;
    });
  }, [invoicesData, dateFrom, dateTo]);

  // ── Sales summary ──
  const salesSummary = useMemo(() => {
    const totalRevenue = filteredInvoices.reduce(
      (sum: number, inv: Invoice) => sum + parseFloat(String(inv.total || "0")), 0
    );
    const processedCount = filteredInvoices.filter((i: Invoice) => i.status === "Processed").length;
    const cancelledCount = filteredInvoices.filter((i: Invoice) => i.status === "Cancelled").length;
    const invoiceCount = filteredInvoices.length;
    const avgValue = invoiceCount > 0 ? totalRevenue / invoiceCount : 0;
    return { totalRevenue, invoiceCount, avgValue, processedCount, cancelledCount };
  }, [filteredInvoices]);

  // ── Monthly revenue chart ──
  const monthlyRevenueData = useMemo(() => {
    const monthMap: Record<string, number> = {};
    filteredInvoices.forEach((inv: Invoice) => {
      const date = new Date(inv.createdAt || "");
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthMap[key] = (monthMap[key] || 0) + parseFloat(String(inv.total || "0"));
    });
    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key]) => {
        const [year, month] = key.split("-");
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return {
          month: date.toLocaleDateString("en-US", { year: "numeric", month: "short" }),
          revenue: Math.round(monthMap[key] * 100) / 100,
        };
      });
  }, [filteredInvoices]);

  // ── Daily sales trend ──
  const dailySalesData = useMemo(() => {
    const dayMap: Record<string, { revenue: number; count: number }> = {};
    filteredInvoices.forEach((inv: Invoice) => {
      const date = new Date(inv.createdAt || "");
      const key = date.toISOString().split("T")[0];
      if (!dayMap[key]) dayMap[key] = { revenue: 0, count: 0 };
      dayMap[key].revenue += parseFloat(String(inv.total || "0"));
      dayMap[key].count += 1;
    });
    return Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30) // last 30 days
      .map(([key, val]) => ({
        date: new Date(key).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        revenue: Math.round(val.revenue * 100) / 100,
        orders: val.count,
      }));
  }, [filteredInvoices]);

  // ── Invoice status breakdown ──
  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = { Pending: 0, Processed: 0, Cancelled: 0 };
    filteredInvoices.forEach((inv: Invoice) => {
      const s = inv.status || "Pending";
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [filteredInvoices]);

  // ── Revenue by category ──
  const categoryRevenue = useMemo(() => {
    if (!allProductsData?.products) return [];
    const catMap: Record<string, number> = {};
    allProductsData.products.forEach((p: Product) => {
      const cat = p.category || "Uncategorized";
      catMap[cat] = (catMap[cat] || 0) + parseFloat(String(p.price || "0")) * (p.quantity || 0);
    });
    return Object.entries(catMap)
      .sort(([, a], [, b]) => b - a)
      .map(([category, value]) => ({ category, value: Math.round(value * 100) / 100 }));
  }, [allProductsData]);

  // ── Manufacturer performance ──
  const manufacturerPerformance = useMemo(() => {
    if (!allProductsData?.products) return [];
    const mfMap: Record<string, { products: number; units: number; value: number }> = {};
    allProductsData.products.forEach((p: Product) => {
      const mf = p.manufacturer || "Unknown";
      if (!mfMap[mf]) mfMap[mf] = { products: 0, units: 0, value: 0 };
      mfMap[mf].products += 1;
      mfMap[mf].units += p.quantity || 0;
      mfMap[mf].value += parseFloat(String(p.price || "0")) * (p.quantity || 0);
    });
    return Object.entries(mfMap)
      .sort(([, a], [, b]) => b.value - a.value)
      .map(([name, data]) => ({ name, ...data, value: Math.round(data.value * 100) / 100 }));
  }, [allProductsData]);

  // ── Size distribution ──
  const sizeDistribution = useMemo(() => {
    if (!allProductsData?.products) return [];
    const sizeMap: Record<string, number> = {};
    allProductsData.products.forEach((p: Product) => {
      const breakdown = p.sizeBreakdown as Record<string, number> | null;
      if (breakdown && typeof breakdown === "object") {
        Object.entries(breakdown).forEach(([size, qty]) => {
          sizeMap[size] = (sizeMap[size] || 0) + qty;
        });
      } else {
        const size = p.size || "N/A";
        sizeMap[size] = (sizeMap[size] || 0) + (p.quantity || 0);
      }
    });
    const order = ["XS", "S", "M", "L", "XL", "XXL"];
    return Object.entries(sizeMap)
      .sort(([a], [b]) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return a.localeCompare(b);
      })
      .map(([size, quantity]) => ({ size, quantity }));
  }, [allProductsData]);

  // ── Customer ranking ──
  const customerRanking = useMemo(() => {
    const custMap: Record<string, { orders: number; revenue: number; email: string }> = {};
    filteredInvoices.forEach((inv: Invoice) => {
      const name = inv.customerName;
      if (!custMap[name]) custMap[name] = { orders: 0, revenue: 0, email: inv.customerEmail || "" };
      custMap[name].orders += 1;
      custMap[name].revenue += parseFloat(String(inv.total || "0"));
    });
    return Object.entries(custMap)
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .slice(0, 15)
      .map(([name, data]) => ({ name, ...data, revenue: Math.round(data.revenue * 100) / 100 }));
  }, [filteredInvoices]);

  // ── Inventory valuation by category ──
  const inventoryValuation = useMemo(() => {
    if (!allProductsData?.products) return { categories: [], totalValue: 0, totalUnits: 0 };
    const catMap: Record<string, { units: number; value: number; products: number }> = {};
    let totalValue = 0;
    let totalUnits = 0;
    allProductsData.products.forEach((p: Product) => {
      const cat = p.category || "Uncategorized";
      const qty = p.quantity || 0;
      const val = parseFloat(String(p.price || "0")) * qty;
      if (!catMap[cat]) catMap[cat] = { units: 0, value: 0, products: 0 };
      catMap[cat].units += qty;
      catMap[cat].value += val;
      catMap[cat].products += 1;
      totalValue += val;
      totalUnits += qty;
    });
    const categories = Object.entries(catMap)
      .sort(([, a], [, b]) => b.value - a.value)
      .map(([category, data]) => ({
        category,
        ...data,
        value: Math.round(data.value * 100) / 100,
        pct: totalValue > 0 ? Math.round((data.value / totalValue) * 1000) / 10 : 0,
      }));
    return { categories, totalValue: Math.round(totalValue * 100) / 100, totalUnits };
  }, [allProductsData]);

  // ── Top products ──
  const topProducts = useMemo(() => {
    if (!allProductsData?.products) return [];
    return [...allProductsData.products]
      .sort((a: Product, b: Product) => {
        const aVal = parseFloat(String(a.price || "0")) * (a.quantity || 0);
        const bVal = parseFloat(String(b.price || "0")) * (b.quantity || 0);
        return bVal - aVal;
      })
      .slice(0, 10);
  }, [allProductsData]);

  const lowStockProducts = useMemo(() => {
    if (!lowStockData?.products) return [];
    return lowStockData.products.filter((p: Product) => p.quantity <= 5);
  }, [lowStockData]);

  const clearDateFilters = () => { setDateFrom(undefined); setDateTo(undefined); };

  // ── CSV helpers ──
  const downloadCSV = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportCSV = (headers: string[], rows: string[][], filename: string, label: string) => {
    if (rows.length === 0) {
      toast({ title: "No Data", description: `No ${label} data to export`, variant: "destructive" });
      return;
    }
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadCSV(csv, `${filename}_${new Date().toISOString().split("T")[0]}.csv`);
    toast({ title: "Export Successful", description: `Exported ${rows.length} ${label} rows to CSV` });
  };

  const exportSalesCSV = () => exportCSV(
    ["Invoice Number", "Customer", "Date", "Subtotal", "Tax", "Discount", "Total", "Status"],
    filteredInvoices.map((inv: Invoice) => [
      `"${inv.invoiceNumber}"`, `"${inv.customerName}"`,
      `"${new Date(inv.createdAt || "").toLocaleDateString()}"`,
      String(inv.subtotal), String(inv.taxAmount), String(inv.discountAmount || "0.00"),
      String(inv.total), `"${inv.status}"`,
    ]),
    "sales_report", "sales"
  );

  const exportLowStockCSV = () => exportCSV(
    ["Product ID", "Product Name", "Category", "Size", "Color", "Quantity", "Price"],
    lowStockProducts.map((p: Product) => [
      `"${p.productId}"`, `"${p.productName}"`, `"${p.category || ""}"`,
      `"${p.size}"`, `"${p.color}"`, String(p.quantity), String(p.price),
    ]),
    "low_stock_report", "low stock"
  );

  const exportTopProductsCSV = () => exportCSV(
    ["Product ID", "Product Name", "Category", "Qty", "Price", "Stock Value"],
    topProducts.map((p: Product) => [
      `"${p.productId}"`, `"${p.productName}"`, `"${p.category || ""}"`,
      String(p.quantity), String(p.price),
      (parseFloat(String(p.price || "0")) * (p.quantity || 0)).toFixed(2),
    ]),
    "top_products_report", "product"
  );

  const exportCustomerCSV = () => exportCSV(
    ["Customer Name", "Email", "Orders", "Total Revenue"],
    customerRanking.map(c => [`"${c.name}"`, `"${c.email}"`, String(c.orders), c.revenue.toFixed(2)]),
    "customer_report", "customer"
  );

  const exportManufacturerCSV = () => exportCSV(
    ["Manufacturer", "Products", "Total Units", "Stock Value"],
    manufacturerPerformance.map(m => [`"${m.name}"`, String(m.products), String(m.units), m.value.toFixed(2)]),
    "manufacturer_report", "manufacturer"
  );

  const exportInventoryCSV = () => exportCSV(
    ["Category", "Products", "Units", "Stock Value", "% of Total"],
    inventoryValuation.categories.map(c => [
      `"${c.category}"`, String(c.products), String(c.units), c.value.toFixed(2), `${c.pct}%`,
    ]),
    "inventory_valuation", "category"
  );

  const exportProfitabilityCSV = () => {
    if (!profitabilityData?.productMargins) return;
    exportCSV(
      ["Product ID", "Product Name", "Category", "Selling Price", "Cost Price", "Sold Qty", "Revenue", "COGS", "Profit", "Margin %"],
      profitabilityData.productMargins.map((p: any) => [
        `"${p.productId}"`, `"${p.productName}"`, `"${p.category || ""}"`,
        p.sellingPrice.toFixed(2), p.costPrice !== null ? p.costPrice.toFixed(2) : "N/A",
        String(p.soldQty), p.revenue.toFixed(2),
        p.cogs !== null ? p.cogs.toFixed(2) : "N/A",
        p.profit !== null ? p.profit.toFixed(2) : "N/A",
        p.marginPct !== null ? p.marginPct.toFixed(1) : "N/A",
      ]),
      "profitability_report", "product margin"
    );
  };

  const exportAgingCSV = () => {
    if (!invoiceAgingData?.invoices) return;
    exportCSV(
      ["Invoice #", "Customer", "Phone", "Total", "Days Pending", "Bucket"],
      invoiceAgingData.invoices.map((inv: any) => [
        `"${inv.invoiceNumber}"`, `"${inv.customerName}"`, `"${inv.customerPhone}"`,
        inv.total.toFixed(2), String(inv.daysPending), `"${inv.bucket}"`,
      ]),
      "invoice_aging_report", "aging invoice"
    );
  };

  const exportDeadStockCSV = () => {
    if (!inventoryHealthData?.deadStock) return;
    exportCSV(
      ["Product ID", "Product Name", "Category", "Color", "Qty", "Price", "Stock Value", "Days Since Created"],
      inventoryHealthData.deadStock.map((p: any) => [
        `"${p.productId}"`, `"${p.productName}"`, `"${p.category || ""}"`, `"${p.color}"`,
        String(p.quantity), p.price.toFixed(2), p.stockValue.toFixed(2), String(p.daysSinceCreated),
      ]),
      "dead_stock_report", "dead stock"
    );
  };

  const exportFashionCSV = () => {
    if (!fashionAnalyticsData?.salesByColor) return;
    exportCSV(
      ["Color", "Units Sold", "Revenue", "Product Count"],
      fashionAnalyticsData.salesByColor.map((c: any) => [
        `"${c.color}"`, String(c.unitsSold), c.revenue.toFixed(2), String(c.productCount),
      ]),
      "fashion_analytics_report", "fashion color"
    );
  };

  const isLoading = metricsLoading || invoicesLoading || lowStockLoading || productsLoading;
  const newReportsLoading = profitabilityLoading || inventoryHealthLoading || invoiceAgingLoading || fashionAnalyticsLoading;

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    color: "hsl(var(--foreground))",
  };

  return (
    <div className="space-y-6">
      {/* Header + Date Range */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Reports & Analytics</h2>
          <p className="text-sm text-muted-foreground">Overview of sales, inventory, and product performance</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={fromOpen} onOpenChange={setFromOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
                <i className="fas fa-calendar mr-2 text-muted-foreground"></i>
                {dateFrom ? formatDate(dateFrom) : "From date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setFromOpen(false); }} initialFocus />
            </PopoverContent>
          </Popover>
          <Popover open={toOpen} onOpenChange={setToOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
                <i className="fas fa-calendar mr-2 text-muted-foreground"></i>
                {dateTo ? formatDate(dateTo) : "To date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setToOpen(false); }} initialFocus />
            </PopoverContent>
          </Popover>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" onClick={clearDateFilters}>
              <i className="fas fa-times mr-1"></i> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: formatCurrency(salesSummary.totalRevenue), icon: "fa-dollar-sign", color: "text-green-500", bg: "bg-green-500/10" },
          { label: "Total Invoices", value: salesSummary.invoiceCount.toLocaleString(), icon: "fa-file-invoice", color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "Avg. Invoice Value", value: formatCurrency(salesSummary.avgValue), icon: "fa-chart-line", color: "text-purple-500", bg: "bg-purple-500/10" },
          { label: "Cancellation Rate", value: salesSummary.invoiceCount > 0 ? `${((salesSummary.cancelledCount / salesSummary.invoiceCount) * 100).toFixed(1)}%` : "0%", icon: "fa-ban", color: "text-red-500", bg: "bg-red-500/10" },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                  {isLoading ? <Skeleton className="h-7 w-20 mt-1" /> : (
                    <p className="text-xl font-bold text-foreground mt-1">{card.value}</p>
                  )}
                </div>
                <div className={`w-10 h-10 ${card.bg} rounded-lg flex items-center justify-center`}>
                  <i className={`fas ${card.icon} ${card.color}`}></i>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Profitability Summary Cards */}
      {profitabilityData?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Gross Profit", value: formatCurrency(profitabilityData.summary.grossProfit), icon: "fa-coins", color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Profit Margin", value: `${profitabilityData.summary.marginPct.toFixed(1)}%`, icon: "fa-percentage", color: "text-cyan-500", bg: "bg-cyan-500/10" },
            { label: "Total COGS", value: formatCurrency(profitabilityData.summary.totalCOGS), icon: "fa-boxes-stacked", color: "text-orange-500", bg: "bg-orange-500/10" },
            { label: "Units Sold", value: profitabilityData.summary.totalUnits.toLocaleString(), icon: "fa-truck-fast", color: "text-indigo-500", bg: "bg-indigo-500/10" },
          ].map((card) => (
            <Card key={card.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                    {newReportsLoading ? <Skeleton className="h-7 w-20 mt-1" /> : (
                      <p className="text-xl font-bold text-foreground mt-1">{card.value}</p>
                    )}
                  </div>
                  <div className={`w-10 h-10 ${card.bg} rounded-lg flex items-center justify-center`}>
                    <i className={`fas ${card.icon} ${card.color}`}></i>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Revenue by Month + Daily Trend side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Revenue by Month</h3>
            <Button variant="outline" size="sm" onClick={exportSalesCSV}>
              <i className="fas fa-download mr-1"></i> CSV
            </Button>
          </div>
          <CardContent className="p-4">
            {isLoading ? <Skeleton className="w-full h-[250px]" /> : monthlyRevenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={monthlyRevenueData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Revenue"]} contentStyle={tooltipStyle} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <i className="fas fa-chart-bar text-3xl mb-2"></i>
                <p className="text-sm">No revenue data for selected period</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Daily Sales Trend (Last 30 Days)</h3>
          </div>
          <CardContent className="p-4">
            {isLoading ? <Skeleton className="w-full h-[250px]" /> : dailySalesData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={dailySalesData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number, name: string) => [
                      name === "revenue" ? formatCurrency(v) : v,
                      name === "revenue" ? "Revenue" : "Orders",
                    ]}
                    contentStyle={tooltipStyle}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="orders" stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <i className="fas fa-chart-line text-3xl mb-2"></i>
                <p className="text-sm">No daily data for selected period</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invoice Status + Size Distribution + Category Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Status Pie */}
        <Card>
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Invoice Status Breakdown</h3>
          </div>
          <CardContent className="p-4">
            {isLoading ? <Skeleton className="w-full h-[220px]" /> : statusBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={statusBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {statusBreakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No invoices to display</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Size Distribution */}
        <Card>
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Size Distribution</h3>
          </div>
          <CardContent className="p-4">
            {isLoading ? <Skeleton className="w-full h-[220px]" /> : sizeDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sizeDistribution}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="size" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [v, "Units"]} contentStyle={tooltipStyle} />
                  <Bar dataKey="quantity" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No size data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue by Category */}
        <Card>
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Stock Value by Category</h3>
          </div>
          <CardContent className="p-4">
            {isLoading ? <Skeleton className="w-full h-[220px]" /> : categoryRevenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={categoryRevenue}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    nameKey="category"
                    label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
                  >
                    {categoryRevenue.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Value"]} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-sm">No category data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="customers">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="customers"><i className="fas fa-users mr-1.5"></i>Customers</TabsTrigger>
          <TabsTrigger value="manufacturers"><i className="fas fa-industry mr-1.5"></i>Manufacturers</TabsTrigger>
          <TabsTrigger value="inventory"><i className="fas fa-warehouse mr-1.5"></i>Inventory</TabsTrigger>
          <TabsTrigger value="low-stock"><i className="fas fa-exclamation-triangle mr-1.5"></i>Low Stock ({lowStockProducts.length})</TabsTrigger>
          <TabsTrigger value="top-products"><i className="fas fa-star mr-1.5"></i>Top Products</TabsTrigger>
          <TabsTrigger value="profitability"><i className="fas fa-coins mr-1.5"></i>Profitability</TabsTrigger>
          <TabsTrigger value="invoice-aging"><i className="fas fa-clock mr-1.5"></i>Invoice Aging</TabsTrigger>
          <TabsTrigger value="dead-stock"><i className="fas fa-skull-crossbones mr-1.5"></i>Dead Stock</TabsTrigger>
          <TabsTrigger value="fashion-analytics"><i className="fas fa-palette mr-1.5"></i>Fashion Analytics</TabsTrigger>
        </TabsList>

        {/* Customer Ranking */}
        <TabsContent value="customers">
          <Card>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Top Customers by Revenue</h3>
              <Button variant="outline" size="sm" onClick={exportCustomerCSV}>
                <i className="fas fa-download mr-1"></i> Export CSV
              </Button>
            </div>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : customerRanking.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">#</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Customer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Orders</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Total Revenue</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Avg. Order</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {customerRanking.map((c, i) => (
                        <tr key={c.name} className="hover:bg-accent/50">
                          <td className="px-4 py-3 text-sm text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3 text-sm font-medium text-foreground">{c.name}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{c.email || "-"}</td>
                          <td className="px-4 py-3"><Badge variant="secondary">{c.orders}</Badge></td>
                          <td className="px-4 py-3 text-sm font-semibold text-foreground">{formatCurrency(c.revenue)}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{formatCurrency(c.orders > 0 ? c.revenue / c.orders : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <i className="fas fa-users text-3xl mb-2"></i>
                  <p className="text-sm">No customer data for selected period</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manufacturer Performance */}
        <TabsContent value="manufacturers">
          <Card>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Manufacturer Performance</h3>
              <Button variant="outline" size="sm" onClick={exportManufacturerCSV}>
                <i className="fas fa-download mr-1"></i> Export CSV
              </Button>
            </div>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : manufacturerPerformance.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">#</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Manufacturer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Products</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Total Units</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Stock Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {manufacturerPerformance.map((m, i) => (
                        <tr key={m.name} className="hover:bg-accent/50">
                          <td className="px-4 py-3 text-sm text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3 text-sm font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 bg-primary/10 rounded flex items-center justify-center">
                                <i className="fas fa-industry text-primary text-xs"></i>
                              </div>
                              {m.name}
                            </div>
                          </td>
                          <td className="px-4 py-3"><Badge variant="secondary">{m.products}</Badge></td>
                          <td className="px-4 py-3 text-sm text-foreground">{m.units.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-foreground">{formatCurrency(m.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <i className="fas fa-industry text-3xl mb-2"></i>
                  <p className="text-sm">No manufacturer data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory Valuation */}
        <TabsContent value="inventory">
          <Card>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Inventory Valuation</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Total: {formatCurrency(inventoryValuation.totalValue)} across {inventoryValuation.totalUnits.toLocaleString()} units
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={exportInventoryCSV}>
                <i className="fas fa-download mr-1"></i> Export CSV
              </Button>
            </div>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : inventoryValuation.categories.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Products</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Units</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Stock Value</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">% of Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {inventoryValuation.categories.map((c) => (
                        <tr key={c.category} className="hover:bg-accent/50">
                          <td className="px-4 py-3 text-sm font-medium text-foreground">{c.category}</td>
                          <td className="px-4 py-3"><Badge variant="secondary">{c.products}</Badge></td>
                          <td className="px-4 py-3 text-sm text-foreground">{c.units.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-foreground">{formatCurrency(c.value)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-muted rounded-full h-2 max-w-[100px]">
                                <div className="bg-primary rounded-full h-2" style={{ width: `${c.pct}%` }}></div>
                              </div>
                              <span className="text-xs text-muted-foreground">{c.pct}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <i className="fas fa-warehouse text-3xl mb-2"></i>
                  <p className="text-sm">No inventory data available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Low Stock */}
        <TabsContent value="low-stock">
          <Card>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Low Stock Products (Qty &le; 5)</h3>
              <Button variant="outline" size="sm" onClick={exportLowStockCSV}>
                <i className="fas fa-download mr-1"></i> Export CSV
              </Button>
            </div>
            <CardContent className="p-0">
              {lowStockLoading ? (
                <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : lowStockProducts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Size / Color</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Quantity</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {lowStockProducts.map((p: Product) => (
                        <tr key={p.id} className="hover:bg-accent/50">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-foreground">{p.productName}</p>
                            <p className="text-xs text-muted-foreground">{p.productId}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{p.category || "N/A"}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{p.size} / {p.color}</td>
                          <td className="px-4 py-3">
                            <Badge variant="destructive" className={p.quantity === 0 ? "bg-red-600 text-white" : ""}>
                              {p.quantity === 0 ? "Out of Stock" : `${p.quantity} left`}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-foreground">
                            {formatCurrency(parseFloat(String(p.price || "0")))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <i className="fas fa-check-circle text-green-500 text-3xl mb-2"></i>
                  <p className="text-sm">All products are well stocked</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Products */}
        <TabsContent value="top-products">
          <Card>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Top Products by Stock Value</h3>
              <Button variant="outline" size="sm" onClick={exportTopProductsCSV}>
                <i className="fas fa-download mr-1"></i> Export CSV
              </Button>
            </div>
            <CardContent className="p-0">
              {productsLoading ? (
                <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : topProducts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">#</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Qty</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Price</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Stock Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {topProducts.map((p: Product, i: number) => {
                        const price = parseFloat(String(p.price || "0"));
                        return (
                          <tr key={p.id} className="hover:bg-accent/50">
                            <td className="px-4 py-3 text-sm text-muted-foreground">{i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-muted rounded overflow-hidden flex items-center justify-center">
                                  {p.imageUrl ? <img src={p.imageUrl} alt="" className="w-9 h-9 object-cover" /> : <i className="fas fa-image text-muted-foreground text-xs"></i>}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">{p.productName}</p>
                                  <p className="text-xs text-muted-foreground">{p.productId}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{p.category || "N/A"}</td>
                            <td className="px-4 py-3"><Badge variant={p.quantity <= 5 ? "destructive" : "secondary"}>{p.quantity}</Badge></td>
                            <td className="px-4 py-3 text-sm text-foreground">{formatCurrency(price)}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-foreground">{formatCurrency(price * (p.quantity || 0))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <i className="fas fa-box text-3xl mb-2"></i>
                  <p className="text-sm">No products found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profitability */}
        <TabsContent value="profitability">
          <div className="space-y-6">
            {/* By Category Chart */}
            <Card>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Profit by Category</h3>
                <Button variant="outline" size="sm" onClick={exportProfitabilityCSV}>
                  <i className="fas fa-download mr-1"></i> Export CSV
                </Button>
              </div>
              <CardContent className="p-4">
                {newReportsLoading ? <Skeleton className="w-full h-[300px]" /> : profitabilityData?.byCategory?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={profitabilityData.byCategory}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                      <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name === "revenue" ? "Revenue" : name === "cogs" ? "COGS" : "Profit"]} contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cogs" fill="#ef4444" name="COGS" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="profit" fill="#22c55e" name="Profit" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <i className="fas fa-chart-bar text-3xl mb-2"></i>
                    <p className="text-sm">No profitability data available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* By Manufacturer */}
            <Card>
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground">Profit by Manufacturer</h3>
              </div>
              <CardContent className="p-4">
                {newReportsLoading ? <Skeleton className="w-full h-[300px]" /> : profitabilityData?.byManufacturer?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={profitabilityData.byManufacturer} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                      <YAxis type="category" dataKey="manufacturer" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip formatter={(v: number, name: string) => [formatCurrency(v), name === "revenue" ? "Revenue" : name === "cogs" ? "COGS" : "Profit"]} contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="profit" fill="#22c55e" name="Profit" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <i className="fas fa-industry text-3xl mb-2"></i>
                    <p className="text-sm">No manufacturer profitability data</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Product Margins Table */}
            <Card>
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground">Product Margins (Top 50)</h3>
              </div>
              <CardContent className="p-0">
                {newReportsLoading ? (
                  <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : profitabilityData?.productMargins?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Product</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Category</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Sell Price</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Cost Price</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Sold</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Revenue</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Profit</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {profitabilityData.productMargins.map((p: any) => (
                          <tr key={p.productId} className="hover:bg-accent/50">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-foreground">{p.productName}</p>
                              <p className="text-xs text-muted-foreground">{p.productId}</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{p.category || "N/A"}</td>
                            <td className="px-4 py-3 text-sm text-foreground">{formatCurrency(p.sellingPrice)}</td>
                            <td className="px-4 py-3 text-sm text-foreground">{p.costPrice !== null ? formatCurrency(p.costPrice) : <span className="text-muted-foreground">N/A</span>}</td>
                            <td className="px-4 py-3"><Badge variant="secondary">{p.soldQty}</Badge></td>
                            <td className="px-4 py-3 text-sm font-semibold text-foreground">{formatCurrency(p.revenue)}</td>
                            <td className="px-4 py-3 text-sm font-semibold">{p.profit !== null ? <span className={p.profit >= 0 ? "text-green-600" : "text-red-600"}>{formatCurrency(p.profit)}</span> : <span className="text-muted-foreground">N/A</span>}</td>
                            <td className="px-4 py-3 text-sm">{p.marginPct !== null ? <Badge variant={p.marginPct >= 20 ? "default" : p.marginPct >= 0 ? "secondary" : "destructive"}>{p.marginPct.toFixed(1)}%</Badge> : <span className="text-muted-foreground">N/A</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <i className="fas fa-coins text-3xl mb-2"></i>
                    <p className="text-sm">No product margin data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Invoice Aging */}
        <TabsContent value="invoice-aging">
          <div className="space-y-6">
            {/* Aging Buckets */}
            {invoiceAgingData?.summary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: "Current (0-30d)", count: invoiceAgingData.summary.currentCount, amount: invoiceAgingData.summary.currentAmount, color: "text-green-500", bg: "bg-green-500/10" },
                  { label: "30-60 Days", count: invoiceAgingData.summary.thirtyCount, amount: invoiceAgingData.summary.thirtyAmount, color: "text-yellow-500", bg: "bg-yellow-500/10" },
                  { label: "60-90 Days", count: invoiceAgingData.summary.sixtyCount, amount: invoiceAgingData.summary.sixtyAmount, color: "text-orange-500", bg: "bg-orange-500/10" },
                  { label: "90+ Days", count: invoiceAgingData.summary.ninetyPlusCount, amount: invoiceAgingData.summary.ninetyPlusAmount, color: "text-red-500", bg: "bg-red-500/10" },
                  { label: "Total Pending", count: invoiceAgingData.summary.totalPendingCount, amount: invoiceAgingData.summary.totalPendingAmount, color: "text-blue-500", bg: "bg-blue-500/10" },
                ].map((b) => (
                  <Card key={b.label}>
                    <CardContent className="p-4">
                      <p className="text-xs font-medium text-muted-foreground">{b.label}</p>
                      <p className="text-lg font-bold text-foreground mt-1">{formatCurrency(b.amount)}</p>
                      <p className={`text-xs mt-1 ${b.color}`}>{b.count} invoice{b.count !== 1 ? "s" : ""}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Aging Chart */}
            <Card>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Aging Distribution</h3>
                <Button variant="outline" size="sm" onClick={exportAgingCSV}>
                  <i className="fas fa-download mr-1"></i> Export CSV
                </Button>
              </div>
              <CardContent className="p-4">
                {invoiceAgingLoading ? <Skeleton className="w-full h-[250px]" /> : invoiceAgingData?.summary ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Current (0-30d)", value: invoiceAgingData.summary.currentAmount },
                          { name: "30-60 Days", value: invoiceAgingData.summary.thirtyAmount },
                          { name: "60-90 Days", value: invoiceAgingData.summary.sixtyAmount },
                          { name: "90+ Days", value: invoiceAgingData.summary.ninetyPlusAmount },
                        ].filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        <Cell fill="#22c55e" />
                        <Cell fill="#f59e0b" />
                        <Cell fill="#f97316" />
                        <Cell fill="#ef4444" />
                      </Pie>
                      <Tooltip formatter={(v: number) => [formatCurrency(v), "Amount"]} contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <i className="fas fa-clock text-3xl mb-2"></i>
                    <p className="text-sm">No pending invoices</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Aging Table */}
            <Card>
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground">Pending Invoices</h3>
              </div>
              <CardContent className="p-0">
                {invoiceAgingLoading ? (
                  <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : invoiceAgingData?.invoices?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Invoice #</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Customer</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Total</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Days Pending</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Bucket</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {invoiceAgingData.invoices.map((inv: any) => (
                          <tr key={inv.id} className="hover:bg-accent/50">
                            <td className="px-4 py-3 text-sm font-medium text-foreground">{inv.invoiceNumber}</td>
                            <td className="px-4 py-3">
                              <p className="text-sm text-foreground">{inv.customerName}</p>
                              <p className="text-xs text-muted-foreground">{inv.customerPhone}</p>
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-foreground">{formatCurrency(inv.total)}</td>
                            <td className="px-4 py-3 text-sm text-foreground">{inv.daysPending}d</td>
                            <td className="px-4 py-3">
                              <Badge variant={inv.bucket === "current" ? "secondary" : inv.bucket === "90+" ? "destructive" : "default"}>
                                {inv.bucket === "current" ? "0-30d" : inv.bucket}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <i className="fas fa-check-circle text-green-500 text-3xl mb-2"></i>
                    <p className="text-sm">No pending invoices</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Dead Stock */}
        <TabsContent value="dead-stock">
          <div className="space-y-6">
            <Card>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Dead Stock (No Sales in 60 Days)</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Products with inventory but no sales in the last 60 days
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={exportDeadStockCSV}>
                  <i className="fas fa-download mr-1"></i> Export CSV
                </Button>
              </div>
              <CardContent className="p-0">
                {inventoryHealthLoading ? (
                  <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : inventoryHealthData?.deadStock?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Product</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Category</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Color</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Qty</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Stock Value</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Days Old</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {inventoryHealthData.deadStock.map((p: any) => (
                          <tr key={p.productId} className="hover:bg-accent/50">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-foreground">{p.productName}</p>
                              <p className="text-xs text-muted-foreground">{p.productId}</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{p.category || "N/A"}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{p.color}</td>
                            <td className="px-4 py-3"><Badge variant="secondary">{p.quantity}</Badge></td>
                            <td className="px-4 py-3 text-sm font-semibold text-foreground">{formatCurrency(p.stockValue)}</td>
                            <td className="px-4 py-3">
                              <Badge variant={p.daysSinceCreated > 90 ? "destructive" : "secondary"}>
                                {p.daysSinceCreated}d
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <i className="fas fa-check-circle text-green-500 text-3xl mb-2"></i>
                    <p className="text-sm">No dead stock found — all products are selling</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Inventory Turnover */}
            <Card>
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground">Inventory Turnover (90 Days)</h3>
                <p className="text-sm text-muted-foreground mt-1">Lower turnover rate = slower selling. Sorted slowest first.</p>
              </div>
              <CardContent className="p-0">
                {inventoryHealthLoading ? (
                  <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : inventoryHealthData?.turnover?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Product</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Category</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Current Stock</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Sold (90d)</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Turnover Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {inventoryHealthData.turnover.map((p: any) => (
                          <tr key={p.productId} className="hover:bg-accent/50">
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-foreground">{p.productName}</p>
                              <p className="text-xs text-muted-foreground">{p.productId}</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{p.category || "N/A"}</td>
                            <td className="px-4 py-3"><Badge variant="secondary">{p.currentStock}</Badge></td>
                            <td className="px-4 py-3 text-sm text-foreground">{p.soldLast90Days}</td>
                            <td className="px-4 py-3">
                              <Badge variant={p.turnoverRate === 0 ? "destructive" : p.turnoverRate < 1 ? "secondary" : "default"}>
                                {p.turnoverRate === Infinity ? "All sold" : p.turnoverRate.toFixed(2)}x
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <i className="fas fa-sync text-3xl mb-2"></i>
                    <p className="text-sm">No turnover data available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Fashion Analytics */}
        <TabsContent value="fashion-analytics">
          <div className="space-y-6">
            {/* Sales by Color */}
            <Card>
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Sales by Color</h3>
                <Button variant="outline" size="sm" onClick={exportFashionCSV}>
                  <i className="fas fa-download mr-1"></i> Export CSV
                </Button>
              </div>
              <CardContent className="p-4">
                {fashionAnalyticsLoading ? <Skeleton className="w-full h-[300px]" /> : fashionAnalyticsData?.salesByColor?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={fashionAnalyticsData.salesByColor}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="color" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number, name: string) => [name === "revenue" ? formatCurrency(v) : v, name === "revenue" ? "Revenue" : "Units Sold"]} contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="revenue" fill="#8b5cf6" name="Revenue" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="unitsSold" fill="#06b6d4" name="Units Sold" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <i className="fas fa-palette text-3xl mb-2"></i>
                    <p className="text-sm">No color sales data available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Seasonal Trends */}
            <Card>
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground">Seasonal Revenue Trends</h3>
              </div>
              <CardContent className="p-4">
                {fashionAnalyticsLoading ? <Skeleton className="w-full h-[300px]" /> : fashionAnalyticsData?.seasonalTrends?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={fashionAnalyticsData.seasonalTrends}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                      <Tooltip formatter={(v: number, name: string) => [name === "revenue" ? formatCurrency(v) : v, name === "revenue" ? "Revenue" : "Orders"]} contentStyle={tooltipStyle} />
                      <Legend />
                      <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} name="Revenue" />
                      <Area type="monotone" dataKey="orderCount" stroke="#22c55e" fill="#22c55e" fillOpacity={0.15} name="Orders" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <i className="fas fa-chart-area text-3xl mb-2"></i>
                    <p className="text-sm">No seasonal data available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Color Sales Table */}
            <Card>
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-foreground">Color Performance Details</h3>
              </div>
              <CardContent className="p-0">
                {fashionAnalyticsLoading ? (
                  <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : fashionAnalyticsData?.salesByColor?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Color</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Products</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Units Sold</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Revenue</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Avg/Unit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {fashionAnalyticsData.salesByColor.map((c: any) => (
                          <tr key={c.color} className="hover:bg-accent/50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: c.color.toLowerCase() }}></div>
                                <span className="text-sm font-medium text-foreground">{c.color}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3"><Badge variant="secondary">{c.productCount}</Badge></td>
                            <td className="px-4 py-3 text-sm text-foreground">{c.unitsSold.toLocaleString()}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-foreground">{formatCurrency(c.revenue)}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{c.unitsSold > 0 ? formatCurrency(c.revenue / c.unitsSold) : "N/A"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <i className="fas fa-palette text-3xl mb-2"></i>
                    <p className="text-sm">No color performance data</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
