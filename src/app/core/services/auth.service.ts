import { Injectable, computed, inject, signal } from '@angular/core';
import { AppUser } from '../models/user.model';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabaseService = inject(SupabaseService);

  currentUser = signal<AppUser | null>(null);
  loading = signal<boolean>(true);

  isAuthenticated = computed(() => this.currentUser() !== null);
  isSuperAdmin = computed(() => this.currentUser()?.is_super_admin === true);

  constructor() {
    this.restoreSession();
  }

  /** Called once on app startup to restore session from localStorage */
  private async restoreSession(): Promise<void> {
    try {
      const { data: { session } } = await this.supabaseService.auth.getSession();
      if (session?.user) {
        await this.fetchProfile(session.user.id);
      }
    } catch (e) {
      console.error('Session restore failed:', e);
    } finally {
      this.loading.set(false);
    }
  }

  private async fetchProfile(userId: string): Promise<void> {
    const { data, error } = await this.supabaseService.client
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw new Error('Profil yüklenemedi: ' + error.message);
    if (!data) throw new Error('Profil bulunamadı.');

    this.currentUser.set(data as AppUser);
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabaseService.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      await this.fetchProfile(data.user.id);
    }
    this.loading.set(false);
  }

  async signOut(): Promise<void> {
    try {
      await this.supabaseService.auth.signOut();
    } catch {
      // Ignore signout errors
    }
    this.currentUser.set(null);
    window.location.href = '/login';
  }
}
