import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { WorkshopService } from '../../core/services/workshop.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css'
})
export class RegisterComponent {
  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  errorMessage = '';
  loading = false;

  constructor(private readonly workshop: WorkshopService, private readonly router: Router) { }

  register(): void {
    this.errorMessage = '';
    if (!this.name.trim() || !this.email.trim() || this.password.length < 12) {
      this.errorMessage = 'Completa todos los campos. La contraseña debe tener al menos 12 caracteres.';
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Las contraseñas no coinciden.';
      return;
    }

    this.loading = true;
    this.workshop.registerClient(this.name, this.email, this.password, (user, error) => {
      this.loading = false;
      if (user) {
        this.router.navigate(['/login'], { queryParams: { registered: '1' } });
      } else {
        this.errorMessage = error || 'No se pudo crear la cuenta.';
      }
    });
  }
}
