export type UserRole = 'recepcionista' | 'mecanico' | 'cliente' | 'admin';

export type WorkOrderStatus =
  | 'solicitada'
  | 'recibido'
  | 'diagnóstico'
  | 'reparación'
  | 'listo'
  | 'en_diagnostico'
  | 'cotizacion_pendiente'
  | 'cotizacion_aprobada'
  | 'en_reparacion'
  | 'esperando_aprobacion'
  | 'trabajo_terminado'
  | 'listo_para_entrega'
  | 'entregado'
  | 'cerrado'
  | 'cancelado';

export type QuoteStatus = 'pendiente' | 'aprobado' | 'rechazado' | 'modificada' | 'reemplazada' | 'cancelada';

export interface User {
  id: number;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  rut?: string;
  phone?: string;
  alternatePhone?: string;
  dataConsent?: boolean;
  consentAt?: string;
  active?: boolean;
  forcePasswordChange?: boolean;
}

export interface Vehicle {
  id: number;
  ownerId: number;
  type: 'Auto' | 'Moto';
  brand: string;
  model: string;
  plate: string;
  year: number;
  active?: boolean;
}

export interface WorkOrder {
  id: number;
  clientId: number;
  vehicleId: number;
  description: string;
  status: WorkOrderStatus;
  entryMileage?: number;
  fuelLevel?: string;
  receptionNotes?: string;
  damages?: string;
  leftItems?: string;
  receptionPhotos?: string[];
  estimatedDate?: string;
  appointmentAt?: string;
  services: string[];
  createdAt: string;
  nextMaintenance: string;
  quoteStatus?: QuoteStatus;
  mechanicId?: number;
  recepcionistaId?: number;
  assignedMechanic?: string;
  diagnosis?: string;
  observations?: string;
  failures?: string[];
  repairs?: string[];
  parts?: string[];
  laborHours?: number;
  tests?: string[];
  cost?: number;
  evidence?: string[];
  partsCost?: number;
  laborCost?: number;
  otherCosts?: number;
  quoteHours?: number;
  quoteTotal?: number;
  notifications?: string[];
  nextMaintenanceDate?: string;
  recommendedMileage?: number;
  recommendedNotes?: string;
  totalFinal?: number;
  quoteVersion?: number;
}

export interface OrderQuote {
  id: number;
  orderId: number;
  version: number;
  subtotal: number;
  descuento: number;
  totalEstimado: number;
  motivoModificacion?: string;
  estado: QuoteStatus;
  creadoPor: number;
  fechaCreacion: string;
  fechaRespuesta?: string;
  observaciones?: string;
  aprobadoPor?: string;
  medioRespuesta?: 'presencial' | 'whatsapp' | 'portal';
  motivoRechazo?: string;
  detalles: QuoteDetail[];
}

export interface QuoteDetail {
  id: number;
  cotizacionId: number;
  tipo: 'MANO_DE_OBRA' | 'REPUESTO' | 'SERVICIO' | 'OTRO';
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface SparePart {
  id: number;
  name: string;
  code: string;
  category: string;
  price: number;
  stock: number;
  stockMinimo: number;
  supplier?: string;
  active?: boolean;
}

export interface StockMovement {
  id: number;
  sparePartId: number;
  partName: string;
  partCode: string;
  userId: number | null;
  userName: string;
  orderId: number | null;
  type: 'entrada' | 'salida' | 'ajuste';
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  supplier: string;
  reference: string;
  createdAt: string;
}

export interface AdditionalWork {
  id: number;
  orderId: number;
  mecanicoId: number;
  descripcion: string;
  motivo: string;
  observaciones?: string;
  costoEstimado: number;
  estado: 'PENDIENTE_REVISION' | 'PENDIENTE_APROBACION' | 'APROBADO' | 'RECHAZADO' | 'REALIZADO' | 'CANCELADO';
  fecha: string;
}

export interface OrderHistory {
  id: number;
  orderId: number;
  usuarioId: number;
  accion: string;
  descripcion: string;
  fecha: string;
  estadoAnterior?: string;
  estadoNuevo?: string;
}

export const WORK_ORDER_STATUS_SEQUENCE: WorkOrderStatus[] = [
  'solicitada',
  'recibido',
  'diagnóstico',
  'en_diagnostico',
  'cotizacion_pendiente',
  'cotizacion_aprobada',
  'en_reparacion',
  'esperando_aprobacion',
  'trabajo_terminado',
  'listo_para_entrega',
  'entregado',
  'cerrado'
];
