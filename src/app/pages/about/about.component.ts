import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../components/footer/footer.component';
import { NavbarComponent } from '../../components/navbar/navbar.component';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [FooterComponent, NavbarComponent, RouterLink],
  templateUrl: './about.component.html',
  styleUrl: './about.component.css'
})
export class AboutComponent {
  benefits = [
    { number: '01', title: 'Mecánicos especializados', text: 'Personas que conocen su oficio y explican cada decisión.' },
    { number: '02', title: 'Diagnóstico profesional', text: 'Equipamiento y criterio técnico para reparar lo necesario.' },
    { number: '03', title: 'Seguimiento del vehículo', text: 'Siempre sabrás en qué etapa está tu vehículo.' },
    { number: '04', title: 'Autos y motos', text: 'Un solo equipo para cuidar todo lo que te mueve.' }
  ];
}
