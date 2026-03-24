import { Router } from "express";

const router = Router();

// Cache exchange rates for 1 hour
let cachedRates: Record<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

async function fetchRates(): Promise<Record<string, number>> {
  const now = Date.now();
  if (cachedRates && now - cacheTimestamp < CACHE_DURATION) {
    return cachedRates;
  }

  try {
    // Using the free exchangerate-api (no key needed for open endpoint)
    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!response.ok) throw new Error("Failed to fetch rates");
    const data = await response.json();
    cachedRates = data.rates as Record<string, number>;
    cacheTimestamp = now;
    return cachedRates;
  } catch (error) {
    // Fallback rates if API is unavailable
    if (cachedRates) return cachedRates;
    return {
      USD: 1,
      EUR: 0.92,
      GBP: 0.79,
      AED: 3.67,
      SAR: 3.75,
      EGP: 50.85,
      CNY: 7.24,
      JOD: 0.71,
    };
  }
}

// GET /api/exchange-rates
router.get("/api/exchange-rates", async (_req, res) => {
  const rates = await fetchRates();
  res.json({ base: "USD", rates });
});

// GET /api/exchange-rates/convert?from=USD&to=EUR&amount=100
router.get("/api/exchange-rates/convert", async (req, res) => {
  const { from, to, amount } = req.query;
  if (!from || !to || !amount) {
    return res.status(400).json({ error: "Missing from, to, or amount" });
  }

  const rates = await fetchRates();
  const fromRate = rates[from as string];
  const toRate = rates[to as string];

  if (!fromRate || !toRate) {
    return res.status(400).json({ error: "Unsupported currency" });
  }

  // Convert: amount in "from" currency -> USD -> "to" currency
  const amountInUSD = parseFloat(amount as string) / fromRate;
  const converted = amountInUSD * toRate;

  res.json({
    from,
    to,
    originalAmount: parseFloat(amount as string),
    convertedAmount: Math.round(converted * 100) / 100,
    rate: toRate / fromRate,
  });
});

export default router;
