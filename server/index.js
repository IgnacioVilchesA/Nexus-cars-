const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'taller_mecanico',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const mapOrder = async (order) => {
  const [services] = await db.query(
    'SELECT service_name FROM work_order_services WHERE order_id = ? ORDER BY id ASC',
    [order.id]
  );

  return {
    id: order.id,
    clientId: order.client_id,
    vehicleId: order.vehicle_id,
    description: order.description,
    status: order.status,
    services: services.map((service) => service.service_name),
    createdAt: order.created_at ? new Date(order.created_at).toLocaleDateString('es-CL') : '',
    nextMaintenance: order.next_maintenance || 'Por definir',
  };
};

app.get('/api/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, message: 'API conectada a MySQL' });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'No se pudo conectar con MySQL', error: error.message });
  }
});

app.get('/api/users', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM users ORDER BY id ASC');
    res.json(rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      password: row.password,
      role: row.role,
    })));
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { name, email, password, role = 'cliente' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email.trim().toLowerCase(), password, role]
    );

    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    const user = rows[0];

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.role,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear usuario', error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña requeridos' });
    }

    const [rows] = await db.query(
      'SELECT * FROM users WHERE email = ? AND password = ? LIMIT 1',
      [String(email).trim().toLowerCase(), String(password)]
    );

    if (!rows.length) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const user = rows[0];
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.role,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al iniciar sesión', error: error.message });
  }
});

app.get('/api/vehicles', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM vehicles ORDER BY id ASC');
    res.json(rows.map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      type: row.type,
      brand: row.brand,
      model: row.model,
      plate: row.plate,
      year: row.year,
    })));
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener vehículos', error: error.message });
  }
});

app.post('/api/vehicles', async (req, res) => {
  try {
    const { ownerId, type, brand, model, plate, year } = req.body;

    if (!ownerId || !type || !brand || !model || !plate || !year) {
      return res.status(400).json({ message: 'Faltan campos de vehículo' });
    }

    const [result] = await db.query(
      'INSERT INTO vehicles (owner_id, type, brand, model, plate, year) VALUES (?, ?, ?, ?, ?, ?)',
      [ownerId, type, brand, model, plate, year]
    );

    const [rows] = await db.query('SELECT * FROM vehicles WHERE id = ?', [result.insertId]);
    const vehicle = rows[0];

    res.status(201).json({
      id: vehicle.id,
      ownerId: vehicle.owner_id,
      type: vehicle.type,
      brand: vehicle.brand,
      model: vehicle.model,
      plate: vehicle.plate,
      year: vehicle.year,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear vehículo', error: error.message });
  }
});

app.get('/api/orders', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM work_orders ORDER BY id DESC');
    const orders = [];

    for (const order of rows) {
      orders.push(await mapOrder(order));
    }

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener órdenes', error: error.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const {
      clientId,
      vehicleId,
      description,
      status = 'recibido',
      services = [],
      nextMaintenance = 'Por definir',
    } = req.body;

    if (!clientId || !vehicleId || !description) {
      return res.status(400).json({ message: 'Faltan datos para la orden' });
    }

    const [result] = await db.query(
      'INSERT INTO work_orders (client_id, vehicle_id, description, status, next_maintenance) VALUES (?, ?, ?, ?, ?)',
      [clientId, vehicleId, description, status, nextMaintenance]
    );

    if (Array.isArray(services) && services.length) {
      const values = services.filter(Boolean).map((service) => [result.insertId, service]);
      if (values.length) {
        await db.query('INSERT INTO work_order_services (order_id, service_name) VALUES ?', [values]);
      }
    }

    const [rows] = await db.query('SELECT * FROM work_orders WHERE id = ?', [result.insertId]);
    const created = await mapOrder(rows[0]);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear orden', error: error.message });
  }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    if (!status) {
      return res.status(400).json({ message: 'Debe indicar un estado válido' });
    }

    await db.query('UPDATE work_orders SET status = ? WHERE id = ?', [status, id]);
    const [rows] = await db.query('SELECT * FROM work_orders WHERE id = ?', [id]);

    if (!rows.length) {
      return res.status(404).json({ message: 'Orden no encontrada' });
    }

    res.json(await mapOrder(rows[0]));
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar estado', error: error.message });
  }
});

app.get('/api/orders/:id/services', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT service_name FROM work_order_services WHERE order_id = ? ORDER BY id ASC',
      [req.params.id]
    );
    res.json(rows.map((row) => row.service_name));
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener servicios', error: error.message });
  }
});

app.post('/api/orders/:id/services', async (req, res) => {
  try {
    const { service } = req.body;

    if (!service) {
      return res.status(400).json({ message: 'Debe indicar un servicio' });
    }

    await db.query('INSERT INTO work_order_services (order_id, service_name) VALUES (?, ?)', [req.params.id, service]);

    const [rows] = await db.query(
      'SELECT service_name FROM work_order_services WHERE order_id = ? ORDER BY id ASC',
      [req.params.id]
    );

    res.status(201).json(rows.map((row) => row.service_name));
  } catch (error) {
    res.status(500).json({ message: 'Error al agregar servicio', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor API corriendo en http://localhost:${PORT}`);
});
