import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  styles: [`
    .login-wrapper {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f0f4f8;
      font-family: 'Inter', 'Segoe UI', sans-serif;
    }

    .login-card {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.10);
      padding: 48px 40px;
      width: 100%;
      max-width: 400px;
    }

    .logo-area {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      background: #1a56db;
      border-radius: 12px;
      margin-bottom: 16px;
    }

    .logo-icon svg {
      width: 32px;
      height: 32px;
      fill: #ffffff;
    }

    .app-name {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1a1a2e;
      margin: 0 0 4px;
    }

    .app-tagline {
      font-size: 0.875rem;
      color: #6b7280;
      margin: 0;
    }

    .form-group {
      margin-bottom: 20px;
    }

    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      color: #374151;
      margin-bottom: 6px;
    }

    input {
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid #d1d5db;
      border-radius: 8px;
      font-size: 0.95rem;
      color: #111827;
      background: #fff;
      transition: border-color 0.2s, box-shadow 0.2s;
      box-sizing: border-box;
      outline: none;
    }

    input:focus {
      border-color: #1a56db;
      box-shadow: 0 0 0 3px rgba(26, 86, 219, 0.12);
    }

    input.field-error {
      border-color: #dc2626;
    }

    .field-hint {
      font-size: 0.78rem;
      color: #dc2626;
      margin-top: 4px;
    }

    .error-banner {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #b91c1c;
      font-size: 0.875rem;
    }

    .error-banner svg {
      flex-shrink: 0;
      width: 18px;
      height: 18px;
      fill: #b91c1c;
    }

    .submit-btn {
      width: 100%;
      padding: 12px;
      background: #1a56db;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, opacity 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .submit-btn:hover:not(:disabled) {
      background: #1447c0;
    }

    .submit-btn:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2.5px solid rgba(255,255,255,0.4);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
  template: `
    <div class="login-wrapper">
      <div class="login-card">

        <div class="logo-area">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <h1 class="app-name">SFSPanel</h1>
          <p class="app-tagline">Finansal Yönetim Platformu</p>
        </div>

        @if (errorMessage()) {
          <div class="error-banner" role="alert">
            <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
            {{ errorMessage() }}
          </div>
        }

        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
          <div class="form-group">
            <label for="email">E-posta</label>
            <input
              id="email"
              type="email"
              formControlName="email"
              placeholder="ornek@sirket.com"
              autocomplete="email"
              [class.field-error]="emailInvalid"
            />
            @if (emailInvalid) {
              <p class="field-hint">Geçerli bir e-posta adresi giriniz.</p>
            }
          </div>

          <div class="form-group">
            <label for="password">Şifre</label>
            <input
              id="password"
              type="password"
              formControlName="password"
              placeholder="••••••••"
              autocomplete="current-password"
              [class.field-error]="passwordInvalid"
            />
            @if (passwordInvalid) {
              <p class="field-hint">Şifre en az 6 karakter olmalıdır.</p>
            }
          </div>

          <button
            type="submit"
            class="submit-btn"
            [disabled]="submitting()"
          >
            @if (submitting()) {
              <span class="spinner"></span>
              Giriş yapılıyor...
            } @else {
              Giriş Yap
            }
          </button>
        </form>

      </div>
    </div>
  `
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  submitting = signal(false);
  errorMessage = signal<string | null>(null);

  get emailInvalid(): boolean {
    const ctrl = this.loginForm.get('email')!;
    return ctrl.invalid && ctrl.touched;
  }

  get passwordInvalid(): boolean {
    const ctrl = this.loginForm.get('password')!;
    return ctrl.invalid && ctrl.touched;
  }

  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.loginForm.getRawValue();

    try {
      await this.authService.signIn(email!, password!);
      this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Giriş başarısız. Lütfen tekrar deneyin.';
      this.errorMessage.set(this.translateError(message));
    } finally {
      this.submitting.set(false);
    }
  }

  private translateError(message: string): string {
    if (message.toLowerCase().includes('invalid login credentials')) {
      return 'E-posta veya şifre hatalı.';
    }
    if (message.toLowerCase().includes('email not confirmed')) {
      return 'E-posta adresiniz henüz doğrulanmamış.';
    }
    if (message.toLowerCase().includes('too many requests')) {
      return 'Çok fazla deneme yaptınız. Lütfen bir süre bekleyiniz.';
    }
    return message;
  }
}
