import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Vehicle, WorkOrder, WorkOrderStatus } from '../../models/workshop.models';
import { WorkshopService } from '../../core/services/workshop.service';

@Component({ selector: 'app-mechanic-dashboard', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './mechanic-dashboard.component.html', styleUrl: './mechanic-dashboard.component.css' })
export class MechanicDashboardComponent {
  clientName = ''; clientEmail = ''; clientPassword = 'cliente123';
  vehicleBrand = ''; vehicleModel = ''; vehiclePlate = ''; vehicleType: 'Auto' | 'Moto' = 'Auto'; vehicleOwner = 2;
  orderClient = 2; orderVehicle = 1; orderDescription = ''; orderService = 'Mantención preventiva';
  newService = ''; selectedOrder = 0; selectedVehicleId = 0; selectedOrderId = 0;
  mechanicName = 'Mecánico principal'; diagnosis = ''; observations = ''; failuresText = ''; repairsText = '';
  partsText = ''; laborHours = 0; testsText = ''; cost = 0; evidenceText = '';
  partsCost = 0; laborCost = 0; otherCosts = 0; quoteHours = 0; statusMessage = '';
  statusFilter = 'todos'; dateFilter = ''; clientFilter = ''; plateFilter = ''; brandFilter = ''; serviceFilter = '';
  readonly statuses: WorkOrderStatus[] = ['solicitada', 'recibido', 'diagnóstico', 'reparación', 'listo'];

  constructor(public workshop: WorkshopService, private readonly router: Router) { }

  get clients() { return this.workshop.users().filter((user) => user.role === 'cliente'); }
  get selectedVehicle(): Vehicle | undefined { return this.workshop.vehicles().find((vehicle) => vehicle.id === Number(this.selectedVehicleId)); }
  get vehicleHistory(): WorkOrder[] { return this.selectedVehicle ? this.workshop.orders().filter((order) => order.vehicleId === this.selectedVehicle?.id) : []; }
  get activeOrder(): WorkOrder | undefined { return this.workshop.orders().find((order) => order.id === Number(this.selectedOrderId)); }
  get activeOrders(): number { return this.workshop.orders().filter((order) => order.status !== 'listo').length; }
  get filteredOrders(): WorkOrder[] {
    return this.workshop.orders().filter((order) => {
      const matchesStatus = this.statusFilter === 'todos' || order.status === this.statusFilter;
      const matchesClient = !this.clientFilter || this.clientNameById(order.clientId).toLowerCase().includes(this.clientFilter.toLowerCase());
      const vehicle = this.workshop.vehicles().find((item) => item.id === order.vehicleId);
      const matchesPlate = !this.plateFilter || (vehicle?.plate || '').toLowerCase().includes(this.plateFilter.toLowerCase());
      const matchesBrand = !this.brandFilter || (vehicle?.brand || '').toLowerCase().includes(this.brandFilter.toLowerCase());
      const matchesService = !this.serviceFilter || order.services.some((service) => service.toLowerCase().includes(this.serviceFilter.toLowerCase()));
      const matchesDate = !this.dateFilter || order.createdAt.includes(this.dateFilter);
      return matchesStatus && matchesClient && matchesPlate && matchesBrand && matchesService && matchesDate;
    });
  }

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
    this.partsCost = order.partsCost || 0;
    this.laborCost = order.laborCost || 0;
    this.otherCosts = order.otherCosts || 0;
    this.quoteHours = order.quoteHours || 0;
    this.evidenceText = (order.evidence || []).join('\n');
  }
  saveMechanicData(): void {
    if (!this.activeOrder) return;
    const quoteTotal = this.workshop.calculateQuoteTotal({
      partsCost: Number(this.partsCost) || 0,
      laborCost: Number(this.laborCost) || 0,
      otherCosts: Number(this.otherCosts) || 0,
      quoteHours: Number(this.quoteHours) || 0,
    });

    this.workshop.updateOrderDetails(this.activeOrder.id, {
      assignedMechanic: this.mechanicName,
      diagnosis: this.diagnosis,
      observations: this.observations,
      failures: this.toLines(this.failuresText),
      repairs: this.toLines(this.repairsText),
      parts: this.toLines(this.partsText),
      laborHours: Number(this.laborHours) || 0,
      tests: this.toLines(this.testsText),
      cost: quoteTotal,
      partsCost: Number(this.partsCost) || 0,
      laborCost: Number(this.laborCost) || 0,
      otherCosts: Number(this.otherCosts) || 0,
      quoteHours: Number(this.quoteHours) || 0,
      quoteTotal,
      evidence: this.toLines(this.evidenceText)
    });
  }
  changeOrderStatus(order: WorkOrder, nextStatus: WorkOrderStatus): void {
    if (!this.workshop.canTransitionOrderStatus(order.status, nextStatus, order.quoteStatus)) {
      this.statusMessage = 'No puedes saltar estados. Sigue la secuencia solicitada → recibido → diagnóstico → reparación → listo.';
      return;
    }
    this.statusMessage = '';
    if (nextStatus === 'reparación' && order.quoteStatus !== 'aprobado') {
      this.statusMessage = 'La reparación solo puede comenzar después de aprobar el presupuesto.';
      return;
    }
    this.workshop.updateOrderStatus(order.id, nextStatus);
    if (this.selectedOrderId === order.id) {
      this.selectedOrderId = order.id;
    }
  }
  acceptRequest(order: WorkOrder): void { this.changeOrderStatus(order, 'recibido'); }
  markFinished(): void {
    const active = this.activeOrder;
    if (!active) return;
    this.changeOrderStatus(active, 'listo');
  }
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
  vehiclePlateByOrder(vehicleId: number): string { return this.workshop.vehicles().find((item) => item.id === vehicleId)?.plate ?? 'Sin patente'; }
  getQuoteTotal(): number {
    return this.workshop.calculateQuoteTotal({
      partsCost: Number(this.partsCost) || 0,
      laborCost: Number(this.laborCost) || 0,
      otherCosts: Number(this.otherCosts) || 0,
      quoteHours: Number(this.quoteHours) || 0,
    });
  }
}