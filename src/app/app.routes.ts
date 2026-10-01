import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { AdminDashboardComponent } from './pages/admin-dashboard/admin-dashboard.component';
import { ClientDashboardComponent } from './pages/client-dashboard/client-dashboard.component';
import { RegisterComponent } from './pages/register/register.component';
import { MechanicDashboardComponent } from './pages/mechanic-dashboard/mechanic-dashboard.component';
import { ServicesComponent } from './pages/services/services.component';
import { AboutComponent } from './pages/about/about.component';
import { ContactComponent } from './pages/contact/contact.component';
import { ReceptionistDashboardComponent } from './pages/receptionist-dashboard/receptionist-dashboard.component';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
	{ path: '', component: HomeComponent },
	{ path: 'servicios', component: ServicesComponent },
	{ path: 'nosotros', component: AboutComponent },
	{ path: 'contacto', component: ContactComponent },
	{ path: 'login', component: LoginComponent },
	{ path: 'registro', component: RegisterComponent },
	{ path: 'admin', component: AdminDashboardComponent, canActivate: [roleGuard('admin')] },
	{ path: 'recepcionista', component: ReceptionistDashboardComponent, canActivate: [roleGuard('recepcionista')] },
	{ path: 'recepcion', redirectTo: 'recepcionista', pathMatch: 'full' },
	{ path: 'mecanico', component: MechanicDashboardComponent, canActivate: [roleGuard('mecanico')] },
	{ path: 'cliente', component: ClientDashboardComponent, canActivate: [roleGuard('cliente')] },
	{ path: '**', redirectTo: '' }
];
