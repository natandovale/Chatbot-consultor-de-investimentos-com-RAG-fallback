import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { Chat } from './chat/chat';
import { Health } from './health/health';

describe('App e Roteamento', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('roteia "" para o componente Chat', async () => {
    const harness = await RouterTestingHarness.create();
    const instance = await harness.navigateByUrl('/', Chat);

    expect(instance).toBeInstanceOf(Chat);
    expect(harness.routeNativeElement?.textContent).toContain('Consultor de Investimentos');
  });

  it('roteia "health" para o componente Health e exibe o status de /api/health', async () => {
    const harness = await RouterTestingHarness.create();
    const instance = await harness.navigateByUrl('/health', Health);

    expect(instance).toBeInstanceOf(Health);

    httpMock.expectOne('/api/health').flush({ status: 'ok', database: 'ok' });
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('status: ok');
    expect(harness.routeNativeElement?.textContent).toContain('database: ok');
  });
});
