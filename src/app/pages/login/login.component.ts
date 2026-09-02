import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';
import { WorkshopService } from '../../core/services/workshop.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
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

  constructor(private readonly workshop: WorkshopService, private readonly router: Router) {
    const user = this.workshop.currentUser();
    if (user) {
      this.router.navigate([user.role === 'admin' ? '/admin' : '/cliente']);
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
        this.router.navigate([user.role === 'admin' ? '/admin' : '/cliente']);
      } else {
        this.errorMessage = error || 'El correo o la contraseña no son correctos.';
      }
    });
  }
}
