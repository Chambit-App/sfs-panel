import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'currencyTry', standalone: true })
export class CurrencyTryPipe implements PipeTransform {
  transform(value: number | null | undefined, showSymbol = true): string {
    if (value == null) return '-';
    const formatted = new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    return showSymbol ? `₺${formatted}` : formatted;
  }
}
