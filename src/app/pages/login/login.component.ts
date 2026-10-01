import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { WorkshopService } from '../../core/services/workshop.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  email = '';
  password = '';
  remember = false;
  submitted = false;
  loading = false;
  errorMessage = '';
  requirePasswordChange = false;
  newPassword = '';
  confirmPassword = '';
  passwordChangeError = '';

  constructor(private readonly workshop: WorkshopService, private readonly router: Router) {
    const user = this.workshop.currentUser();
    if (user && !user.forcePasswordChange) {
      const target = user.role === 'admin'
        ? '/admin'
        : user.role === 'recepcionista'
          ? '/recepcionista'
          : user.role === 'mecanico'
            ? '/mecanico'
            : '/cliente';
      this.router.navigate([target]);
    }
  }

  login(): void {
    if (!this.email || !this.password) {
      this.errorMessage = 'Por favor ingresa tu correo y contraseña.';
      return;
    }

    this.errorMessage = '';
    this.submitted = false;
    this.loading = true;

    this.workshop.login(this.email, this.password, (user, error) => {
      this.loading = false;
      this.submitted = true;

      if (user) {
        if (user.forcePasswordChange) {
          this.requirePasswordChange = true;
          this.passwordChangeError = '';
          return;
        }
        const target = user.role === 'admin'
          ? '/admin'
          : user.role === 'recepcionista'
            ? '/recepcionista'
            : user.role === 'mecanico'
              ? '/mecanico'
              : '/cliente';
        this.router.navigate([target]);
      } else {
        this.errorMessage = error || 'El correo o la contraseña no son correctos.';
      }
    });
  }

  changeTemporaryPassword(): void {
    if (this.newPassword.length < 8) { this.passwordChangeError = 'La nueva contraseña debe tener al menos 8 caracteres.'; return; }
    if (this.newPassword !== this.confirmPassword) { this.passwordChangeError = 'Las contraseñas no coinciden.'; return; }
    this.loading = true;
    this.workshop.changeTemporaryPassword(this.newPassword, (user, error) => {
      this.loading = false;
      if (!user) { this.passwordChangeError = error || 'No se pudo actualizar la contraseña.'; return; }
      const target = user.role === 'admin' ? '/admin' : user.role === 'recepcionista' ? '/recepcionista' : user.role === 'mecanico' ? '/mecanico' : '/cliente';
      this.router.navigate([target]);
    });
  }
}
