import { Injectable, signal } from '@angular/core';
import { User, Vehicle, WorkOrder, WorkOrderStatus } from '../../models/workshop.models';

const USERS_KEY = 'torque-users';
const VEHICLES_KEY = 'torque-vehicles';
const ORDERS_KEY = 'torque-orders';
const SESSION_KEY = 'torque-session';

@Injectable({ providedIn: 'root' })
export class WorkshopService {
  private readonly defaultUsers: User[] = [
    { id: 1, name: 'Administrador Torque', email: 'admin@torquenorte.cl', password: 'admin123', role: 'admin' },
    { id: 2, name: 'Camila Rojas', email: 'cliente@torquenorte.cl', password: 'cliente123', role: 'cliente' }
  ];
  private readonly defaultVehicles: Vehicle[] = [
    { id: 1, ownerId: 2, type: 'Auto', brand: 'Mazda', model: 'CX-5', plate: 'KT-42-18', year: 2021 },
    { id: 2, ownerId: 2, type: 'Moto', brand: 'Yamaha', model: 'FZ 25', plate: 'LM-08-77', year: 2022 }
  ];
  private readonly defaultOrders: WorkOrder[] = [
    { id: 1001, clientId: 2, vehicleId: 1, description: 'Mantención de 40.000 km y revisión de frenos.', status: 'diagnóstico', services: ['Cambio de aceite', 'Revisión de frenos'], createdAt: '28 ago 2024', nextMaintenance: '28 feb 2025' },
    { id: 1002, clientId: 2, vehicleId: 2, description: 'Revisión general para viaje.', status: 'listo', services: ['Mantención preventiva'], createdAt: '12 jul 2024', nextMaintenance: '12 ene 2025' }
  ];

  currentUser = signal<User | null>(this.readSession());
  users = signal<User[]>(this.readUsers());
  vehicles = signal<Vehicle[]>(this.read(VEHICLES_KEY, this.defaultVehicles));
  orders = signal<WorkOrder[]>(this.read(ORDERS_KEY, this.defaultOrders));

  login(email: string, password: string): User | null {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.users().find((item) => item.email.toLowerCase() === normalizedEmail && item.password === password) ?? null;
    if (user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      this.currentUser.set(user);
    }
    return user;
  }

  logout(): void { localStorage.removeItem(SESSION_KEY); this.currentUser.set(null); }
  addClient(name: string, email: string, password: string): void { this.saveUsers([...this.users(), { id: Date.now(), name, email, password, role: 'cliente' }]); }
  addVehicle(vehicle: Omit<Vehicle, 'id'>): void { this.saveVehicles([...this.vehicles(), { ...vehicle, id: Date.now() }]); }
  addOrder(order: Omit<WorkOrder, 'id' | 'createdAt'>): void { this.saveOrders([...this.orders(), { ...order, id: Date.now(), createdAt: new Date().toLocaleDateString('es-CL') }]); }
  updateOrderStatus(id: number, status: WorkOrderStatus): void { this.saveOrders(this.orders().map((order) => order.id === id ? { ...order, status } : order)); }
  addService(id: number, service: string): void { this.saveOrders(this.orders().map((order) => order.id === id ? { ...order, services: [...order.services, service] } : order)); }
  clientOrders(clientId: number): WorkOrder[] { return this.orders().filter((order) => order.clientId === clientId); }

  private saveUsers(value: User[]): void { this.users.set(value); localStorage.setItem(USERS_KEY, JSON.stringify(value)); }
  private saveVehicles(value: Vehicle[]): void { this.vehicles.set(value); localStorage.setItem(VEHICLES_KEY, JSON.stringify(value)); }
  private saveOrders(value: WorkOrder[]): void { this.orders.set(value); localStorage.setItem(ORDERS_KEY, JSON.stringify(value)); }
  private readUsers(): User[] {
    const storedUsers = this.read<User[]>(USERS_KEY, []);
    const mergedUsers = [...this.defaultUsers];
    for (const storedUser of storedUsers) {
      if (!mergedUsers.some((user) => user.email.toLowerCase() === storedUser.email.toLowerCase())) {
        mergedUsers.push(storedUser);
      }
    }
    localStorage.setItem(USERS_KEY, JSON.stringify(mergedUsers));
    return mergedUsers;
  }
  private read<T>(key: string, fallback: T): T { const stored = localStorage.getItem(key); return stored ? JSON.parse(stored) as T : fallback; }
  private readSession(): User | null { const stored = localStorage.getItem(SESSION_KEY); return stored ? JSON.parse(stored) as User : null; }
}
