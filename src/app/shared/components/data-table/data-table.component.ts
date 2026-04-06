import {
  Component,
  Input,
  OnChanges,
  signal,
  computed,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { CurrencyTryPipe } from '../../pipes/currency-try.pipe';
import { TurkishDatePipe } from '../../pipes/turkish-date.pipe';

export interface TableColumn {
  field: string;
  header: string;
  type?: 'text' | 'currency' | 'date' | 'status';
}

type SortDirection = 'asc' | 'desc' | null;

const STATUS_LABELS: Record<string, string> = {
  BEKLIYOR: 'Bekliyor',
  ODENDI: 'Ödendi',
  IPTAL: 'İptal',
};

const STATUS_CLASSES: Record<string, string> = {
  BEKLIYOR: 'badge--warning',
  ODENDI: 'badge--success',
  IPTAL: 'badge--danger',
};

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CurrencyTryPipe, TurkishDatePipe],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
})
export class DataTableComponent implements OnChanges {
  @Input() columns: TableColumn[] = [];
  @Input() data: Record<string, unknown>[] = [];
  @Input() loading = false;

  sortField = signal<string | null>(null);
  sortDirection = signal<SortDirection>(null);

  sortedData = computed(() => {
    const field = this.sortField();
    const dir = this.sortDirection();
    if (!field || !dir) return this.data;

    return [...this.data].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av == null) return 1;
      if (bv == null) return -1;
      const result = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === 'asc' ? result : -result;
    });
  });

  ngOnChanges(): void {
    // When data input changes, re-evaluate computed
  }

  sortBy(field: string): void {
    if (this.sortField() === field) {
      // Cycle: asc -> desc -> null
      const current = this.sortDirection();
      if (current === 'asc') {
        this.sortDirection.set('desc');
      } else if (current === 'desc') {
        this.sortField.set(null);
        this.sortDirection.set(null);
      } else {
        this.sortDirection.set('asc');
      }
    } else {
      this.sortField.set(field);
      this.sortDirection.set('asc');
    }
  }

  getSortIcon(field: string): string {
    if (this.sortField() !== field) return 'unfold_more';
    return this.sortDirection() === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  getCellValue(row: Record<string, unknown>, column: TableColumn): unknown {
    return row[column.field];
  }

  getStatusLabel(value: string): string {
    return STATUS_LABELS[value] ?? value;
  }

  getStatusClass(value: string): string {
    return STATUS_CLASSES[value] ?? 'badge--neutral';
  }
}
