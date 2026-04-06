import { Pipe, PipeTransform } from '@angular/core';

/** Formats a number as Turkish currency without symbol, shows '-' for zero */
@Pipe({ name: 'amountCell', standalone: true })
export class AmountCellPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null || value === 0) return '-';
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
}
