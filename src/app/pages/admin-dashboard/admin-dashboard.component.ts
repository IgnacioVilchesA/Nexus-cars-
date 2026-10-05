import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { User, Vehicle, WorkOrder, WorkOrderStatus, SparePart } from '../../models/workshop.models';
import { WorkshopService } from '../../core/services/workshop.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent {
  section = 'inicio';
  staffForm = { name: '', email: '', password: 'NexusCars2026', role: 'mecanico' as 'mecanico' | 'recepcionista' };
  staffMessage = '';
  vehicleForm = { ownerId: 2, type: 'Auto' as 'Auto' | 'Moto', brand: '', model: '', plate: '', year: new Date().getFullYear() };
  orderForm = { clientId: 2, vehicleId: 1, description: '', status: 'solicitada' as WorkOrderStatus, services: 'Mantención preventiva' };
  sparePartForm = { name: '', code: '', category: 'Mantenimiento', price: 0, stock: 0, stockMinimo: 1, supplier: '' };
  editingVehicleId = 0;
  editingOrderId = 0;
  editingSparePartId = 0;

  readonly statuses: WorkOrderStatus[] = ['solicitada', 'recibido', 'diagnóstico', 'reparación', 'listo'];

  readonly nav = [
    { id: 'inicio', label: 'Inicio', icon: '⌂' },
    { id: 'personal', label: 'Personal', icon: '♙' },
    { id: 'usuarios', label: 'Usuarios', icon: '◎' },
    { id: 'vehiculos', label: 'Vehículos', icon: '▱' },
    { id: 'ordenes', label: 'Órdenes', icon: '▤' },
    { id: 'inventario', label: 'Inventario', icon: '▦' },
    { id: 'indicadores', label: 'Indicadores', icon: '◷' }
  ];

  constructor(public workshop: WorkshopService, private readonly router: Router) {
    this.workshop.loadStockMovements();
  }

  get users(): User[] { return this.workshop.users(); }
  get clients(): User[] { return this.users.filter((user) => user.role === 'cliente' && user.active !== false); }
  get mechanics(): User[] { return this.users.filter((user) => user.role === 'mecanico' && user.active !== false); }
  get vehicles(): Vehicle[] { return this.workshop.vehicles(); }
  get orders(): WorkOrder[] { return this.workshop.orders(); }
  get spareParts(): SparePart[] { return this.workshop.spareParts(); }
  get lowStockParts(): SparePart[] { return this.spareParts.filter((part) => part.stock <= part.stockMinimo); }
  get totalRevenue(): number { return this.orders.reduce((sum, order) => sum + Number(order.quoteTotal ?? order.cost ?? 0), 0); }
  get activeOrdersCount(): number { return this.orders.filter((order) => order.status !== 'listo').length; }

  logout(): void {
    this.workshop.logout();
    this.router.navigate(['/']);
  }

  setSection(id: string): void {
    this.section = id;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  createStaff(): void {
    const name = this.staffForm.name.trim();
    const email = this.staffForm.email.trim();
    const password = this.staffForm.password.trim();
    if (!name || !email || password.length < 12) {
      this.staffMessage = 'Completa nombre, correo y una contraseña de al menos 8 caracteres.';
      return;
    }
    this.workshop.createStaffAccount(name, email, password, this.staffForm.role, (user, error) => {
      this.staffMessage = error || (user ? `Cuenta de ${user.role} creada correctamente.` : 'No se pudo crear la cuenta.');
      if (user) this.staffForm = { name: '', email: '', password: 'NexusCars2026', role: this.staffForm.role };
    });
  }

  async exportWorkbook(): Promise<void> {
    this.workshop.recordExport('Libro Excel administrativo');
    const XLSX = await import('xlsx');
    const movements = await this.workshop.loadStockMovements(100000);
    const workbook = XLSX.utils.book_new();
    const activeOrders = this.orders.filter((order) => !['listo', 'entregado', 'cerrado', 'cancelado'].includes(order.status));
    const sheets: [string, Record<string, unknown>[]][] = [
      ['Resumen', [
        { Indicador: 'Usuarios activos', Total: this.users.filter((user) => user.active !== false).length },
        { Indicador: 'Clientes', Total: this.clients.length },
        { Indicador: 'Mecánicos', Total: this.mechanics.length },
        { Indicador: 'Recepcionistas', Total: this.users.filter((user) => user.role === 'recepcionista').length },
        { Indicador: 'Vehículos', Total: this.vehicles.length },
        { Indicador: 'Órdenes activas', Total: activeOrders.length },
        { Indicador: 'Total estimado en órdenes', Total: this.totalRevenue },
        { Indicador: 'Repuestos bajo mínimo', Total: this.spareParts.filter((part) => part.stock <= part.stockMinimo).length }
      ]],
      ['Usuarios', this.users.map(({ id, name, email, role, active, rut, phone, alternatePhone }) => ({ ID: id, Nombre: name, Correo: email, Rol: role, RUT: rut || '', Celular: phone || '', 'Teléfono alternativo': alternatePhone || '', Activo: active !== false }))],
      ['Vehículos', this.vehicles.map((vehicle) => ({ ID: vehicle.id, Propietario: this.getClientName(vehicle.ownerId), Tipo: vehicle.type, Marca: vehicle.brand, Modelo: vehicle.model, Patente: vehicle.plate, Año: vehicle.year, Activo: vehicle.active !== false }))],
      ['Órdenes', this.orders.map((order) => ({ ID: order.id, Cliente: this.getClientName(order.clientId), Vehículo: this.getVehicleName(order.vehicleId), Descripción: order.description, Estado: order.status, 'Estado cotización': order.quoteStatus || '', Servicios: order.services.join(', '), 'Kilometraje ingreso': order.entryMileage ?? '', Combustible: order.fuelLevel || '', Daños: order.damages || '', 'Objetos dejados': order.leftItems || '', 'Notas recepción': order.receptionNotes || '', Mecánico: order.assignedMechanic || '', 'Cotización total': order.quoteTotal ?? order.cost ?? 0, 'Total final': order.totalFinal ?? '', 'Fecha estimada': order.estimatedDate || '', Fecha: order.createdAt }))],
      ['Cotizaciones', this.workshop.quotes().map((quote) => ({ ID: quote.id, Orden: quote.orderId, Versión: quote.version, Subtotal: quote.subtotal, Descuento: quote.descuento, Total: quote.totalEstimado, Estado: quote.estado, 'Creada por': quote.creadoPor, 'Fecha creación': quote.fechaCreacion, 'Fecha respuesta': quote.fechaRespuesta || '', 'Aprobado por': quote.aprobadoPor || '', 'Medio respuesta': quote.medioRespuesta || '', 'Motivo rechazo': quote.motivoRechazo || '', Detalles: quote.detalles.map((detail) => `${detail.descripcion} x${detail.cantidad}: ${detail.subtotal}`).join('; ') }))],
      ['Trabajos adicionales', this.workshop.additionalWorks().map((work) => ({ Orden: work.orderId, Mecánico: work.mecanicoId, Descripción: work.descripcion, Motivo: work.motivo, Observaciones: work.observaciones || '', 'Costo estimado': work.costoEstimado, Estado: work.estado }))],
      ['Inventario', this.spareParts.map((part) => ({ ID: part.id, Nombre: part.name, Código: part.code, Categoría: part.category, Precio: part.price, Stock: part.stock, 'Stock mínimo': part.stockMinimo, Proveedor: part.supplier || '' }))],
      ['Movimientos', movements.map((movement) => ({ Fecha: movement.createdAt, Repuesto: movement.partName, Código: movement.partCode, Tipo: movement.type, Cantidad: movement.quantity, 'Stock anterior': movement.stockBefore, 'Stock nuevo': movement.stockAfter, Responsable: movement.userName, Proveedor: movement.supplier, Referencia: movement.reference, Orden: movement.orderId || '' }))]
    ];
    for (const [name, rows] of sheets) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
    }
    XLSX.writeFile(workbook, `nexus-cars-${new Date().toISOString().slice(0, 10)}.xlsx`);
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

  saveSparePart(): void {
    if (!this.sparePartForm.name || !this.sparePartForm.code) return;

    const payload = {
      name: this.sparePartForm.name.trim(),
      code: this.sparePartForm.code.trim().toUpperCase(),
      category: this.sparePartForm.category,
      price: Number(this.sparePartForm.price) || 0,
      stock: Number(this.sparePartForm.stock) || 0,
      stockMinimo: Number(this.sparePartForm.stockMinimo) || 1,
      supplier: this.sparePartForm.supplier.trim(),
      active: true
    };

    if (this.editingSparePartId) {
      this.workshop.updateSparePart(this.editingSparePartId, payload);
      this.editingSparePartId = 0;
    } else {
      this.workshop.addSparePart(payload);
    }

    this.sparePartForm = { name: '', code: '', category: 'Mantenimiento', price: 0, stock: 0, stockMinimo: 1, supplier: '' };
  }

  editSparePart(part: SparePart): void {
    this.editingSparePartId = part.id;
    this.sparePartForm = {
      name: part.name,
      code: part.code,
      category: part.category,
      price: part.price,
      stock: part.stock,
      stockMinimo: part.stockMinimo,
      supplier: part.supplier || ''
    };
  }

  deleteSparePart(id: number): void {
    this.workshop.deleteSparePart(id);
  }

  getVehicleName(vehicleId: number): string {
    const vehicle = this.vehicles.find((item) => item.id === vehicleId);
    return vehicle ? `${vehicle.brand} ${vehicle.model} · ${vehicle.plate}` : 'Vehículo';
  }

  getClientName(userId: number): string {
    return this.users.find((item) => item.id === userId)?.name ?? 'Cliente';
  }
}
