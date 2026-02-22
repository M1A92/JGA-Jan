import express from "express";
import { createServer as createViteServer } from "vite";
import sql, { initDb } from "./db";

const app = express();
app.use(express.json());

// For Vercel, we need to ensure DB is initialized before handling requests
let dbInitPromise: Promise<void> | null = null;
function ensureDb() {
  if (!dbInitPromise) {
    dbInitPromise = initDb().catch(err => {
      console.error("Critical DB Init Error:", err);
      dbInitPromise = null; // Try again on next request if it failed
      throw err;
    });
  }
  return dbInitPromise;
}

// API Routes
app.get("/api/people", async (req, res) => {
  try {
    await ensureDb();
    const { rows } = await sql`SELECT * FROM people`;
    res.json(rows);
  } catch (err) {
    console.error("API Error (/api/people):", err);
    res.status(500).json({ error: "Failed to fetch people" });
  }
});

app.get("/api/availability", async (req, res) => {
  try {
    await ensureDb();
    const { rows } = await sql`SELECT * FROM availability`;
    const map: Record<string, string[]> = {};
    rows.forEach((row: any) => {
      if (!map[row.person_id]) map[row.person_id] = [];
      map[row.person_id].push(row.date);
    });
    res.json(map);
  } catch (err) {
    console.error("API Error (/api/availability):", err);
    res.status(500).json({ error: "Failed to fetch availability" });
  }
});

app.get("/api/availability/:personId", async (req, res) => {
  try {
    await ensureDb();
    const { personId } = req.params;
    const { rows } = await sql`SELECT date FROM availability WHERE person_id = ${personId}`;
    res.json(rows.map(r => r.date));
  } catch (err) {
    console.error("API Error (/api/availability/:personId):", err);
    res.status(500).json({ error: "Failed to fetch personal availability" });
  }
});

app.post("/api/availability/:personId", async (req, res) => {
  try {
    await ensureDb();
    const { personId } = req.params;
    const { date, available } = req.body;

    if (available) {
      await sql`DELETE FROM availability WHERE person_id = ${personId} AND date = ${date}`;
    } else {
      try {
        await sql`INSERT INTO availability (person_id, date) VALUES (${personId}, ${date}) ON CONFLICT DO NOTHING`;
      } catch (e) {
        // Ignore
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error("API Error (POST /api/availability):", err);
    res.status(500).json({ error: "Failed to update availability" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// For Vercel, we need to export the app but also handle local dev
async function startServer() {
  await initDb();

  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const PORT = 3000;
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } else {
    // In production/Vercel, we serve the static files or let Vercel handle it
    app.use(express.static('dist'));
  }
}

// Ensure DB is initialized
startServer().catch(err => console.error("Server startup error:", err));

export default app;
