import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Vehicle, WorkOrder } from '../../models/workshop.models';
import { WorkshopService } from '../../core/services/workshop.service';

@Component({ selector: 'app-client-dashboard', standalone: true, imports: [CommonModule], templateUrl: './client-dashboard.component.html', styleUrl: './client-dashboard.component.css' })
export class ClientDashboardComponent {
  constructor(public workshop: WorkshopService, private readonly router: Router) { }
  get user() { return this.workshop.currentUser()!; }
  get vehicles(): Vehicle[] { return this.workshop.vehicles().filter((vehicle) => vehicle.ownerId === this.user.id); }
  get orders(): WorkOrder[] { return this.workshop.clientOrders(this.user.id); }
  logout(): void { this.workshop.logout(); this.router.navigate(['/']); }
  vehicleLabel(id: number): string { const vehicle = this.workshop.vehicles().find((item) => item.id === id); return vehicle ? `${vehicle.brand} ${vehicle.model}` : 'Vehículo'; }
}
