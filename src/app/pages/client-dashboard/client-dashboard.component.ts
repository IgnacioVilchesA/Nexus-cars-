import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Vehicle, WorkOrder, QuoteStatus } from '../../models/workshop.models';
import { WorkshopService } from '../../core/services/workshop.service';

@Component({ selector: 'app-client-dashboard', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './client-dashboard.component.html', styleUrl: './client-dashboard.component.css' })
export class ClientDashboardComponent {
  profileName = '';
  profileEmail = '';
  vehicleBrand = '';
  vehicleModel = '';
  vehiclePlate = '';
  vehicleYear = new Date().getFullYear();
  readonly maxVehicleYear = new Date().getFullYear() + 1;
  vehicleType: 'Auto' | 'Moto' = 'Auto';
  selectedOrderId = 0;
  profileMessage = '';
  vehicleMessage = '';
  constructor(public workshop: WorkshopService, private readonly router: Router) { }
  get user() { return this.workshop.currentUser(); }
  get firstName(): string { return this.user?.name?.split(' ').at(0) || ''; }
  get vehicles(): Vehicle[] {
    const u = this.user;
    return u ? this.workshop.vehicles().filter((vehicle) => vehicle.ownerId === u.id) : [];
  }
  get orders(): WorkOrder[] {
    const u = this.user;
    return u ? this.workshop.clientOrders(u.id) : [];
  }
  get selectedOrder(): WorkOrder | undefined { return this.orders.find((order) => order.id === Number(this.selectedOrderId)) || this.orders[0]; }
  get nextMaintenance(): string { return this.orders.find((order) => order.nextMaintenance && order.nextMaintenance !== 'Por definir')?.nextMaintenance || 'Por definir'; }
  get activeVehicles(): number { return this.vehicles.filter((vehicle) => this.orders.some((order) => order.vehicleId === vehicle.id && order.status !== 'listo')).length; }
  get orderProgress(): number {
    const progress: Record<string, number> = { recibido: 25, diagnóstico: 50, reparación: 75, listo: 100 };
    return this.selectedOrder ? progress[this.selectedOrder.status] : 0;
  }
  get quoteStatusLabel(): string {
    return this.selectedOrder?.quoteStatus || (this.selectedOrder?.cost ? 'pendiente' : 'sin cotización');
  }
  openOrder(order: WorkOrder): void { this.selectedOrderId = order.id; }
  startProfileEdit(): void {
    this.profileName = this.user?.name || '';
    this.profileEmail = this.user?.email || '';
    this.profileMessage = '';
  }
  saveProfile(): void {
    const user = this.user;
    if (!user || !this.profileName.trim() || !this.profileEmail.trim()) return;
    this.workshop.updateClientProfile(user.id, this.profileName, this.profileEmail);
    this.profileMessage = 'Datos personales actualizados';
  }
  registerVehicle(): void {
    const user = this.user;
    if (!user || !this.vehicleBrand.trim() || !this.vehicleModel.trim() || !this.vehiclePlate.trim() || !this.vehicleYear) return;
    this.workshop.addVehicle({ ownerId: user.id, type: this.vehicleType, brand: this.vehicleBrand.trim(), model: this.vehicleModel.trim(), plate: this.vehiclePlate.trim().toUpperCase(), year: Number(this.vehicleYear) });
    this.vehicleBrand = ''; this.vehicleModel = ''; this.vehiclePlate = ''; this.vehicleYear = new Date().getFullYear();
    this.vehicleMessage = 'Vehículo registrado correctamente';
  }
  respondToQuote(status: QuoteStatus): void {
    if (this.selectedOrder) this.workshop.respondToQuote(this.selectedOrder.id, status);
  }
  logout(): void { this.workshop.logout(); this.router.navigate(['/login']); }
  vehicleLabel(id: number): string { const vehicle = this.workshop.vehicles().find((item) => item.id === id); return vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Vehículo'; }
}
