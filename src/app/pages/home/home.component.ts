import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../components/footer/footer.component';
import { NavbarComponent } from '../../components/navbar/navbar.component';
import { ServiceCardComponent } from '../../components/service-card/service-card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FooterComponent, NavbarComponent, RouterLink, ServiceCardComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  services = [
    { icon: '◌', title: 'Mantención preventiva', description: 'Anticipamos problemas para que sigas avanzando tranquilo.' },
    { icon: '✦', title: 'Cambio de aceite', description: 'Lubricación precisa para prolongar la vida de tu motor.' },
    { icon: '◈', title: 'Frenos', description: 'Revisión y reparación del sistema más importante.' },
    { icon: '⌁', title: 'Diagnóstico computarizado', description: 'Tecnología que encuentra la falla a la primera.' },
    { icon: '⚙', title: 'Reparación de motor', description: 'Experiencia técnica para devolverle fuerza a tu vehículo.' },
    { icon: '⌕', title: 'Reparación de motos', description: 'El mismo cuidado experto para tus dos ruedas.' }
  ];

  benefits = [
    { number: '01', title: 'Mecánicos especializados', text: 'Personas que conocen su oficio y explican cada decisión.' },
    { number: '02', title: 'Diagnóstico profesional', text: 'Equipamiento y criterio técnico para reparar lo necesario.' },
    { number: '03', title: 'Seguimiento del vehículo', text: 'Siempre sabrás en qué etapa está tu vehículo.' },
    { number: '04', title: 'Autos y motos', text: 'Un solo equipo para cuidar todo lo que te mueve.' }
  ];

  steps = [
    { number: '01', title: 'Ingresa tu vehículo', text: 'Cuéntanos qué necesita y agenda tu visita.' },
    { number: '02', title: 'Diagnosticamos', text: 'Revisamos a fondo y te explicamos el hallazgo.' },
    { number: '03', title: 'Reparamos', text: 'Trabajamos con repuestos adecuados y respaldo.' },
    { number: '04', title: 'Tú haces seguimiento', text: 'Consulta el avance de tu orden desde la plataforma.' }
  ];
}
