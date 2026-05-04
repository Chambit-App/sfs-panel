import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [],
  templateUrl: './kpi-card.component.html',
  styleUrl: './kpi-card.component.scss',
})
export class KpiCardComponent {
  @Input() title = '';
  @Input() value: number = 0;
  @Input() icon = 'analytics';
  @Input() trend: 'up' | 'down' | 'neutral' = 'neutral';
  @Input() format: 'currency' | 'number' | 'percent' = 'number';
  @Input() deltaPercent: number | null = null;

  get formattedValue(): string {
    if (this.format === 'currency') {
      return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(this.value);
    }
    if (this.format === 'percent') {
      return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(this.value) + '%';
    }
    return new Intl.NumberFormat('tr-TR').format(this.value);
  }

  get trendIcon(): string {
    if (this.trend === 'up') return 'arrow_upward';
    if (this.trend === 'down') return 'arrow_downward';
    return 'remove';
  }

  get trendClass(): string {
    if (this.trend === 'up') return 'kpi-card__trend--up';
    if (this.trend === 'down') return 'kpi-card__trend--down';
    return 'kpi-card__trend--neutral';
  }

  get formattedDelta(): string {
    if (this.deltaPercent === null || !isFinite(this.deltaPercent)) return '';
    const sign = this.deltaPercent > 0 ? '+' : '';
    return `${sign}${this.deltaPercent.toFixed(1)}%`;
  }
}
