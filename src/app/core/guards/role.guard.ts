import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../../models/workshop.models';
import { WorkshopService } from '../services/workshop.service';

export const roleGuard = (role: UserRole): CanActivateFn => () => {
  const workshop = inject(WorkshopService);
  const router = inject(Router);
  const user = workshop.currentUser();
  return user?.role === role ? true : router.createUrlTree(['/login']);
};
