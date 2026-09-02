import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User, Vehicle, WorkOrder, WorkOrderStatus } from '../../models/workshop.models';

@Injectable({ providedIn: 'root' })
export class WorkshopService {
  private readonly apiUrl = 'http://localhost:3000/api';

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
    this.http.post<User>(`${this.apiUrl}/login`, { email, password }).subscribe({
      next: (user) => {
        this.currentUser.set(user);
        try {
          localStorage.setItem('nexus_user', JSON.stringify(user));
        } catch {}
        onResult?.(user);
      },
      error: (err) => {
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
    this.http.post<User>(`${this.apiUrl}/users`, { name, email, password, role: 'cliente' }).subscribe({
      next: (user) => this.users.update((items) => [...items, user]),
      error: () => console.error('No se pudo crear el cliente')
    });
  }

  addVehicle(vehicle: Omit<Vehicle, 'id'>): void {
    this.http.post<Vehicle>(`${this.apiUrl}/vehicles`, vehicle).subscribe({
      next: (newVehicle) => this.vehicles.update((items) => [...items, newVehicle]),
      error: () => console.error('No se pudo crear el vehículo')
    });
  }

  addOrder(order: Omit<WorkOrder, 'id' | 'createdAt'>): void {
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
    this.http.patch<WorkOrder>(`${this.apiUrl}/orders/${id}/status`, { status }).subscribe({
      next: (updatedOrder) => {
        this.orders.update((items) => items.map((order) => order.id === id ? { ...order, ...updatedOrder } : order));
      },
      error: () => console.error('No se pudo actualizar el estado')
    });
  }

  addService(id: number, service: string): void {
    this.http.post<string[]>(`${this.apiUrl}/orders/${id}/services`, { service }).subscribe({
      next: (services) => {
        this.orders.update((items) => items.map((order) => order.id === id ? { ...order, services } : order));
      },
      error: () => console.error('No se pudo agregar el servicio')
    });
  }

  clientOrders(clientId: number): WorkOrder[] {
    return this.orders().filter((order) => order.clientId === clientId);
  }

  private loadUsers(): void {
    this.http.get<User[]>(`${this.apiUrl}/users`).subscribe({
      next: (users) => this.users.set(users),
      error: () => this.users.set([])
    });
  }

  private loadVehicles(): void {
    this.http.get<Vehicle[]>(`${this.apiUrl}/vehicles`).subscribe({
      next: (vehicles) => this.vehicles.set(vehicles),
      error: () => this.vehicles.set([])
    });
  }

  private loadOrders(): void {
    this.http.get<WorkOrder[]>(`${this.apiUrl}/orders`).subscribe({
      next: (orders) => this.orders.set(orders),
      error: () => this.orders.set([])
    });
  }
}
