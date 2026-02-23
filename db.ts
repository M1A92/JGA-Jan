import { neon } from '@neondatabase/serverless';

let _sql: any = null;

const getSql = () => {
  if (!_sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) {
      throw new Error("DATABASE_URL or POSTGRES_URL is missing. Check Vercel Environment Variables.");
    }
    _sql = neon(url);
  }
  return _sql;
};

const sql = (query: string, params?: any[]) => {
  const client = getSql();
  return params ? client(query, params) : client(query);
};

export async function initDb() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return;

  try {
    // 1. Create tables
    await sql('CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, passcode TEXT)');
    await sql('CREATE TABLE IF NOT EXISTS availability (person_id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY (person_id, date), FOREIGN KEY (person_id) REFERENCES people (id))');

    // 2. Check if data exists
    const rows = await sql('SELECT count(*) as count FROM people');
    const count = parseInt(rows[0]?.count || "0");

    if (count === 0) {
      console.log('Seeding database with batch queries...');

      const SEED_PEOPLE = [
        ['1', 'Jan', '#3b82f6', '1234'], ['2', 'Kevin', '#ef4444', '1234'], ['3', 'Dom', '#10b981', '1234'],
        ['4', 'Stephan', '#f59e0b', '1234'], ['5', 'David', '#8b5cf6', '1234'], ['6', 'Niko', '#ec4899', '1234'],
        ['7', 'Luki', '#06b6d4', '1234'], ['8', 'Julian', '#f97316', '1234'], ['9', 'Florian', '#6366f1', '1234'],
        ['10', 'Mike', '#84cc16', '1234'], ['11', 'Grischov', '#0d9488', '1234']
      ];

      const SEED_UNAVAILABILITY = [
        ['1', '2026-05-01'], ['1', '2026-05-02'], ['1', '2026-05-30'], ['1', '2026-06-12'],
        ['1', '2026-07-17'], ['1', '2026-08-14'], ['2', '2026-05-30'], ['2', '2026-06-25'],
        ['2', '2026-08-14'], ['2', '2026-09-05'], ['3', '2026-05-30'], ['3', '2026-08-22']
      ];

      // Batch insert people
      const peopleValues = SEED_PEOPLE.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(',');
      await sql(`INSERT INTO people (id, name, color, passcode) VALUES ${peopleValues}`, SEED_PEOPLE.flat());

      // Batch insert unavailability
      const availValues = SEED_UNAVAILABILITY.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',');
      await sql(`INSERT INTO availability (person_id, date) VALUES ${availValues}`, SEED_UNAVAILABILITY.flat());

      console.log('Database seeded successfully.');
    } else {
      // For existing databases, ensure Grischov is added
      const existing = await sql("SELECT * FROM people WHERE id = '11'");
      if (existing.length === 0) {
        await sql("INSERT INTO people (id, name, color, passcode) VALUES ('11', 'Grischov', '#0d9488', '1234')");
        console.log('Added missing user Grischov to database.');
      }

      // Migration: Ensure passcode column exists and has defaults for existing users
      try {
        await sql("ALTER TABLE people ADD COLUMN IF NOT EXISTS passcode TEXT DEFAULT '1234'");
      } catch (e) {
        // column might already exist or default failed
      }
    }
  } catch (err) {
    console.error("initDb Error:", err);
    throw err;
  }
}

export default sql;
