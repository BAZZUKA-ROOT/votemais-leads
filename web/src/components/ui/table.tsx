'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

/** Copia o título de cada coluna para `data-label` das células: no celular a tabela vira cartões rotulados (globals.css, .rtable). */
function set(el: Element, name: string, value: string | null) {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function useColumnLabels(ref: React.RefObject<HTMLTableElement | null>) {
  React.useLayoutEffect(() => {
    const table = ref.current;
    if (!table) return;
    const apply = () => {
      const heads = [...table.querySelectorAll('thead th')].map((th) => (th.textContent ?? '').replace(/[▲▼↑↓⇅]/g, '').trim());
      if (!heads.length) return;
      table.querySelectorAll('tbody tr').forEach((tr) => {
        let col = 0;
        let primary = false;
        for (const cell of tr.children) {
          const label = heads[col] ?? '';
          const text = (cell.textContent ?? '').trim();
          const hidden = cell.classList.contains('max-md:hidden');
          set(cell, 'data-label', label);
          // vazio/"—": some no cartão do celular
          set(cell, 'data-empty', !hidden && !cell.querySelector('button,a,input,svg') && (text === '' || text === '—' || text === '-') ? '' : null);
          // primeira célula com conteúdo vira o título do cartão
          const isPrimary = !primary && !hidden && !!label && text !== '' && text !== '—';
          if (isPrimary) primary = true;
          set(cell, 'data-primary', isPrimary ? '' : null);
          col += (cell as HTMLTableCellElement).colSpan || 1;
        }
      });
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(table, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [ref]);
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  const ref = React.useRef<HTMLTableElement>(null);
  useColumnLabels(ref);
  return (
    <div className="relative w-full scrollbar-thin md:overflow-x-auto">
      <table ref={ref} className={cn('rtable w-full caption-bottom text-[13px]', className)} {...props} />
    </div>
  );
}
export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="[&_tr]:border-b" {...props} />;
}
export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="[&_tr:last-child]:border-0" {...props} />;
}
export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b transition-colors hover:bg-subtle data-[selected=true]:bg-primary-soft/40', className)} {...props} />;
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-9 whitespace-nowrap px-3 text-left align-middle text-[11px] font-medium uppercase tracking-wide text-muted-foreground', className)} {...props} />;
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...props} />;
}
