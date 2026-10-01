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
  requestVehicleId = 0;
  requestDescription = '';
  requestService = 'Diagnóstico general';
  requestMessage = '';

  activeTab: 'auto' | 'garaje' | 'historial' = 'auto';
  showNewVehicleModal = false;
  showRequestModal = false;
  showProfileModal = false;

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
  get selectedOrder(): WorkOrder | undefined { 
    return this.orders.find((order) => order.id === Number(this.selectedOrderId)) || this.activeOrder; 
  }

  get activeOrder(): WorkOrder | undefined {
    return this.orders.find((order) => 
      order.status !== 'listo' && 
      order.status !== 'listo_para_entrega' && 
      order.status !== 'entregado' && 
      order.status !== 'cerrado'
    ) || this.orders[0];
  }

  get inProgressOrders(): WorkOrder[] {
    return this.orders.filter((order) => 
      order.status !== 'listo' && 
      order.status !== 'listo_para_entrega' && 
      order.status !== 'entregado' && 
      order.status !== 'cerrado'
    );
  }

  get completedOrders(): WorkOrder[] {
    return this.orders.filter((order) => 
      order.status === 'listo' || 
      order.status === 'listo_para_entrega' || 
      order.status === 'entregado' || 
      order.status === 'cerrado'
    );
  }

  get nextMaintenance(): string { return this.orders.find((order) => order.nextMaintenance && order.nextMaintenance !== 'Por definir')?.nextMaintenance || 'Por definir'; }
  get activeVehicles(): number { return this.vehicles.filter((vehicle) => this.orders.some((order) => order.vehicleId === vehicle.id && order.status !== 'listo')).length; }
  get orderProgress(): number {
    const progress: Record<string, number> = { 
      solicitada: 10, 
      recibido: 25, 
      diagnóstico: 50, 
      en_diagnostico: 50, 
      cotizacion_pendiente: 50,
      cotizacion_aprobada: 60,
      reparación: 75, 
      en_reparacion: 75, 
      esperando_aprobacion: 65,
      trabajo_terminado: 90,
      listo: 100, 
      listo_para_entrega: 100,
      entregado: 100,
      cerrado: 100 
    };
    return this.selectedOrder ? (progress[this.selectedOrder.status] ?? 25) : 0;
  }
  get quoteStatusLabel(): string {
    return this.selectedOrder?.quoteStatus || (this.selectedOrder?.cost ? 'pendiente' : 'sin cotización');
  }

  get currentOrderAdditionalWorks() {
    return this.workshop.additionalWorks().filter((w) => w.orderId === this.selectedOrder?.id);
  }

  get pendingAdditionalWorks() {
    return this.currentOrderAdditionalWorks.filter((w) => w.estado === 'PENDIENTE_REVISION' || w.estado === 'PENDIENTE_APROBACION');
  }

  decideAdditional(workId: number, approve: boolean): void {
    if (this.selectedOrder) {
      this.workshop.clientDecideAdditionalWork(this.selectedOrder.id, workId, approve);
    }
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
  requestServiceOrder(): void {
    const user = this.user;
    if (!user || !this.requestVehicleId || !this.requestDescription.trim()) return;
    this.workshop.addOrder({
      clientId: user.id,
      vehicleId: Number(this.requestVehicleId),
      description: this.requestDescription.trim(),
      status: 'solicitada',
      services: [this.requestService],
      nextMaintenance: 'Por definir'
    });
    this.requestDescription = '';
    this.requestMessage = 'Solicitud enviada. El mecánico revisará tu vehículo.';
  }
  respondToQuote(status: QuoteStatus): void {
    if (this.selectedOrder) this.workshop.respondToQuote(this.selectedOrder.id, status);
  }
  logout(): void { this.workshop.logout(); this.router.navigate(['/login']); }
  vehicleLabel(id: number): string { const vehicle = this.workshop.vehicles().find((item) => item.id === id); return vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Vehículo'; }
}
