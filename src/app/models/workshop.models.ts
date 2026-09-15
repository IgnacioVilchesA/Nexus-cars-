export type UserRole = 'admin' | 'mecanico' | 'cliente';
export type WorkOrderStatus = 'solicitada' | 'recibido' | 'diagnóstico' | 'reparación' | 'listo';
export type QuoteStatus = 'pendiente' | 'aprobado' | 'rechazado';

export interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export interface Vehicle {
  id: number;
  ownerId: number;
  type: 'Auto' | 'Moto';
  brand: string;
  model: string;
  plate: string;
  year: number;
}

export interface WorkOrder {
  id: number;
  clientId: number;
  vehicleId: number;
  description: string;
  status: WorkOrderStatus;
  services: string[];
  createdAt: string;
  nextMaintenance: string;
  quoteStatus?: QuoteStatus;
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
}
