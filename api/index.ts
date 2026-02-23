import express from "express";
import sql, { initDb } from "../db.js";

const app = express();
app.use(express.json());

let dbInitPromise: Promise<void> | null = null;
function ensureDb() {
    if (!dbInitPromise) {
        dbInitPromise = initDb().catch(err => {
            console.error("DB Init Failure:", err);
            dbInitPromise = null;
            throw err;
        });
    }
    return dbInitPromise;
}

// API Routes
app.get("/api/people", async (req, res) => {
    try {
        await ensureDb();
        const rows = await sql("SELECT * FROM people");
        res.json(rows);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/availability", async (req, res) => {
    try {
        await ensureDb();
        const rows = await sql("SELECT * FROM availability");
        const map: Record<string, string[]> = {};
        rows.forEach((row: any) => {
            if (!map[row.person_id]) map[row.person_id] = [];
            map[row.person_id].push(row.date);
        });
        res.json(map);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/availability/:personId", async (req, res) => {
    try {
        await ensureDb();
        const { personId } = req.params;
        const rows = await sql("SELECT date FROM availability WHERE person_id = $1", [personId]);
        res.json(rows.map((r: any) => r.date));
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/availability/:personId", async (req, res) => {
    try {
        await ensureDb();
        const { personId } = req.params;
        const { date, available } = req.body;

        if (available) {
            await sql("DELETE FROM availability WHERE person_id = $1 AND date = $2", [personId, date]);
        } else {
            await sql("INSERT INTO availability (person_id, date) VALUES ($1, $2) ON CONFLICT DO NOTHING", [personId, date]);
        }
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/debug", async (req, res) => {
    try {
        const hasDbUrl = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
        let dbStatus = "Unknown";
        let errorDetail = null;
        let tables = [];
        let peopleCount = 0;

        if (hasDbUrl) {
            try {
                await ensureDb();
                dbStatus = "Connected";
                const rows = await sql("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
                tables = rows.map((r: any) => r.table_name);
                if (tables.includes('people')) {
                    const peopleRows = await sql("SELECT count(*) as count FROM people");
                    peopleCount = parseInt(peopleRows[0]?.count || "0");
                }
            } catch (e: any) {
                dbStatus = "Failed";
                errorDetail = {
                    message: e.message,
                    stack: e.stack,
                    code: e.code
                };
            }
        }

        res.json({
            timestamp: new Date().toISOString(),
            env: {
                hasDbUrl,
                isVercel: !!process.env.VERCEL,
                nodeVersion: process.version
            },
            db: {
                status: dbStatus,
                error: errorDetail,
                tables,
                peopleCount
            }
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});

// Final Error Handler
app.use((err: any, req: any, res: any, next: any) => {
    console.error("Unhandle Error:", err);
    res.status(500).json({
        error: "Internal Server Error",
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

export default app;
