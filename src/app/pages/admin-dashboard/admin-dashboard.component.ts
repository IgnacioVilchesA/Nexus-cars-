import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Vehicle, WorkOrder, WorkOrderStatus } from '../../models/workshop.models';
import { WorkshopService } from '../../core/services/workshop.service';

@Component({ selector: 'app-admin-dashboard', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './admin-dashboard.component.html', styleUrl: './admin-dashboard.component.css' })
export class AdminDashboardComponent {
  clientName = ''; clientEmail = ''; clientPassword = 'cliente123';
  vehicleBrand = ''; vehicleModel = ''; vehiclePlate = ''; vehicleType: 'Auto' | 'Moto' = 'Auto'; vehicleOwner = 2;
  orderClient = 2; orderVehicle = 1; orderDescription = ''; orderService = 'Mantención preventiva';
  newService = ''; selectedOrder = 0; selectedVehicleId = 0; selectedOrderId = 0;
  mechanicName = 'Mecánico principal'; diagnosis = ''; observations = ''; failuresText = ''; repairsText = '';
  partsText = ''; laborHours = 0; testsText = ''; cost = 0; evidenceText = '';
  readonly statuses: WorkOrderStatus[] = ['recibido', 'diagnóstico', 'reparación', 'listo'];
  constructor(public workshop: WorkshopService, private readonly router: Router) { }
  get clients() { return this.workshop.users().filter((user) => user.role === 'cliente'); }
  get selectedVehicle(): Vehicle | undefined { return this.workshop.vehicles().find((vehicle) => vehicle.id === Number(this.selectedVehicleId)); }
  get vehicleHistory(): WorkOrder[] { return this.selectedVehicle ? this.workshop.orders().filter((order) => order.vehicleId === this.selectedVehicle?.id) : []; }
  get activeOrder(): WorkOrder | undefined { return this.workshop.orders().find((order) => order.id === Number(this.selectedOrderId)); }
  get activeOrders(): number { return this.workshop.orders().filter((order) => order.status !== 'listo').length; }
  logout(): void { this.workshop.logout(); this.router.navigate(['/']); }
  registerClient(): void { if (this.clientName && this.clientEmail) { this.workshop.addClient(this.clientName, this.clientEmail, this.clientPassword); this.clientName = ''; this.clientEmail = ''; } }
  registerVehicle(): void { if (this.vehicleBrand && this.vehicleModel && this.vehiclePlate) { this.workshop.addVehicle({ ownerId: Number(this.vehicleOwner), type: this.vehicleType, brand: this.vehicleBrand, model: this.vehicleModel, plate: this.vehiclePlate, year: new Date().getFullYear() }); this.vehicleBrand = ''; this.vehicleModel = ''; this.vehiclePlate = ''; } }
  createOrder(): void { if (this.orderDescription) { this.workshop.addOrder({ clientId: Number(this.orderClient), vehicleId: Number(this.orderVehicle), description: this.orderDescription, status: 'recibido', services: [this.orderService], nextMaintenance: 'Por definir' }); this.orderDescription = ''; } }
  addService(): void { if (this.selectedOrder && this.newService) { this.workshop.addService(this.selectedOrder, this.newService); this.newService = ''; } }
  selectVehicle(id: number): void { this.selectedVehicleId = Number(id); }
  selectOrder(order: WorkOrder): void {
    this.selectedOrderId = order.id;
    this.selectedVehicleId = order.vehicleId;
    this.mechanicName = order.assignedMechanic || 'Mecánico principal';
    this.diagnosis = order.diagnosis || '';
    this.observations = order.observations || '';
    this.failuresText = (order.failures || []).join('\n');
    this.repairsText = (order.repairs || []).join('\n');
    this.partsText = (order.parts || []).join('\n');
    this.laborHours = order.laborHours || 0;
    this.testsText = (order.tests || []).join('\n');
    this.cost = order.cost || 0;
    this.evidenceText = (order.evidence || []).join('\n');
  }
  saveMechanicData(): void {
    if (!this.activeOrder) return;
    this.workshop.updateOrderDetails(this.activeOrder.id, {
      assignedMechanic: this.mechanicName,
      diagnosis: this.diagnosis,
      observations: this.observations,
      failures: this.toLines(this.failuresText),
      repairs: this.toLines(this.repairsText),
      parts: this.toLines(this.partsText),
      laborHours: Number(this.laborHours) || 0,
      tests: this.toLines(this.testsText),
      cost: Number(this.cost) || 0,
      evidence: this.toLines(this.evidenceText)
    });
  }
  markFinished(): void { if (this.activeOrder) this.workshop.updateOrderStatus(this.activeOrder.id, 'listo'); }
  addEvidenceFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []).filter((file) => file.type.startsWith('image/'));
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => { this.evidenceText = `${this.evidenceText}${this.evidenceText ? '\n' : ''}${reader.result}`; };
      reader.readAsDataURL(file);
    });
    input.value = '';
  }
  private toLines(value: string): string[] { return value.split('\n').map((item) => item.trim()).filter(Boolean); }
  clientNameById(id: number): string { return this.workshop.users().find((user) => user.id === id)?.name ?? 'Cliente'; }
  vehicleLabel(id: number): string { const vehicle = this.workshop.vehicles().find((item) => item.id === id); return vehicle ? `${vehicle.brand} ${vehicle.model} · ${vehicle.plate}` : 'Vehículo'; }
}
