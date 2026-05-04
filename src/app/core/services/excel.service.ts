import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';

export type ColumnType = 'text' | 'number' | 'date' | 'enum' | 'uuid' | 'boolean';

export interface ColumnSpec {
  key: string;
  label: string;
  type: ColumnType;
  required: boolean;
  enumValues?: string[];
  example?: string | number;
  description?: string;
}

export interface EntitySchema {
  entity: string;
  title: string;
  columns: ColumnSpec[];
  notes: string[];
}

export interface ParseResult<T = Record<string, unknown>> {
  rows: ParsedRow<T>[];
  validCount: number;
  invalidCount: number;
}

export interface ParsedRow<T = Record<string, unknown>> {
  rowNumber: number;
  data: T;
  errors: string[];
  isValid: boolean;
}

export interface CariRef {
  id: string;
  name: string;
  type: string;
}

export interface CategoryRef {
  id: string;
  name: string;
  type: string;
}

export interface BankRef {
  id: string;
  name: string;
}

export interface PaymentsTemplateContext {
  cariler: CariRef[];
  categories: CategoryRef[];
  banks: BankRef[];
  generatedAt: Date;
  firmName: string;
}

@Injectable({ providedIn: 'root' })
export class ExcelService {
  buildTemplate(schema: EntitySchema): Blob {
    const headers = schema.columns.map(c => c.label);
    const exampleRow = schema.columns.map(c => c.example ?? '');
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, schema.entity);
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  async buildPaymentsTemplate(ctx: PaymentsTemplateContext): Promise<Blob> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SFSPanel';
    wb.created = ctx.generatedAt;

    const TEMPLATE_ROWS = 200;
    const cariCount = Math.max(ctx.cariler.length, 1);
    const catCount = Math.max(ctx.categories.length, 1);
    const bankCount = Math.max(ctx.banks.length, 1);

    // ── Main data sheet (added FIRST so it becomes the first tab) ──
    const ws = wb.addWorksheet('Ödemeler', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const columns = [
      { header: 'Tip', key: 'type', width: 10 },
      { header: 'Cari Adı (seçim)', key: 'cari_adi', width: 30 },
      { header: 'Cari ID (UUID)', key: 'cari_id', width: 38 },
      { header: 'Kategori Adı (seçim)', key: 'cat_adi', width: 28 },
      { header: 'Kategori ID (UUID)', key: 'category_id', width: 38 },
      { header: 'Banka Adı (seçim)', key: 'bank_adi', width: 24 },
      { header: 'Banka ID (UUID)', key: 'bank_id', width: 38 },
      { header: 'Fatura No', key: 'invoice_no', width: 16 },
      { header: 'Fatura Tarihi', key: 'invoice_date', width: 14 },
      { header: 'Vade Tarihi', key: 'due_date', width: 14 },
      { header: 'Vade (Gün)', key: 'payment_term_days', width: 12 },
      { header: 'Tutar', key: 'amount', width: 14 },
      { header: 'Durum', key: 'status', width: 12 },
      { header: 'Açıklama', key: 'description', width: 36 },
    ];
    ws.columns = columns;
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' },
    };

    // Tint the auto-filled UUID columns to signal "do not edit"
    const uuidCols = ['C', 'E', 'G'];
    for (const col of uuidCols) {
      ws.getColumn(col).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFAFAFA' },
      };
    }

    for (let i = 2; i <= TEMPLATE_ROWS + 1; i++) {
      ws.getCell(`A${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"GELIR,GIDER"'],
      };

      ws.getCell(`B${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Cariler!$B$2:$B$${cariCount + 1}`],
      };
      ws.getCell(`C${i}`).value = {
        formula: `IF(B${i}="","",IFERROR(INDEX(Cariler!$A$2:$A$${cariCount + 1}, MATCH(B${i}, Cariler!$B$2:$B$${cariCount + 1}, 0)),""))`,
      };

      ws.getCell(`D${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Kategoriler!$B$2:$B$${catCount + 1}`],
      };
      ws.getCell(`E${i}`).value = {
        formula: `IF(D${i}="","",IFERROR(INDEX(Kategoriler!$A$2:$A$${catCount + 1}, MATCH(D${i}, Kategoriler!$B$2:$B$${catCount + 1}, 0)),""))`,
      };

      ws.getCell(`F${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Bankalar!$B$2:$B$${bankCount + 1}`],
      };
      ws.getCell(`G${i}`).value = {
        formula: `IF(F${i}="","",IFERROR(INDEX(Bankalar!$A$2:$A$${bankCount + 1}, MATCH(F${i}, Bankalar!$B$2:$B$${bankCount + 1}, 0)),""))`,
      };

      ws.getCell(`M${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"BEKLIYOR,ODENDI,IPTAL"'],
      };
    }

    // ── Reference sheets ───────────────────────────────────────────
    const cariSheet = wb.addWorksheet('Cariler', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    cariSheet.columns = [
      { header: 'UUID', key: 'id', width: 38 },
      { header: 'Ad', key: 'name', width: 36 },
      { header: 'Tip', key: 'type', width: 12 },
    ];
    cariSheet.getRow(1).font = { bold: true };
    ctx.cariler.forEach(c => cariSheet.addRow(c));

    const catSheet = wb.addWorksheet('Kategoriler', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    catSheet.columns = [
      { header: 'UUID', key: 'id', width: 38 },
      { header: 'Ad', key: 'name', width: 36 },
      { header: 'Tip', key: 'type', width: 12 },
    ];
    catSheet.getRow(1).font = { bold: true };
    ctx.categories.forEach(c => catSheet.addRow(c));

    const bankSheet = wb.addWorksheet('Bankalar', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    bankSheet.columns = [
      { header: 'UUID', key: 'id', width: 38 },
      { header: 'Banka Adı', key: 'name', width: 36 },
    ];
    bankSheet.getRow(1).font = { bold: true };
    ctx.banks.forEach(b => bankSheet.addRow(b));

    // ── Info sheet ─────────────────────────────────────────────────
    const info = wb.addWorksheet('Bilgi');
    info.columns = [{ width: 28 }, { width: 60 }];
    info.addRow(['Firma', ctx.firmName]);
    info.addRow(['Şablon oluşturma tarihi', ctx.generatedAt.toLocaleString('tr-TR')]);
    info.addRow(['Cari sayısı', ctx.cariler.length]);
    info.addRow(['Kategori sayısı', ctx.categories.length]);
    info.addRow(['Banka sayısı', ctx.banks.length]);
    info.addRow([]);
    info.addRow(['Kullanım', '"Ödemeler" sayfasında her satıra:']);
    info.addRow(['', '1) "Cari Adı" hücresine tıkla, açılan listeden seç']);
    info.addRow(['', '2) "Cari ID (UUID)" hücresi otomatik dolar (formül)']);
    info.addRow(['', '3) Aynısını Kategori ve Banka için tekrarla']);
    info.addRow(['', '4) Diğer alanları (tip, tarih, tutar, durum, açıklama) doldur']);
    info.addRow([]);
    info.addRow(['Uyarı', 'Yeni cari/kategori/banka eklediyseniz şablonu yeniden indirin.']);
    info.addRow(['', 'Bu şablon yalnızca yukarıda listelenen kayıtları içerir.']);
    info.getColumn(1).font = { bold: true };

    // Force Excel to open on the Ödemeler tab (first tab)
    wb.views = [
      {
        x: 0,
        y: 0,
        width: 12000,
        height: 24000,
        firstSheet: 0,
        activeTab: 0,
        visibility: 'visible',
      },
    ];

    const buffer = await wb.xlsx.writeBuffer();
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  exportRows(schema: EntitySchema, rows: Record<string, unknown>[]): Blob {
    const headers = schema.columns.map(c => c.label);
    const data = rows.map(r =>
      schema.columns.map(c => this.formatCellValue(r[c.key], c.type)),
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, schema.entity);
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async parseFile(file: File, schema: EntitySchema): Promise<ParseResult> {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: '',
      raw: true,
    });

    if (matrix.length < 1) {
      return { rows: [], validCount: 0, invalidCount: 0 };
    }

    const headerRow = matrix[0].map(h => String(h ?? '').trim());
    const labelToColumn = new Map<string, ColumnSpec>();
    schema.columns.forEach(c => labelToColumn.set(c.label.toLowerCase(), c));

    const colIndex: Array<{ col: ColumnSpec; idx: number } | null> = headerRow.map(label => {
      const c = labelToColumn.get(label.toLowerCase());
      return c ? { col: c, idx: 0 } : null;
    });
    colIndex.forEach((entry, idx) => {
      if (entry) entry.idx = idx;
    });

    const rows: ParsedRow[] = [];
    for (let r = 1; r < matrix.length; r++) {
      const raw = matrix[r];
      if (this.isRowEmpty(raw)) continue;

      const data: Record<string, unknown> = {};
      const errors: string[] = [];

      for (const col of schema.columns) {
        const headerIdx = colIndex.findIndex(e => e?.col.key === col.key);
        const cell = headerIdx >= 0 ? raw[headerIdx] : undefined;
        const { value, error } = this.coerceCell(cell, col);
        if (error) errors.push(error);
        data[col.key] = value;
      }

      rows.push({
        rowNumber: r + 1, // 1-indexed Excel row (header=1, first data=2)
        data,
        errors,
        isValid: errors.length === 0,
      });
    }

    const validCount = rows.filter(r => r.isValid).length;
    return { rows, validCount, invalidCount: rows.length - validCount };
  }

  private isRowEmpty(raw: unknown[]): boolean {
    return raw.every(cell => cell === '' || cell === null || cell === undefined);
  }

  private coerceCell(
    cell: unknown,
    col: ColumnSpec,
  ): { value: unknown; error: string | null } {
    const isEmpty = cell === '' || cell === null || cell === undefined;

    if (isEmpty) {
      if (col.required) return { value: null, error: `${col.label}: zorunlu` };
      return { value: null, error: null };
    }

    switch (col.type) {
      case 'text':
        return { value: String(cell).trim(), error: null };

      case 'number': {
        const n = typeof cell === 'number' ? cell : Number(String(cell).replace(',', '.'));
        if (!isFinite(n)) return { value: null, error: `${col.label}: sayı değil (${cell})` };
        return { value: n, error: null };
      }

      case 'date': {
        if (cell instanceof Date) {
          if (isNaN(cell.getTime())) return { value: null, error: `${col.label}: geçersiz tarih` };
          return { value: cell.toISOString().split('T')[0], error: null };
        }
        const s = String(cell).trim();
        // ISO YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { value: s, error: null };
        // Turkish DD.MM.YYYY or DD/MM/YYYY
        const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
        if (m) {
          const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
          return { value: iso, error: null };
        }
        const d = new Date(s);
        if (!isNaN(d.getTime())) return { value: d.toISOString().split('T')[0], error: null };
        return { value: null, error: `${col.label}: tarih okunamadı (${cell})` };
      }

      case 'enum': {
        const s = String(cell).trim().toUpperCase();
        if (!col.enumValues || !col.enumValues.includes(s)) {
          return {
            value: null,
            error: `${col.label}: geçersiz değer "${cell}" (geçerli: ${col.enumValues?.join(', ')})`,
          };
        }
        return { value: s, error: null };
      }

      case 'uuid': {
        const s = String(cell).trim();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
          return { value: null, error: `${col.label}: geçerli UUID değil (${s})` };
        }
        return { value: s.toLowerCase(), error: null };
      }

      case 'boolean': {
        const s = String(cell).trim().toLowerCase();
        if (['true', '1', 'evet', 'aktif', 'yes'].includes(s)) return { value: true, error: null };
        if (['false', '0', 'hayir', 'hayır', 'pasif', 'no'].includes(s)) return { value: false, error: null };
        return { value: null, error: `${col.label}: boolean değil (${cell})` };
      }
    }
  }

  private formatCellValue(value: unknown, type: ColumnType): unknown {
    if (value === null || value === undefined) return '';
    if (type === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      // Keep as ISO; Excel will display as date when opened with proper locale
      return value;
    }
    return value;
  }
}

// =============================================================================
// Entity schemas
// =============================================================================

export const BANK_SCHEMA: EntitySchema = {
  entity: 'banka_hesaplari',
  title: 'Banka Hesapları',
  columns: [
    {
      key: 'bank_name',
      label: 'Banka Adı',
      type: 'text',
      required: true,
      example: 'Vakıfbank',
      description: 'Bankanın tam adı',
    },
    {
      key: 'account_no',
      label: 'Hesap No',
      type: 'text',
      required: false,
      example: '00158007310000001',
      description: 'Banka hesap numarası (opsiyonel)',
    },
    {
      key: 'iban',
      label: 'IBAN',
      type: 'text',
      required: false,
      example: 'TR330006400000100015800731',
      description: '26 haneli IBAN (opsiyonel)',
    },
    {
      key: 'currency',
      label: 'Para Birimi',
      type: 'text',
      required: false,
      example: 'TRY',
      description: 'TRY, USD, EUR vb. Boş bırakılırsa TRY varsayılır.',
    },
  ],
  notes: [
    'Banka Adı zorunludur, diğer alanlar boş bırakılabilir.',
    'Para Birimi boş bırakılırsa TRY (Türk Lirası) varsayılır.',
    'Aynı bankaya birden fazla hesap eklenebilir; her satır ayrı bir hesap olarak kaydedilir.',
    'Yüklenen hesaplar aktif durumla başlar.',
  ],
};

export const CARI_SCHEMA: EntitySchema = {
  entity: 'cari_hesaplar',
  title: 'Cari Hesaplar',
  columns: [
    {
      key: 'type',
      label: 'Tip',
      type: 'enum',
      required: true,
      enumValues: ['MUSTERI', 'TEDARIKCI'],
      example: 'MUSTERI',
      description: 'MUSTERI veya TEDARIKCI',
    },
    {
      key: 'name',
      label: 'Ad / Ünvan',
      type: 'text',
      required: true,
      example: 'Booking.com Türkiye',
      description: 'Cari hesabın adı veya ticari ünvanı',
    },
    {
      key: 'tax_no',
      label: 'Vergi No',
      type: 'text',
      required: false,
      example: '1234567890',
    },
    {
      key: 'phone',
      label: 'Telefon',
      type: 'text',
      required: false,
      example: '+90 212 555 0100',
    },
    {
      key: 'email',
      label: 'E-posta',
      type: 'text',
      required: false,
      example: 'iletisim@firma.com',
    },
    {
      key: 'address',
      label: 'Adres',
      type: 'text',
      required: false,
      example: 'Beyoğlu / İstanbul',
    },
    {
      key: 'payment_term_days',
      label: 'Vade (Gün)',
      type: 'number',
      required: false,
      example: 30,
      description: 'Varsayılan ödeme vadesi gün cinsinden. Boş bırakılırsa 0.',
    },
  ],
  notes: [
    'Tip ve Ad / Ünvan zorunludur.',
    'Tip alanı sadece MUSTERI ya da TEDARIKCI değerlerini kabul eder (büyük harfle).',
    'Vade boş bırakılırsa 0 (peşin) varsayılır.',
    'Yüklenen cariler aktif durumla başlar.',
  ],
};

export const PAYMENTS_SCHEMA: EntitySchema = {
  entity: 'odemeler',
  title: 'Ödemeler & Tahsilatlar',
  columns: [
    {
      key: 'type',
      label: 'Tip',
      type: 'enum',
      required: true,
      enumValues: ['GELIR', 'GIDER'],
      example: 'GELIR',
      description: 'GELIR veya GIDER',
    },
    {
      key: 'cari_id',
      label: 'Cari ID (UUID)',
      type: 'uuid',
      required: true,
      example: '00000000-0000-0000-0000-000000000000',
      description: 'Cari hesabın UUID değeri. Cariler sayfasından Excel İndir ile UUID kolonunu görebilirsin.',
    },
    {
      key: 'category_id',
      label: 'Kategori ID (UUID)',
      type: 'uuid',
      required: false,
      example: '00000000-0000-0000-0000-000000000000',
      description: 'Kategori UUID. Boş bırakılabilir.',
    },
    {
      key: 'bank_id',
      label: 'Banka ID (UUID)',
      type: 'uuid',
      required: false,
      example: '00000000-0000-0000-0000-000000000000',
      description: 'Ödeme alındıysa hangi banka. BEKLIYOR durumlu işlemde boş bırakılır.',
    },
    {
      key: 'invoice_no',
      label: 'Fatura No',
      type: 'text',
      required: false,
      example: 'FT-2026-001',
    },
    {
      key: 'invoice_date',
      label: 'Fatura Tarihi',
      type: 'date',
      required: true,
      example: '2026-05-04',
      description: 'YYYY-AA-GG, GG.AA.YYYY veya GG/AA/YYYY formatları kabul edilir.',
    },
    {
      key: 'due_date',
      label: 'Vade Tarihi',
      type: 'date',
      required: true,
      example: '2026-05-15',
    },
    {
      key: 'payment_term_days',
      label: 'Vade (Gün)',
      type: 'number',
      required: false,
      example: 11,
    },
    {
      key: 'amount',
      label: 'Tutar',
      type: 'number',
      required: true,
      example: 12500.50,
      description: 'Pozitif sayı. Türkçe ondalık (12500,50) ve İngilizce (12500.50) kabul edilir.',
    },
    {
      key: 'status',
      label: 'Durum',
      type: 'enum',
      required: true,
      enumValues: ['BEKLIYOR', 'ODENDI', 'IPTAL'],
      example: 'BEKLIYOR',
    },
    {
      key: 'description',
      label: 'Açıklama',
      type: 'text',
      required: false,
      example: 'Mayıs ayı kira',
    },
  ],
  notes: [
    'Cari ID, Kategori ID ve Banka ID kolonlarına ilgili kayıtların UUID değeri yazılmalıdır.',
    'UUID öğrenmek için Cariler / Kategoriler / Bankalar sayfalarından Excel İndir butonunu kullanın — UUID kolonu çıktıda yer alır.',
    'Tip GELIR veya GIDER, Durum BEKLIYOR / ODENDI / IPTAL değerlerini alır (büyük harfle).',
    'ODENDI durumunda Banka ID dolu olmalıdır; aksi hâlde Supabase tarafında uyarı çıkabilir.',
    'Tutar her zaman pozitif sayı olmalıdır (gider için de pozitif).',
    'Vade Gün boş bırakılırsa 0, Kategori / Banka / Açıklama boş bırakılabilir.',
  ],
};

export function getSchemaByKey(key: string): EntitySchema | null {
  switch (key) {
    case 'bank':
      return BANK_SCHEMA;
    case 'cari':
      return CARI_SCHEMA;
    case 'payments':
      return PAYMENTS_SCHEMA;
    default:
      return null;
  }
}
