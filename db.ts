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
    await sql('CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL)');
    await sql('CREATE TABLE IF NOT EXISTS availability (person_id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY (person_id, date), FOREIGN KEY (person_id) REFERENCES people (id))');

    // 2. Check if data exists
    const rows = await sql('SELECT count(*) as count FROM people');
    const count = parseInt(rows[0]?.count || "0");

    if (count === 0) {
      console.log('Seeding database with batch queries...');

      const SEED_PEOPLE = [
        ['1', 'Jan', '#3b82f6'], ['2', 'Kevin', '#ef4444'], ['3', 'Dom', '#10b981'],
        ['4', 'Stephan', '#f59e0b'], ['5', 'David', '#8b5cf6'], ['6', 'Niko', '#ec4899'],
        ['7', 'Luki', '#06b6d4'], ['8', 'Julian', '#f97316'], ['9', 'Florian', '#6366f1'],
        ['10', 'Mike', '#84cc16']
      ];

      const SEED_UNAVAILABILITY = [
        ['1', '2026-05-01'], ['1', '2026-05-02'], ['1', '2026-05-30'], ['1', '2026-06-12'],
        ['1', '2026-07-17'], ['1', '2026-08-14'], ['2', '2026-05-30'], ['2', '2026-06-25'],
        ['2', '2026-08-14'], ['2', '2026-09-05'], ['3', '2026-05-30'], ['3', '2026-08-22']
      ];

      // Batch insert people
      const peopleValues = SEED_PEOPLE.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(',');
      await sql(`INSERT INTO people (id, name, color) VALUES ${peopleValues}`, SEED_PEOPLE.flat());

      // Batch insert unavailability
      const availValues = SEED_UNAVAILABILITY.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',');
      await sql(`INSERT INTO availability (person_id, date) VALUES ${availValues}`, SEED_UNAVAILABILITY.flat());

      console.log('Database seeded successfully.');
    }
  } catch (err) {
    console.error("initDb Error:", err);
    throw err;
  }
}

export default sql;
