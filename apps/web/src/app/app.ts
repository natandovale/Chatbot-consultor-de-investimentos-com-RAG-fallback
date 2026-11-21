import { Component, inject, resource } from '@angular/core';
import { HealthService } from './api/health.service';
import { ChatComponent } from './chat/chat';

@Component({
  selector: 'app-root',
  imports: [ChatComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly healthService = inject(HealthService);

  protected readonly health = resource({
    loader: () => this.healthService.fetchHealth(),
  });
}
