import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../customAuth";
import { requireRole } from "../rbac";
import { insertManufacturerSchema } from "@shared/schema";
import { logger } from "../logger";

const router = Router();

// GET /api/manufacturers
router.get("/api/manufacturers", isAuthenticated, async (_req, res) => {
  try {
    const manufacturers = await storage.getAllManufacturers();
    res.json(manufacturers);
  } catch (error) {
    logger.error({ err: error }, "Error fetching manufacturers");
    res.status(500).json({ message: "Failed to fetch manufacturers" });
  }
});

// GET /api/manufacturers/:id
router.get("/api/manufacturers/:id", isAuthenticated, async (req, res) => {
  try {
    const manufacturer = await storage.getManufacturer(req.params.id);
    if (!manufacturer) {
      return res.status(404).json({ message: "Manufacturer not found" });
    }
    res.json(manufacturer);
  } catch (error) {
    logger.error({ err: error }, "Error fetching manufacturer");
    res.status(500).json({ message: "Failed to fetch manufacturer" });
  }
});

// POST /api/manufacturers
router.post("/api/manufacturers", isAuthenticated, requireRole("Admin", "Manager", "Staff"), async (req: any, res) => {
  try {
    const validated = insertManufacturerSchema.parse(req.body);
    const manufacturer = await storage.createManufacturer(validated);
    res.status(201).json(manufacturer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid manufacturer data", errors: error.errors });
    }
    logger.error({ err: error }, "Error creating manufacturer");
    res.status(500).json({ message: "Failed to create manufacturer" });
  }
});

// PUT /api/manufacturers/:id
router.put("/api/manufacturers/:id", isAuthenticated, requireRole("Admin", "Manager"), async (req: any, res) => {
  try {
    const validated = insertManufacturerSchema.partial().parse(req.body);
    const manufacturer = await storage.updateManufacturer(req.params.id, validated);
    res.json(manufacturer);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid manufacturer data", errors: error.errors });
    }
    logger.error({ err: error }, "Error updating manufacturer");
    res.status(500).json({ message: "Failed to update manufacturer" });
  }
});

// DELETE /api/manufacturers/:id
router.delete("/api/manufacturers/:id", isAuthenticated, requireRole("Admin", "Manager"), async (req: any, res) => {
  try {
    await storage.deleteManufacturer(req.params.id);
    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, "Error deleting manufacturer");
    res.status(500).json({ message: "Failed to delete manufacturer" });
  }
});

export default router;
