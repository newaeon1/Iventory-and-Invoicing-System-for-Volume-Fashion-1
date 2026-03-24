import { db } from "./db";
import { users, products } from "@shared/schema";
import { hashPassword } from "./customAuth";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";

async function seed() {
  // Check if any admin user exists
  const existingAdmins = await db
    .select()
    .from(users)
    .where(eq(users.role, "Admin"))
    .limit(1);

  if (existingAdmins.length > 0) {
    console.log("Admin user already exists, skipping seed.");
  } else {
    const hashedPassword = await hashPassword("admin123");

    await db.insert(users).values({
      username: "admin",
      password: hashedPassword,
      email: "admin@volumefashion.com",
      firstName: "System",
      lastName: "Admin",
      role: "Admin",
      isActive: true,
    });

    console.log("Default admin user created.");
    console.log("  Username: admin");
    console.log("  Password: admin123");
  }

  // Regenerate missing QR codes
  await regenerateMissingQRCodes();
}

async function regenerateMissingQRCodes() {
  const appUrl = process.env.APP_URL || "http://localhost:5000";
  const uploadDir = process.env.UPLOAD_DIR || "./uploads";
  const qrDir = path.resolve(uploadDir, "qr-codes");

  // Ensure directory exists
  if (!fs.existsSync(qrDir)) {
    fs.mkdirSync(qrDir, { recursive: true });
  }

  const allProducts = await db.select().from(products).where(eq(products.isActive, true));
  let regenerated = 0;

  for (const product of allProducts) {
    const qrFilePath = path.join(qrDir, `${product.id}.png`);

    if (!fs.existsSync(qrFilePath)) {
      try {
        const qrCodeData = `${appUrl}/products/${product.id}`;
        const qrCodeBuffer = await QRCode.toBuffer(qrCodeData, {
          type: "png",
          width: 300,
          margin: 2,
        });
        await fs.promises.writeFile(qrFilePath, qrCodeBuffer);

        // Update DB if qrCodeUrl is missing
        const expectedUrl = `/uploads/qr-codes/${product.id}.png`;
        if (product.qrCodeUrl !== expectedUrl) {
          await db.update(products).set({ qrCodeUrl: expectedUrl }).where(eq(products.id, product.id));
        }
        regenerated++;
      } catch (err) {
        console.error(`Failed to regenerate QR for ${product.productName}:`, err);
      }
    }
  }

  if (regenerated > 0) {
    console.log(`Regenerated ${regenerated} missing QR codes.`);
  } else {
    console.log("All QR codes present.");
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
