import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User, Vehicle, WorkOrder, WorkOrderStatus, QuoteStatus } from '../../models/workshop.models';

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

  addClient(name: string, email: string, password: string): void {
    if (this.demoMode) {
      const user = { id: this.nextId(this.users()), name, email: email.trim().toLowerCase(), password, role: 'cliente' as const };
      this.users.update((items) => [...items, user]);
      return;
    }

    this.http.post<User>(`${this.apiUrl}/users`, { name, email, password, role: 'cliente' }).subscribe({
      next: (user) => this.users.update((items) => [...items, user]),
      error: () => console.error('No se pudo crear el cliente')
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

  updateOrderStatus(id: number, status: WorkOrderStatus): void {
    if (this.demoMode) {
      this.orders.update((items) => items.map((order) => order.id === id ? { ...order, status } : order));
      return;
    }

    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${id}/status`, { status }).subscribe({
      next: (updatedOrder) => {
        this.orders.update((items) => items.map((order) => order.id === id ? { ...order, ...updatedOrder } : order));
      },
      error: () => console.error('No se pudo actualizar el estado')
    });
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
      this.orders.update((items) => items.map((order) => order.id === id ? { ...order, ...details } : order));
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
      { id: 2, name: 'Camila Rojas', email: 'cliente@nexuscars.cl', password: 'cliente123', role: 'cliente' }
    ]);
    this.vehicles.set([
      { id: 1, ownerId: 2, type: 'Auto', brand: 'Mazda', model: 'CX-5', plate: 'KT-42-18', year: 2021 },
      { id: 2, ownerId: 2, type: 'Moto', brand: 'Yamaha', model: 'FZ 25', plate: 'LM-08-77', year: 2022 }
    ]);
    this.orders.set([
      { id: 1001, clientId: 2, vehicleId: 1, description: 'Mantención de 40.000 km y revisión de frenos.', status: 'diagnóstico', services: ['Cambio de aceite', 'Revisión de frenos'], createdAt: '28-08-2024', nextMaintenance: '28-02-2025', quoteStatus: 'pendiente', diagnosis: 'Desgaste moderado en pastillas delanteras.', parts: ['Pastillas de freno delanteras'], laborHours: 2.5, cost: 189900 },
      { id: 1002, clientId: 2, vehicleId: 2, description: 'Revisión general para viaje.', status: 'listo', services: ['Mantención preventiva'], createdAt: '12-07-2024', nextMaintenance: '12-01-2025', quoteStatus: 'aprobado', cost: 85000, laborHours: 1.5 }
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
