import { Component, input } from '@angular/core';

@Component({
  selector: 'app-service-card',
  standalone: true,
  templateUrl: './service-card.component.html',
  styleUrl: './service-card.component.css'
})
export class ServiceCardComponent {
  icon = input('');
  title = input('');
  description = input('');
}
