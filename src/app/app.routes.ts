import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { LoginComponent } from './pages/login/login.component';
import { AdminDashboardComponent } from './pages/admin-dashboard/admin-dashboard.component';
import { ClientDashboardComponent } from './pages/client-dashboard/client-dashboard.component';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
	{ path: '', component: HomeComponent },
	{ path: 'login', component: LoginComponent },
	{ path: 'admin', component: AdminDashboardComponent, canActivate: [roleGuard('admin')] },
	{ path: 'cliente', component: ClientDashboardComponent, canActivate: [roleGuard('cliente')] },
	{ path: '**', redirectTo: '' }
];
