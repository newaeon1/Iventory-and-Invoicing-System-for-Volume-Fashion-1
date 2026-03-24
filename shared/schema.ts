import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table with username/password authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique().notNull(),
  password: varchar("password").notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { enum: ["Admin", "Manager", "Staff", "Viewer"] }).default("Viewer"),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_password_reset_tokens_token_hash").on(table.tokenHash),
]);

// Manufacturers table
export const manufacturers = pgTable("manufacturers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull().unique(),
  contactPerson: varchar("contact_person"),
  email: varchar("email"),
  phone: varchar("phone"),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Customers table
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  email: varchar("email"),
  phone: varchar("phone"),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Products table
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().unique(),
  productName: varchar("product_name").notNull(),
  color: varchar("color").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }),
  quantity: integer("quantity").notNull().default(0),
  size: varchar("size").notNull(),
  sizeBreakdown: jsonb("size_breakdown").$type<Record<string, number>>(),
  manufacturer: varchar("manufacturer"),
  manufacturerId: varchar("manufacturer_id").references(() => manufacturers.id),
  imageUrl: varchar("image_url"),
  imageUrls: jsonb("image_urls").$type<string[]>(),
  qrCodeUrl: varchar("qr_code_url"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  category: varchar("category"),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => [
  index("idx_products_product_id").on(table.productId),
  index("idx_products_category").on(table.category),
  index("idx_products_is_active").on(table.isActive),
]);

// Invoices table
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: varchar("invoice_number").notNull().unique(),
  customerName: varchar("customer_name").notNull(),
  customerEmail: varchar("customer_email"),
  customerPhone: varchar("customer_phone").notNull(),
  customerAddress: text("customer_address"),
  customerId: varchar("customer_id").references(() => customers.id),
  status: varchar("status", { enum: ["Pending", "Processed", "Cancelled"] }).default("Pending"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 4 }).default("0.00"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0.00"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 4 }).default("0.085"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  pdfPath: varchar("pdf_path"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  processedBy: varchar("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at"),
}, (table) => [
  index("idx_invoices_status").on(table.status),
  index("idx_invoices_customer_name").on(table.customerName),
  index("idx_invoices_created_at").on(table.createdAt),
]);

// Invoice items table
export const invoiceItems = pgTable("invoice_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  productId: varchar("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Activity logs table
export const activityLogs = pgTable("activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: varchar("action").notNull(),
  module: varchar("module").notNull(),
  targetId: varchar("target_id"),
  targetName: varchar("target_name"),
  details: jsonb("details"),
  ipAddress: varchar("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_activity_logs_module").on(table.module),
  index("idx_activity_logs_user_id").on(table.userId),
  index("idx_activity_logs_created_at").on(table.createdAt),
]);

// Stock adjustments table
export const stockAdjustments = pgTable("stock_adjustments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id),
  quantity: integer("quantity").notNull(),
  type: varchar("type", { enum: ["in", "out"] }).notNull(),
  reason: text("reason"),
  adjustedBy: varchar("adjusted_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Product changes table (edit history)
export const productChanges = pgTable("product_changes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id),
  field: varchar("field").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: varchar("changed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  products: many(products),
  invoices: many(invoices),
  processedInvoices: many(invoices),
  activityLogs: many(activityLogs),
  passwordResetTokens: many(passwordResetTokens),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export const manufacturersRelations = relations(manufacturers, ({ many }) => ({
  products: many(products),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  invoices: many(invoices),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [products.createdBy],
    references: [users.id],
  }),
  manufacturerRef: one(manufacturers, {
    fields: [products.manufacturerId],
    references: [manufacturers.id],
  }),
  invoiceItems: many(invoiceItems),
  stockAdjustments: many(stockAdjustments),
  changes: many(productChanges),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [invoices.createdBy],
    references: [users.id],
  }),
  processedBy: one(users, {
    fields: [invoices.processedBy],
    references: [users.id],
  }),
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  items: many(invoiceItems),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
  product: one(products, {
    fields: [invoiceItems.productId],
    references: [products.id],
  }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

export const stockAdjustmentsRelations = relations(stockAdjustments, ({ one }) => ({
  product: one(products, {
    fields: [stockAdjustments.productId],
    references: [products.id],
  }),
  adjustedBy: one(users, {
    fields: [stockAdjustments.adjustedBy],
    references: [users.id],
  }),
}));

export const productChangesRelations = relations(productChanges, ({ one }) => ({
  product: one(products, {
    fields: [productChanges.productId],
    references: [products.id],
  }),
  changedBy: one(users, {
    fields: [productChanges.changedBy],
    references: [users.id],
  }),
}));

// Zod schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  qrCodeUrl: true,
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({
  id: true,
  invoiceNumber: true,
  createdAt: true,
  updatedAt: true,
  processedAt: true,
  pdfPath: true,
});

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({
  id: true,
  invoiceId: true,
  createdAt: true,
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
  createdAt: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStockAdjustmentSchema = createInsertSchema(stockAdjustments).omit({
  id: true,
  createdAt: true,
});

export const insertManufacturerSchema = createInsertSchema(manufacturers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Currency configuration
export const SUPPORTED_CURRENCIES = {
  USD: { symbol: '$', name: 'US Dollar', placement: 'before' },
  EUR: { symbol: '\u20AC', name: 'Euro', placement: 'before' },
  GBP: { symbol: '\u00A3', name: 'British Pound', placement: 'before' },
  AED: { symbol: 'AED', name: 'UAE Dirham', placement: 'before' },
  SAR: { symbol: 'SAR', name: 'Saudi Riyal', placement: 'before' },
  EGP: { symbol: 'EGP', name: 'Egyptian Pound', placement: 'before' },
  CNY: { symbol: '\u00A5', name: 'Chinese Yuan', placement: 'before' },
  JOD: { symbol: 'JOD', name: 'Jordanian Dinar', placement: 'before' },
} as const;

export type CurrencyCode = keyof typeof SUPPORTED_CURRENCIES;

export function formatCurrency(amount: number | string, currencyCode: string = 'USD'): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  const currency = SUPPORTED_CURRENCIES[currencyCode as CurrencyCode];
  if (!currency) {
    return `${currencyCode} ${numAmount.toFixed(2)}`;
  }
  if (currency.placement === 'before') {
    return `${currency.symbol}${numAmount.toFixed(2)}`;
  }
  return `${numAmount.toFixed(2)} ${currency.symbol}`;
}

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type StockAdjustment = typeof stockAdjustments.$inferSelect;
export type InsertStockAdjustment = z.infer<typeof insertStockAdjustmentSchema>;
export type ProductChange = typeof productChanges.$inferSelect;
export type Manufacturer = typeof manufacturers.$inferSelect;
export type InsertManufacturer = z.infer<typeof insertManufacturerSchema>;

// API Response Types
export type DashboardMetrics = {
  totalProducts: number;
  lowStockItems: number;
  pendingInvoices: number;
  monthlyRevenue: number;
};

export type ProductsResponse = {
  products: Product[];
  total: number;
};

export type InvoicesResponse = {
  invoices: Invoice[];
  total: number;
};

export type ActivityLogsResponse = {
  logs: (ActivityLog & { user: User | null })[];
  total: number;
};
