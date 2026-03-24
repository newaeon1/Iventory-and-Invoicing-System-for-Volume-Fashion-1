import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import type { ActivityLogsResponse } from "@shared/schema";

interface ExtendedDashboard {
  totalProducts: number;
  lowStockItems: number;
  pendingInvoices: number;
  monthlyRevenue: number;
  lastMonthRevenue: number;
  revenueChange: number;
  totalInvoicesThisMonth: number;
  processedInvoices: number;
  cancelledInvoices: number;
  totalCustomers: number;
  totalManufacturers: number;
  totalInventoryValue: number;
  dailyRevenue: { date: string; revenue: number; orders: number }[];
  topProducts: { productName: string; productId: string; totalSold: number; revenue: number }[];
  recentInvoices: {
    id: string; invoiceNumber: string; customerName: string;
    total: string; status: string; currency: string; createdAt: string;
  }[];
  categoryBreakdown: { category: string; count: number; value: number }[];
}

const PIE_COLORS = ["#6366f1", "#f43f5e", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6"];
const BAR_COLORS = ["#818cf8", "#fb7185", "#34d399", "#fbbf24", "#a78bfa", "#22d3ee", "#f472b6", "#2dd4bf", "#60a5fa", "#facc15", "#c084fc", "#38bdf8", "#fb923c", "#4ade80"];

export default function Dashboard() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<ExtendedDashboard>({
    queryKey: ["/api/dashboard/extended"],
  });

  const { data: activityData, isLoading: activityLoading } = useQuery<ActivityLogsResponse>({
    queryKey: ["/api/activity-logs", { limit: 6 }],
  });

  const fmt = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

  const fmtFull = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const timeAgo = (dateString: string) => {
    const mins = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  const formatChartDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Custom bar shape with individual colors
  const ColoredBar = (props: any) => {
    const { x, y, width, height, index } = props;
    const color = BAR_COLORS[index % BAR_COLORS.length];
    return <rect x={x} y={y} width={width} height={height} rx={4} ry={4} fill={color} />;
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-1">
        <Skeleton className="h-16 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-72 lg:col-span-2 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  const d = data!;
  const totalCategoryValue = d.categoryBreakdown.reduce((s, c) => s + c.value, 0);

  return (
    <div className="space-y-6 p-1">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            {greeting()}, {user?.firstName || "there"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Here's what's happening with your business today.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/create-invoice">
            <Button size="sm" className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white shadow-md shadow-violet-500/25 border-0">
              <i className="fas fa-plus mr-2 text-xs"></i> New Invoice
            </Button>
          </Link>
          <Link href="/add-product">
            <Button size="sm" className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-md shadow-cyan-500/25 border-0">
              <i className="fas fa-box mr-2 text-xs"></i> Add Product
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards — each with distinct vibrant gradient */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue */}
        <Card className="relative overflow-hidden border-0 shadow-lg bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 text-white">
          <CardContent className="p-5 relative z-10">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider">Monthly Revenue</p>
                <p className="text-2xl font-bold mt-1">{fmt(d.monthlyRevenue)}</p>
                <div className="flex items-center mt-2 text-xs">
                  {d.revenueChange >= 0 ? (
                    <span className="flex items-center bg-white/20 rounded-full px-2 py-0.5">
                      <i className="fas fa-arrow-up mr-1 text-[10px] text-emerald-300"></i>
                      <span className="text-emerald-200">{d.revenueChange}%</span>
                    </span>
                  ) : (
                    <span className="flex items-center bg-white/20 rounded-full px-2 py-0.5">
                      <i className="fas fa-arrow-down mr-1 text-[10px] text-red-300"></i>
                      <span className="text-red-200">{Math.abs(d.revenueChange)}%</span>
                    </span>
                  )}
                  <span className="text-white/50 ml-2">vs last month</span>
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <i className="fas fa-dollar-sign text-lg"></i>
              </div>
            </div>
          </CardContent>
          <div className="absolute -bottom-6 -right-6 w-28 h-28 rounded-full bg-white/10"></div>
          <div className="absolute -top-4 -left-4 w-20 h-20 rounded-full bg-white/5"></div>
        </Card>

        {/* Products */}
        <Card className="relative overflow-hidden border-0 shadow-lg bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600 text-white">
          <CardContent className="p-5 relative z-10">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider">Total Products</p>
                <p className="text-2xl font-bold mt-1">{d.totalProducts.toLocaleString()}</p>
                <p className="text-xs text-white/60 mt-2 flex items-center">
                  <i className="fas fa-warehouse mr-1 text-[10px]"></i>
                  {fmt(d.totalInventoryValue)} stock value
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <i className="fas fa-box text-lg"></i>
              </div>
            </div>
          </CardContent>
          <div className="absolute -bottom-6 -right-6 w-28 h-28 rounded-full bg-white/10"></div>
          <div className="absolute -top-4 -left-4 w-20 h-20 rounded-full bg-white/5"></div>
        </Card>

        {/* Invoices */}
        <Card className="relative overflow-hidden border-0 shadow-lg bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 text-white">
          <CardContent className="p-5 relative z-10">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider">Pending Invoices</p>
                <p className="text-2xl font-bold mt-1">{d.pendingInvoices}</p>
                <p className="text-xs text-white/60 mt-2 flex items-center">
                  <i className="fas fa-calendar mr-1 text-[10px]"></i>
                  {d.totalInvoicesThisMonth} this month
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <i className="fas fa-file-invoice text-lg"></i>
              </div>
            </div>
          </CardContent>
          <div className="absolute -bottom-6 -right-6 w-28 h-28 rounded-full bg-white/10"></div>
          <div className="absolute -top-4 -left-4 w-20 h-20 rounded-full bg-white/5"></div>
        </Card>

        {/* Low Stock */}
        <Card className="relative overflow-hidden border-0 shadow-lg bg-gradient-to-br from-rose-400 via-pink-500 to-fuchsia-600 text-white">
          <CardContent className="p-5 relative z-10">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider">Low Stock Alert</p>
                <p className="text-2xl font-bold mt-1">{d.lowStockItems}</p>
                <p className="text-xs text-white/60 mt-2 flex items-center">
                  <i className="fas fa-exclamation-circle mr-1 text-[10px]"></i>
                  items need restocking
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <i className="fas fa-exclamation-triangle text-lg"></i>
              </div>
            </div>
          </CardContent>
          <div className="absolute -bottom-6 -right-6 w-28 h-28 rounded-full bg-white/10"></div>
          <div className="absolute -top-4 -left-4 w-20 h-20 rounded-full bg-white/5"></div>
        </Card>
      </div>

      {/* Secondary Stats — colorful left borders */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="flex">
            <div className="w-1.5 bg-gradient-to-b from-blue-400 to-cyan-500 shrink-0" />
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-950 dark:to-cyan-950 flex items-center justify-center">
                <i className="fas fa-users text-blue-500 text-sm"></i>
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{d.totalCustomers}</p>
                <p className="text-xs text-muted-foreground">Customers</p>
              </div>
            </CardContent>
          </div>
        </Card>
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="flex">
            <div className="w-1.5 bg-gradient-to-b from-purple-400 to-violet-500 shrink-0" />
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-100 to-violet-100 dark:from-purple-950 dark:to-violet-950 flex items-center justify-center">
                <i className="fas fa-industry text-purple-500 text-sm"></i>
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{d.totalManufacturers}</p>
                <p className="text-xs text-muted-foreground">Manufacturers</p>
              </div>
            </CardContent>
          </div>
        </Card>
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="flex">
            <div className="w-1.5 bg-gradient-to-b from-emerald-400 to-green-500 shrink-0" />
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-950 dark:to-green-950 flex items-center justify-center">
                <i className="fas fa-check-circle text-emerald-500 text-sm"></i>
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{d.processedInvoices}</p>
                <p className="text-xs text-muted-foreground">Processed</p>
              </div>
            </CardContent>
          </div>
        </Card>
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="flex">
            <div className="w-1.5 bg-gradient-to-b from-red-400 to-rose-500 shrink-0" />
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-100 to-rose-100 dark:from-red-950 dark:to-rose-950 flex items-center justify-center">
                <i className="fas fa-ban text-red-500 text-sm"></i>
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{d.cancelledInvoices}</p>
                <p className="text-xs text-muted-foreground">Cancelled</p>
              </div>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Revenue Chart + Category Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Trend — multi-color gradient fill */}
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground">Revenue Trend</h3>
                <p className="text-xs text-muted-foreground">Last 14 days performance</p>
              </div>
              <Link href="/reports">
                <Button variant="ghost" size="sm" className="text-xs text-violet-500 hover:text-violet-600">
                  View Reports <i className="fas fa-arrow-right ml-1 text-[10px]"></i>
                </Button>
              </Link>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.dailyRevenue} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradMulti" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                      <stop offset="50%" stopColor="#ec4899" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="revenueStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="50%" stopColor="#ec4899" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={formatChartDate} tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                    tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} width={50} />
                  <Tooltip
                    contentStyle={{ borderRadius: "10px", border: "none", background: "hsl(var(--card))", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }}
                    formatter={(value: number) => [fmtFull(value), "Revenue"]}
                    labelFormatter={(label: string) => formatChartDate(label)}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="url(#revenueStroke)" strokeWidth={3}
                    fill="url(#revenueGradMulti)" dot={false} activeDot={{ r: 6, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Category Donut */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <h3 className="font-semibold text-foreground mb-1">Inventory by Category</h3>
            <p className="text-xs text-muted-foreground mb-3">Stock value distribution</p>
            {d.categoryBreakdown.length > 0 ? (
              <>
                <div className="h-44 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={d.categoryBreakdown} dataKey="value" nameKey="category"
                        cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={4}
                        strokeWidth={0} cornerRadius={4}>
                        {d.categoryBreakdown.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: "10px", border: "none", background: "hsl(var(--card))", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }}
                        formatter={(value: number) => [fmtFull(value), "Value"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2.5 mt-2">
                  {d.categoryBreakdown.slice(0, 5).map((cat, i) => {
                    const pct = totalCategoryValue > 0 ? Math.round((cat.value / totalCategoryValue) * 100) : 0;
                    return (
                      <div key={cat.category} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-foreground truncate flex-1">{cat.category}</span>
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        </div>
                        <span className="font-semibold text-foreground w-8 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">
                No category data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products + Recent Invoices + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Products */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Top Products</h3>
              <Link href="/products">
                <Button variant="ghost" size="sm" className="text-xs text-emerald-500 hover:text-emerald-600 h-7">View All</Button>
              </Link>
            </div>
            {d.topProducts.length > 0 ? (
              <div className="space-y-3.5">
                {d.topProducts.map((product, i) => {
                  const maxSold = d.topProducts[0]?.totalSold || 1;
                  const colors = ["from-violet-500 to-purple-500", "from-rose-500 to-pink-500", "from-emerald-500 to-teal-500", "from-amber-500 to-orange-500", "from-cyan-500 to-blue-500"];
                  return (
                    <div key={product.productId} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colors[i % colors.length]} flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{product.productName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full bg-gradient-to-r ${colors[i % colors.length]}`}
                              style={{ width: `${(product.totalSold / maxSold) * 100}%` }} />
                          </div>
                          <span className="text-[11px] text-muted-foreground shrink-0">{product.totalSold} sold</span>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-foreground shrink-0">{fmt(product.revenue)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <i className="fas fa-chart-bar text-2xl mb-2 block opacity-40"></i>
                No sales data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Invoices */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Recent Invoices</h3>
              <Link href="/invoices">
                <Button variant="ghost" size="sm" className="text-xs text-orange-500 hover:text-orange-600 h-7">View All</Button>
              </Link>
            </div>
            {d.recentInvoices.length > 0 ? (
              <div className="space-y-2">
                {d.recentInvoices.map((inv) => {
                  const statusStyles = inv.status === "Processed"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400"
                    : inv.status === "Cancelled"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400";
                  return (
                    <Link key={inv.id} href={`/invoices/${inv.id}`}>
                      <div className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-muted/60 transition-all cursor-pointer -mx-1 group">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{inv.invoiceNumber}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${statusStyles}`}>
                              {inv.status}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{inv.customerName}</p>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="text-sm font-bold text-foreground">{fmtFull(parseFloat(inv.total))}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(inv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <i className="fas fa-file-invoice text-2xl mb-2 block opacity-40"></i>
                No invoices yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">Activity Feed</h3>
              <Link href="/activity-logs">
                <Button variant="ghost" size="sm" className="text-xs text-pink-500 hover:text-pink-600 h-7">View All</Button>
              </Link>
            </div>
            {activityLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : activityData?.logs?.length ? (
              <div className="relative">
                <div className="absolute left-[13px] top-3 bottom-3 w-px bg-gradient-to-b from-violet-300 via-pink-300 to-cyan-300 dark:from-violet-700 dark:via-pink-700 dark:to-cyan-700" />
                <div className="space-y-4">
                  {activityData.logs.map((log: any, idx: number) => {
                    const moduleStyles: Record<string, { bg: string; icon: string }> = {
                      Products: { bg: "bg-gradient-to-br from-emerald-400 to-teal-500", icon: "fa-box" },
                      Invoices: { bg: "bg-gradient-to-br from-violet-400 to-indigo-500", icon: "fa-file-invoice" },
                      Users: { bg: "bg-gradient-to-br from-pink-400 to-rose-500", icon: "fa-user" },
                      Customers: { bg: "bg-gradient-to-br from-cyan-400 to-blue-500", icon: "fa-address-book" },
                    };
                    const style = moduleStyles[log.module] || { bg: "bg-gradient-to-br from-gray-400 to-gray-500", icon: "fa-circle" };
                    return (
                      <div key={log.id} className="flex gap-3 relative">
                        <div className={`w-[27px] h-[27px] rounded-full ${style.bg} flex items-center justify-center shrink-0 z-10 ring-[3px] ring-background shadow-sm`}>
                          <i className={`fas ${style.icon} text-white text-[10px]`}></i>
                        </div>
                        <div className="min-w-0 pt-0.5">
                          <p className="text-xs text-foreground leading-snug line-clamp-2">{log.action}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(log.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <i className="fas fa-history text-2xl mb-2 block opacity-40"></i>
                No recent activity
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Orders — colorful individual bars */}
      {d.dailyRevenue.some(day => day.orders > 0) && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-foreground">Daily Orders</h3>
                <p className="text-xs text-muted-foreground">Number of orders per day</p>
              </div>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.dailyRevenue} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={formatChartDate} tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} width={30} />
                  <Tooltip
                    contentStyle={{ borderRadius: "10px", border: "none", background: "hsl(var(--card))", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }}
                    formatter={(value: number) => [value, "Orders"]}
                    labelFormatter={(label: string) => formatChartDate(label)}
                    cursor={{ fill: "hsl(var(--muted))", radius: 4 }}
                  />
                  <Bar dataKey="orders" maxBarSize={28} shape={ColoredBar} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
