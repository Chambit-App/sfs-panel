import { Pipe, PipeTransform } from '@angular/core';

const TURKISH_MONTHS_LONG = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

@Pipe({ name: 'turkishDate', standalone: true })
export class TurkishDatePipe implements PipeTransform {
  /**
   * Formats a date value.
   * @param value - ISO string, Date object, or timestamp
   * @param format - 'short' => "dd.MM.yyyy" | 'long' => "dd MMMM yyyy"
   */
  transform(
    value: string | Date | number | null | undefined,
    format: 'short' | 'long' = 'short'
  ): string {
    if (value == null || value === '') return '-';

    const date = value instanceof Date ? value : new Date(value);

    if (isNaN(date.getTime())) return '-';

    const day = String(date.getDate()).padStart(2, '0');
    const month = date.getMonth(); // 0-based
    const year = date.getFullYear();

    if (format === 'long') {
      return `${day} ${TURKISH_MONTHS_LONG[month]} ${year}`;
    }

    const monthStr = String(month + 1).padStart(2, '0');
    return `${day}.${monthStr}.${year}`;
  }
}
