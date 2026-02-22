import express from "express";
import { createServer as createViteServer } from "vite";
import db from "./db";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/people", (req, res) => {
    const people = db.prepare('SELECT * FROM people').all();
    res.json(people);
  });

  app.get("/api/availability", (req, res) => {
    // Get all availability for admin view
    const rows = db.prepare('SELECT * FROM availability').all() as { person_id: string, date: string }[];
    const map: Record<string, string[]> = {};
    rows.forEach(row => {
      if (!map[row.person_id]) map[row.person_id] = [];
      map[row.person_id].push(row.date);
    });
    res.json(map);
  });

  app.get("/api/availability/:personId", (req, res) => {
    const { personId } = req.params;
    const rows = db.prepare('SELECT date FROM availability WHERE person_id = ?').all(personId) as { date: string }[];
    res.json(rows.map(r => r.date));
  });

  app.post("/api/availability/:personId", (req, res) => {
    const { personId } = req.params;
    const { date, available } = req.body; // available = true means remove from unavailability list

    if (available) {
      db.prepare('DELETE FROM availability WHERE person_id = ? AND date = ?').run(personId, date);
    } else {
      try {
        db.prepare('INSERT INTO availability (person_id, date) VALUES (?, ?)').run(personId, date);
      } catch (e) {
        // Ignore unique constraint violations (already exists)
      }
    }
    res.json({ success: true });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist
    // (This part assumes a build step has run, but for this environment we focus on dev/preview)
    app.use(express.static('dist'));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
