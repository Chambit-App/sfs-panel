import { Injectable, signal } from '@angular/core';

export interface NotificationMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 0;
  private readonly AUTO_DISMISS_MS = 5000;

  private messagesSignal = signal<NotificationMessage[]>([]);
  messages$ = this.messagesSignal.asReadonly();

  success(text: string): void {
    this.add('success', text);
  }

  error(text: string): void {
    this.add('error', text);
  }

  info(text: string): void {
    this.add('info', text);
  }

  dismiss(id: number): void {
    this.messagesSignal.update(msgs => msgs.filter(m => m.id !== id));
  }

  private add(type: NotificationMessage['type'], text: string): void {
    const id = ++this.nextId;
    this.messagesSignal.update(msgs => [...msgs, { id, type, text }]);
    setTimeout(() => this.dismiss(id), this.AUTO_DISMISS_MS);
  }
}
