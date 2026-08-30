import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WorkOrderStatus } from '../../models/workshop.models';
import { WorkshopService } from '../../core/services/workshop.service';

@Component({ selector: 'app-admin-dashboard', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './admin-dashboard.component.html', styleUrl: './admin-dashboard.component.css' })
export class AdminDashboardComponent {
  clientName = ''; clientEmail = ''; clientPassword = 'cliente123';
  vehicleBrand = ''; vehicleModel = ''; vehiclePlate = ''; vehicleType: 'Auto' | 'Moto' = 'Auto'; vehicleOwner = 2;
  orderClient = 2; orderVehicle = 1; orderDescription = ''; orderService = 'Mantención preventiva';
  newService = ''; selectedOrder = 0;
  readonly statuses: WorkOrderStatus[] = ['recibido', 'diagnóstico', 'reparación', 'listo'];
  constructor(public workshop: WorkshopService, private readonly router: Router) { }
  get clients() { return this.workshop.users().filter((user) => user.role === 'cliente'); }
  logout(): void { this.workshop.logout(); this.router.navigate(['/']); }
  registerClient(): void { if (this.clientName && this.clientEmail) { this.workshop.addClient(this.clientName, this.clientEmail, this.clientPassword); this.clientName = ''; this.clientEmail = ''; } }
  registerVehicle(): void { if (this.vehicleBrand && this.vehicleModel && this.vehiclePlate) { this.workshop.addVehicle({ ownerId: Number(this.vehicleOwner), type: this.vehicleType, brand: this.vehicleBrand, model: this.vehicleModel, plate: this.vehiclePlate, year: new Date().getFullYear() }); this.vehicleBrand = ''; this.vehicleModel = ''; this.vehiclePlate = ''; } }
  createOrder(): void { if (this.orderDescription) { this.workshop.addOrder({ clientId: Number(this.orderClient), vehicleId: Number(this.orderVehicle), description: this.orderDescription, status: 'recibido', services: [this.orderService], nextMaintenance: 'Por definir' }); this.orderDescription = ''; } }
  addService(): void { if (this.selectedOrder && this.newService) { this.workshop.addService(this.selectedOrder, this.newService); this.newService = ''; } }
  clientNameById(id: number): string { return this.workshop.users().find((user) => user.id === id)?.name ?? 'Cliente'; }
  vehicleLabel(id: number): string { const vehicle = this.workshop.vehicles().find((item) => item.id === id); return vehicle ? `${vehicle.brand} ${vehicle.model} · ${vehicle.plate}` : 'Vehículo'; }
}
