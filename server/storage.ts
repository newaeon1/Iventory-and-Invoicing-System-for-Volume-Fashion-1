import {
  users,
  products,
  invoices,
  invoiceItems,
  activityLogs,
  passwordResetTokens,
  customers,
  stockAdjustments,
  productChanges,
  manufacturers,
  type User,
  type UpsertUser,
  type InsertProduct,
  type Product,
  type InsertInvoice,
  type Invoice,
  type InsertInvoiceItem,
  type InvoiceItem,
  type InsertActivityLog,
  type ActivityLog,
  type InsertPasswordResetToken,
  type PasswordResetToken,
  type Customer,
  type InsertCustomer,
  type StockAdjustment,
  type InsertStockAdjustment,
  type ProductChange,
  type Manufacturer,
  type InsertManufacturer,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, ilike, count, sql, isNull, gt, gte, lte } from "drizzle-orm";
import { logger } from "./logger";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserLastLogin(id: string): Promise<void>;
  updateUserPassword(userId: string, passwordHash: string): Promise<User>;
  getAllUsers(): Promise<Omit<User, 'password'>[]>;
  updateUserRole(id: string, role: string): Promise<User>;
  updateUserStatus(id: string, isActive: boolean): Promise<User>;

  // Password reset operations
  createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetToken>;
  findValidPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenUsed(tokenId: string): Promise<void>;

  // Product operations
  createProduct(product: InsertProduct): Promise<Product>;
  getProduct(id: string): Promise<Product | undefined>;
  getProductByProductId(productId: string): Promise<Product | undefined>;
  getAllProducts(options?: { limit?: number; offset?: number; search?: string; category?: string; size?: string; stockLevel?: string }): Promise<{ products: Product[]; total: number }>;
  updateProduct(id: string, product: Partial<InsertProduct>, changedBy?: string): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  updateProductQRCode(id: string, qrCodeUrl: string): Promise<Product>;
  createBulkProducts(products: InsertProduct[]): Promise<Product[]>;
  getLowStockProducts(threshold?: number): Promise<Product[]>;

  // Stock adjustment operations
  adjustStock(productId: string, quantity: number, type: 'in' | 'out', reason: string, adjustedBy: string): Promise<StockAdjustment>;
  getStockAdjustments(productId: string): Promise<StockAdjustment[]>;

  // Invoice operations
  createInvoice(invoice: InsertInvoice, items: InsertInvoiceItem[]): Promise<Invoice>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  getAllInvoices(options?: { limit?: number; offset?: number; status?: string; startDate?: string; endDate?: string; customerName?: string }): Promise<{ invoices: Invoice[]; total: number }>;
  updateInvoiceStatus(id: string, status: string, processedBy?: string): Promise<Invoice>;
  cancelInvoice(id: string, cancelledBy: string): Promise<Invoice>;
  updateInvoicePdfPath(id: string, pdfPath: string): Promise<Invoice>;
  getInvoiceItems(invoiceId: string): Promise<(InvoiceItem & { product: Product })[]>;
  getInvoiceWithItems(id: string): Promise<(Invoice & { items: (InvoiceItem & { product: Product })[] }) | undefined>;
  updateInvoiceDiscount(id: string, discountPercentage: number): Promise<Invoice>;

  // Customer operations
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  getCustomer(id: string): Promise<Customer | undefined>;
  findCustomerByPhone(phone: string): Promise<Customer | undefined>;
  getAllCustomers(): Promise<Customer[]>;
  updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer>;
  searchCustomers(query: string): Promise<Customer[]>;

  // Manufacturer operations
  createManufacturer(manufacturer: InsertManufacturer): Promise<Manufacturer>;
  getManufacturer(id: string): Promise<Manufacturer | undefined>;
  getAllManufacturers(): Promise<Manufacturer[]>;
  updateManufacturer(id: string, manufacturer: Partial<InsertManufacturer>): Promise<Manufacturer>;
  deleteManufacturer(id: string): Promise<void>;

  // Activity log operations
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogs(options?: { limit?: number; offset?: number; userId?: string; module?: string; startDate?: string; endDate?: string }): Promise<{ logs: (ActivityLog & { user: User | null })[]; total: number }>;

  // Dashboard metrics
  getDashboardMetrics(): Promise<{
    totalProducts: number;
    lowStockItems: number;
    pendingInvoices: number;
    monthlyRevenue: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<Omit<User, 'password'>[]> {
    const result = await db.select({
      id: users.id,
      username: users.username,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      profileImageUrl: users.profileImageUrl,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    }).from(users).orderBy(desc(users.createdAt));
    return result;
  }

  async updateUserRole(id: string, role: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ role: role as any, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserStatus(id: string, isActive: boolean): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserLastLogin(id: string): Promise<void> {
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, id));
  }

  async updateUser(id: string, data: Partial<{ firstName: string; lastName: string; email: string }>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  // Password reset operations
  async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetToken> {
    const [token] = await db
      .insert(passwordResetTokens)
      .values({ userId, tokenHash, expiresAt })
      .returning();
    return token;
  }

  async findValidPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | undefined> {
    const [token] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date())
        )
      );
    return token;
  }

  async markPasswordResetTokenUsed(tokenId: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, tokenId));
  }

  // Product operations
  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getProductByProductId(productId: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.productId, productId));
    return product;
  }

  async getAllProducts(options?: { limit?: number; offset?: number; search?: string; category?: string; size?: string; stockLevel?: string }): Promise<{ products: Product[]; total: number }> {
    const { limit = 50, offset = 0, search, category, size, stockLevel } = options || {};
    // Enforce max pagination limit
    const safeLimit = Math.min(limit, 100);

    const conditions = [eq(products.isActive, true)];

    if (search) {
      conditions.push(ilike(products.productName, `%${search}%`));
    }
    if (category) {
      conditions.push(eq(products.category, category));
    }
    if (size) {
      conditions.push(eq(products.size, size));
    }
    if (stockLevel === 'low') {
      conditions.push(sql`${products.quantity} <= 5`);
    } else if (stockLevel === 'out') {
      conditions.push(eq(products.quantity, 0));
    } else if (stockLevel === 'in') {
      conditions.push(sql`${products.quantity} > 5`);
    }

    const whereCondition = conditions.length === 1 ? conditions[0] : and(...conditions);

    const [productsResult, totalResult] = await Promise.all([
      db.select().from(products)
        .where(whereCondition)
        .orderBy(desc(products.createdAt))
        .limit(safeLimit)
        .offset(offset),
      db.select({ count: count() }).from(products).where(whereCondition)
    ]);

    return {
      products: productsResult,
      total: totalResult[0].count
    };
  }

  async updateProduct(id: string, product: Partial<InsertProduct>, changedBy?: string): Promise<Product> {
    // Track changes if changedBy is provided
    if (changedBy) {
      const existing = await this.getProduct(id);
      if (existing) {
        const changeEntries: { field: string; oldValue: string | null; newValue: string | null }[] = [];
        for (const [key, value] of Object.entries(product)) {
          const oldVal = (existing as any)[key];
          if (oldVal !== value && value !== undefined) {
            changeEntries.push({
              field: key,
              oldValue: oldVal != null ? String(oldVal) : null,
              newValue: value != null ? String(value) : null,
            });
          }
        }
        if (changeEntries.length > 0) {
          await db.insert(productChanges).values(
            changeEntries.map((c) => ({
              productId: id,
              field: c.field,
              oldValue: c.oldValue,
              newValue: c.newValue,
              changedBy,
            }))
          );
        }
      }
    }

    const [updatedProduct] = await db
      .update(products)
      .set({ ...product, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return updatedProduct;
  }

  async deleteProduct(id: string): Promise<void> {
    await db.update(products).set({ isActive: false }).where(eq(products.id, id));
  }

  async updateProductQRCode(id: string, qrCodeUrl: string): Promise<Product> {
    const [product] = await db
      .update(products)
      .set({ qrCodeUrl, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return product;
  }

  async createBulkProducts(productList: InsertProduct[]): Promise<Product[]> {
    return await db.insert(products).values(productList).returning();
  }

  async getLowStockProducts(threshold: number = 5): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(and(
        eq(products.isActive, true),
        sql`${products.quantity} <= ${threshold}`
      ))
      .orderBy(products.quantity);
  }

  // Stock adjustment operations
  async adjustStock(productId: string, quantity: number, type: 'in' | 'out', reason: string, adjustedBy: string): Promise<StockAdjustment> {
    return await db.transaction(async (tx) => {
      // Get current product
      const [product] = await tx.select().from(products).where(eq(products.id, productId));
      if (!product) throw new Error("Product not found");

      const currentQty = product.quantity;
      let newQty: number;

      if (type === 'in') {
        newQty = currentQty + quantity;
      } else {
        if (currentQty < quantity) {
          throw new Error(`Insufficient stock. Current: ${currentQty}, Requested: ${quantity}`);
        }
        newQty = currentQty - quantity;
      }

      // Update product quantity
      await tx.update(products)
        .set({ quantity: newQty, updatedAt: new Date() })
        .where(eq(products.id, productId));

      // Create adjustment record
      const [adjustment] = await tx.insert(stockAdjustments)
        .values({ productId, quantity, type, reason, adjustedBy })
        .returning();

      return adjustment;
    });
  }

  async getStockAdjustments(productId: string): Promise<StockAdjustment[]> {
    return await db.select()
      .from(stockAdjustments)
      .where(eq(stockAdjustments.productId, productId))
      .orderBy(desc(stockAdjustments.createdAt));
  }

  // Invoice operations
  async createInvoice(invoice: InsertInvoice, items: InsertInvoiceItem[]): Promise<Invoice> {
    return await db.transaction(async (tx) => {
      // Validate stock for all items before creating
      for (const item of items) {
        const [product] = await tx.select().from(products).where(eq(products.id, item.productId));
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        if (product.quantity < item.quantity) {
          throw new Error(`Insufficient stock for ${product.productName}. Available: ${product.quantity}, Requested: ${item.quantity}`);
        }
      }

      // Generate invoice number using MAX to avoid race conditions
      const [lastInvoice] = await tx
        .select({ invoiceNumber: invoices.invoiceNumber })
        .from(invoices)
        .orderBy(desc(invoices.createdAt))
        .limit(1);
      const lastNum = lastInvoice?.invoiceNumber
        ? parseInt(lastInvoice.invoiceNumber.replace('INV-', ''), 10) || 0
        : 0;
      const invoiceNumber = `INV-${String(lastNum + 1).padStart(4, '0')}`;

      const [newInvoice] = await tx
        .insert(invoices)
        .values({ ...invoice, invoiceNumber })
        .returning();

      const invoiceItemsWithId = items.map(item => ({
        ...item,
        invoiceId: newInvoice.id
      }));

      await tx.insert(invoiceItems).values(invoiceItemsWithId);

      return newInvoice;
    });
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async getAllInvoices(options?: { limit?: number; offset?: number; status?: string; startDate?: string; endDate?: string; customerName?: string }): Promise<{ invoices: Invoice[]; total: number }> {
    const { limit = 50, offset = 0, status, startDate, endDate, customerName } = options || {};
    const safeLimit = Math.min(limit, 100);

    const conditions = [];

    if (status) {
      conditions.push(eq(invoices.status, status as any));
    }
    if (startDate) {
      conditions.push(sql`${invoices.createdAt} >= ${startDate}`);
    }
    if (endDate) {
      conditions.push(sql`${invoices.createdAt} <= ${endDate}`);
    }
    if (customerName) {
      conditions.push(ilike(invoices.customerName, `%${customerName}%`));
    }

    const whereCondition = conditions.length > 0
      ? (conditions.length === 1 ? conditions[0] : and(...conditions))
      : undefined;

    const [invoicesResult, totalResult] = await Promise.all([
      whereCondition
        ? db.select().from(invoices)
            .where(whereCondition)
            .orderBy(desc(invoices.createdAt))
            .limit(safeLimit)
            .offset(offset)
        : db.select().from(invoices)
            .orderBy(desc(invoices.createdAt))
            .limit(safeLimit)
            .offset(offset),
      whereCondition
        ? db.select({ count: count() }).from(invoices).where(whereCondition)
        : db.select({ count: count() }).from(invoices)
    ]);

    return {
      invoices: invoicesResult,
      total: totalResult[0].count
    };
  }

  async updateInvoiceStatus(id: string, status: string, processedBy?: string): Promise<Invoice> {
    return await db.transaction(async (tx) => {
      const updateData: any = { status, updatedAt: new Date() };
      if (status === 'Processed' && processedBy) {
        updateData.processedBy = processedBy;
        updateData.processedAt = new Date();
      }

      // Get current invoice to verify state
      const [currentInvoice] = await tx.select().from(invoices).where(eq(invoices.id, id));
      if (!currentInvoice) throw new Error("Invoice not found");
      if (currentInvoice.status === 'Cancelled') throw new Error("Cannot update a cancelled invoice");

      // Update invoice status
      const [invoice] = await tx
        .update(invoices)
        .set(updateData)
        .where(eq(invoices.id, id))
        .returning();

      // If processing the invoice, deduct inventory quantities
      if (status === 'Processed') {
        const items = await tx
          .select()
          .from(invoiceItems)
          .where(eq(invoiceItems.invoiceId, id));

        for (const item of items) {
          const [currentProduct] = await tx
            .select({ quantity: products.quantity })
            .from(products)
            .where(eq(products.id, item.productId));

          const currentQty = currentProduct?.quantity || 0;
          if (currentQty < item.quantity) {
            throw new Error(`Insufficient stock for product ${item.productId}. Available: ${currentQty}, Required: ${item.quantity}`);
          }

          const newQuantity = currentQty - item.quantity;

          await tx
            .update(products)
            .set({
              quantity: newQuantity,
              updatedAt: new Date()
            })
            .where(eq(products.id, item.productId));
        }
      }

      return invoice;
    });
  }

  async cancelInvoice(id: string, cancelledBy: string): Promise<Invoice> {
    return await db.transaction(async (tx) => {
      const [currentInvoice] = await tx.select().from(invoices).where(eq(invoices.id, id));
      if (!currentInvoice) throw new Error("Invoice not found");
      if (currentInvoice.status === 'Cancelled') throw new Error("Invoice is already cancelled");

      // If invoice was processed, reverse stock deductions
      if (currentInvoice.status === 'Processed') {
        const items = await tx
          .select()
          .from(invoiceItems)
          .where(eq(invoiceItems.invoiceId, id));

        for (const item of items) {
          const [currentProduct] = await tx
            .select({ quantity: products.quantity })
            .from(products)
            .where(eq(products.id, item.productId));

          const newQuantity = (currentProduct?.quantity || 0) + item.quantity;

          await tx
            .update(products)
            .set({
              quantity: newQuantity,
              updatedAt: new Date()
            })
            .where(eq(products.id, item.productId));
        }
      }

      const [invoice] = await tx
        .update(invoices)
        .set({
          status: 'Cancelled',
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, id))
        .returning();

      return invoice;
    });
  }

  async updateInvoicePdfPath(id: string, pdfPath: string): Promise<Invoice> {
    const [invoice] = await db
      .update(invoices)
      .set({ pdfPath, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return invoice;
  }

  async getInvoiceItems(invoiceId: string): Promise<(InvoiceItem & { product: Product })[]> {
    const result = await db
      .select()
      .from(invoiceItems)
      .leftJoin(products, eq(invoiceItems.productId, products.id))
      .where(eq(invoiceItems.invoiceId, invoiceId));

    return result.map(row => ({
      ...row.invoice_items,
      product: row.products!
    }));
  }

  async getInvoiceWithItems(id: string): Promise<(Invoice & { items: (InvoiceItem & { product: Product })[] }) | undefined> {
    const invoice = await this.getInvoice(id);
    if (!invoice) return undefined;

    const items = await this.getInvoiceItems(id);

    return {
      ...invoice,
      items
    };
  }

  async updateInvoiceDiscount(id: string, discountPercentage: number): Promise<Invoice> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id));

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status !== 'Pending') {
      throw new Error('Can only update discount for pending invoices');
    }

    const subtotal = parseFloat(invoice.subtotal);
    const taxRate = parseFloat(invoice.taxRate || "0.085");

    const discountAmount = subtotal * (discountPercentage / 100);
    const discountedSubtotal = subtotal - discountAmount;
    const taxAmount = discountedSubtotal * taxRate;
    const total = discountedSubtotal + taxAmount;

    const [updatedInvoice] = await db
      .update(invoices)
      .set({
        discountPercentage: discountPercentage.toString(),
        discountAmount: discountAmount.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        total: total.toFixed(2),
        updatedAt: new Date()
      })
      .where(eq(invoices.id, id))
      .returning();

    return updatedInvoice;
  }

  // Customer operations
  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const [newCustomer] = await db.insert(customers).values(customer).returning();
    return newCustomer;
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
    return customer;
  }

  async findCustomerByPhone(phone: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.phone, phone));
    return customer;
  }

  async getAllCustomers(): Promise<Customer[]> {
    return await db.select().from(customers).orderBy(desc(customers.createdAt));
  }

  async updateCustomer(id: string, customer: Partial<InsertCustomer>): Promise<Customer> {
    const [updated] = await db.update(customers)
      .set({ ...customer, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return updated;
  }

  async searchCustomers(query: string): Promise<Customer[]> {
    return await db.select().from(customers)
      .where(ilike(customers.name, `%${query}%`))
      .limit(10);
  }

  // Activity log operations
  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [newLog] = await db.insert(activityLogs).values(log).returning();
    return newLog;
  }

  async getActivityLogs(options?: { limit?: number; offset?: number; userId?: string; module?: string; startDate?: string; endDate?: string }): Promise<{ logs: (ActivityLog & { user: User | null })[]; total: number }> {
    const { limit = 50, offset = 0, userId, module, startDate, endDate } = options || {};
    const safeLimit = Math.min(limit, 100);

    const conditions = [];

    if (userId) {
      conditions.push(eq(activityLogs.userId, userId));
    }
    if (module) {
      conditions.push(eq(activityLogs.module, module));
    }
    if (startDate) {
      conditions.push(sql`${activityLogs.createdAt} >= ${startDate}`);
    }
    if (endDate) {
      conditions.push(sql`${activityLogs.createdAt} <= ${endDate}`);
    }

    const whereCondition = conditions.length > 0
      ? (conditions.length === 1 ? conditions[0] : and(...conditions))
      : undefined;

    const [logsResult, totalResult] = await Promise.all([
      whereCondition
        ? db.select()
            .from(activityLogs)
            .leftJoin(users, eq(activityLogs.userId, users.id))
            .where(whereCondition)
            .orderBy(desc(activityLogs.createdAt))
            .limit(safeLimit)
            .offset(offset)
        : db.select()
            .from(activityLogs)
            .leftJoin(users, eq(activityLogs.userId, users.id))
            .orderBy(desc(activityLogs.createdAt))
            .limit(safeLimit)
            .offset(offset),
      whereCondition
        ? db.select({ count: count() }).from(activityLogs).where(whereCondition)
        : db.select({ count: count() }).from(activityLogs)
    ]);

    const logs = logsResult.map(row => ({
      ...row.activity_logs,
      user: row.users
    }));

    return {
      logs,
      total: totalResult[0].count
    };
  }

  // Dashboard metrics
  async getDashboardMetrics(): Promise<{
    totalProducts: number;
    lowStockItems: number;
    pendingInvoices: number;
    monthlyRevenue: number;
  }> {
    const [
      totalProductsResult,
      lowStockResult,
      pendingInvoicesResult,
      monthlyRevenueResult
    ] = await Promise.all([
      db.select({ count: count() }).from(products).where(eq(products.isActive, true)),
      db.select({ count: count() }).from(products).where(
        and(eq(products.isActive, true), sql`${products.quantity} <= 5`)
      ),
      db.select({ count: count() }).from(invoices).where(eq(invoices.status, 'Pending')),
      db.select({
        total: sql<number>`COALESCE(SUM(${invoices.total}), 0)`
      }).from(invoices).where(
        and(
          eq(invoices.status, 'Processed'),
          sql`${invoices.createdAt} >= date_trunc('month', current_date)`
        )
      )
    ]);

    return {
      totalProducts: totalProductsResult[0].count,
      lowStockItems: lowStockResult[0].count,
      pendingInvoices: pendingInvoicesResult[0].count,
      monthlyRevenue: monthlyRevenueResult[0].total || 0
    };
  }

  // Product change history
  async getProductChanges(productId: string): Promise<ProductChange[]> {
    return await db.select()
      .from(productChanges)
      .where(eq(productChanges.productId, productId))
      .orderBy(desc(productChanges.createdAt));
  }

  // Manufacturer operations
  async createManufacturer(manufacturer: InsertManufacturer): Promise<Manufacturer> {
    const [created] = await db.insert(manufacturers).values(manufacturer).returning();
    return created;
  }

  async getManufacturer(id: string): Promise<Manufacturer | undefined> {
    const [manufacturer] = await db.select().from(manufacturers).where(eq(manufacturers.id, id));
    return manufacturer;
  }

  async getAllManufacturers(): Promise<Manufacturer[]> {
    return await db.select().from(manufacturers).orderBy(manufacturers.name);
  }

  async updateManufacturer(id: string, data: Partial<InsertManufacturer>): Promise<Manufacturer> {
    const [updated] = await db.update(manufacturers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(manufacturers.id, id))
      .returning();
    return updated;
  }

  async deleteManufacturer(id: string): Promise<void> {
    await db.delete(manufacturers).where(eq(manufacturers.id, id));
  }
}

export const storage = new DatabaseStorage();
