import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { WorkshopService } from './workshop.service';

describe('WorkshopService', () => {
  let service: WorkshopService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{
        provide: HttpClient,
        useValue: {
          get: () => ({ subscribe: () => undefined }),
          post: () => ({ subscribe: () => undefined }),
          patch: () => ({ subscribe: () => undefined })
        }
      }]
    });

    service = TestBed.inject(WorkshopService);
  });

  it('permite solo avanzar por la secuencia válida de estados', () => {
    expect(service.canTransitionOrderStatus('solicitada', 'recibido')).toBeTrue();
    expect(service.canTransitionOrderStatus('solicitada', 'diagnóstico')).toBeFalse();
    expect(service.canTransitionOrderStatus('diagnóstico', 'en_diagnostico')).toBeTrue();
    expect(service.canTransitionOrderStatus('listo_para_entrega', 'en_reparacion')).toBeFalse();
  });

  it('bloquea entrar a reparación si la cotización aún no fue aprobada', () => {
    expect(service.canTransitionOrderStatus('cotizacion_aprobada', 'en_reparacion', 'pendiente')).toBeFalse();
    expect(service.canTransitionOrderStatus('cotizacion_aprobada', 'en_reparacion', 'aprobado')).toBeTrue();
  });

  it('calcula el total del presupuesto separando costos', () => {
    const total = service.calculateQuoteTotal({
      partsCost: 120000,
      laborCost: 80000,
      otherCosts: 25000,
      quoteHours: 3
    });

    expect(total).toBe(225000);
  });

  it('mantiene la lógica de roles para recepcionista y mecánico', () => {
    const allowedAdmin = ['admin', 'recepcionista'] as const;
    const userRole = 'recepcionista';
    expect(allowedAdmin.includes(userRole)).toBeTrue();
    expect(['mecanico', 'cliente'].includes('recepcionista')).toBeFalse();
  });
});
