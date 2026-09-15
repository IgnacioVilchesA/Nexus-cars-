import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { User, Vehicle, WorkOrder, WorkOrderStatus } from '../../models/workshop.models';
import { WorkshopService } from '../../core/services/workshop.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent {
  mechanicForm = { name: '', email: '', password: 'mecanico123' };
  vehicleForm = { ownerId: 2, type: 'Auto' as 'Auto' | 'Moto', brand: '', model: '', plate: '', year: new Date().getFullYear() };
  orderForm = { clientId: 2, vehicleId: 1, description: '', status: 'solicitada' as WorkOrderStatus, services: 'Mantención preventiva' };
  editingVehicleId = 0;
  editingOrderId = 0;

  readonly statuses: WorkOrderStatus[] = ['solicitada', 'recibido', 'diagnóstico', 'reparación', 'listo'];

  constructor(public workshop: WorkshopService, private readonly router: Router) {}

  get users(): User[] { return this.workshop.users(); }
  get clients(): User[] { return this.users.filter((user) => user.role === 'cliente'); }
  get mechanics(): User[] { return this.users.filter((user) => user.role === 'mecanico'); }
  get vehicles(): Vehicle[] { return this.workshop.vehicles(); }
  get orders(): WorkOrder[] { return this.workshop.orders(); }
  get totalRevenue(): number { return this.orders.reduce((sum, order) => sum + Number(order.quoteTotal ?? order.cost ?? 0), 0); }
  get activeOrdersCount(): number { return this.orders.filter((order) => order.status !== 'listo').length; }

  logout(): void {
    this.workshop.logout();
    this.router.navigate(['/']);
  }

  createMechanic(): void {
    if (!this.mechanicForm.name || !this.mechanicForm.email) return;
    this.workshop.createMechanicAccount(this.mechanicForm.name, this.mechanicForm.email, this.mechanicForm.password || 'mecanico123');
    this.mechanicForm = { name: '', email: '', password: 'mecanico123' };
  }

  saveVehicle(): void {
    if (!this.vehicleForm.brand || !this.vehicleForm.model || !this.vehicleForm.plate) return;

    const payload = {
      ownerId: Number(this.vehicleForm.ownerId),
      type: this.vehicleForm.type,
      brand: this.vehicleForm.brand,
      model: this.vehicleForm.model,
      plate: this.vehicleForm.plate,
      year: Number(this.vehicleForm.year) || new Date().getFullYear()
    };

    if (this.editingVehicleId) {
      this.workshop.updateVehicle(this.editingVehicleId, payload);
      this.editingVehicleId = 0;
    } else {
      this.workshop.addVehicle(payload);
    }

    this.vehicleForm = { ownerId: 2, type: 'Auto', brand: '', model: '', plate: '', year: new Date().getFullYear() };
  }

  editVehicle(vehicle: Vehicle): void {
    this.editingVehicleId = vehicle.id;
    this.vehicleForm = { ownerId: vehicle.ownerId, type: vehicle.type, brand: vehicle.brand, model: vehicle.model, plate: vehicle.plate, year: vehicle.year };
  }

  deleteVehicle(id: number): void { this.workshop.deleteVehicle(id); }

  saveOrder(): void {
    if (!this.orderForm.description) return;

    const payload = {
      clientId: Number(this.orderForm.clientId),
      vehicleId: Number(this.orderForm.vehicleId),
      description: this.orderForm.description,
      status: this.orderForm.status,
      services: this.orderForm.services ? this.orderForm.services.split(',').map((value) => value.trim()).filter(Boolean) : ['Mantención preventiva'],
      nextMaintenance: 'Por definir'
    };

    if (this.editingOrderId) {
      this.workshop.updateOrder(this.editingOrderId, payload as Partial<WorkOrder>);
      this.editingOrderId = 0;
    } else {
      this.workshop.addOrder(payload);
    }

    this.orderForm = { clientId: 2, vehicleId: 1, description: '', status: 'solicitada', services: 'Mantención preventiva' };
  }

  editOrder(order: WorkOrder): void {
    this.editingOrderId = order.id;
    this.orderForm = {
      clientId: order.clientId,
      vehicleId: order.vehicleId,
      description: order.description,
      status: order.status,
      services: order.services.join(', ')
    };
  }

  deleteOrder(id: number): void { this.workshop.deleteOrder(id); }

  updateOrderStatus(order: WorkOrder, status: WorkOrderStatus): void {
    this.workshop.updateOrderStatus(order.id, status);
  }

  deleteUser(id: number): void { this.workshop.deleteUser(id); }

  getVehicleName(vehicleId: number): string {
    const vehicle = this.vehicles.find((item) => item.id === vehicleId);
    return vehicle ? `${vehicle.brand} ${vehicle.model} · ${vehicle.plate}` : 'Vehículo';
  }

  getClientName(userId: number): string {
    return this.users.find((item) => item.id === userId)?.name ?? 'Cliente';
  }
}
