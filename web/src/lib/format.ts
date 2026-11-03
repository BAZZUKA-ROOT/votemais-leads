const dtf = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const dtt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const num = new Intl.NumberFormat('pt-BR');
const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '—';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : dtf.format(d);
}

export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : dtt.format(d);
}

export function fmtRelative(v: string | Date | null | undefined): string {
  if (!v) return '—';
  const diff = (new Date(v).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return fmtDate(v);
}

export const fmtNum = (v: number | null | undefined) => (v === null || v === undefined ? '—' : num.format(v));
export const fmtUsd = (v: number | null | undefined) => (v === null || v === undefined ? '—' : usd.format(v));

export function fmtPhone(e164: string | null | undefined): string {
  if (!e164) return '—';
  const d = e164.replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}
