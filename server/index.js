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

const cleanText = (value, max) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
const cleanRut = (value) => String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
const validRut = (value) => {
  const rut = cleanRut(value); if (!/^\d{7,8}[0-9K]$/.test(rut)) return false;
  let sum = 0; let factor = 2;
  for (let i = rut.length - 2; i >= 0; i--) { sum += Number(rut[i]) * factor; factor = factor === 7 ? 2 : factor + 1; }
  const rest = 11 - (sum % 11); return rut.at(-1) === (rest === 11 ? '0' : rest === 10 ? 'K' : String(rest));
};
const validName = (value) => { const names = cleanText(value, 100).split(' ').filter(Boolean); return names.length >= 2 && names.every(name => /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'’-]{2,}$/.test(name)); };
const validPhone = (value) => /^(?:\+?56)?9\d{8}$/.test(String(value || '').replace(/[\s-]/g, ''));
const mapUser = (row) => ({ id: row.id, name: row.name, email: row.email, role: row.role, rut: row.rut || '', phone: row.phone || '', alternatePhone: row.alternate_phone || '', dataConsent: Boolean(row.data_consent), consentAt: row.consent_at || null, active: row.active !== 0, forcePasswordChange: Boolean(row.force_password_change) });
const mapVehicle = (row) => ({ id: row.id, ownerId: row.owner_id, type: row.type, brand: row.brand, model: row.model, plate: row.plate, year: row.year, active: row.active !== 0 });
const audit = async (userId, action, entity, entityId, detail = '') => {
  await db.query('INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)', [userId || null, action, entity, entityId || null, detail]);
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
    res.json(rows.map(mapUser));
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener usuarios', error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { name, email, password, role = 'cliente', rut, phone, alternatePhone, dataConsent, forcePasswordChange = false } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Faltan campos obligatorios' });
    }

    const normalizedEmail = cleanText(email, 150).toLowerCase();
    const normalizedName = cleanText(name, 100);
    const normalizedRut = rut ? cleanRut(rut) : null;
    if (role === 'cliente' && rut !== undefined && (!validName(normalizedName) || !validRut(normalizedRut) || !validPhone(phone) || !dataConsent)) {
      return res.status(400).json({ message: 'Los datos del cliente no cumplen las validaciones de recepción.' });
    }
    if (normalizedRut) {
      const [existingRut] = await db.query('SELECT id FROM users WHERE rut = ? LIMIT 1', [normalizedRut]);
      if (existingRut.length) return res.status(409).json({ message: 'El RUT ya está registrado.' });
    }
    const [result] = await db.query(
      'INSERT INTO users (name, email, password, role, rut, phone, alternate_phone, data_consent, consent_at, force_password_change, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [normalizedName, normalizedEmail, password, role, normalizedRut, phone ? String(phone).replace(/[\s-]/g, '') : null, alternatePhone ? String(alternatePhone).replace(/[\s-]/g, '') : null, Boolean(dataConsent), dataConsent ? new Date() : null, Boolean(forcePasswordChange), true]
    );

    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    const user = rows[0];
    await audit(req.body.actorId, 'CREAR', 'CLIENTE', user.id, `Cliente ${user.email}`);
    res.status(201).json(mapUser(user));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ya existe una cuenta con ese correo' });
    res.status(500).json({ message: 'Error al crear usuario', error: error.message });
  }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    const { name, email, rut, phone, alternatePhone, dataConsent } = req.body;
    if (!name || !email) return res.status(400).json({ message: 'Nombre y correo son obligatorios' });
    const normalizedRut = rut ? cleanRut(rut) : null;
    if (rut !== undefined && !validRut(normalizedRut)) return res.status(400).json({ message: 'RUT inválido' });
    if (phone !== undefined && !validPhone(phone)) return res.status(400).json({ message: 'Celular inválido' });
    if (alternatePhone && !validPhone(alternatePhone)) return res.status(400).json({ message: 'Teléfono alternativo inválido' });
    if (normalizedRut) { const [sameRut] = await db.query('SELECT id FROM users WHERE rut = ? AND id <> ? LIMIT 1', [normalizedRut, req.params.id]); if (sameRut.length) return res.status(409).json({ message: 'El RUT ya está registrado.' }); }
    await db.query('UPDATE users SET name=?, email=?, rut=?, phone=?, alternate_phone=?, data_consent=?, consent_at=IF(?, COALESCE(consent_at, NOW()), NULL) WHERE id=?', [cleanText(name, 100), cleanText(email, 150).toLowerCase(), normalizedRut, phone ? String(phone).replace(/[\s-]/g, '') : null, alternatePhone ? String(alternatePhone).replace(/[\s-]/g, '') : null, Boolean(dataConsent), Boolean(dataConsent), req.params.id]);
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Usuario no encontrado' });
    await audit(req.body.actorId, 'EDITAR', 'CLIENTE', req.params.id, 'Datos de cliente actualizados');
    res.json(mapUser(rows[0]));
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar perfil', error: error.message });
  }
});

app.patch('/api/users/:id/password', async (req, res) => {
  try {
    const { password, actorId } = req.body;
    if (String(actorId) !== String(req.params.id)) return res.status(403).json({ message: 'No autorizado.' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ message: 'La contraseña debe tener entre 8 y 128 caracteres.' });
    await db.query('UPDATE users SET password=?, force_password_change=0 WHERE id=?', [password, req.params.id]);
    const [rows] = await db.query('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Usuario no encontrado.' });
    await audit(req.params.id, 'CAMBIAR_CONTRASENA', 'USUARIO', req.params.id, 'Cambio obligatorio de contraseña temporal');
    res.json(mapUser(rows[0]));
  } catch (error) { res.status(500).json({ message: 'Error al cambiar la contraseña', error: error.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const [actors] = await db.query('SELECT role FROM users WHERE id = ?', [req.query.actorId]);
    if (!actors.length || actors[0].role !== 'admin') return res.status(403).json({ message: 'Solo administración puede eliminar clientes.' });
    await db.query('UPDATE users SET active = 0 WHERE id = ?', [req.params.id]);
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Cliente no encontrado' });
    await audit(req.query.actorId, 'DESACTIVAR', 'CLIENTE', req.params.id, 'Cliente desactivado; se preserva su historial');
    res.json(mapUser(rows[0]));
  } catch (error) { res.status(500).json({ message: 'Error al eliminar cliente', error: error.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña requeridos' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [accounts] = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [normalizedEmail]);
    const account = accounts[0];
    if (account?.locked_until && new Date(account.locked_until) > new Date()) return res.status(423).json({ message: 'Cuenta bloqueada temporalmente por intentos fallidos.' });
    const [rows] = await db.query('SELECT * FROM users WHERE email = ? AND password = ? AND active = 1 LIMIT 1', [normalizedEmail, String(password)]);
    if (!rows.length) {
      if (account) {
        const attempts = Number(account.failed_login_attempts || 0) + 1;
        await db.query('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?', [attempts >= 5 ? 0 : attempts, attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null, account.id]);
      }
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }
    const user = rows[0];
    await db.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
    res.json(mapUser(user));
  } catch (error) {
    res.status(500).json({ message: 'Error al iniciar sesión', error: error.message });
  }
});

app.get('/api/vehicles', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM vehicles ORDER BY id ASC');
    res.json(rows.map(mapVehicle));
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

    const normalizedPlate = String(plate).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const plateRule = type === 'Moto' ? /^(?:[A-HJ-NPR-Z]{2}\d{4}|[A-HJ-NPR-Z]{3}\d{2}|[A-HJ-NPR-Z]{2}\d{3})$/ : /^(?:[A-HJ-NPR-Z]{2}\d{4}|[A-HJ-NPR-Z]{4}\d{2})$/;
    if (!plateRule.test(normalizedPlate) || Number(year) < 1950 || Number(year) > new Date().getFullYear() + 1) return res.status(400).json({ message: 'Patente o año de vehículo inválidos.' });
    const [result] = await db.query('INSERT INTO vehicles (owner_id, type, brand, model, plate, year, active) VALUES (?, ?, ?, ?, ?, ?, ?)', [ownerId, type, cleanText(brand, 50), cleanText(model, 80), normalizedPlate, year, true]);

    const [rows] = await db.query('SELECT * FROM vehicles WHERE id = ?', [result.insertId]);
    const vehicle = rows[0];
    await audit(req.body.actorId, 'CREAR', 'VEHICULO', vehicle.id, `Patente ${vehicle.plate}`);
    res.status(201).json(mapVehicle(vehicle));
  } catch (error) {
    res.status(500).json({ message: 'Error al crear vehículo', error: error.message });
  }
});

app.patch('/api/vehicles/:id', async (req, res) => {
  try {
    const { ownerId, type, brand, model, plate, year } = req.body;
    if (!ownerId || !type || !brand || !model || !plate || !year) return res.status(400).json({ message: 'Complete los datos del vehículo' });
    const [existing] = await db.query('SELECT owner_id FROM vehicles WHERE id=?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Vehículo no encontrado' });
    if (Number(existing[0].owner_id) !== Number(ownerId) && !req.body.confirmOwnerChange) return res.status(409).json({ message: 'Confirma el cambio de propietario antes de guardar.' });
    await db.query('UPDATE vehicles SET owner_id=?, type=?, brand=?, model=?, plate=?, year=? WHERE id=?', [ownerId, type, cleanText(brand, 50), cleanText(model, 80), String(plate).toUpperCase().replace(/[^A-Z0-9]/g, ''), year, req.params.id]);
    const [rows] = await db.query('SELECT * FROM vehicles WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Vehículo no encontrado' });
    await audit(req.body.actorId, 'EDITAR', 'VEHICULO', req.params.id, 'Datos de vehículo actualizados');
    res.json(mapVehicle(rows[0]));
  } catch (error) { res.status(500).json({ message: 'Error al actualizar vehículo', error: error.message }); }
});

app.delete('/api/vehicles/:id', async (req, res) => {
  try {
    const [actors] = await db.query('SELECT role FROM users WHERE id = ?', [req.query.actorId]);
    if (!actors.length || actors[0].role !== 'admin') return res.status(403).json({ message: 'Solo administración puede eliminar vehículos.' });
    await db.query('UPDATE vehicles SET active = 0 WHERE id=?', [req.params.id]);
    const [rows] = await db.query('SELECT * FROM vehicles WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Vehículo no encontrado' });
    await audit(req.query.actorId, 'DESACTIVAR', 'VEHICULO', req.params.id, 'Vehículo desactivado; se preserva su historial');
    res.json(mapVehicle(rows[0]));
  }
  catch (error) { res.status(500).json({ message: 'Error al eliminar vehículo', error: error.message }); }
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
    const normalizedDescription = cleanText(description, 500);
    if (status === 'solicitada' && appointmentAt) {
      if (normalizedDescription.length < 5 || new Date(appointmentAt).getTime() <= Date.now()) return res.status(400).json({ message: 'La cita requiere motivo válido y fecha futura.' });
      const [conflicts] = await db.query('SELECT id FROM work_orders WHERE status = ? AND appointment_at = ? LIMIT 1', ['solicitada', appointmentAt]);
      if (conflicts.length) return res.status(409).json({ message: 'Ya existe una cita en ese horario.' });
    }
    if (status !== 'solicitada') {
      if (normalizedDescription.length < 10 || !Number.isInteger(Number(entryMileage)) || Number(entryMileage) < 0 || Number(entryMileage) > 2000000 || !fuelLevel || (!damages && !String(receptionNotes || '').includes('Sin daños')) || !estimatedDate || estimatedDate < new Date().toISOString().slice(0, 10)) return res.status(400).json({ message: 'La ficha de recepción contiene datos inválidos o incompletos.' });
      const [activeOrders] = await db.query("SELECT id FROM work_orders WHERE vehicle_id = ? AND status NOT IN ('solicitada','listo','listo_para_entrega','entregado','cerrado','cancelado') LIMIT 1", [vehicleId]);
      if (activeOrders.length) return res.status(409).json({ message: 'El vehículo ya tiene un ingreso activo.' });
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
    res.status(500).json({ message: 'Error al crear orden', error: error.message });
  }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status, entryMileage, fuelLevel, receptionNotes, assignedMechanic, mechanicId, recepcionistaId, totalFinal, quoteStatus, damages, leftItems, receptionPhotos, estimatedDate, appointmentAt } = req.body;
    const { id } = req.params;

    if (!status) {
      return res.status(400).json({ message: 'Debe indicar un estado válido' });
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
    res.status(500).json({ message: 'Error al actualizar estado', error: error.message });
  }
});

app.patch('/api/orders/:id/quote', async (req, res) => {
  try {
    const { quoteStatus, approvedBy = null, responseMethod = 'portal', rejectReason = null, actorId = null } = req.body;
    if (!['pendiente', 'aprobado', 'rechazado'].includes(quoteStatus)) return res.status(400).json({ message: 'Respuesta de presupuesto inválida' });
    if (quoteStatus === 'rechazado' && cleanText(rejectReason, 500).length < 3) return res.status(400).json({ message: 'El motivo de rechazo es obligatorio.' });
    await db.query("UPDATE work_orders SET quote_status = ?, status = IF(? = 'aprobado', 'en_reparacion', status) WHERE id = ?", [quoteStatus, quoteStatus, req.params.id]);
    await db.query(`UPDATE work_order_quotes SET estado=?, fecha_respuesta=NOW(), aprobado_por=?, medio_respuesta=?, motivo_rechazo=?
      WHERE order_id=? AND estado='pendiente' ORDER BY version DESC LIMIT 1`, [quoteStatus, approvedBy, responseMethod, rejectReason, req.params.id]);
    const [rows] = await db.query('SELECT * FROM work_orders WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Orden no encontrada' });
    await audit(actorId, quoteStatus === 'aprobado' ? 'APROBAR_COTIZACION' : 'RECHAZAR_COTIZACION', 'ORDEN', req.params.id, `${responseMethod}${rejectReason ? `: ${cleanText(rejectReason, 500)}` : ''}`);
    res.json(await mapOrder(rows[0]));
  } catch (error) {
    res.status(500).json({ message: 'Error al responder el presupuesto', error: error.message });
  }
});

app.get('/api/quotes', async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM work_order_quotes ORDER BY order_id DESC, version DESC');
    res.json(rows.map(row => ({ id: row.id, orderId: row.order_id, version: row.version, subtotal: Number(row.subtotal), descuento: Number(row.descuento), totalEstimado: Number(row.total_estimado), motivoModificacion: row.motivo_modificacion || '', estado: row.estado, creadoPor: row.creado_por, fechaCreacion: row.fecha_creacion, fechaRespuesta: row.fecha_respuesta, observaciones: row.observaciones || '', aprobadoPor: row.aprobado_por || '', medioRespuesta: row.medio_respuesta || undefined, motivoRechazo: row.motivo_rechazo || '', detalles: [] })));
  } catch (error) { res.status(500).json({ message: 'Error al obtener cotizaciones', error: error.message }); }
});

app.post('/api/orders/:id/quotes', async (req, res) => {
  try {
    const { totalEstimado, observaciones = '', creadoPor, motivoModificacion = 'Cotización inicial' } = req.body;
    if (!Number.isInteger(Number(totalEstimado)) || Number(totalEstimado) <= 0 || cleanText(observaciones, 255).length < 5) return res.status(400).json({ message: 'La cotización contiene datos inválidos.' });
    const [orderRows] = await db.query('SELECT id FROM work_orders WHERE id=?', [req.params.id]);
    if (!orderRows.length) return res.status(404).json({ message: 'Orden no encontrada' });
    const [latest] = await db.query('SELECT COALESCE(MAX(version), 0) AS version FROM work_order_quotes WHERE order_id=?', [req.params.id]);
    const version = Number(latest[0].version) + 1;
    await db.query("UPDATE work_order_quotes SET estado='reemplazada' WHERE order_id=? AND estado='pendiente'", [req.params.id]);
    const [result] = await db.query('INSERT INTO work_order_quotes (order_id, version, subtotal, descuento, total_estimado, motivo_modificacion, estado, creado_por, observaciones) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)', [req.params.id, version, totalEstimado, totalEstimado, cleanText(motivoModificacion, 255), 'pendiente', creadoPor || 1, cleanText(observaciones, 255)]);
    await db.query("UPDATE work_orders SET quote_version=?, quote_status='pendiente', quote_total=? WHERE id=?", [version, totalEstimado, req.params.id]);
    const [rows] = await db.query('SELECT * FROM work_order_quotes WHERE id=?', [result.insertId]);
    await audit(creadoPor, 'CREAR_COTIZACION', 'ORDEN', req.params.id, `Versión ${version}, total ${totalEstimado}`);
    const quote = rows[0]; res.status(201).json({ id: quote.id, orderId: quote.order_id, version: quote.version, subtotal: Number(quote.subtotal), descuento: Number(quote.descuento), totalEstimado: Number(quote.total_estimado), motivoModificacion: quote.motivo_modificacion, estado: quote.estado, creadoPor: quote.creado_por, fechaCreacion: quote.fecha_creacion, observaciones: quote.observaciones, detalles: [] });
  } catch (error) { res.status(500).json({ message: 'Error al crear cotización', error: error.message }); }
});

app.patch('/api/orders/:id/mechanic-data', async (req, res) => {
  try {
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
    res.status(500).json({ message: 'Error al guardar la ficha mecánica', error: error.message });
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

const workOrderStatuses = [
  'solicitada', 'recibido', 'diagnóstico', 'en_diagnostico',
  'cotizacion_pendiente', 'cotizacion_aprobada', 'reparación',
  'en_reparacion', 'esperando_aprobacion', 'trabajo_terminado',
  'listo', 'listo_para_entrega', 'entregado', 'cerrado', 'cancelado'
];

async function startServer() {
  // Migración compatible para instalaciones existentes; no modifica datos actuales.
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
  await ensureColumn('vehicles', 'active', 'TINYINT(1) NOT NULL DEFAULT 1');
  await ensureColumn('work_orders', 'quote_total', 'DECIMAL(12,2) NULL');
  await ensureColumn('work_order_quotes', 'aprobado_por', 'VARCHAR(120) NULL');
  await ensureColumn('work_order_quotes', 'medio_respuesta', 'VARCHAR(20) NULL');
  await ensureColumn('work_order_quotes', 'motivo_rechazo', 'TEXT NULL');
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
