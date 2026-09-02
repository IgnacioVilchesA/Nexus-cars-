import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Vehicle, WorkOrder } from '../../models/workshop.models';
import { WorkshopService } from '../../core/services/workshop.service';

@Component({ selector: 'app-client-dashboard', standalone: true, imports: [CommonModule], templateUrl: './client-dashboard.component.html', styleUrl: './client-dashboard.component.css' })
export class ClientDashboardComponent {
  constructor(public workshop: WorkshopService, private readonly router: Router) { }
  get user() { return this.workshop.currentUser(); }
  get vehicles(): Vehicle[] {
    const u = this.user;
    return u ? this.workshop.vehicles().filter((vehicle) => vehicle.ownerId === u.id) : [];
  }
  get orders(): WorkOrder[] {
    const u = this.user;
    return u ? this.workshop.clientOrders(u.id) : [];
  }
  logout(): void { this.workshop.logout(); this.router.navigate(['/login']); }
  vehicleLabel(id: number): string { const vehicle = this.workshop.vehicles().find((item) => item.id === id); return vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Vehículo'; }
}
