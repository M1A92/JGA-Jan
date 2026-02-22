import Database from 'better-sqlite3';

const db = new Database('availability.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS availability (
    person_id TEXT NOT NULL,
    date TEXT NOT NULL,
    PRIMARY KEY (person_id, date),
    FOREIGN KEY (person_id) REFERENCES people (id)
  );
`);

// Seed data
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

// Check if data exists
const count = db.prepare('SELECT count(*) as c FROM people').get() as { c: number };

if (count.c === 0) {
  const insertPerson = db.prepare('INSERT INTO people (id, name, color) VALUES (@id, @name, @color)');
  const insertUnavailability = db.prepare('INSERT INTO availability (person_id, date) VALUES (@person_id, @date)');

  const transaction = db.transaction(() => {
    for (const person of SEED_PEOPLE) insertPerson.run(person);
    for (const entry of SEED_UNAVAILABILITY) insertUnavailability.run(entry);
  });

  transaction();
  console.log('Database seeded.');
}

export default db;
