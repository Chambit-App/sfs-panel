import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import {
  ExcelService,
  EntitySchema,
  getSchemaByKey,
  ParsedRow,
} from '../../core/services/excel.service';
import { TenantService } from '../../core/services/tenant.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { NotificationService } from '../../core/services/notification.service';

const ENTITY_TO_TABLE: Record<string, string> = {
  bank: 'bank_accounts',
  cari: 'cari_accounts',
  payments: 'transactions',
};

const ENTITY_TO_RETURN_ROUTE: Record<string, string> = {
  bank: '/bank',
  cari: '/cari',
  payments: '/payments',
};

@Component({
  selector: 'app-excel-import',
  standalone: true,
  imports: [CommonModule, RouterLink, PageHeaderComponent],
  templateUrl: './excel-import.component.html',
  styleUrl: './excel-import.component.scss',
})
export class ExcelImportComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private excel = inject(ExcelService);
  private tenant = inject(TenantService);
  private supabase = inject(SupabaseService);
  private notify = inject(NotificationService);

  entityKey = signal<string>('');
  schema = signal<EntitySchema | null>(null);
  fileName = signal<string>('');
  parsedRows = signal<ParsedRow[]>([]);
  parsing = signal(false);
  uploading = signal(false);

  validCount = computed(() => this.parsedRows().filter(r => r.isValid).length);
  invalidCount = computed(() => this.parsedRows().filter(r => !r.isValid).length);
  hasFile = computed(() => this.parsedRows().length > 0);
  activeFirm = this.tenant.activeFirm;
  returnRoute = computed(() => ENTITY_TO_RETURN_ROUTE[this.entityKey()] ?? '/');

  constructor() {
    this.route.data.subscribe(data => {
      const key = data['schemaKey'] as string;
      this.entityKey.set(key);
      this.schema.set(getSchemaByKey(key));
    });
  }

  downloadTemplate(): void {
    const s = this.schema();
    if (!s) return;
    const blob = this.excel.buildTemplate(s);
    this.excel.download(blob, `${s.entity}_sablon.xlsx`);
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const s = this.schema();
    if (!s) return;

    this.parsing.set(true);
    this.fileName.set(file.name);
    try {
      const result = await this.excel.parseFile(file, s);
      this.parsedRows.set(result.rows);
      if (result.rows.length === 0) {
        this.notify.error('Dosyada satır bulunamadı.');
      }
    } catch (err) {
      console.error(err);
      this.notify.error('Dosya okunamadı: ' + (err as Error).message);
      this.clearFile();
    } finally {
      this.parsing.set(false);
    }
    // Reset input so re-selecting the same file re-triggers
    input.value = '';
  }

  clearFile(): void {
    this.fileName.set('');
    this.parsedRows.set([]);
  }

  async upload(): Promise<void> {
    const firm = this.activeFirm();
    if (!firm) {
      this.notify.error('Önce üst menüden bir firma seçin.');
      return;
    }
    const s = this.schema();
    if (!s) return;

    const validRows = this.parsedRows().filter(r => r.isValid);
    if (validRows.length === 0) {
      this.notify.error('Yüklenecek geçerli satır yok.');
      return;
    }

    const table = ENTITY_TO_TABLE[this.entityKey()];
    if (!table) return;

    const records = validRows.map(r => this.transformRow(r.data, firm.id));

    this.uploading.set(true);
    try {
      const { error } = await this.supabase.client.from(table).insert(records);
      if (error) {
        this.notify.error('Yükleme başarısız: ' + error.message);
        return;
      }
      this.notify.success(`${records.length} kayıt başarıyla yüklendi.`);
      const skipped = this.invalidCount();
      if (skipped > 0) {
        this.notify.info(`${skipped} hatalı satır atlandı.`);
      }
      this.router.navigate([this.returnRoute()]);
    } catch (err) {
      console.error(err);
      this.notify.error('Beklenmeyen hata: ' + (err as Error).message);
    } finally {
      this.uploading.set(false);
    }
  }

  private transformRow(
    data: Record<string, unknown>,
    firmId: string,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { firm_id: firmId };
    const key = this.entityKey();

    for (const [k, v] of Object.entries(data)) {
      if (v === null || v === undefined || v === '') continue;
      out[k] = v;
    }

    if (key === 'bank') {
      if (!out['currency']) out['currency'] = 'TRY';
      out['is_active'] = true;
    }

    if (key === 'cari') {
      if (out['payment_term_days'] === undefined || out['payment_term_days'] === null) {
        out['payment_term_days'] = 0;
      }
      out['is_active'] = true;
    }

    if (key === 'payments') {
      if (out['payment_term_days'] === undefined || out['payment_term_days'] === null) {
        out['payment_term_days'] = 0;
      }
    }

    return out;
  }

  cellValue(row: ParsedRow, key: string): string {
    const v = row.data[key];
    if (v === null || v === undefined) return '—';
    return String(v);
  }
}
