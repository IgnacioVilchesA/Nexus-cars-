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
  errorMessage = '';

  constructor(private readonly workshop: WorkshopService, private readonly router: Router) { }

  login(): void {
    this.errorMessage = '';
    const user = this.workshop.login(this.email, this.password);
    this.submitted = !user;
    if (user) {
      this.router.navigate([user.role === 'admin' ? '/admin' : '/cliente']);
    } else {
      this.errorMessage = 'El correo o la contraseña no son correctos.';
    }
  }
}
