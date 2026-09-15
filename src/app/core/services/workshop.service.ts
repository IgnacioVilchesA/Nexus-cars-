import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User, Vehicle, WorkOrder, WorkOrderStatus, QuoteStatus } from '../../models/workshop.models';

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

  currentUser = signal<User | null>(this.getStoredUser());
  users = signal<User[]>([]);
  vehicles = signal<Vehicle[]>([]);
  orders = signal<WorkOrder[]>([]);

  constructor(private readonly http: HttpClient) {
    this.loadUsers();
    this.loadVehicles();
    this.loadOrders();
  }

  canTransitionOrderStatus(currentStatus: WorkOrderStatus, nextStatus: WorkOrderStatus, quoteStatus?: QuoteStatus): boolean {
    const order: WorkOrderStatus[] = ['solicitada', 'recibido', 'diagnóstico', 'reparación', 'listo'];
    const currentIndex = order.indexOf(currentStatus);
    const nextIndex = order.indexOf(nextStatus);

    if (currentIndex === -1 || nextIndex === -1) return false;
    if (nextStatus === currentStatus) return true;
    if (nextStatus === 'reparación' && quoteStatus !== undefined && quoteStatus !== 'aprobado') return false;
    return nextIndex === currentIndex + 1;
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
        onResult?.(user);
      },
      error: (err) => {
        if (err.status === 0 || err.status >= 500) {
          this.enableDemoMode();
          this.loginFromDemoData(email, password, onResult);
          return;
        }
        this.currentUser.set(null);
        try {
          localStorage.removeItem('nexus_user');
        } catch {}
        let msg = 'El correo o la contraseña no son correctos.';
        if (err.status === 0) {
          msg = 'No se pudo conectar con el servidor backend (puerto 3000). Asegúrate de que la API esté iniciada.';
        } else if (err.error?.message) {
          msg = err.error.message;
        }
        onResult?.(null, msg);
      }
    });
  }

  logout(): void {
    this.currentUser.set(null);
    try {
      localStorage.removeItem('nexus_user');
    } catch {}
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

  registerClient(name: string, email: string, password: string, onResult?: (user: User | null, error?: string) => void): void {
    const normalizedEmail = email.trim().toLowerCase();
    if (this.demoMode) {
      if (this.users().some((user) => user.email === normalizedEmail)) {
        onResult?.(null, 'Ya existe una cuenta con ese correo.');
        return;
      }
      const user = { id: this.nextId(this.users()), name: name.trim(), email: normalizedEmail, password, role: 'cliente' as const };
      this.users.update((items) => [...items, user]);
      onResult?.(user);
      return;
    }

    this.http.post<User>(`${this.apiUrl}/users`, { name: name.trim(), email: normalizedEmail, password, role: 'cliente' }).subscribe({
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

  addVehicle(vehicle: Omit<Vehicle, 'id'>): void {
    if (this.demoMode) {
      this.vehicles.update((items) => [...items, { ...vehicle, id: this.nextId(items) }]);
      return;
    }

    this.http.post<Vehicle>(`${this.apiUrl}/vehicles`, vehicle).subscribe({
      next: (newVehicle) => this.vehicles.update((items) => [...items, newVehicle]),
      error: () => console.error('No se pudo crear el vehículo')
    });
  }

  addOrder(order: Omit<WorkOrder, 'id' | 'createdAt'>): void {
    if (this.demoMode) {
      this.orders.update((items) => [{ ...order, id: this.nextId(items), createdAt: new Date().toLocaleDateString('es-CL') }, ...items]);
      return;
    }

    this.http.post<WorkOrder>(`${this.apiUrl}/orders`, {
      ...order,
      clientId: order.clientId,
      vehicleId: order.vehicleId,
      status: order.status,
      description: order.description,
      services: order.services,
      nextMaintenance: order.nextMaintenance
    }).subscribe({
      next: (newOrder) => this.orders.update((items) => [newOrder, ...items]),
      error: () => console.error('No se pudo crear la orden')
    });
  }

  updateVehicle(id: number, data: Partial<Vehicle>): void {
    this.vehicles.update((items) => items.map((vehicle) => vehicle.id === id ? { ...vehicle, ...data } : vehicle));
  }

  deleteVehicle(id: number): void {
    this.vehicles.update((items) => items.filter((vehicle) => vehicle.id !== id));
  }

  updateOrder(id: number, data: Partial<WorkOrder>): void {
    this.orders.update((items) => items.map((order) => order.id === id ? { ...order, ...data } : order));
  }

  deleteOrder(id: number): void {
    this.orders.update((items) => items.filter((order) => order.id !== id));
  }

  updateOrderStatus(id: number, status: WorkOrderStatus): boolean {
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
      return true;
    }

    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${id}/status`, { status }).subscribe({
      next: (updatedOrder) => {
        this.orders.update((items) => items.map((order) => order.id === id ? { ...order, ...updatedOrder, notifications: [...(order.notifications || []), `Estado actualizado: ${status}`] } : order));
      },
      error: () => console.error('No se pudo actualizar el estado')
    });
    return true;
  }

  respondToQuote(id: number, quoteStatus: QuoteStatus): void {
    if (this.demoMode) {
      this.orders.update((items) => items.map((order) => order.id === id ? { ...order, quoteStatus } : order));
      return;
    }

    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${id}/quote`, { quoteStatus }).subscribe({
      next: (updatedOrder) => this.orders.update((items) => items.map((order) => order.id === id ? { ...order, ...updatedOrder } : order)),
      error: () => console.error('No se pudo responder el presupuesto')
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

  updateOrderDetails(id: number, details: Partial<WorkOrder>): void {
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
      return;
    }

    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${id}/mechanic-data`, details).subscribe({
      next: (updatedOrder) => this.orders.update((items) => items.map((order) => order.id === id ? { ...order, ...updatedOrder } : order)),
      error: () => console.error('No se pudieron guardar los datos del mecánico')
    });
  }

  clientOrders(clientId: number): WorkOrder[] {
    return this.orders().filter((order) => order.clientId === clientId);
  }

  private loadUsers(): void {
    this.http.get<User[]>(`${this.apiUrl}/users`).subscribe({
      next: (users) => this.users.set(users),
      error: () => { this.enableDemoMode(); }
    });
  }

  private loadVehicles(): void {
    this.http.get<Vehicle[]>(`${this.apiUrl}/vehicles`).subscribe({
      next: (vehicles) => this.vehicles.set(vehicles),
      error: () => { this.enableDemoMode(); }
    });
  }

  private loadOrders(): void {
    this.http.get<WorkOrder[]>(`${this.apiUrl}/orders`).subscribe({
      next: (orders) => this.orders.set(orders),
      error: () => { this.enableDemoMode(); }
    });
  }

  private enableDemoMode(): void {
    if (this.demoMode) return;
    this.demoMode = true;
    this.users.set([
      { id: 1, name: 'Administrador Nexus', email: 'admin@nexuscars.cl', password: 'admin123', role: 'admin' },
      { id: 2, name: 'Camila Rojas', email: 'cliente@nexuscars.cl', password: 'cliente123', role: 'cliente' },
      { id: 3, name: 'Mecánico Principal', email: 'mecanico@nexuscars.cl', password: 'mecanico123', role: 'mecanico' }
    ]);
    this.vehicles.set([
      { id: 1, ownerId: 2, type: 'Auto', brand: 'Mazda', model: 'CX-5', plate: 'KT-42-18', year: 2021 },
      { id: 2, ownerId: 2, type: 'Moto', brand: 'Yamaha', model: 'FZ 25', plate: 'LM-08-77', year: 2022 }
    ]);
    this.orders.set([
      {
        id: 1001,
        clientId: 2,
        vehicleId: 1,
        description: 'Mantención de 40.000 km y revisión de frenos.',
        status: 'solicitada',
        services: ['Cambio de aceite', 'Revisión de frenos'],
        createdAt: '28-08-2024',
        nextMaintenance: '28-02-2025',
        quoteStatus: 'pendiente',
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
        assignedMechanic: 'Mecánico Principal'
      },
      {
        id: 1002,
        clientId: 2,
        vehicleId: 2,
        description: 'Revisión general para viaje.',
        status: 'listo',
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
        assignedMechanic: 'Mecánico Principal'
      }
    ]);
  }

  private loginFromDemoData(email: string, password: string, onResult?: (user: User | null, error?: string) => void): void {
    const user = this.users().find((item) => item.email === email.trim().toLowerCase() && item.password === password) ?? null;
    if (user) {
      this.currentUser.set(user);
      try { localStorage.setItem('nexus_user', JSON.stringify(user)); } catch { }
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
