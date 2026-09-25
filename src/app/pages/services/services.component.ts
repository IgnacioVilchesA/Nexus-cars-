import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../components/footer/footer.component';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { ServiceCardComponent } from '../../components/service-card/service-card.component';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [FooterComponent, NavbarComponent, RouterLink, ServiceCardComponent],
  templateUrl: './services.component.html',
  styleUrl: './services.component.css'
})
export class ServicesComponent {
  services = [
    { icon: '◌', title: 'Mantención preventiva', description: 'Anticipamos problemas para que sigas avanzando tranquilo.' },
    { icon: '✦', title: 'Cambio de aceite', description: 'Lubricación precisa para prolongar la vida de tu motor.' },
    { icon: '◈', title: 'Frenos', description: 'Revisión y reparación del sistema más importante.' },
    { icon: '⌁', title: 'Diagnóstico computarizado', description: 'Tecnología que encuentra la falla a la primera.' },
    { icon: '⚙', title: 'Reparación de motor', description: 'Experiencia técnica para devolverle fuerza a tu vehículo.' },
    { icon: '⌕', title: 'Reparación de motos', description: 'El mismo cuidado experto para tus dos ruedas.' }
  ];
}
