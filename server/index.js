const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : crypto.randomBytes(48).toString('hex'));
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:4200';
const COOKIE_NAME = 'nexus_session';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET debe configurarse con al menos 32 caracteres en server/.env');
}
if (!process.env.JWT_SECRET) console.warn('JWT_SECRET no está configurado: se generó una clave temporal para desarrollo. Las sesiones se cerrarán al reiniciar la API.');

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] }));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));

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

const cleanText = (value, max) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
const cleanRut = (value) => String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
const validRut = (value) => {
  return /^\d{7,8}[0-9K]$/.test(cleanRut(value));
};
const validName = (value) => { const names = cleanText(value, 100).split(' ').filter(Boolean); return names.length >= 2 && names.every(name => /^[A-Za-zÃÃ‰ÃÃ“ÃšÃœÃ‘Ã¡Ã©Ã­Ã³ÃºÃ¼Ã±'â€™-]{2,}$/.test(name)); };
const validPhone = (value) => /^(?:\+?56)?9\d{8}$/.test(String(value || '').replace(/[\s-]/g, ''));
const mapUser = (row) => ({ id: row.id, name: row.name, email: row.email, role: row.role, rut: row.rut || '', phone: row.phone || '', alternatePhone: row.alternate_phone || '', dataConsent: Boolean(row.data_consent), consentAt: row.consent_at || null, active: row.active !== 0, forcePasswordChange: Boolean(row.force_password_change) });
const mapVehicle = (row) => ({ id: row.id, ownerId: row.owner_id, type: row.type, brand: row.brand, model: row.model, plate: row.plate, year: row.year, active: row.active !== 0 });
const mapSparePart = (row) => ({ id: row.id, name: row.name, code: row.code, category: row.category, price: Number(row.price) || 0, stock: Number(row.stock) || 0, stockMinimo: Number(row.stock_minimo) || 0, supplier: row.supplier || '', active: row.active !== 0 });
const audit = async (userId, action, entity, entityId, detail = '') => {
  await db.query('INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)', [userId || null, action, entity, entityId || null, detail]);
};
const sessionCookie = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000, path: '/' };
const signSession = (user) => jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '8h', issuer: 'nexus-cars', audience: 'nexus-cars-web' });
const optionalAuth = (req, _res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next();
  try { req.user = jwt.verify(token, JWT_SECRET, { issuer: 'nexus-cars', audience: 'nexus-cars-web' }); } catch { req.invalidSession = true; }
  next();
};
const requireAuth = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Debes iniciar sesiÃ³n.' });
  try {
    const [rows] = await db.query('SELECT id, role, active FROM users WHERE id = ? LIMIT 1', [req.user.sub]);
    if (!rows.length || !rows[0].active || rows[0].role !== req.user.role) {
      res.clearCookie(COOKIE_NAME, sessionCookie);
      return res.status(401).json({ message: 'La sesiÃ³n ya no es vÃ¡lida.' });
    }
    req.auth = { id: rows[0].id, role: rows[0].role };
    if (req.body) req.body.actorId = req.auth.id;
    req.query.actorId = req.auth.id;
    next();
  } catch { return res.status(500).json({ message: 'No se pudo validar la sesiÃ³n.' }); }
};
const requireRoles = (...roles) => (req, res, next) => roles.includes(req.auth?.role) ? next() : res.status(403).json({ message: 'No tienes permisos para realizar esta acciÃ³n.' });
const canAccessVehicle = async (vehicleId, auth) => {
  if (['admin', 'recepcionista'].includes(auth.role)) return true;
  const [rows] = await db.query('SELECT owner_id FROM vehicles WHERE id = ? LIMIT 1', [vehicleId]);
  return auth.role === 'cliente' && rows.length && Number(rows[0].owner_id) === Number(auth.id);
};
const canAccessOrder = async (orderId, auth) => {
  if (['admin', 'recepcionista'].includes(auth.role)) return true;
  const [rows] = await db.query('SELECT client_id, mechanic_id FROM work_orders WHERE id = ? LIMIT 1', [orderId]);
  if (!rows.length) return false;
  return auth.role === 'cliente' ? Number(rows[0].client_id) === Number(auth.id) : Number(rows[0].mechanic_id) === Number(auth.id);
};

const mapOrder = async (order) => {
  const [services] = await db.query(
    'SELECT service_name FROM work_order_services WHERE order_id = ? ORDER BY id ASC',
    [order.id]
  );
  const [mechanicRows] = await db.query('SELECT * FROM work_order_mechanic_data WHERE order_id = ?', [order.id]);
  const mechanic = mechanicRows[0] || {};
  const parseJson = (value) => {
    try { return value ? JSON.parse(value) : []; } catch { return []; }
  };

  return {
    id: order.id,
    clientId: order.client_id,
    vehicleId: order.vehicle_id,
    description: order.description,
    status: order.status,
    services: services.map((service) => service.service_name),
    createdAt: order.created_at ? new Date(order.created_at).toLocaleDateString('es-CL') : '',
    nextMaintenance: order.next_maintenance || 'Por definir',
    quoteStatus: order.quote_status || 'pendiente',
    quoteTotal: order.quote_total ? Number(order.quote_total) : 0,
    entryMileage: order.entry_mileage ?? null,
    fuelLevel: order.fuel_level || '',
    receptionNotes: order.reception_notes || '',
    damages: order.damages || '',
    leftItems: order.left_items || '',
    receptionPhotos: parseJson(order.reception_photos),
    estimatedDate: order.estimated_date || '',
    appointmentAt: order.appointment_at || '',
    mechanicId: order.mechanic_id ?? null,
    recepcionistaId: order.recepcionista_id ?? null,
    assignedMechanic: order.assigned_mechanic || mechanic.assigned_mechanic || '',
    totalFinal: order.total_final ? Number(order.total_final) : null,
    quoteVersion: Number(order.quote_version) || 1,
    diagnosis: mechanic.diagnosis || '',
    observations: mechanic.observations || '',
    failures: parseJson(mechanic.failures),
    repairs: parseJson(mechanic.repairs),
    parts: parseJson(mechanic.parts),
    laborHours: Number(mechanic.labor_hours) || 0,
    tests: parseJson(mechanic.tests),
    cost: Number(mechanic.cost) || 0,
    evidence: parseJson(mechanic.evidence),
  };
};

// Todas las rutas de datos requieren una sesiÃ³n vÃ¡lida. El registro de clientes y el login son las Ãºnicas excepciones pÃºblicas.
app.use('/api', optionalAuth, (req, res, next) => {
  if (req.path === '/health' || req.path === '/login') return next();
  if (req.path === '/users' && req.method === 'POST' && (!req.body?.role || req.body.role === 'cliente')) return next();
  return requireAuth(req, res, next);
});

app.get('/api/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, message: 'API conectada a MySQL' });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'No se pudo conectar con MySQL' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    let rows;
    if (['admin', 'recepcionista'].includes(req.auth.role)) [rows] = await db.query('SELECT * FROM users ORDER BY id ASC');
    else [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.auth.id]);
    res.json(rows.map(mapUser));
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { name, email, password, role = 'cliente', rut, phone, alternatePhone, dataConsent, forcePasswordChange = false } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
      return res.status(400).json({ message: 'La contraseña debe tener entre 12 y 128 caracteres.' });
    }
    if (!['admin', 'mecanico', 'recepcionista', 'cliente'].includes(role)) {
      return res.status(400).json({ message: 'El rol solicitado no es vÃ¡lido.' });
    }
    if (role === 'admin' || role === 'mecanico' || role === 'recepcionista') {
      const [actors] = await db.query('SELECT role FROM users WHERE id = ? AND active = 1', [req.body.actorId]);
      if (!actors.length || actors[0].role !== 'admin') {
        return res.status(403).json({ message: 'Solo administraciÃ³n puede crear cuentas internas.' });
      }
    }

    const normalizedEmail = cleanText(email, 150).toLowerCase();
    const normalizedName = cleanText(name, 100);
    const normalizedRut = rut ? cleanRut(rut) : null;
    if (role === 'cliente' && rut !== undefined && (!validName(normalizedName) || !validRut(normalizedRut) || !validPhone(phone) || !dataConsent)) {
      return res.status(400).json({ message: 'Los datos del cliente no cumplen las validaciones de recepciÃ³n.' });
    }
    if (normalizedRut) {
      const [existingRut] = await db.query('SELECT id FROM users WHERE rut = ? LIMIT 1', [normalizedRut]);
      if (existingRut.length) return res.status(409).json({ message: 'El RUT ya estÃ¡ registrado.' });
    }
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role, rut, phone, alternate_phone, data_consent, consent_at, force_password_change, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [normalizedName, normalizedEmail, await bcrypt.hash(password, 12), role, normalizedRut, phone ? String(phone).replace(/[\s-]/g, '') : null, alternatePhone ? String(alternatePhone).replace(/[\s-]/g, '') : null, Boolean(dataConsent), dataConsent ? new Date() : null, Boolean(forcePasswordChange), true]
    );

    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    const user = rows[0];
    await audit(req.body.actorId, 'CREAR', role.toUpperCase(), user.id, `Cuenta ${user.email}`);
    res.status(201).json(mapUser(user));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ya existe una cuenta con ese correo' });
    res.status(500).json({ message: 'Error al crear usuario' });
  }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    if (!['admin', 'recepcionista'].includes(req.auth.role) && Number(req.params.id) !== Number(req.auth.id)) return res.status(403).json({ message: 'No puedes modificar otro perfil.' });
    const { name, email, rut, phone, alternatePhone, dataConsent } = req.body;
    if (!name || !email) return res.status(400).json({ message: 'Nombre y correo son obligatorios' });
    const normalizedRut = rut ? cleanRut(rut) : null;
    if (rut !== undefined && !validRut(normalizedRut)) return res.status(400).json({ message: 'RUT invÃ¡lido' });
    if (phone !== undefined && !validPhone(phone)) return res.status(400).json({ message: 'Celular invÃ¡lido' });
    if (alternatePhone && !validPhone(alternatePhone)) return res.status(400).json({ message: 'TelÃ©fono alternativo invÃ¡lido' });
    if (normalizedRut) { const [sameRut] = await db.query('SELECT id FROM users WHERE rut = ? AND id <> ? LIMIT 1', [normalizedRut, req.params.id]); if (sameRut.length) return res.status(409).json({ message: 'El RUT ya estÃ¡ registrado.' }); }
    await db.query('UPDATE users SET name=?, email=?, rut=?, phone=?, alternate_phone=?, data_consent=?, consent_at=IF(?, COALESCE(consent_at, NOW()), NULL) WHERE id=?', [cleanText(name, 100), cleanText(email, 150).toLowerCase(), normalizedRut, phone ? String(phone).replace(/[\s-]/g, '') : null, alternatePhone ? String(alternatePhone).replace(/[\s-]/g, '') : null, Boolean(dataConsent), Boolean(dataConsent), req.params.id]);
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Usuario no encontrado' });
    await audit(req.body.actorId, 'EDITAR', 'CLIENTE', req.params.id, 'Datos de cliente actualizados');
    res.json(mapUser(rows[0]));
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar perfil' });
  }
});

app.patch('/api/users/:id/password', async (req, res) => {
  try {
    const { password, actorId } = req.body;
    if (String(actorId) !== String(req.params.id)) return res.status(403).json({ message: 'No autorizado.' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ message: 'La contraseÃ±a debe tener entre 8 y 128 caracteres.' });
    await db.query('UPDATE users SET password=?, force_password_change=0 WHERE id=?', [await bcrypt.hash(password, 12), req.params.id]);
    const [rows] = await db.query('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Usuario no encontrado.' });
    await audit(req.params.id, 'CAMBIAR_CONTRASENA', 'USUARIO', req.params.id, 'Cambio obligatorio de contraseÃ±a temporal');
    res.json(mapUser(rows[0]));
  } catch (error) { res.status(500).json({ message: 'Error al cambiar la contraseÃ±a' }); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const [actors] = await db.query('SELECT role FROM users WHERE id = ?', [req.query.actorId]);
    if (!actors.length || actors[0].role !== 'admin') return res.status(403).json({ message: 'Solo administraciÃ³n puede eliminar clientes.' });
    await db.query('UPDATE users SET active = 0 WHERE id = ?', [req.params.id]);
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Cliente no encontrado' });
    await audit(req.query.actorId, 'DESACTIVAR', 'CLIENTE', req.params.id, 'Cliente desactivado; se preserva su historial');
    res.json(mapUser(rows[0]));
  } catch (error) { res.status(500).json({ message: 'Error al eliminar cliente' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseÃ±a requeridos' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [accounts] = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
    const account = accounts[0];
    const passwordMatches = account?.active && await bcrypt.compare(String(password), account.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }
    const user = account;
    await audit(user.id, 'INICIAR_SESION', 'USUARIO', user.id, 'Inicio de sesiÃ³n correcto');
    res.cookie(COOKIE_NAME, signSession(user), sessionCookie);
    res.json(mapUser(user));
  } catch (error) {
    res.status(500).json({ message: 'Error al iniciar sesiÃ³n' });
  }
});

app.post('/api/logout', async (req, res) => {
  await audit(req.auth.id, 'CERRAR_SESION', 'USUARIO', req.auth.id, 'Cierre de sesiÃ³n');
  res.clearCookie(COOKIE_NAME, sessionCookie);
  res.status(204).send();
});

app.post('/api/audit/exports', requireRoles('admin'), async (req, res) => {
  const report = cleanText(req.body.report || 'Reporte administrativo', 100);
  await audit(req.auth.id, 'EXPORTAR', 'REPORTE', null, report);
  res.status(204).send();
});

app.get('/api/vehicles', async (req, res) => {
  try {
    let rows;
    if (['admin', 'recepcionista'].includes(req.auth.role)) [rows] = await db.query('SELECT * FROM vehicles ORDER BY id ASC');
    else if (req.auth.role === 'cliente') [rows] = await db.query('SELECT * FROM vehicles WHERE owner_id = ? ORDER BY id ASC', [req.auth.id]);
    else [rows] = await db.query('SELECT DISTINCT v.* FROM vehicles v JOIN work_orders o ON o.vehicle_id = v.id WHERE o.mechanic_id = ? ORDER BY v.id ASC', [req.auth.id]);
    res.json(rows.map(mapVehicle));
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener vehÃ­culos' });
  }
});

app.post('/api/vehicles', async (req, res) => {
  try {
    const { ownerId, type, brand, model, plate, year } = req.body;

    if (!ownerId || !type || !brand || !model || !plate || !year) {
      return res.status(400).json({ message: 'Faltan campos de vehÃ­culo' });
    }

    if (!['admin', 'recepcionista'].includes(req.auth.role) && !(req.auth.role === 'cliente' && Number(ownerId) === Number(req.auth.id))) return res.status(403).json({ message: 'No puedes crear vehÃ­culos para otro usuario.' });
    const normalizedPlate = String(plate).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const plateRule = type === 'Moto' ? /^(?:[A-HJ-NPR-Z]{2}\d{4}|[A-HJ-NPR-Z]{3}\d{2}|[A-HJ-NPR-Z]{2}\d{3})$/ : /^(?:[A-HJ-NPR-Z]{2}\d{4}|[A-HJ-NPR-Z]{4}\d{2})$/;
    if (!plateRule.test(normalizedPlate) || Number(year) < 1950 || Number(year) > new Date().getFullYear() + 1) return res.status(400).json({ message: 'Patente o aÃ±o de vehÃ­culo invÃ¡lidos.' });
    const [result] = await db.query('INSERT INTO vehicles (owner_id, type, brand, model, plate, year, active) VALUES (?, ?, ?, ?, ?, ?, ?)', [ownerId, type, cleanText(brand, 50), cleanText(model, 80), normalizedPlate, year, true]);

    const [rows] = await db.query('SELECT * FROM vehicles WHERE id = ?', [result.insertId]);
    const vehicle = rows[0];
    await audit(req.body.actorId, 'CREAR', 'VEHICULO', vehicle.id, `Patente ${vehicle.plate}`);
    res.status(201).json(mapVehicle(vehicle));
  } catch (error) {
    res.status(500).json({ message: 'Error al crear vehÃ­culo' });
  }
});

app.patch('/api/vehicles/:id', async (req, res) => {
  try {
    const { ownerId, type, brand, model, plate, year } = req.body;
    if (!ownerId || !type || !brand || !model || !plate || !year) return res.status(400).json({ message: 'Complete los datos del vehÃ­culo' });
    if (!await canAccessVehicle(req.params.id, req.auth)) return res.status(403).json({ message: 'No tienes acceso a este vehÃ­culo.' });
    if (req.auth.role === 'cliente' && Number(ownerId) !== Number(req.auth.id)) return res.status(403).json({ message: 'No puedes transferir vehÃ­culos.' });
    const [existing] = await db.query('SELECT owner_id FROM vehicles WHERE id=?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'VehÃ­culo no encontrado' });
    if (Number(existing[0].owner_id) !== Number(ownerId) && !req.body.confirmOwnerChange) return res.status(409).json({ message: 'Confirma el cambio de propietario antes de guardar.' });
    await db.query('UPDATE vehicles SET owner_id=?, type=?, brand=?, model=?, plate=?, year=? WHERE id=?', [ownerId, type, cleanText(brand, 50), cleanText(model, 80), String(plate).toUpperCase().replace(/[^A-Z0-9]/g, ''), year, req.params.id]);
    const [rows] = await db.query('SELECT * FROM vehicles WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'VehÃ­culo no encontrado' });
    await audit(req.body.actorId, 'EDITAR', 'VEHICULO', req.params.id, 'Datos de vehÃ­culo actualizados');
    res.json(mapVehicle(rows[0]));
  } catch (error) { res.status(500).json({ message: 'Error al actualizar vehÃ­culo' }); }
});

app.delete('/api/vehicles/:id', async (req, res) => {
  try {
    const [actors] = await db.query('SELECT role FROM users WHERE id = ?', [req.query.actorId]);
    if (!actors.length || actors[0].role !== 'admin') return res.status(403).json({ message: 'Solo administraciÃ³n puede eliminar vehÃ­culos.' });
    await db.query('UPDATE vehicles SET active = 0 WHERE id=?', [req.params.id]);
    const [rows] = await db.query('SELECT * FROM vehicles WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'VehÃ­culo no encontrado' });
    await audit(req.query.actorId, 'DESACTIVAR', 'VEHICULO', req.params.id, 'VehÃ­culo desactivado; se preserva su historial');
    res.json(mapVehicle(rows[0]));
  }
  catch (error) { res.status(500).json({ message: 'Error al eliminar vehÃ­culo' }); }
});

app.use('/api/spare-parts', requireRoles('admin', 'mecanico', 'recepcionista'));

app.get('/api/spare-parts', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM spare_parts WHERE active = 1 ORDER BY id ASC');
    res.json(rows.map(mapSparePart));
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener repuestos' });
  }
});

app.post('/api/spare-parts', async (req, res) => {
  try {
    const { name, code, category = 'Mantenimiento', price = 0, stock = 0, stockMinimo = 1, supplier = '', active = true } = req.body;
    if (!name || !code) return res.status(400).json({ message: 'Nombre y cÃ³digo del repuesto son obligatorios.' });
    const [actors] = await db.query('SELECT role FROM users WHERE id = ? AND active = 1', [req.body.actorId]);
    if (!actors.length || actors[0].role !== 'admin') return res.status(403).json({ message: 'Solo administraciÃ³n puede crear repuestos.' });
    if (!Number.isInteger(Number(stock)) || Number(stock) < 0) return res.status(400).json({ message: 'El stock debe ser un entero no negativo.' });

    const [result] = await db.query(
      'INSERT INTO spare_parts (name, code, category, price, stock, stock_minimo, supplier, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [cleanText(name, 150), String(code).trim().toUpperCase(), cleanText(category, 80), Number(price) || 0, Number(stock) || 0, Number(stockMinimo) || 0, cleanText(supplier, 120), Boolean(active)]
    );

    if (Number(stock) > 0) {
      await db.query(
        'INSERT INTO stock_movements (spare_part_id, user_id, type, quantity, stock_before, stock_after, supplier, reference) VALUES (?, ?, \'entrada\', ?, 0, ?, ?, \'Stock inicial\')',
        [result.insertId, req.body.actorId, Number(stock), Number(stock), cleanText(supplier, 120)]
      );
    }

    const [rows] = await db.query('SELECT * FROM spare_parts WHERE id = ?', [result.insertId]);
    await audit(req.body.actorId, 'CREAR', 'REPUESTO', result.insertId, `Repuesto ${code}`);
    res.status(201).json(mapSparePart(rows[0]));
  } catch (error) {
    res.status(500).json({ message: 'Error al crear repuesto' });
  }
});

app.patch('/api/spare-parts/:id', async (req, res) => {
  try {
    const { name, code, category, price, stock, stockMinimo, supplier, active } = req.body;
    const [actors] = await db.query('SELECT role FROM users WHERE id = ? AND active = 1', [req.body.actorId]);
    if (!actors.length || actors[0].role !== 'admin') return res.status(403).json({ message: 'Solo administraciÃ³n puede modificar el catÃ¡logo.' });
    const [currentRows] = await db.query('SELECT * FROM spare_parts WHERE id = ?', [req.params.id]);
    if (!currentRows.length) return res.status(404).json({ message: 'Repuesto no encontrado.' });
    if (stock !== undefined && (!Number.isInteger(Number(stock)) || Number(stock) < 0)) return res.status(400).json({ message: 'El stock debe ser un entero no negativo.' });
    if (price !== undefined && (!Number.isFinite(Number(price)) || Number(price) < 0)) return res.status(400).json({ message: 'El precio no puede ser negativo.' });
    const updateFields = [];
    const params = [];

    if (name !== undefined) { updateFields.push('name = ?'); params.push(cleanText(name, 150)); }
    if (code !== undefined) { updateFields.push('code = ?'); params.push(String(code).trim().toUpperCase()); }
    if (category !== undefined) { updateFields.push('category = ?'); params.push(cleanText(category, 80)); }
    if (price !== undefined) { updateFields.push('price = ?'); params.push(Number(price) || 0); }
    if (stock !== undefined) { updateFields.push('stock = ?'); params.push(Number(stock) || 0); }
    if (stockMinimo !== undefined) { updateFields.push('stock_minimo = ?'); params.push(Number(stockMinimo) || 0); }
    if (supplier !== undefined) { updateFields.push('supplier = ?'); params.push(cleanText(supplier, 120)); }
    if (active !== undefined) { updateFields.push('active = ?'); params.push(Boolean(active)); }

    if (!updateFields.length) return res.status(400).json({ message: 'No hay cambios para guardar' });

    params.push(req.params.id);
    await db.query(`UPDATE spare_parts SET ${updateFields.join(', ')} WHERE id = ?`, params);

    const [rows] = await db.query('SELECT * FROM spare_parts WHERE id = ?', [req.params.id]);
    if (stock !== undefined && Number(currentRows[0].stock) !== Number(rows[0].stock)) {
      await db.query(
        'INSERT INTO stock_movements (spare_part_id, user_id, type, quantity, stock_before, stock_after, supplier, reference) VALUES (?, ?, \'ajuste\', ?, ?, ?, ?, \'Ajuste manual de administraciÃ³n\')',
        [req.params.id, req.body.actorId, Math.abs(Number(rows[0].stock) - Number(currentRows[0].stock)), Number(currentRows[0].stock), Number(rows[0].stock), rows[0].supplier || '']
      );
    }
    await audit(req.body.actorId, 'EDITAR', 'REPUESTO', req.params.id, 'Ficha o stock actualizado');
    res.json(mapSparePart(rows[0]));
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar repuesto' });
  }
});

app.patch('/api/spare-parts/:id/consume', async (req, res) => {
  const connection = await db.getConnection();
  let transactionStarted = false;
  try {
    const quantity = Number(req.body.quantity);
    const actorId = Number(req.body.actorId);
    if (!Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ message: 'La cantidad a descontar debe ser un entero mayor que cero.' });
    const [actors] = await connection.query('SELECT role FROM users WHERE id = ? AND active = 1', [actorId]);
    if (!actors.length || !['admin', 'mecanico'].includes(actors[0].role)) {
      return res.status(403).json({ message: 'Solo un mecÃ¡nico o administraciÃ³n puede registrar salidas.' });
    }

    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query('SELECT * FROM spare_parts WHERE id = ? AND active = 1 FOR UPDATE', [req.params.id]);
    if (!rows.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Repuesto no encontrado.' });
    }
    const part = rows[0];
    const stockBefore = Number(part.stock);
    if (stockBefore < quantity) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(409).json({ message: `Stock insuficiente. Disponible: ${stockBefore}.` });
    }
    const stockAfter = stockBefore - quantity;
    await connection.query('UPDATE spare_parts SET stock = ? WHERE id = ?', [stockAfter, req.params.id]);
    await connection.query(
      'INSERT INTO stock_movements (spare_part_id, user_id, order_id, type, quantity, stock_before, stock_after, reference) VALUES (?, ?, ?, \'salida\', ?, ?, ?, ?)',
      [req.params.id, actorId, req.body.orderId || null, quantity, stockBefore, stockAfter, req.body.orderId ? `Orden #${req.body.orderId}` : 'Consumo de taller']
    );
    const [updatedRows] = await connection.query('SELECT * FROM spare_parts WHERE id = ?', [req.params.id]);
    await connection.commit();
    transactionStarted = false;
    res.json(mapSparePart(updatedRows[0]));
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    res.status(500).json({ message: 'Error al consumir stock del repuesto' });
  } finally {
    connection.release();
  }
});

app.delete('/api/spare-parts/:id', async (req, res) => {
  try {
    const [actors] = await db.query('SELECT role FROM users WHERE id = ? AND active = 1', [req.query.actorId]);
    if (!actors.length || actors[0].role !== 'admin') return res.status(403).json({ message: 'Solo administraciÃ³n puede desactivar repuestos.' });
    await db.query('UPDATE spare_parts SET active = 0 WHERE id = ?', [req.params.id]);
    const [rows] = await db.query('SELECT * FROM spare_parts WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Repuesto no encontrado' });
    await audit(req.query.actorId, 'DESACTIVAR', 'REPUESTO', req.params.id, 'Repuesto desactivado; se preservan movimientos');
    res.json(mapSparePart(rows[0]));
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar repuesto' });
  }
});

app.get('/api/stock-movements', async (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100000) : 500;
    const [actors] = await db.query('SELECT role FROM users WHERE id = ? AND active = 1', [req.query.actorId]);
    if (!actors.length || !['admin', 'recepcionista'].includes(actors[0].role)) {
      return res.status(403).json({ message: 'Solo administraciÃ³n o recepciÃ³n puede consultar los movimientos.' });
    }
    const [rows] = await db.query(`
      SELECT m.id, m.spare_part_id, p.name AS part_name, p.code AS part_code,
        m.user_id, u.name AS user_name, m.order_id, m.type, m.quantity,
        m.stock_before, m.stock_after, m.supplier, m.reference, m.created_at
      FROM stock_movements m
      JOIN spare_parts p ON p.id = m.spare_part_id
      LEFT JOIN users u ON u.id = m.user_id
      ORDER BY m.id DESC LIMIT ${limit}
    `);
    res.json(rows.map((row) => ({
      id: row.id, sparePartId: row.spare_part_id, partName: row.part_name,
      partCode: row.part_code, userId: row.user_id, userName: row.user_name || '',
      orderId: row.order_id, type: row.type, quantity: row.quantity,
      stockBefore: row.stock_before, stockAfter: row.stock_after,
      supplier: row.supplier || '', reference: row.reference || '',
      createdAt: row.created_at
    })));
  } catch (error) {
    res.status(500).json({ message: 'Error al consultar movimientos de inventario' });
  }
});

app.post('/api/spare-parts/:id/receive', async (req, res) => {
  const connection = await db.getConnection();
  let transactionStarted = false;
  try {
    const quantity = Number(req.body.quantity);
    const actorId = Number(req.body.actorId);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ message: 'La cantidad recibida debe ser un entero mayor que cero.' });
    }
    const [actors] = await connection.query('SELECT role FROM users WHERE id = ? AND active = 1', [actorId]);
    if (!actors.length || !['admin', 'recepcionista'].includes(actors[0].role)) {
      return res.status(403).json({ message: 'Solo administraciÃ³n o recepciÃ³n puede registrar entradas de stock.' });
    }

    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query('SELECT * FROM spare_parts WHERE id = ? AND active = 1 FOR UPDATE', [req.params.id]);
    if (!rows.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: 'Repuesto no encontrado.' });
    }
    const part = rows[0];
    const stockBefore = Number(part.stock);
    const stockAfter = stockBefore + quantity;
    const supplier = cleanText(req.body.supplier || part.supplier, 120);
    const reference = cleanText(req.body.reference, 120);
    await connection.query('UPDATE spare_parts SET stock = ?, supplier = COALESCE(NULLIF(?, \'\'), supplier) WHERE id = ?', [stockAfter, supplier, req.params.id]);
    await connection.query(
      'INSERT INTO stock_movements (spare_part_id, user_id, type, quantity, stock_before, stock_after, supplier, reference) VALUES (?, ?, \'entrada\', ?, ?, ?, ?, ?)',
      [req.params.id, actorId, quantity, stockBefore, stockAfter, supplier, reference]
    );
    const [updatedRows] = await connection.query('SELECT * FROM spare_parts WHERE id = ?', [req.params.id]);
    await connection.commit();
    transactionStarted = false;
    res.json(mapSparePart(updatedRows[0]));
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    res.status(500).json({ message: 'Error al registrar la entrada de stock' });
  } finally {
    connection.release();
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    let rows;
    if (['admin', 'recepcionista'].includes(req.auth.role)) [rows] = await db.query('SELECT * FROM work_orders ORDER BY id DESC');
    else if (req.auth.role === 'cliente') [rows] = await db.query('SELECT * FROM work_orders WHERE client_id = ? ORDER BY id DESC', [req.auth.id]);
    else [rows] = await db.query('SELECT * FROM work_orders WHERE mechanic_id = ? ORDER BY id DESC', [req.auth.id]);
    const orders = [];

    for (const order of rows) {
      orders.push(await mapOrder(order));
    }

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener Ã³rdenes' });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const {
      clientId,
      vehicleId,
      description,
      status = 'solicitada',
      services = [],
      nextMaintenance = 'Por definir',
      entryMileage = null,
      fuelLevel = null,
      receptionNotes = null,
      mechanicId = null,
      recepcionistaId = null,
      assignedMechanic = null,
      totalFinal = null,
      damages = null, leftItems = null, receptionPhotos = [], estimatedDate = null, appointmentAt = null,
    } = req.body;

    if (!clientId || !vehicleId || !description) {
      return res.status(400).json({ message: 'Faltan datos para la orden' });
    }
    if (!['admin', 'recepcionista', 'cliente'].includes(req.auth.role)) return res.status(403).json({ message: 'No tienes permisos para crear Ã³rdenes.' });
    if (req.auth.role === 'cliente' && (Number(clientId) !== Number(req.auth.id) || !await canAccessVehicle(vehicleId, req.auth))) return res.status(403).json({ message: 'Solo puedes crear Ã³rdenes para tus propios vehÃ­culos.' });
    const normalizedDescription = cleanText(description, 500);
    if (status === 'solicitada' && appointmentAt) {
      if (normalizedDescription.length < 5 || new Date(appointmentAt).getTime() <= Date.now()) return res.status(400).json({ message: 'La cita requiere motivo vÃ¡lido y fecha futura.' });
      const [conflicts] = await db.query('SELECT id FROM work_orders WHERE status = ? AND appointment_at = ? LIMIT 1', ['solicitada', appointmentAt]);
      if (conflicts.length) return res.status(409).json({ message: 'Ya existe una cita en ese horario.' });
    }
    if (status !== 'solicitada') {
      if (normalizedDescription.length < 10 || !Number.isInteger(Number(entryMileage)) || Number(entryMileage) < 0 || Number(entryMileage) > 2000000 || !fuelLevel || (!damages && !String(receptionNotes || '').includes('Sin daÃ±os')) || !estimatedDate || estimatedDate < new Date().toISOString().slice(0, 10)) return res.status(400).json({ message: 'La ficha de recepciÃ³n contiene datos invÃ¡lidos o incompletos.' });
      const [activeOrders] = await db.query("SELECT id FROM work_orders WHERE vehicle_id = ? AND status NOT IN ('solicitada','listo','listo_para_entrega','entregado','cerrado','cancelado') LIMIT 1", [vehicleId]);
      if (activeOrders.length) return res.status(409).json({ message: 'El vehÃ­culo ya tiene un ingreso activo.' });
    }

    const [result] = await db.query(
      'INSERT INTO work_orders (client_id, vehicle_id, description, status, next_maintenance, entry_mileage, fuel_level, reception_notes, mechanic_id, recepcionista_id, assigned_mechanic, total_final, damages, left_items, reception_photos, estimated_date, appointment_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [clientId, vehicleId, normalizedDescription, status, nextMaintenance, entryMileage, fuelLevel, receptionNotes, mechanicId, recepcionistaId, assignedMechanic, totalFinal, damages, leftItems, JSON.stringify(receptionPhotos), estimatedDate, appointmentAt]
    );

    if (Array.isArray(services) && services.length) {
      const values = services.filter(Boolean).map((service) => [result.insertId, service]);
      if (values.length) {
        await db.query('INSERT INTO work_order_services (order_id, service_name) VALUES ?', [values]);
      }
    }

    const [rows] = await db.query('SELECT * FROM work_orders WHERE id = ?', [result.insertId]);
    const created = await mapOrder(rows[0]);
    await audit(recepcionistaId, 'CREAR', status === 'solicitada' ? 'CITA' : 'ORDEN', created.id, `Estado inicial: ${status}`);
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear orden' });
  }
});

app.patch('/api/orders/:id', async (req, res) => {
  const connection = await db.getConnection();
  let transactionStarted = false;
  try {
    const [actors] = await connection.query('SELECT role FROM users WHERE id = ? AND active = 1', [req.body.actorId]);
    if (!actors.length || actors[0].role !== 'admin') return res.status(403).json({ message: 'Solo administraciÃ³n puede editar Ã³rdenes.' });
    const { clientId, vehicleId, description, status, services, nextMaintenance } = req.body;
    const [existing] = await connection.query('SELECT id FROM work_orders WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Orden no encontrada.' });
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.query(
      'UPDATE work_orders SET client_id = ?, vehicle_id = ?, description = ?, status = ?, next_maintenance = ? WHERE id = ?',
      [clientId, vehicleId, cleanText(description, 500), status, cleanText(nextMaintenance || 'Por definir', 50), req.params.id]
    );
    if (Array.isArray(services)) {
      await connection.query('DELETE FROM work_order_services WHERE order_id = ?', [req.params.id]);
      const values = services.map((service) => cleanText(service, 150)).filter(Boolean).map((service) => [req.params.id, service]);
      if (values.length) await connection.query('INSERT INTO work_order_services (order_id, service_name) VALUES ?', [values]);
    }
    const [rows] = await connection.query('SELECT * FROM work_orders WHERE id = ?', [req.params.id]);
    await connection.commit();
    transactionStarted = false;
    await audit(req.body.actorId, 'EDITAR', 'ORDEN', req.params.id, 'Orden actualizada por administraciÃ³n');
    res.json(await mapOrder(rows[0]));
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    res.status(500).json({ message: 'Error al actualizar la orden' });
  } finally {
    connection.release();
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    const [actors] = await db.query('SELECT role FROM users WHERE id = ? AND active = 1', [req.query.actorId]);
    if (!actors.length || actors[0].role !== 'admin') return res.status(403).json({ message: 'Solo administraciÃ³n puede eliminar Ã³rdenes.' });
    const [result] = await db.query('DELETE FROM work_orders WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Orden no encontrada.' });
    await audit(req.query.actorId, 'ELIMINAR', 'ORDEN', req.params.id, 'Orden eliminada por administraciÃ³n');
    res.json({ id: Number(req.params.id), deleted: true });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar la orden' });
  }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status, entryMileage, fuelLevel, receptionNotes, assignedMechanic, mechanicId, recepcionistaId, totalFinal, quoteStatus, damages, leftItems, receptionPhotos, estimatedDate, appointmentAt } = req.body;
    const { id } = req.params;

    if (!await canAccessOrder(id, req.auth)) return res.status(403).json({ message: 'No tienes acceso a esta orden.' });
    if (req.auth.role === 'cliente' && (!quoteStatus || Object.keys(req.body).some((key) => !['quoteStatus', 'actorId'].includes(key)))) return res.status(403).json({ message: 'Solo puedes responder una cotizaciÃ³n.' });

    if (!status) {
      return res.status(400).json({ message: 'Debe indicar un estado vÃ¡lido' });
    }

    const updates = ['status = ?'];
    const params = [status];

    if (entryMileage !== undefined) {
      updates.push('entry_mileage = ?');
      params.push(entryMileage);
    }
    if (fuelLevel !== undefined) {
      updates.push('fuel_level = ?');
      params.push(fuelLevel);
    }
    if (receptionNotes !== undefined) {
      updates.push('reception_notes = ?');
      params.push(receptionNotes);
    }
    if (assignedMechanic !== undefined) {
      updates.push('assigned_mechanic = ?');
      params.push(assignedMechanic);
    }
    if (mechanicId !== undefined) {
      updates.push('mechanic_id = ?');
      params.push(mechanicId);
    }
    if (recepcionistaId !== undefined) {
      updates.push('recepcionista_id = ?');
      params.push(recepcionistaId);
    }
    if (totalFinal !== undefined) {
      updates.push('total_final = ?');
      params.push(totalFinal);
    }
    if (quoteStatus !== undefined) {
      updates.push('quote_status = ?');
      params.push(quoteStatus);
    }
    if (damages !== undefined) { updates.push('damages = ?'); params.push(damages); }
    if (leftItems !== undefined) { updates.push('left_items = ?'); params.push(leftItems); }
    if (receptionPhotos !== undefined) { updates.push('reception_photos = ?'); params.push(JSON.stringify(receptionPhotos)); }
    if (estimatedDate !== undefined) { updates.push('estimated_date = ?'); params.push(estimatedDate); }
    if (appointmentAt !== undefined) { updates.push('appointment_at = ?'); params.push(appointmentAt); }

    params.push(id);
    await db.query(`UPDATE work_orders SET ${updates.join(', ')} WHERE id = ?`, params);
    const [rows] = await db.query('SELECT * FROM work_orders WHERE id = ?', [id]);

    if (!rows.length) {
      return res.status(404).json({ message: 'Orden no encontrada' });
    }

    await audit(recepcionistaId || req.body.actorId, 'ACTUALIZAR_ESTADO', 'ORDEN', id, `Nuevo estado: ${status}`);
    res.json(await mapOrder(rows[0]));
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar estado' });
  }
});

app.patch('/api/orders/:id/quote', async (req, res) => {
  try {
    const { quoteStatus, approvedBy = null, responseMethod = 'portal', rejectReason = null, actorId = null } = req.body;
    if (!await canAccessOrder(req.params.id, req.auth)) return res.status(403).json({ message: 'No tienes acceso a esta orden.' });
    if (!['pendiente', 'aprobado', 'rechazado'].includes(quoteStatus)) return res.status(400).json({ message: 'Respuesta de presupuesto invÃ¡lida' });
    if (quoteStatus === 'rechazado' && cleanText(rejectReason, 500).length < 3) return res.status(400).json({ message: 'El motivo de rechazo es obligatorio.' });
    await db.query("UPDATE work_orders SET quote_status = ?, status = IF(? = 'aprobado', 'en_reparacion', status) WHERE id = ?", [quoteStatus, quoteStatus, req.params.id]);
    await db.query(`UPDATE work_order_quotes SET estado=?, fecha_respuesta=NOW(), aprobado_por=?, medio_respuesta=?, motivo_rechazo=?
      WHERE order_id=? AND estado='pendiente' ORDER BY version DESC LIMIT 1`, [quoteStatus, approvedBy, responseMethod, rejectReason, req.params.id]);
    const [rows] = await db.query('SELECT * FROM work_orders WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Orden no encontrada' });
    await audit(actorId, quoteStatus === 'aprobado' ? 'APROBAR_COTIZACION' : 'RECHAZAR_COTIZACION', 'ORDEN', req.params.id, `${responseMethod}${rejectReason ? `: ${cleanText(rejectReason, 500)}` : ''}`);
    res.json(await mapOrder(rows[0]));
  } catch (error) {
    res.status(500).json({ message: 'Error al responder el presupuesto' });
  }
});

app.get('/api/quotes', async (req, res) => {
  try {
    let rows;
    if (['admin', 'recepcionista'].includes(req.auth.role)) [rows] = await db.query('SELECT * FROM work_order_quotes ORDER BY order_id DESC, version DESC');
    else if (req.auth.role === 'cliente') [rows] = await db.query('SELECT q.* FROM work_order_quotes q JOIN work_orders o ON o.id=q.order_id WHERE o.client_id=? ORDER BY q.order_id DESC, q.version DESC', [req.auth.id]);
    else [rows] = await db.query('SELECT q.* FROM work_order_quotes q JOIN work_orders o ON o.id=q.order_id WHERE o.mechanic_id=? ORDER BY q.order_id DESC, q.version DESC', [req.auth.id]);
    res.json(rows.map(row => ({ id: row.id, orderId: row.order_id, version: row.version, subtotal: Number(row.subtotal), descuento: Number(row.descuento), totalEstimado: Number(row.total_estimado), motivoModificacion: row.motivo_modificacion || '', estado: row.estado, creadoPor: row.creado_por, fechaCreacion: row.fecha_creacion, fechaRespuesta: row.fecha_respuesta, observaciones: row.observaciones || '', aprobadoPor: row.aprobado_por || '', medioRespuesta: row.medio_respuesta || undefined, motivoRechazo: row.motivo_rechazo || '', detalles: [] })));
  } catch (error) { res.status(500).json({ message: 'Error al obtener cotizaciones' }); }
});

app.post('/api/orders/:id/quotes', async (req, res) => {
  try {
    if (!['admin', 'recepcionista', 'mecanico'].includes(req.auth.role) || !await canAccessOrder(req.params.id, req.auth)) return res.status(403).json({ message: 'No tienes permisos para cotizar esta orden.' });
    const { totalEstimado, observaciones = '', creadoPor, motivoModificacion = 'CotizaciÃ³n inicial' } = req.body;
    if (!Number.isInteger(Number(totalEstimado)) || Number(totalEstimado) <= 0 || cleanText(observaciones, 255).length < 5) return res.status(400).json({ message: 'La cotizaciÃ³n contiene datos invÃ¡lidos.' });
    const [orderRows] = await db.query('SELECT id FROM work_orders WHERE id=?', [req.params.id]);
    if (!orderRows.length) return res.status(404).json({ message: 'Orden no encontrada' });
    const [latest] = await db.query('SELECT COALESCE(MAX(version), 0) AS version FROM work_order_quotes WHERE order_id=?', [req.params.id]);
    const version = Number(latest[0].version) + 1;
    await db.query("UPDATE work_order_quotes SET estado='reemplazada' WHERE order_id=? AND estado='pendiente'", [req.params.id]);
    const [result] = await db.query('INSERT INTO work_order_quotes (order_id, version, subtotal, descuento, total_estimado, motivo_modificacion, estado, creado_por, observaciones) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)', [req.params.id, version, totalEstimado, totalEstimado, cleanText(motivoModificacion, 255), 'pendiente', creadoPor || 1, cleanText(observaciones, 255)]);
    await db.query("UPDATE work_orders SET quote_version=?, quote_status='pendiente', quote_total=? WHERE id=?", [version, totalEstimado, req.params.id]);
    const [rows] = await db.query('SELECT * FROM work_order_quotes WHERE id=?', [result.insertId]);
    await audit(creadoPor, 'CREAR_COTIZACION', 'ORDEN', req.params.id, `VersiÃ³n ${version}, total ${totalEstimado}`);
    const quote = rows[0]; res.status(201).json({ id: quote.id, orderId: quote.order_id, version: quote.version, subtotal: Number(quote.subtotal), descuento: Number(quote.descuento), totalEstimado: Number(quote.total_estimado), motivoModificacion: quote.motivo_modificacion, estado: quote.estado, creadoPor: quote.creado_por, fechaCreacion: quote.fecha_creacion, observaciones: quote.observaciones, detalles: [] });
  } catch (error) { res.status(500).json({ message: 'Error al crear cotizaciÃ³n' }); }
});

app.patch('/api/orders/:id/mechanic-data', async (req, res) => {
  try {
    if (!['admin', 'mecanico'].includes(req.auth.role) || !await canAccessOrder(req.params.id, req.auth)) return res.status(403).json({ message: 'No tienes permisos para modificar esta ficha.' });
    const { id } = req.params;
    const {
      assignedMechanic = '', diagnosis = '', observations = '', failures = [], repairs = [],
      parts = [], laborHours = 0, tests = [], cost = 0, evidence = []
    } = req.body;

    await db.query(
      `INSERT INTO work_order_mechanic_data
        (order_id, assigned_mechanic, diagnosis, observations, failures, repairs, parts, labor_hours, tests, cost, evidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        assigned_mechanic = VALUES(assigned_mechanic), diagnosis = VALUES(diagnosis), observations = VALUES(observations),
        failures = VALUES(failures), repairs = VALUES(repairs), parts = VALUES(parts), labor_hours = VALUES(labor_hours),
        tests = VALUES(tests), cost = VALUES(cost), evidence = VALUES(evidence)`,
      [id, assignedMechanic, diagnosis, observations, JSON.stringify(failures), JSON.stringify(repairs), JSON.stringify(parts), Number(laborHours) || 0, JSON.stringify(tests), Number(cost) || 0, JSON.stringify(evidence)]
    );

    const [rows] = await db.query('SELECT * FROM work_orders WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Orden no encontrada' });
    res.json(await mapOrder(rows[0]));
  } catch (error) {
    res.status(500).json({ message: 'Error al guardar la ficha mecÃ¡nica' });
  }
});

app.get('/api/orders/:id/services', async (req, res) => {
  try {
    if (!await canAccessOrder(req.params.id, req.auth)) return res.status(403).json({ message: 'No tienes acceso a esta orden.' });
    const [rows] = await db.query(
      'SELECT service_name FROM work_order_services WHERE order_id = ? ORDER BY id ASC',
      [req.params.id]
    );
    res.json(rows.map((row) => row.service_name));
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener servicios' });
  }
});

app.post('/api/orders/:id/services', async (req, res) => {
  try {
    if (!['admin', 'recepcionista', 'mecanico'].includes(req.auth.role) || !await canAccessOrder(req.params.id, req.auth)) return res.status(403).json({ message: 'No tienes permisos para modificar los servicios.' });
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
    res.status(500).json({ message: 'Error al agregar servicio' });
  }
});

const workOrderStatuses = [
  'solicitada', 'recibido', 'diagnÃ³stico', 'en_diagnostico',
  'cotizacion_pendiente', 'cotizacion_aprobada', 'reparaciÃ³n',
  'en_reparacion', 'esperando_aprobacion', 'trabajo_terminado',
  'listo', 'listo_para_entrega', 'entregado', 'cerrado', 'cancelado'
];

async function startServer() {
  // MigraciÃ³n compatible para instalaciones existentes; no modifica datos actuales.
  const ensureColumn = async (table, name, definition) => {
    const [existing] = await db.query(
      'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, name]
    );
    if (!existing.length) await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  const receptionColumns = [
    ['damages', 'TEXT NULL'], ['left_items', 'TEXT NULL'], ['reception_photos', 'JSON NULL'],
    ['estimated_date', 'VARCHAR(30) NULL'], ['appointment_at', 'DATETIME NULL']
  ];
  for (const [name, definition] of receptionColumns) await ensureColumn('work_orders', name, definition);
  for (const [name, definition] of [
    ['rut', 'VARCHAR(12) NULL'], ['phone', 'VARCHAR(15) NULL'], ['alternate_phone', 'VARCHAR(15) NULL'],
    ['data_consent', 'TINYINT(1) NOT NULL DEFAULT 0'], ['consent_at', 'DATETIME NULL'],
    ['force_password_change', 'TINYINT(1) NOT NULL DEFAULT 0'], ['active', 'TINYINT(1) NOT NULL DEFAULT 1'],
    ['failed_login_attempts', 'TINYINT UNSIGNED NOT NULL DEFAULT 0'], ['locked_until', 'DATETIME NULL']
  ]) await ensureColumn('users', name, definition);
  // Migra credenciales heredadas una sola vez y obliga a definir una clave nueva.
  const [legacyPasswords] = await db.query("SELECT id, password FROM users WHERE password NOT LIKE '$2%'");
  for (const user of legacyPasswords) {
    await db.query('UPDATE users SET password = ?, force_password_change = 1 WHERE id = ?', [await bcrypt.hash(user.password, 12), user.id]);
  }
  await ensureColumn('vehicles', 'active', 'TINYINT(1) NOT NULL DEFAULT 1');
  await ensureColumn('work_orders', 'quote_total', 'DECIMAL(12,2) NULL');
  await ensureColumn('work_order_quotes', 'aprobado_por', 'VARCHAR(120) NULL');
  await ensureColumn('work_order_quotes', 'medio_respuesta', 'VARCHAR(20) NULL');
  await ensureColumn('work_order_quotes', 'motivo_rechazo', 'TEXT NULL');
  await db.query(`CREATE TABLE IF NOT EXISTS spare_parts (
    id INT NOT NULL AUTO_INCREMENT,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL,
    category VARCHAR(80) NOT NULL DEFAULT 'Mantenimiento',
    price DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock INT NOT NULL DEFAULT 0,
    stock_minimo INT NOT NULL DEFAULT 0,
    supplier VARCHAR(120) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id), UNIQUE KEY uq_spare_parts_code (code)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS stock_movements (
    id INT NOT NULL AUTO_INCREMENT,
    spare_part_id INT NOT NULL,
    user_id INT NULL,
    order_id INT NULL,
    type ENUM('entrada', 'salida', 'ajuste') NOT NULL,
    quantity INT NOT NULL,
    stock_before INT NOT NULL,
    stock_after INT NOT NULL,
    supplier VARCHAR(120) NULL,
    reference VARCHAR(120) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_stock_movements_part_date (spare_part_id, created_at),
    KEY idx_stock_movements_user_date (user_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query(`CREATE TABLE IF NOT EXISTS audit_log (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NULL,
    action VARCHAR(50) NOT NULL,
    entity VARCHAR(50) NOT NULL,
    entity_id INT NULL,
    detail TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_audit_entity (entity, entity_id), KEY idx_audit_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  const enumValues = workOrderStatuses.map((status) => db.escape(status)).join(', ');
  await db.query(
    `ALTER TABLE work_orders MODIFY COLUMN status ENUM(${enumValues}) NOT NULL DEFAULT 'solicitada'`
  );

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor API corriendo en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('No se pudo preparar la base de datos:', error.message);
  process.exit(1);
});
