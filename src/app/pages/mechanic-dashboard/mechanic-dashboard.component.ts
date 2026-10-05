import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  Vehicle,
  WorkOrder,
  WorkOrderStatus
} from '../../models/workshop.models';
import { WorkshopService } from '../../core/services/workshop.service';

type MechanicSection =
  | 'inicio'
  | 'vehiculos'
  | 'ordenes'
  | 'historial';

type OrderTab =
  | 'resumen'
  | 'inspeccion'
  | 'diagnostico'
  | 'reparacion'
  | 'repuestos'
  | 'evidencias'
  | 'costos';

interface InspectionItem {
  name: string;
  status: 'pendiente' | 'bueno' | 'observacion' | 'reparar';
}

@Component({
  selector: 'app-mechanic-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mechanic-dashboard.component.html',
  styleUrl: './mechanic-dashboard.component.css'
})
export class MechanicDashboardComponent {

  // ============================================================
  // NAVEGACIÓN
  // ============================================================

  activeSection: MechanicSection = 'inicio';
  activeOrderTab: OrderTab = 'resumen';

  // ============================================================
  // BÚSQUEDA Y FILTROS
  // ============================================================

  searchTerm = '';
  statusFilter: 'todos' | WorkOrderStatus = 'todos';

  // ============================================================
  // ORDEN SELECCIONADA
  // ============================================================

  selectedOrderId = 0;
  selectedVehicleId = 0;

  // ============================================================
  // DATOS DE LA ORDEN
  // ============================================================

  mechanicName = 'Mecánico principal';

  diagnosis = '';
  observations = '';
  failuresText = '';
  repairsText = '';
  partsText = '';
  testsText = '';

  laborHours = 0;

  partsCost = 0;
  laborCost = 0;
  otherCosts = 0;
  quoteHours = 0;

  evidenceText = '';

  // ============================================================
  // TRABAJO ADICIONAL
  // ============================================================

  additionalDesc = '';
  additionalReason = '';
  additionalCost = 0;
  additionalMessage = '';
  selectedPartId = 0;
  selectedPartQty = 1;

  // ============================================================
  // MENSAJES
  // ============================================================

  statusMessage = '';
  saveMessage = '';

  // ============================================================
  // CHECKLIST DE INSPECCIÓN
  // ============================================================

  inspectionItems: InspectionItem[] = [
    { name: 'Aceite del motor', status: 'pendiente' },
    { name: 'Líquido refrigerante', status: 'pendiente' },
    { name: 'Líquido de frenos', status: 'pendiente' },
    { name: 'Batería', status: 'pendiente' },
    { name: 'Neumáticos', status: 'pendiente' },
    { name: 'Frenos', status: 'pendiente' },
    { name: 'Suspensión', status: 'pendiente' },
    { name: 'Dirección', status: 'pendiente' },
    { name: 'Luces', status: 'pendiente' }
  ];

  // ============================================================
  // ESTADOS
  // ============================================================

  readonly statuses: WorkOrderStatus[] = [
    'solicitada',
    'recibido',
    'en_diagnostico',
    'cotizacion_pendiente',
    'cotizacion_aprobada',
    'en_reparacion',
    'esperando_aprobacion',
    'trabajo_terminado',
    'listo',
    'listo_para_entrega',
    'entregado',
    'cerrado'
  ];

  constructor(
    public workshop: WorkshopService,
    private readonly router: Router
  ) {}

  // ============================================================
  // DATOS GENERALES
  // ============================================================

  get clients() {
    return this.workshop
      .users()
      .filter((user) => user.role === 'cliente');
  }

  get spareParts() {
    return this.workshop.spareParts();
  }

  get selectedSparePart() {
    return this.spareParts.find((part) => part.id === Number(this.selectedPartId));
  }

  get selectedVehicle(): Vehicle | undefined {
    return this.workshop
      .vehicles()
      .find((vehicle) => vehicle.id === Number(this.selectedVehicleId));
  }

  get activeOrder(): WorkOrder | undefined {
    return this.workshop
      .orders()
      .find((order) => order.id === Number(this.selectedOrderId));
  }

  get vehicleHistory(): WorkOrder[] {
    if (!this.selectedVehicle) {
      return [];
    }

    return this.workshop
      .orders()
      .filter((order) => order.vehicleId === this.selectedVehicle!.id);
  }

  // ============================================================
  // RESUMEN
  // ============================================================

  get pendingOrders(): number {
    return this.workshop
      .orders()
      .filter((order) =>
        ['solicitada', 'recibido'].includes(order.status)
      ).length;
  }

  get diagnosticOrders(): number {
    return this.workshop
      .orders()
      .filter((order) => order.status === 'en_diagnostico')
      .length;
  }

  get repairOrders(): number {
    return this.workshop
      .orders()
      .filter((order) => order.status === 'en_reparacion')
      .length;
  }

  get finishedOrders(): number {
    return this.workshop
      .orders()
      .filter((order) =>
        ['trabajo_terminado', 'listo', 'listo_para_entrega'].includes(
          order.status
        )
      ).length;
  }

  // ============================================================
  // ÓRDENES FILTRADAS
  // ============================================================

  get filteredOrders(): WorkOrder[] {
    const search = this.searchTerm.trim().toLowerCase();

    return this.workshop.orders().filter((order) => {

      const vehicle = this.workshop
        .vehicles()
        .find((item) => item.id === order.vehicleId);

      const client = this.clientNameById(order.clientId);

      const vehicleText = vehicle
        ? `${vehicle.brand} ${vehicle.model} ${vehicle.plate}`
        : '';

      const orderText = `
        ${order.id}
        ${order.description}
        ${order.services?.join(' ') || ''}
      `;

      const searchableText = `
        ${vehicleText}
        ${client}
        ${orderText}
      `.toLowerCase();

      const matchesSearch =
        !search || searchableText.includes(search);

      const matchesStatus =
        this.statusFilter === 'todos' ||
        order.status === this.statusFilter;

      return matchesSearch && matchesStatus;
    });
  }

  get assignedVehicles(): Vehicle[] {
    const vehicleIds = new Set(
      this.workshop
        .orders()
        .map((order) => order.vehicleId)
    );

    return this.workshop
      .vehicles()
      .filter((vehicle) => vehicleIds.has(vehicle.id))
      .filter((vehicle) => {
        if (!this.searchTerm.trim()) {
          return true;
        }

        const search = this.searchTerm.toLowerCase();

        const text = `
          ${vehicle.brand}
          ${vehicle.model}
          ${vehicle.plate}
          ${this.clientNameById(vehicle.ownerId)}
        `.toLowerCase();

        return text.includes(search);
      });
  }

  // ============================================================
  // NAVEGACIÓN
  // ============================================================

  setSection(section: MechanicSection): void {
    this.activeSection = section;

    if (section !== 'historial') {
      this.activeOrderTab = 'resumen';
    }
  }

  setOrderTab(tab: OrderTab): void {
    this.activeOrderTab = tab;
  }

  // ============================================================
  // SELECCIÓN
  // ============================================================

  selectVehicle(id: number): void {
    this.selectedVehicleId = Number(id);
    this.activeSection = 'vehiculos';
  }

  selectOrder(order: WorkOrder): void {
    this.selectedOrderId = order.id;
    this.selectedVehicleId = order.vehicleId;

    this.activeSection = 'ordenes';
    this.activeOrderTab = 'resumen';

    this.loadOrderData(order);

    this.statusMessage = '';
    this.saveMessage = '';
    this.additionalMessage = '';
  }

  openVehicle(order: WorkOrder): void {
    this.selectOrder(order);
    this.activeOrderTab = 'resumen';
  }

  // ============================================================
  // CARGAR DATOS DE ORDEN
  // ============================================================

  private loadOrderData(order: WorkOrder): void {
    this.mechanicName =
      order.assignedMechanic || 'Mecánico principal';

    this.diagnosis = order.diagnosis || '';
    this.observations = order.observations || '';

    this.failuresText =
      (order.failures || []).join('\n');

    this.repairsText =
      (order.repairs || []).join('\n');

    this.partsText =
      (order.parts || []).join('\n');

    this.laborHours =
      order.laborHours || 0;

    this.testsText =
      (order.tests || []).join('\n');

    this.partsCost =
      order.partsCost || 0;

    const selectedPartFromOrder = this.spareParts.find((part) =>
      (order.parts || []).some((name) => name.toLowerCase().includes(part.name.toLowerCase()))
    );
    this.selectedPartId = selectedPartFromOrder?.id ?? 0;
    this.selectedPartQty = 1;

    this.laborCost =
      order.laborCost || 0;

    this.otherCosts =
      order.otherCosts || 0;

    this.quoteHours =
      order.quoteHours || 0;

    this.evidenceText =
      (order.evidence || []).join('\n');

    this.resetInspection();
  }

  // ============================================================
  // ESTADOS
  // ============================================================

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      solicitada: 'Solicitada',
      recibido: 'Recibido',
      en_diagnostico: 'En diagnóstico',
      cotizacion_pendiente: 'Cotización pendiente',
      cotizacion_aprobada: 'Cotización aprobada',
      en_reparacion: 'En reparación',
      esperando_aprobacion: 'Esperando aprobación',
      trabajo_terminado: 'Trabajo terminado',
      listo: 'Listo',
      listo_para_entrega: 'Listo para entrega',
      entregado: 'Entregado',
      cerrado: 'Cerrado'
    };

    return labels[status] || status;
  }

  getNextAction(order: WorkOrder): string {
    switch (order.status) {
      case 'solicitada':
        return 'Aceptar solicitud';

      case 'recibido':
        return 'Iniciar diagnóstico';

      case 'en_diagnostico':
        return 'Iniciar reparación';

      case 'en_reparacion':
        return 'Continuar reparación';

      case 'cotizacion_pendiente':
        return 'Esperar aprobación';

      case 'cotizacion_aprobada':
        return 'Iniciar reparación';

      case 'trabajo_terminado':
        return 'Trabajo terminado';

      default:
        return 'Ver orden';
    }
  }

  getStatusClass(status: string): string {
    return status
      .replace(/_/g, '-')
      .toLowerCase();
  }

  acceptRequest(order: WorkOrder): void {
    this.changeOrderStatus(order, 'recibido');
  }

  isUnassigned(order: WorkOrder): boolean {
    return !order.mechanicId && !order.assignedMechanic;
  }

  takeOrder(order: WorkOrder): void {
    const mechanic = this.workshop.currentUser();
    if (!mechanic) {
      return;
    }

    this.workshop.assignMechanic(order.id, mechanic.id, mechanic.name);
    this.selectOrder({
      ...order,
      mechanicId: mechanic.id,
      assignedMechanic: mechanic.name,
      status: order.status === 'recibido' ? 'en_diagnostico' : order.status
    });
    this.saveMessage = 'Orden asignada a tu bandeja.';
  }

  nextActionLabel(order: WorkOrder): string | null {
    if (this.isUnassigned(order)) {
      return null;
    }

    switch (order.status) {
      case 'solicitada':
        return 'Aceptar solicitud';
      case 'recibido':
        return 'Iniciar diagnóstico';
      case 'en_diagnostico':
        return 'Iniciar reparación';
      case 'en_reparacion':
        return 'Continuar reparación';
      default:
        return null;
    }
  }

  advanceOrder(order: WorkOrder): void {
    const nextStatusMap: Partial<Record<WorkOrderStatus, WorkOrderStatus>> = {
      solicitada: 'recibido',
      recibido: 'en_diagnostico',
      en_diagnostico: 'en_reparacion',
      en_reparacion: 'trabajo_terminado'
    };

    const nextStatus = nextStatusMap[order.status as keyof typeof nextStatusMap];
    if (!nextStatus) {
      return;
    }

    this.changeOrderStatus(order, nextStatus);
  }

  changeOrderStatus(
    order: WorkOrder,
    nextStatus: WorkOrderStatus
  ): void {

    if (
      !this.workshop.canTransitionOrderStatus(
        order.status,
        nextStatus,
        order.quoteStatus
      )
    ) {
      this.statusMessage =
        'No puedes saltar estados. Sigue la secuencia de trabajo definida.';

      return;
    }

    this.statusMessage = '';

    this.workshop.updateOrderStatus(
      order.id,
      nextStatus
    );
  }

  // ============================================================
  // GUARDAR FICHA DEL MECÁNICO
  // ============================================================

  onSparePartChange(): void {
    const part = this.selectedSparePart;
    if (!part) {
      this.partsCost = Number(this.partsCost) || 0;
      return;
    }

    this.partsCost = part.price * Math.max(1, Number(this.selectedPartQty) || 1);
  }

  saveMechanicData(): void {
    if (!this.activeOrder) {
      return;
    }

    const selectedPart = this.selectedSparePart;
    const quantity = Math.max(1, Number(this.selectedPartQty) || 1);
    const computedPartCost = selectedPart ? selectedPart.price * quantity : Number(this.partsCost) || 0;

    if (selectedPart && selectedPart.stock < quantity) {
      this.statusMessage = 'No hay stock suficiente para ese repuesto.';
      return;
    }

    this.partsCost = computedPartCost;
    this.statusMessage = '';

    const quoteTotal = this.getQuoteTotal();
    const mergedParts = selectedPart ? [`${selectedPart.name} x${quantity}`, ...this.toLines(this.partsText)] : this.toLines(this.partsText);

    if (selectedPart) {
      this.workshop.consumeSparePart(selectedPart.id, quantity, this.activeOrder.id);
    }

    this.workshop.updateOrderDetails(
      this.activeOrder.id,
      {
        assignedMechanic: this.mechanicName,

        diagnosis: this.diagnosis,

        observations: this.observations,

        failures: this.toLines(
          this.failuresText
        ),

        repairs: this.toLines(
          this.repairsText
        ),

        parts: mergedParts,

        laborHours:
          Number(this.laborHours) || 0,

        tests: this.toLines(
          this.testsText
        ),

        cost: quoteTotal,

        partsCost: computedPartCost,

        laborCost:
          Number(this.laborCost) || 0,

        otherCosts:
          Number(this.otherCosts) || 0,

        quoteHours:
          Number(this.quoteHours) || 0,

        quoteTotal,

        evidence: this.toLines(
          this.evidenceText
        )
      }
    );

    this.saveMessage =
      'Información de la orden guardada correctamente.';

    setTimeout(() => {
      this.saveMessage = '';
    }, 3500);
  }

  // ============================================================
  // FINALIZAR TRABAJO
  // ============================================================

  markFinished(): void {
    const active = this.activeOrder;

    if (!active) {
      return;
    }

    this.workshop.markWorkFinished(
      active.id
    );

    this.saveMessage =
      'Trabajo marcado como terminado.';
  }

  // ============================================================
  // COSTOS
  // ============================================================

  getQuoteTotal(): number {
    return this.workshop.calculateQuoteTotal({
      partsCost:
        Number(this.partsCost) || 0,

      laborCost:
        Number(this.laborCost) || 0,

      otherCosts:
        Number(this.otherCosts) || 0,

      quoteHours:
        Number(this.quoteHours) || 0
    });
  }

  // ============================================================
  // EVIDENCIAS
  // ============================================================

  addEvidenceFiles(event: Event): void {
    const input =
      event.target as HTMLInputElement;

    const files = Array
      .from(input.files || [])
      .filter((file) =>
        file.type.startsWith('image/')
      );

    files.forEach((file) => {

      const reader =
        new FileReader();

      reader.onload = () => {

        this.evidenceText =
          `${this.evidenceText}${
            this.evidenceText ? '\n' : ''
          }${reader.result}`;
      };

      reader.readAsDataURL(file);
    });

    input.value = '';
  }

  // ============================================================
  // CHECKLIST
  // ============================================================

  setInspectionStatus(
    item: InspectionItem,
    status: InspectionItem['status']
  ): void {
    item.status = status;
  }

  resetInspection(): void {
    this.inspectionItems.forEach(
      (item) => item.status = 'pendiente'
    );
  }

  get inspectionCompleted(): number {
    return this.inspectionItems.filter(
      (item) => item.status !== 'pendiente'
    ).length;
  }

  get inspectionProblems(): number {
    return this.inspectionItems.filter(
      (item) =>
        item.status === 'observacion' ||
        item.status === 'reparar'
    ).length;
  }

  // ============================================================
  // TRABAJOS ADICIONALES
  // ============================================================

  get currentOrderAdditionalWorks() {
    return this.workshop
      .additionalWorks()
      .filter(
        (work) =>
          work.orderId === this.selectedOrderId
      );
  }

  submitAdditionalWork(): void {

    if (!this.activeOrder) {
      return;
    }

    if (
      !this.additionalDesc.trim() ||
      !this.additionalCost
    ) {
      this.additionalMessage =
        'Ingresa descripción y costo estimado del problema adicional.';

      return;
    }

    const mechanic =
      this.workshop.currentUser();

    this.workshop.registerAdditionalWork(
      this.activeOrder.id,
      mechanic?.id ?? 3,
      this.additionalDesc.trim(),
      this.additionalReason.trim() ||
        'Falla imprevista detectada durante la reparación',
      Number(this.additionalCost)
    );

    this.additionalMessage =
      'Trabajo adicional registrado. Se notificó a recepción y al cliente para aprobación.';

    this.additionalDesc = '';
    this.additionalReason = '';
    this.additionalCost = 0;
  }

  // ============================================================
  // SERVICIOS
  // ============================================================

  selectedOrder = 0;
  newService = '';

  addService(): void {

    if (
      this.selectedOrder &&
      this.newService.trim()
    ) {

      this.workshop.addService(
        this.selectedOrder,
        this.newService.trim()
      );

      this.newService = '';
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

  clientNameById(id: number): string {
    return this.workshop
      .users()
      .find((user) => user.id === id)
      ?.name ?? 'Cliente';
  }

  vehicleLabel(id: number): string {
    const vehicle =
      this.workshop
        .vehicles()
        .find((item) => item.id === id);

    return vehicle
      ? `${vehicle.brand} ${vehicle.model} · ${vehicle.plate}`
      : 'Vehículo';
  }

  vehiclePlateByOrder(
    vehicleId: number
  ): string {

    return this.workshop
      .vehicles()
      .find(
        (item) => item.id === vehicleId
      )
      ?.plate ?? 'Sin patente';
  }

  private toLines(
    value: string
  ): string[] {

    return value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  // ============================================================
  // LOGOUT
  // ============================================================

  logout(): void {
    this.workshop.logout();
    this.router.navigate(['/']);
  }
}
