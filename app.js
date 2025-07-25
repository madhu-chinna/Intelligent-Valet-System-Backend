const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { open } = require('sqlite');
const cors = require('cors');

const app = express();
const PORT = 3008;
const dbPath = path.join(__dirname, 'valet.db');
let db = null;

app.use(cors());
app.use(express.json());

// Initialize Database and Server
const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    await createTables();
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}/`);
    });
  } catch (e) {
    console.error(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

// Create Tables
const createTables = async () => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS gates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS valet_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      car_info TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sensor_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      ble TEXT,
      wifi TEXT,
      imu TEXT,
      gps TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES valet_tickets(id)
    );
  `);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS dispatches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      gate TEXT NOT NULL,
      score INTEGER NOT NULL,
      status TEXT NOT NULL,
      dispatched_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES valet_tickets(id)
    );
  `);
  // Insert gates if not exist
  const count = await db.get(`SELECT COUNT(*) AS count FROM gates`);
  if (count.count === 0) {
    await db.run(`INSERT INTO gates (name) VALUES ('A'), ('B'), ('C'), ('D')`);
  }
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Create a new valet ticket (car drop-off)
app.post('/api/tickets', async (req, res) => {
  const { userId, carInfo } = req.body;
  if (!userId || !carInfo) return res.status(400).json({ error: 'userId and carInfo required' });
  const now = new Date().toISOString();
  const result = await db.run(
    'INSERT INTO valet_tickets (user_id, car_info, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [userId, carInfo, 'parked', now, now]
  );
  const ticket = await db.get('SELECT * FROM valet_tickets WHERE id = ?', [result.lastID]);
  res.status(201).json(ticket);
});

// User requests car (start sensor data stream)
app.post('/api/tickets/:id/request', async (req, res) => {
  const { id } = req.params;
  const now = new Date().toISOString();
  const ticket = await db.get('SELECT * FROM valet_tickets WHERE id = ?', [id]);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  await db.run('UPDATE valet_tickets SET status = ?, updated_at = ? WHERE id = ?', ['requested', now, id]);
  res.json({ ...ticket, status: 'requested', updated_at: now });
});

// Receive sensor data (simulate BLE/Wi-Fi/IMU/GPS)
app.post('/api/tickets/:id/sensor', async (req, res) => {
  const { id } = req.params;
  const { ble, wifi, imu, gps, timestamp } = req.body;
  const ticket = await db.get('SELECT * FROM valet_tickets WHERE id = ?', [id]);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  await db.run(
    'INSERT INTO sensor_data (ticket_id, ble, wifi, imu, gps, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    [id, JSON.stringify(ble), JSON.stringify(wifi), JSON.stringify(imu), JSON.stringify(gps), timestamp || new Date().toISOString()]
  );
  await db.run('UPDATE valet_tickets SET updated_at = ? WHERE id = ?', [new Date().toISOString(), id]);
  res.json({ success: true });
});

// Run exit gate inference and dispatch logic
app.post('/api/tickets/:id/infer', async (req, res) => {
  const { id } = req.params;
  const ticket = await db.get('SELECT * FROM valet_tickets WHERE id = ?', [id]);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  const gates = await db.all('SELECT name FROM gates');
  // Simulate scoring for each gate (replace with real logic)
  const scores = gates.map(gate => ({
    gate: gate.name,
    score: Math.floor(Math.random() * 100)
  }));
  // Find max score
  const best = scores.reduce((a, b) => (a.score > b.score ? a : b));
  let dispatch = await db.get('SELECT * FROM dispatches WHERE ticket_id = ?', [id]);
  if (best.score > 90 && !dispatch) {
    const now = new Date().toISOString();
    await db.run(
      'INSERT INTO dispatches (ticket_id, gate, score, status, dispatched_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, best.gate, best.score, 'pending', now, now]
    );
    await db.run('UPDATE valet_tickets SET status = ?, updated_at = ? WHERE id = ?', ['dispatched', now, id]);
    dispatch = await db.get('SELECT * FROM dispatches WHERE ticket_id = ?', [id]);
  }
  res.json({ scores, dispatched: !!dispatch, dispatch });
});

// List all dispatches (for valet dashboard)
app.get('/api/dispatches', async (req, res) => {
  const dispatches = await db.all('SELECT * FROM dispatches');
  res.json(dispatches);
});

// Update dispatch status (valet actions)
app.post('/api/dispatches/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const now = new Date().toISOString();
  const dispatch = await db.get('SELECT * FROM dispatches WHERE id = ?', [id]);
  if (!dispatch) return res.status(404).json({ error: 'Dispatch not found' });
  await db.run('UPDATE dispatches SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);
  res.json({ ...dispatch, status, updated_at: now });
});

// List all tickets (for admin/debug)
app.get('/api/tickets', async (req, res) => {
  const tickets = await db.all('SELECT * FROM valet_tickets');
  res.json(tickets);
});

// List all gates
app.get('/api/gates', async (req, res) => {
  const gates = await db.all('SELECT * FROM gates');
  res.json(gates);
});

// List all sensor data for a ticket
app.get('/api/tickets/:id/sensor', async (req, res) => {
  const { id } = req.params;
  const data = await db.all('SELECT * FROM sensor_data WHERE ticket_id = ?', [id]);
  res.json(data);
});

initializeDBAndServer();
