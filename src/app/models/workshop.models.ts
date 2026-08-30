export type UserRole = 'admin' | 'cliente';
export type WorkOrderStatus = 'recibido' | 'diagnóstico' | 'reparación' | 'listo';

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
}
