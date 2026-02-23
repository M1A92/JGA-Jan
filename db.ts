import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || '');

export async function initDb() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.warn("No DATABASE_URL or POSTGRES_URL found. Database initialization skipped.");
    return;
  }

  // Initialize tables
  await sql('CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL)');

  await sql('CREATE TABLE IF NOT EXISTS availability (person_id TEXT NOT NULL, date TEXT NOT NULL, PRIMARY KEY (person_id, date), FOREIGN KEY (person_id) REFERENCES people (id))');

  // Seed data if empty
  const rows = await sql('SELECT * FROM people LIMIT 1');

  if (rows.length === 0) {
    const SEED_PEOPLE = [
      { id: '1', name: 'Jan', color: '#3b82f6' },
      { id: '2', name: 'Kevin', color: '#ef4444' },
      { id: '3', name: 'Dom', color: '#10b981' },
      { id: '4', name: 'Stephan', color: '#f59e0b' },
      { id: '5', name: 'David', color: '#8b5cf6' },
      { id: '6', name: 'Niko', color: '#ec4899' },
      { id: '7', name: 'Luki', color: '#06b6d4' },
      { id: '8', name: 'Julian', color: '#f97316' },
      { id: '9', name: 'Florian', color: '#6366f1' },
      { id: '10', name: 'Mike', color: '#84cc16' },
    ];

    const SEED_UNAVAILABILITY = [
      { person_id: '1', date: '2026-05-01' },
      { person_id: '1', date: '2026-05-02' },
      { person_id: '1', date: '2026-05-30' },
      { person_id: '1', date: '2026-06-12' },
      { person_id: '1', date: '2026-07-17' },
      { person_id: '1', date: '2026-08-14' },
      { person_id: '2', date: '2026-05-30' },
      { person_id: '2', date: '2026-06-25' },
      { person_id: '2', date: '2026-08-14' },
      { person_id: '2', date: '2026-09-05' },
      { person_id: '3', date: '2026-05-30' },
      { person_id: '3', date: '2026-08-22' },
    ];

    console.log('Seeding database...');
    for (const person of SEED_PEOPLE) {
      await sql('INSERT INTO people (id, name, color) VALUES ($1, $2, $3)', [person.id, person.name, person.color]);
    }
    for (const entry of SEED_UNAVAILABILITY) {
      await sql('INSERT INTO availability (person_id, date) VALUES ($1, $2)', [entry.person_id, entry.date]);
    }
    console.log('Database seeded successfully.');
  }
}

export default sql;
