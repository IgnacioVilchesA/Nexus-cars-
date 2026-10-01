import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  AdditionalWork,
  OrderHistory,
  OrderQuote,
  QuoteStatus,
  User,
  Vehicle,
  WorkOrder,
  WorkOrderStatus,
  UserRole
} from '../../models/workshop.models';

export interface QuoteBreakdown {
  partsCost: number;
  laborCost: number;
  otherCosts: number;
  quoteHours: number;
}

@Injectable({ providedIn: 'root' })
export class WorkshopService {
  private readonly apiUrl = 'http://localhost:3000/api';
  private demoMode = false;
  private inactivityTimer?: ReturnType<typeof setTimeout>;
  private readonly inactivityMs = 30 * 60 * 1000;

  currentUser = signal<User | null>(this.getStoredUser());
  users = signal<User[]>([]);
  vehicles = signal<Vehicle[]>([]);
  orders = signal<WorkOrder[]>([]);
  quotes = signal<OrderQuote[]>([]);
  additionalWorks = signal<AdditionalWork[]>([]);
  orderHistory = signal<OrderHistory[]>([]);

  constructor(private readonly http: HttpClient) {
    this.loadUsers();
    this.loadVehicles();
    this.loadOrders();
    this.loadQuotes();
    this.loadAdditionalWorks();
    this.loadOrderHistory();
    if (this.currentUser()) this.resetInactivityTimer();
    if (typeof window !== 'undefined') ['pointerdown', 'keydown', 'touchstart'].forEach(event => window.addEventListener(event, () => this.resetInactivityTimer(), { passive: true }));
  }

  canTransitionOrderStatus(currentStatus: WorkOrderStatus, nextStatus: WorkOrderStatus, quoteStatus?: QuoteStatus): boolean {
    const orderSequence: WorkOrderStatus[] = [
      'solicitada',
      'recibido',
      'diagnóstico',
      'en_diagnostico',
      'cotizacion_pendiente',
      'cotizacion_aprobada',
      'en_reparacion',
      'esperando_aprobacion',
      'trabajo_terminado',
      'listo_para_entrega',
      'entregado',
      'cerrado'
    ];

    const normalizedCurrent = this.normalizeStatus(currentStatus);
    const normalizedNext = this.normalizeStatus(nextStatus);

    const currentIndex = orderSequence.indexOf(normalizedCurrent);
    const nextIndex = orderSequence.indexOf(normalizedNext);

    if (currentIndex === -1 || nextIndex === -1) return false;
    if (normalizedNext === normalizedCurrent) return true;
    if (normalizedNext === 'en_reparacion' && quoteStatus !== undefined && quoteStatus !== 'aprobado') return false;
    return nextIndex === currentIndex + 1;
  }

  normalizeStatus(status: WorkOrderStatus): WorkOrderStatus {
    if (status === 'diagnóstico' || status === 'en_diagnostico') return 'en_diagnostico';
    if (status === 'reparación' || status === 'en_reparacion') return 'en_reparacion';
    if (status === 'listo' || status === 'listo_para_entrega') return 'listo_para_entrega';
    return status;
  }

  calculateQuoteTotal({ partsCost, laborCost, otherCosts, quoteHours }: QuoteBreakdown): number {
    const total = Number(partsCost || 0) + Number(laborCost || 0) + Number(otherCosts || 0);
    return Number.isFinite(total) ? total : 0;
  }

  private getStoredUser(): User | null {
    try {
      const stored = localStorage.getItem('nexus_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private resetInactivityTimer(): void {
    if (!this.currentUser()) return;
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => {
      this.logout();
      if (typeof window !== 'undefined') window.location.assign('/login');
    }, this.inactivityMs);
  }

  login(email: string, password: string, onResult?: (user: User | null, error?: string) => void): void {
    if (this.demoMode) {
      this.loginFromDemoData(email, password, onResult);
      return;
    }

    this.http.post<User>(`${this.apiUrl}/login`, { email, password }).subscribe({
      next: (user) => {
        this.currentUser.set(user);
        try {
          localStorage.setItem('nexus_user', JSON.stringify(user));
        } catch {}
        this.resetInactivityTimer();
        onResult?.(user);
      },
      error: (err) => {
        this.currentUser.set(null);
        try {
          localStorage.removeItem('nexus_user');
        } catch {}
        let msg = 'El correo o la contraseña no son correctos.';
        if (err.status === 0 || err.status >= 500) {
          msg = 'No se pudo conectar con la API y la base de datos. El registro no se guardó; verifica que el servidor Node esté iniciado en el puerto 3000.';
        } else if (err.error?.message) {
          msg = err.error.message;
        }
        onResult?.(null, msg);
      }
    });
  }

  logout(): void {
    this.currentUser.set(null);
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    try {
      localStorage.removeItem('nexus_user');
    } catch {}
  }

  changeTemporaryPassword(password: string, onResult: (user: User | null, error?: string) => void): void {
    const current = this.currentUser();
    if (!current) { onResult(null, 'La sesión ya no está disponible.'); return; }
    if (this.demoMode) {
      const updated = { ...current, password, forcePasswordChange: false };
      this.currentUser.set(updated); this.users.update(items => items.map(user => user.id === updated.id ? updated : user)); this.persistCurrentUser(); onResult(updated); return;
    }
    this.http.patch<User>(`${this.apiUrl}/users/${current.id}/password`, { password, actorId: current.id }).subscribe({
      next: user => { this.currentUser.set(user); this.users.update(items => items.map(item => item.id === user.id ? user : item)); this.persistCurrentUser(); onResult(user); },
      error: error => onResult(null, error.error?.message || 'No se pudo actualizar la contraseña.')
    });
  }

  createUser(data: Omit<User, 'id'>): User {
    const user = { id: this.nextId(this.users()), ...data, email: data.email.trim().toLowerCase() };
    this.users.update((items) => [...items, user]);
    return user;
  }

  addClient(name: string, email: string, password: string): void {
    this.createUser({ name, email, password, role: 'cliente' });
  }

  createMechanicAccount(name: string, email: string, password: string): User {
    return this.createUser({ name, email, password, role: 'mecanico' });
  }

  createReceptionistAccount(name: string, email: string, password: string): User {
    return this.createUser({ name, email, password, role: 'recepcionista' });
  }

  registerClient(name: string, email: string, password: string, onResult?: (user: User | null, error?: string) => void, profile: Partial<User> = {}): void {
    const normalizedEmail = email.trim().toLowerCase();
    if (this.demoMode) {
      if (this.users().some((user) => user.email === normalizedEmail)) {
        onResult?.(null, 'Ya existe una cuenta con ese correo.');
        return;
      }
      const user = { id: this.nextId(this.users()), name: name.trim(), email: normalizedEmail, password, role: 'cliente' as const, ...profile, forcePasswordChange: Object.keys(profile).length > 0, active: true };
      this.users.update((items) => [...items, user]);
      onResult?.(user);
      return;
    }

    this.http.post<User>(`${this.apiUrl}/users`, { name: name.trim(), email: normalizedEmail, password, role: 'cliente', ...profile, forcePasswordChange: Object.keys(profile).length > 0, actorId: this.currentUser()?.id }).subscribe({
      next: (user) => {
        this.users.update((items) => [...items, user]);
        onResult?.(user);
      },
      error: (err) => onResult?.(null, err.error?.message || 'No se pudo crear la cuenta')
    });
  }

  updateClientProfile(id: number, name: string, email: string): void {
    const profile = { name: name.trim(), email: email.trim().toLowerCase() };
    if (this.demoMode) {
      this.users.update((items) => items.map((user) => user.id === id ? { ...user, ...profile } : user));
      this.currentUser.update((user) => user?.id === id ? { ...user, ...profile } : user);
      this.persistCurrentUser();
      return;
    }

    this.http.patch<User>(`${this.apiUrl}/users/${id}`, profile).subscribe({
      next: (user) => {
        this.users.update((items) => items.map((item) => item.id === id ? user : item));
        this.currentUser.set(user);
        this.persistCurrentUser();
      },
      error: () => console.error('No se pudo actualizar el perfil')
    });
  }

  updateUser(id: number, data: Partial<User>): void {
    this.users.update((items) => items.map((user) => user.id === id ? { ...user, ...data, email: (data.email ?? user.email).trim().toLowerCase() } : user));
  }

  deleteUser(id: number): void {
    this.users.update((items) => items.filter((user) => user.id !== id));
  }

  addVehicle(vehicle: Omit<Vehicle, 'id'>, onResult?: (vehicle: Vehicle | null, error?: string) => void): void {
    if (this.demoMode) {
      const created = { ...vehicle, id: this.nextId(this.vehicles()) };
      this.vehicles.update((items) => [...items, created]);
      onResult?.(created);
      return;
    }

    this.http.post<Vehicle>(`${this.apiUrl}/vehicles`, { ...vehicle, actorId: this.currentUser()?.id }).subscribe({
      next: (newVehicle) => {
        this.vehicles.update((items) => [...items, newVehicle]);
        onResult?.(newVehicle);
      },
      error: (err) => {
        console.error('No se pudo crear el vehículo');
        onResult?.(null, err.error?.message || 'No se pudo crear el vehículo');
      }
    });
  }

  addOrder(order: Omit<WorkOrder, 'id' | 'createdAt'>, onResult?: (order: WorkOrder | null, error?: string) => void): void {
    if (this.demoMode) {
      const created = { ...order, id: this.nextId(this.orders()), createdAt: new Date().toLocaleDateString('es-CL') };
      this.orders.update((items) => [created, ...items]);
      onResult?.(created);
      return;
    }

    this.http.post<WorkOrder>(`${this.apiUrl}/orders`, {
      ...order,
      clientId: order.clientId,
      vehicleId: order.vehicleId,
      status: order.status,
      description: order.description,
      services: order.services,
      nextMaintenance: order.nextMaintenance,
      entryMileage: order.entryMileage,
      fuelLevel: order.fuelLevel,
      receptionNotes: order.receptionNotes,
      mechanicId: order.mechanicId,
      recepcionistaId: order.recepcionistaId,
      assignedMechanic: order.assignedMechanic,
      totalFinal: order.totalFinal,
      damages: order.damages,
      leftItems: order.leftItems,
      receptionPhotos: order.receptionPhotos,
      estimatedDate: order.estimatedDate,
      appointmentAt: order.appointmentAt
    }).subscribe({
      next: (newOrder) => {
        this.orders.update((items) => [newOrder, ...items]);
        onResult?.(newOrder);
      },
      error: (err) => {
        console.error('No se pudo crear la orden');
        onResult?.(null, err.error?.message || 'No se pudo crear la orden');
      }
    });
  }

  checkInOrder(id: number, data: { entryMileage?: number; fuelLevel?: string; receptionNotes?: string; damages?: string; leftItems?: string; receptionPhotos?: string[]; estimatedDate?: string; mechanicId?: number; assignedMechanic?: string; status?: WorkOrderStatus }, onResult?: (order: WorkOrder | null, error?: string) => void): void {
    const status = data.status || 'recibido';
    if (this.demoMode) {
      this.orders.update((items) => items.map((order) => order.id === id ? {
        ...order,
        ...data,
        status,
        notifications: [...(order.notifications || []), `Vehículo recibido en taller (${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })})`]
      } : order));
      onResult?.(this.orders().find(order => order.id === id) ?? null);
      return;
    }

    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${id}/status`, { status, ...data }).subscribe({
      next: (updatedOrder) => {
        this.orders.update((items) => items.map((order) => order.id === id ? { ...order, ...updatedOrder } : order));
        onResult?.(updatedOrder);
      },
      error: (error) => {
        console.error('No se pudo registrar la recepción');
        onResult?.(null, error.error?.message || 'No se pudo guardar la ficha de recepción.');
      }
    });
  }

  updateVehicle(id: number, data: Partial<Vehicle>): void {
    if (this.demoMode) { this.vehicles.update((items) => items.map((vehicle) => vehicle.id === id ? { ...vehicle, ...data } : vehicle)); return; }
    const previous = this.vehicles().find(vehicle => vehicle.id === id);
    if (previous && data.ownerId !== undefined && previous.ownerId !== data.ownerId && !confirm('¿Confirmas el cambio de propietario del vehículo?')) return;
    this.http.patch<Vehicle>(`${this.apiUrl}/vehicles/${id}`, { ...data, confirmOwnerChange: true, actorId: this.currentUser()?.id }).subscribe({
      next: vehicle => this.vehicles.update(items => items.map(item => item.id === id ? vehicle : item)),
      error: () => console.error('No se pudo actualizar el vehículo')
    });
  }

  deleteVehicle(id: number): void {
    if (this.currentUser()?.role !== 'admin') { console.warn('Solo administración puede eliminar vehículos'); return; }
    if (this.demoMode) { this.vehicles.update((items) => items.map(vehicle => vehicle.id === id ? { ...vehicle, active: false } : vehicle)); return; }
    this.http.delete<Vehicle>(`${this.apiUrl}/vehicles/${id}`, { params: { actorId: String(this.currentUser()?.id || '') } }).subscribe({
      next: vehicle => this.vehicles.update(items => items.map(item => item.id === id ? vehicle : item)),
      error: () => console.error('No se pudo eliminar el vehículo')
    });
  }

  updateClient(id: number, data: Partial<Pick<User, 'name' | 'email' | 'rut' | 'phone' | 'alternatePhone' | 'dataConsent'>>): void {
    if (this.demoMode) { this.users.update(items => items.map(user => user.id === id ? { ...user, ...data } : user)); return; }
    this.http.patch<User>(`${this.apiUrl}/users/${id}`, { ...data, actorId: this.currentUser()?.id }).subscribe({ next: user => this.users.update(items => items.map(item => item.id === id ? user : item)) });
  }

  deleteClient(id: number): void {
    if (this.currentUser()?.role !== 'admin') { console.warn('Solo administración puede eliminar clientes'); return; }
    if (this.demoMode) { this.users.update(items => items.map(user => user.id === id ? { ...user, active: false } : user)); return; }
    this.http.delete<User>(`${this.apiUrl}/users/${id}`, { params: { actorId: String(this.currentUser()?.id || '') } }).subscribe({ next: user => this.users.update(items => items.map(item => item.id === id ? user : item)) });
  }

  updateOrder(id: number, data: Partial<WorkOrder>): void {
    this.orders.update((items) => items.map((order) => order.id === id ? { ...order, ...data } : order));
  }

  deleteOrder(id: number): void {
    this.orders.update((items) => items.filter((order) => order.id !== id));
  }

  updateOrderStatus(id: number, status: WorkOrderStatus, onResult?: (order: WorkOrder | null, error?: string) => void): boolean {
    const currentOrder = this.orders().find((order) => order.id === id);
    if (!currentOrder) return false;

    if (!this.canTransitionOrderStatus(currentOrder.status, status, currentOrder.quoteStatus)) {
      return false;
    }

    if (this.demoMode) {
      this.orders.update((items) => items.map((order) => order.id === id ? {
        ...order,
        status,
        notifications: [...(order.notifications || []), `Estado actualizado: ${status}`]
      } : order));
      onResult?.(this.orders().find((order) => order.id === id) ?? null);
      return true;
    }

    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${id}/status`, { status }).subscribe({
      next: (updatedOrder) => {
        this.orders.update((items) => items.map((order) => order.id === id ? { ...order, ...updatedOrder, notifications: [...(order.notifications || []), `Estado actualizado: ${status}`] } : order));
        onResult?.(updatedOrder);
      },
      error: (err) => {
        console.error('No se pudo actualizar el estado');
        onResult?.(null, err.error?.message || 'No se pudo actualizar el estado');
      }
    });
    return true;
  }

  respondToQuote(id: number, quoteStatus: QuoteStatus, response?: { approvedBy?: string; responseMethod?: 'presencial' | 'whatsapp' | 'portal'; rejectReason?: string }): void {
    const currentOrder = this.orders().find((o) => o.id === id);
    const newStatus: WorkOrderStatus = quoteStatus === 'aprobado' ? 'en_reparacion' : (currentOrder?.status || 'cotizacion_pendiente');

    this.quotes.update((items) => items.map((q) => {
      if (q.orderId === id && (q.estado === 'pendiente' || q.version === currentOrder?.quoteVersion)) {
        return { ...q, estado: quoteStatus, fechaRespuesta: new Date().toISOString() };
      }
      return q;
    }));

    if (this.demoMode) {
      this.orders.update((items) => items.map((order) => order.id === id ? {
        ...order,
        quoteStatus,
        status: newStatus,
        notifications: [...(order.notifications || []), `Cotización ${quoteStatus} por el cliente.`]
      } : order));
      return;
    }

    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${id}/quote`, {
      quoteStatus, approvedBy: response?.approvedBy, responseMethod: response?.responseMethod || 'portal', rejectReason: response?.rejectReason, actorId: this.currentUser()?.id
    }).subscribe({
      next: (updatedOrder) => this.orders.update((items) => items.map((order) => order.id === id ? { ...order, ...updatedOrder } : order)),
      error: () => console.error('No se pudo responder la cotización')
    });
  }

  addService(id: number, service: string): void {
    if (this.demoMode) {
      this.orders.update((items) => items.map((order) => order.id === id ? { ...order, services: [...order.services, service] } : order));
      return;
    }

    this.http.post<string[]>(`${this.apiUrl}/orders/${id}/services`, { service }).subscribe({
      next: (services) => {
        this.orders.update((items) => items.map((order) => order.id === id ? { ...order, services } : order));
      },
      error: () => console.error('No se pudo agregar el servicio')
    });
  }

  createQuoteVersion(orderId: number, totalEstimado: number, options?: Partial<OrderQuote>): OrderQuote | null {
    const order = this.orders().find((item) => item.id === orderId);
    if (!order) return null;

    const version = (order.quoteVersion ?? 0) + 1;

    // Mantener versiones anteriores marcadas como reemplazadas
    this.quotes.update((items) => items.map((q) => {
      if (q.orderId === orderId && q.estado === 'pendiente') {
        return { ...q, estado: 'reemplazada' as QuoteStatus };
      }
      return q;
    }));

    const quote: OrderQuote = {
      id: this.nextId(this.quotes()),
      orderId,
      version,
      subtotal: totalEstimado,
      descuento: 0,
      totalEstimado,
      motivoModificacion: options?.motivoModificacion ?? (version > 1 ? 'Actualización por trabajo adicional detectado' : 'Cotización inicial'),
      estado: options?.estado ?? 'pendiente',
      creadoPor: options?.creadoPor ?? this.currentUser()?.id ?? 1,
      fechaCreacion: new Date().toISOString(),
      observaciones: options?.observaciones ?? `Cotización versión ${version} emitida por el taller.`,
      detalles: options?.detalles ?? []
    };

    this.quotes.update((items) => [...items, quote]);
    this.orders.update((items) => items.map((item) => item.id === orderId ? { ...item, quoteVersion: version, quoteStatus: quote.estado, quoteTotal: totalEstimado, cost: totalEstimado } : item));
    if (!this.demoMode) {
      this.http.post<OrderQuote>(`${this.apiUrl}/orders/${orderId}/quotes`, { totalEstimado, observaciones: quote.observaciones, motivoModificacion: quote.motivoModificacion, creadoPor: quote.creadoPor }).subscribe({
        next: saved => this.quotes.update(items => items.map(item => item.id === quote.id ? { ...saved, detalles: quote.detalles } : item)),
        error: error => console.error(error.error?.message || 'No se pudo guardar la cotización')
      });
    }
    return quote;
  }

  createAdditionalWork(orderId: number, mechanicId: number, description: string, motivo: string, costoEstimado: number): AdditionalWork | null {
    const order = this.orders().find((item) => item.id === orderId);
    if (!order) return null;

    const work: AdditionalWork = {
      id: this.nextId(this.additionalWorks()),
      orderId,
      mecanicoId: mechanicId,
      descripcion: description,
      motivo,
      costoEstimado,
      estado: 'PENDIENTE_REVISION',
      fecha: new Date().toISOString()
    };

    this.additionalWorks.update((items) => [...items, work]);
    return work;
  }

  assignMechanic(orderId: number, mechanicId: number, mechanicName: string): void {
    const order = this.orders().find((o) => o.id === orderId);
    const newStatus: WorkOrderStatus = order?.status === 'recibido' || order?.status === 'solicitada' 
      ? 'en_diagnostico' 
      : (order?.status ?? 'en_diagnostico');

    if (this.demoMode) {
      this.orders.update((items) => items.map((item) => item.id === orderId ? {
        ...item,
        mechanicId,
        assignedMechanic: mechanicName,
        status: newStatus,
        notifications: [...(item.notifications || []), `Mecánico asignado: ${mechanicName}`]
      } : item));
      return;
    }

    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${orderId}/status`, {
      status: newStatus,
      assignedMechanic: mechanicName,
      mechanicId
    }).subscribe({
      next: (updated) => this.orders.update((items) => items.map((o) => o.id === orderId ? { ...o, ...updated } : o)),
      error: () => console.error('No se pudo asignar mecánico')
    });
  }

  registerAdditionalWork(orderId: number, mechanicId: number, description: string, motivo: string, costoEstimado: number): AdditionalWork | null {
    const work = this.createAdditionalWork(orderId, mechanicId, description, motivo, costoEstimado);
    if (!work) return null;

    // Actualizar estado a esperando aprobación del cliente
    if (this.demoMode) {
      this.orders.update((items) => items.map((o) => o.id === orderId ? {
        ...o,
        status: 'esperando_aprobacion',
        notifications: [...(o.notifications || []), `Problema adicional detectado: ${description} (+$${costoEstimado})`]
      } : o));
    } else {
      this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${orderId}/status`, {
        status: 'esperando_aprobacion'
      }).subscribe({
        next: (updated) => this.orders.update((items) => items.map((o) => o.id === orderId ? { ...o, ...updated } : o)),
        error: () => console.error('No se pudo actualizar estado a esperando_aprobacion')
      });
    }

    return work;
  }

  clientDecideAdditionalWork(orderId: number, workId: number, approve: boolean): void {
    const work = this.additionalWorks().find((w) => w.id === workId);
    if (!work) return;

    this.additionalWorks.update((items) => items.map((w) => w.id === workId ? {
      ...w,
      estado: approve ? 'APROBADO' : 'RECHAZADO'
    } : w));

    const order = this.orders().find((o) => o.id === orderId);
    const addedCost = approve ? work.costoEstimado : 0;
    const newTotal = (order?.cost || order?.quoteTotal || 0) + addedCost;

    if (this.demoMode) {
      this.orders.update((items) => items.map((o) => o.id === orderId ? {
        ...o,
        status: 'en_reparacion',
        cost: newTotal,
        quoteTotal: newTotal,
        totalFinal: newTotal,
        quoteStatus: 'aprobado',
        notifications: [...(o.notifications || []), approve ? `Trabajo adicional aprobado (+ $${work.costoEstimado})` : `Trabajo adicional rechazado por el cliente`]
      } : o));
      return;
    }

    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${orderId}/status`, {
      status: 'en_reparacion',
      totalFinal: newTotal,
      quoteStatus: 'aprobado'
    }).subscribe({
      next: (updated) => this.orders.update((items) => items.map((o) => o.id === orderId ? { ...o, ...updated } : o)),
      error: () => console.error('No se pudo actualizar respuesta de adicional')
    });
  }

  markWorkFinished(orderId: number, onResult?: (order: WorkOrder | null, error?: string) => void): void {
    if (this.demoMode) {
      this.orders.update((items) => items.map((o) => o.id === orderId ? {
        ...o,
        status: 'trabajo_terminado',
        notifications: [...(o.notifications || []), 'Mecánico finalizó los trabajos']
      } : o));
      onResult?.(this.orders().find((order) => order.id === orderId) ?? null);
      return;
    }

    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${orderId}/status`, {
      status: 'trabajo_terminado'
    }).subscribe({
      next: (updated) => {
        this.orders.update((items) => items.map((o) => o.id === orderId ? { ...o, ...updated } : o));
        onResult?.(updated);
      },
      error: (err) => {
        console.error('No se pudo marcar trabajo terminado');
        onResult?.(null, err.error?.message || 'No se pudo marcar trabajo terminado');
      }
    });
  }

  receptionistValidateAndSetReady(orderId: number, totalFinal: number): void {
    if (this.demoMode) {
      this.orders.update((items) => items.map((o) => o.id === orderId ? {
        ...o,
        totalFinal,
        status: 'listo_para_entrega',
        notifications: [...(o.notifications || []), `Vehículo listo para entrega. Total: $${totalFinal}`]
      } : o));
      return;
    }

    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${orderId}/status`, {
      status: 'listo_para_entrega',
      totalFinal
    }).subscribe({
      next: (updated) => this.orders.update((items) => items.map((o) => o.id === orderId ? { ...o, ...updated } : o)),
      error: () => console.error('No se pudo validar total y dejar listo')
    });
  }

  deliverVehicleToClient(orderId: number): void {
    if (this.demoMode) {
      this.orders.update((items) => items.map((o) => o.id === orderId ? {
        ...o,
        status: 'cerrado',
        notifications: [...(o.notifications || []), 'Vehículo entregado al cliente. Orden cerrada.']
      } : o));
      return;
    }

    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${orderId}/status`, {
      status: 'cerrado'
    }).subscribe({
      next: (updated) => this.orders.update((items) => items.map((o) => o.id === orderId ? { ...o, ...updated } : o)),
      error: () => console.error('No se pudo cerrar la orden')
    });
  }

  updateOrderDetails(id: number, details: Partial<WorkOrder>, onResult?: (order: WorkOrder | null, error?: string) => void): void {
    if (this.demoMode) {
      this.orders.update((items) => items.map((order) => {
        if (order.id !== id) return order;

        const updated = { ...order, ...details } as WorkOrder;
        if (details.partsCost !== undefined || details.laborCost !== undefined || details.otherCosts !== undefined) {
          updated.quoteTotal = this.calculateQuoteTotal({
            partsCost: Number(details.partsCost ?? updated.partsCost ?? 0),
            laborCost: Number(details.laborCost ?? updated.laborCost ?? 0),
            otherCosts: Number(details.otherCosts ?? updated.otherCosts ?? 0),
            quoteHours: Number(details.quoteHours ?? updated.quoteHours ?? 0),
          });
          updated.cost = updated.quoteTotal;
        }
        return updated;
      }));
      onResult?.(this.orders().find((order) => order.id === id) ?? null);
      return;
    }

    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${id}/mechanic-data`, details).subscribe({
      next: (updatedOrder) => {
        this.orders.update((items) => items.map((order) => order.id === id ? { ...order, ...updatedOrder } : order));
        onResult?.(updatedOrder);
      },
      error: (err) => {
        console.error('No se pudieron guardar los datos del mecánico');
        onResult?.(null, err.error?.message || 'No se pudieron guardar los datos del mecánico');
      }
    });
  }

  clientOrders(clientId: number): WorkOrder[] {
    return this.orders().filter((order) => order.clientId === clientId);
  }

  private loadUsers(): void {
    this.http.get<User[]>(`${this.apiUrl}/users`).subscribe({
      next: (users) => this.users.set(users),
      error: () => console.error('No se pudieron cargar los usuarios desde la API')
    });
  }

  private loadVehicles(): void {
    this.http.get<Vehicle[]>(`${this.apiUrl}/vehicles`).subscribe({
      next: (vehicles) => this.vehicles.set(vehicles),
      error: () => console.error('No se pudieron cargar los vehículos desde la API')
    });
  }

  private loadOrders(): void {
    this.http.get<WorkOrder[]>(`${this.apiUrl}/orders`).subscribe({
      next: (orders) => this.orders.set(orders),
      error: () => console.error('No se pudieron cargar las órdenes desde la API')
    });
  }

  private loadQuotes(): void {
    this.http.get<OrderQuote[]>(`${this.apiUrl}/quotes`).subscribe({ next: quotes => this.quotes.set(quotes), error: () => this.quotes.set([
      {
        id: 1,
        orderId: 1001,
        version: 1,
        subtotal: 150000,
        descuento: 0,
        totalEstimado: 150000,
        estado: 'aprobado',
        creadoPor: 1,
        fechaCreacion: new Date('2024-08-28').toISOString(),
        detalles: []
      }
    ]) });
  }

  private loadAdditionalWorks(): void {
    this.additionalWorks.set([]);
  }

  private loadOrderHistory(): void {
    this.orderHistory.set([
      {
        id: 1,
        orderId: 1001,
        usuarioId: 1,
        accion: 'Orden creada',
        descripcion: 'Recepcionista registró la orden',
        fecha: new Date('2024-08-28').toISOString(),
        estadoAnterior: 'solicitada',
        estadoNuevo: 'recibido'
      }
    ]);
  }

  private enableDemoMode(): void {
    if (this.demoMode) return;
    this.demoMode = true;
    this.users.set([
      { id: 1, name: 'Recepcionista Nexus', email: 'recepcionista@nexuscars.cl', password: 'admin123', role: 'recepcionista' },
      { id: 2, name: 'Camila Rojas', email: 'cliente@nexuscars.cl', password: 'cliente123', role: 'cliente' },
      { id: 3, name: 'Mecánico Principal', email: 'mecanico@nexuscars.cl', password: 'mecanico123', role: 'mecanico' },
      { id: 4, name: 'Administrador Nexus', email: 'admin@nexuscars.cl', password: 'admin123', role: 'admin' }
    ]);
    this.vehicles.set([
      { id: 1, ownerId: 2, type: 'Auto', brand: 'Mazda', model: 'CX-5', plate: 'KT-42-18', year: 2021, active: true },
      { id: 2, ownerId: 2, type: 'Moto', brand: 'Yamaha', model: 'FZ 25', plate: 'LM-08-77', year: 2022, active: true }
    ]);
    this.orders.set([
      {
        id: 1001,
        clientId: 2,
        vehicleId: 1,
        description: 'Mantención de 40.000 km y revisión de frenos.',
        status: 'en_diagnostico',
        services: ['Cambio de aceite', 'Revisión de frenos'],
        createdAt: '28-08-2024',
        nextMaintenance: '28-02-2025',
        quoteStatus: 'aprobado',
        diagnosis: 'Desgaste moderado en pastillas delanteras.',
        parts: ['Pastillas de freno delanteras'],
        laborHours: 2.5,
        cost: 189900,
        partsCost: 120000,
        laborCost: 50000,
        otherCosts: 19900,
        quoteHours: 2.5,
        quoteTotal: 189900,
        notifications: ['Solicitud registrada por el cliente.'],
        assignedMechanic: 'Mecánico Principal',
        totalFinal: 185000,
        quoteVersion: 1
      },
      {
        id: 1002,
        clientId: 2,
        vehicleId: 2,
        description: 'Revisión general para viaje.',
        status: 'cerrado',
        services: ['Mantención preventiva'],
        createdAt: '12-07-2024',
        nextMaintenance: '12-01-2025',
        quoteStatus: 'aprobado',
        cost: 85000,
        laborHours: 1.5,
        partsCost: 40000,
        laborCost: 30000,
        otherCosts: 15000,
        quoteHours: 1.5,
        quoteTotal: 85000,
        notifications: ['Reparación completada.'],
        assignedMechanic: 'Mecánico Principal',
        totalFinal: 85000,
        quoteVersion: 1
      }
    ]);
  }

  private loginFromDemoData(email: string, password: string, onResult?: (user: User | null, error?: string) => void): void {
    const user = this.users().find((item) => item.email === email.trim().toLowerCase() && item.password === password) ?? null;
    if (user) {
      this.currentUser.set(user);
      try { localStorage.setItem('nexus_user', JSON.stringify(user)); } catch { }
      this.resetInactivityTimer();
      onResult?.(user);
    } else {
      onResult?.(null, 'El correo o la contraseña no son correctos.');
    }
  }

  private nextId<T extends { id: number }>(items: T[]): number {
    return items.length ? Math.max(...items.map((item) => item.id)) + 1 : 1;
  }

  private persistCurrentUser(): void {
    try {
      const user = this.currentUser();
      if (user) localStorage.setItem('nexus_user', JSON.stringify(user));
    } catch { }
  }
}
