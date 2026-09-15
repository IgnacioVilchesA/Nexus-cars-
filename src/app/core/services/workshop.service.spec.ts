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
    expect(service.canTransitionOrderStatus('diagnóstico', 'reparación')).toBeTrue();
    expect(service.canTransitionOrderStatus('listo', 'reparación')).toBeFalse();
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
});
