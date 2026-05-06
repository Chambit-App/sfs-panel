import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { CurrencyTryPipe } from '../../shared/pipes/currency-try.pipe';
import { TurkishDatePipe } from '../../shared/pipes/turkish-date.pipe';
import { TenantService } from '../../core/services/tenant.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  buildGenericFilePreviewFromBuffer,
  suggestFieldMapping,
  parseTahsilatFile,
  GenericFilePreview,
  FieldMapping,
  ParsedTahsilatRow,
} from '../../core/services/excel.service';

type Step = 1 | 2 | 3 | 4;
type Direction = 'GELIR' | 'GIDER';

interface CariResolution {
  name: string;          // unique cari name from file
  matchedId: string | null;
  newPlaceholderName: string; // editable
  willCreate: boolean;   // user toggled
}

interface ImportResult {
  inserted: number;
  cariCreated: number;
  duplicateInvoices: number;
  failedRows: number;
  errors: string[];
}

const TARGET_FIELDS: { key: keyof FieldMapping; label: string; required: boolean }[] = [
  { key: 'cariName',        label: 'Cari Adı',        required: true },
  { key: 'amount',          label: 'Tutar',           required: true },
  { key: 'invoiceDate',     label: 'Fatura Tarihi',   required: true },
  { key: 'dueDate',         label: 'Vade Tarihi',     required: false },
  { key: 'paymentTermDays', label: 'Vade (Gün)',      required: false },
  { key: 'invoiceNo',       label: 'Fatura No',       required: false },
  { key: 'status',          label: 'Durum',           required: false },
  { key: 'description',     label: 'Açıklama',        required: false },
];

@Component({
  selector: 'app-tahsilat-import',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, CurrencyTryPipe, TurkishDatePipe],
  templateUrl: './tahsilat-import.component.html',
  styleUrl: './tahsilat-import.component.scss',
})
export class TahsilatImportComponent {
  private tenant = inject(TenantService);
  private supabase = inject(SupabaseService);
  private notify = inject(NotificationService);
  private router = inject(Router);

  activeFirm = this.tenant.activeFirm;

  // Wizard state
  step = signal<Step>(1);
  direction = signal<Direction>('GELIR');

  // Step 1
  selectedFile = signal<File | null>(null);
  preview = signal<GenericFilePreview | null>(null);
  reading = signal(false);

  // Step 2
  mapping = signal<FieldMapping>({
    cariName: null, amount: null, invoiceDate: null, dueDate: null,
    paymentTermDays: null, invoiceNo: null, status: null, description: null,
  });

  // Step 3
  parsedRows = signal<ParsedTahsilatRow[]>([]);
  cariResolutions = signal<CariResolution[]>([]);
  parsing = signal(false);
  loadingCariler = signal(false);

  // Step 4
  importing = signal(false);
  result = signal<ImportResult | null>(null);

  // Computed
  readonly TARGET_FIELDS = TARGET_FIELDS;
  validRowCount = computed(() => this.parsedRows().filter(r => r.isValid).length);
  invalidRowCount = computed(() => this.parsedRows().filter(r => !r.isValid).length);
  uniqueCariNames = computed(() => {
    const names = new Set<string>();
    for (const r of this.parsedRows()) if (r.cariName) names.add(r.cariName);
    return [...names];
  });
  unresolvedCount = computed(() =>
    this.cariResolutions().filter(c => !c.matchedId && !c.willCreate).length,
  );
  cariStatusFor(name: string): 'matched' | 'will-create' | 'unresolved' {
    const r = this.cariResolutions().find(x => x.name === name);
    if (!r) return 'unresolved';
    if (r.matchedId) return 'matched';
    if (r.willCreate) return 'will-create';
    return 'unresolved';
  }

  canAdvanceFromStep2 = computed(() => {
    const m = this.mapping();
    return m.cariName !== null && m.amount !== null && m.invoiceDate !== null;
  });
  canImport = computed(() => this.validRowCount() > 0 && this.unresolvedCount() === 0 && !this.importing());

  // ─── Step navigation ─────────────────────────────────────────────────────
  goNext(): void {
    if (this.step() === 1 && this.preview()) this.step.set(2);
    else if (this.step() === 2 && this.canAdvanceFromStep2()) this.advanceToStep3();
  }
  goBack(): void {
    if (this.step() === 1) return;
    this.step.update(s => (s - 1) as Step);
  }
  reset(): void {
    this.step.set(1);
    this.selectedFile.set(null);
    this.preview.set(null);
    this.parsedRows.set([]);
    this.cariResolutions.set([]);
    this.result.set(null);
  }

  // ─── STEP 1: File upload ────────────────────────────────────────────────
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.selectedFile.set(file);
    this.reading.set(true);
    try {
      const buffer = await file.arrayBuffer();
      const preview = buildGenericFilePreviewFromBuffer(buffer);
      if (preview.headers.length === 0) {
        this.notify.error('Dosya boş veya başlık satırı bulunamadı.');
        this.selectedFile.set(null);
        return;
      }
      this.preview.set(preview);
      this.mapping.set(suggestFieldMapping(preview.headers));
    } catch (err) {
      console.error(err);
      this.notify.error('Dosya okunamadı: ' + (err as Error).message);
      this.selectedFile.set(null);
    } finally {
      this.reading.set(false);
    }
    input.value = '';
  }

  // ─── STEP 2: Mapping ────────────────────────────────────────────────────
  setMapping(field: keyof FieldMapping, columnIndex: number | null): void {
    this.mapping.update(m => ({ ...m, [field]: columnIndex }));
  }
  setMappingFromEvent(field: keyof FieldMapping, value: unknown): void {
    if (value === null || value === undefined || value === '') {
      this.setMapping(field, null);
    } else {
      this.setMapping(field, Number(value));
    }
  }

  // ─── STEP 3: Parse + cari resolution ────────────────────────────────────
  async advanceToStep3(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;
    this.parsing.set(true);
    try {
      const rows = await parseTahsilatFile(file, this.mapping());
      this.parsedRows.set(rows);
      await this.resolveCariler();
      this.step.set(3);
    } catch (err) {
      console.error(err);
      this.notify.error('Satırlar ayrıştırılamadı: ' + (err as Error).message);
    } finally {
      this.parsing.set(false);
    }
  }

  async resolveCariler(): Promise<void> {
    const firm = this.activeFirm();
    if (!firm) return;
    this.loadingCariler.set(true);
    try {
      const { data } = await this.supabase.client
        .from('cari_accounts')
        .select('id, name, type')
        .eq('firm_id', firm.id);
      const existing = new Map<string, string>();
      for (const c of (data ?? []) as Array<{ id: string; name: string; type: string }>) {
        existing.set(this.normalize(c.name), c.id);
      }
      const resolutions: CariResolution[] = [];
      for (const name of this.uniqueCariNames()) {
        const matchedId = existing.get(this.normalize(name)) ?? null;
        resolutions.push({
          name,
          matchedId,
          newPlaceholderName: name,
          willCreate: false,
        });
      }
      this.cariResolutions.set(resolutions);
    } finally {
      this.loadingCariler.set(false);
    }
  }

  toggleCreateCari(name: string): void {
    this.cariResolutions.update(list =>
      list.map(c => (c.name === name ? { ...c, willCreate: !c.willCreate } : c)),
    );
  }
  bulkCreateAllMissing(): void {
    this.cariResolutions.update(list =>
      list.map(c => (c.matchedId ? c : { ...c, willCreate: true })),
    );
  }
  setNewName(name: string, value: string): void {
    this.cariResolutions.update(list =>
      list.map(c => (c.name === name ? { ...c, newPlaceholderName: value } : c)),
    );
  }

  // ─── STEP 4: Final insert ────────────────────────────────────────────────
  async runImport(): Promise<void> {
    const firm = this.activeFirm();
    if (!firm) {
      this.notify.error('Firma seçili değil.');
      return;
    }
    if (this.unresolvedCount() > 0) {
      this.notify.error('Eşleşmeyen carileri önce işaretle.');
      return;
    }
    this.importing.set(true);
    const result: ImportResult = {
      inserted: 0,
      cariCreated: 0,
      duplicateInvoices: 0,
      failedRows: 0,
      errors: [],
    };

    try {
      // Step A: Create new cariler (those marked willCreate)
      const cariType = this.direction() === 'GELIR' ? 'MUSTERI' : 'TEDARIKCI';
      const toCreate = this.cariResolutions().filter(c => !c.matchedId && c.willCreate);
      const idByName = new Map<string, string>();
      for (const c of this.cariResolutions()) {
        if (c.matchedId) idByName.set(c.name, c.matchedId);
      }
      if (toCreate.length > 0) {
        const inserts = toCreate.map(c => ({
          firm_id: firm.id,
          type: cariType,
          name: c.newPlaceholderName.trim(),
          payment_term_days: 0,
          is_active: true,
        }));
        const { data, error } = await this.supabase.client
          .from('cari_accounts')
          .insert(inserts)
          .select('id, name');
        if (error) {
          result.errors.push('Cari oluşturma hatası: ' + error.message);
        } else if (data) {
          result.cariCreated = data.length;
          for (let i = 0; i < toCreate.length && i < data.length; i++) {
            idByName.set(toCreate[i].name, (data[i] as { id: string }).id);
          }
        }
      }

      // Step B: Look up existing invoice_no's for duplicate detection
      const validRows = this.parsedRows().filter(r => r.isValid);
      const invoiceNos = [...new Set(validRows.map(r => r.invoiceNo).filter(Boolean))];
      const existingInvoiceSet = new Set<string>();
      if (invoiceNos.length > 0) {
        const { data } = await this.supabase.client
          .from('transactions')
          .select('invoice_no')
          .eq('firm_id', firm.id)
          .in('invoice_no', invoiceNos);
        for (const row of (data ?? []) as Array<{ invoice_no: string }>) {
          if (row.invoice_no) existingInvoiceSet.add(row.invoice_no);
        }
      }

      // Step C: Build transaction records
      const records: Record<string, unknown>[] = [];
      for (const r of validRows) {
        const cariId = idByName.get(r.cariName);
        if (!cariId) {
          result.failedRows++;
          continue;
        }
        if (r.invoiceNo && existingInvoiceSet.has(r.invoiceNo)) {
          result.duplicateInvoices++;
          continue;
        }
        records.push({
          firm_id: firm.id,
          cari_id: cariId,
          type: this.direction(),
          invoice_no: r.invoiceNo || null,
          invoice_date: r.invoiceDate,
          due_date: r.dueDate ?? r.invoiceDate,
          payment_term_days: r.paymentTermDays,
          amount: r.amount,
          status: r.status,
          description: r.description || null,
        });
      }

      // Step D: Bulk insert in batches of 200
      if (records.length > 0) {
        const batchSize = 200;
        for (let i = 0; i < records.length; i += batchSize) {
          const batch = records.slice(i, i + batchSize);
          const { error } = await this.supabase.client.from('transactions').insert(batch);
          if (error) {
            result.errors.push(`Batch ${i}-${i + batch.length}: ${error.message}`);
            result.failedRows += batch.length;
          } else {
            result.inserted += batch.length;
          }
        }
      }

      result.failedRows += this.invalidRowCount();
      this.result.set(result);
      this.step.set(4);
    } catch (err) {
      console.error(err);
      this.notify.error('Beklenmeyen hata: ' + (err as Error).message);
    } finally {
      this.importing.set(false);
    }
  }

  goToList(): void {
    this.router.navigate(['/payments']);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  private normalize(s: string): string {
    return s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  }
  sampleValueForColumn(idx: number | null): string {
    if (idx === null) return '';
    const samples = this.preview()?.sampleRows ?? [];
    for (const row of samples) {
      const v = row[idx];
      if (v && v.trim()) return v.length > 24 ? v.slice(0, 24) + '…' : v;
    }
    return '';
  }
  rowsForCari(name: string): number {
    return this.parsedRows().filter(r => r.cariName === name).length;
  }
}
