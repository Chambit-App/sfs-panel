import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { TenantService } from './tenant.service';

@Injectable()
export abstract class BaseDataService {
  protected supabaseService = inject(SupabaseService);
  protected tenantService = inject(TenantService);

  protected get client(): SupabaseClient {
    return this.supabaseService.client;
  }

  protected get firmId(): string | null {
    return this.tenantService.activeFirm()?.id ?? null;
  }

  protected get tenantId(): string | null {
    return this.tenantService.activeTenant()?.id ?? null;
  }

  /**
   * Returns a query scoped to the active firm.
   * Throws if no firm is selected.
   */
  protected fromFirm(table: string) {
    const firmId = this.firmId;
    if (!firmId) throw new Error('No active firm selected');
    return this.client.from(table).select().eq('firm_id', firmId);
  }

  /**
   * Returns a query scoped to all firms in the active tenant.
   * Used for consolidated (all-firms) views.
   * If a specific firm is selected, scopes to that firm only.
   */
  protected fromTenant(table: string) {
    const firmId = this.firmId;
    if (firmId) {
      // A specific firm is active — scope to it
      return this.client.from(table).select().eq('firm_id', firmId);
    }

    // No specific firm — use all firm IDs for the active tenant
    const firmIds = this.tenantService.firms().map(f => f.id);
    if (firmIds.length === 0) {
      // Return an impossible filter so query returns empty safely
      return this.client.from(table).select().in('firm_id', ['__no_firms__']);
    }

    return this.client.from(table).select().in('firm_id', firmIds);
  }

  /**
   * Insert a record, automatically attaching the active firm_id.
   */
  protected async insert<T extends object>(table: string, data: T) {
    const firmId = this.firmId;
    if (!firmId) throw new Error('No active firm selected');

    const record = { ...data, firm_id: firmId };
    const { data: result, error } = await this.client.from(table).insert(record).select().single();
    if (error) throw error;
    return result;
  }

  /**
   * Update a record by id, verifying it belongs to the active firm.
   */
  protected async update<T extends object>(table: string, id: string, data: T) {
    const firmId = this.firmId;
    if (!firmId) throw new Error('No active firm selected');

    const { data: result, error } = await this.client
      .from(table)
      .update(data)
      .eq('id', id)
      .eq('firm_id', firmId)
      .select()
      .single();

    if (error) throw error;
    return result;
  }

  /**
   * Delete a record by id, verifying it belongs to the active firm.
   */
  protected async delete(table: string, id: string) {
    const firmId = this.firmId;
    if (!firmId) throw new Error('No active firm selected');

    const { error } = await this.client
      .from(table)
      .delete()
      .eq('id', id)
      .eq('firm_id', firmId);

    if (error) throw error;
  }
}
