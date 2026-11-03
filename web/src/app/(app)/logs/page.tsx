'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronRight, FileText } from 'lucide-react';
import { useState } from 'react';
import { EmptyState, PageHeader, Pagination } from '@/components/app/common';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import type { Paged } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Log {
  id: number;
  level: string;
  scope: string;
  message: string;
  context: Record<string, unknown> | null;
  userId: string | null;
  ip: string | null;
  createdAt: string;
}
const LV: Record<string, 'neutral' | 'info' | 'warning' | 'danger' | 'default'> = { debug: 'neutral', info: 'info', warn: 'warning', error: 'danger', audit: 'default' };

export default function LogsPage() {
  const [level, setLevel] = useState('');
  const [scope, setScope] = useState('');
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ['logs', level, scope, text, page],
    queryFn: () => api.get<Paged<Log> & { scopes: string[] }>('/logs', { level: level || undefined, scope: scope || undefined, q: text || undefined, page }),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });
  return (
    <>
      <PageHeader title="Logs do sistema" description="Eventos operacionais, erros e trilha de auditoria (logins, exportações, exclusões, alterações de configuração)." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Select className="w-36" value={level} onChange={(e) => (setLevel(e.target.value), setPage(1))}>
          <option value="">Todos níveis</option>
          <option value="error">Erros</option>
          <option value="warn">Avisos</option>
          <option value="info">Info</option>
          <option value="audit">Auditoria</option>
          <option value="error,warn">Erros e avisos</option>
        </Select>
        <Select className="w-44" value={scope} onChange={(e) => (setScope(e.target.value), setPage(1))}>
          <option value="">Todos escopos</option>
          {q.data?.scopes.map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Input className="w-64" placeholder="Buscar na mensagem…" onKeyDown={(e) => e.key === 'Enter' && (setText((e.target as HTMLInputElement).value), setPage(1))} />
      </div>
      <Card className="overflow-hidden">
        {q.isPending && <Skeleton className="m-3 h-64" />}
        <ul className="divide-y font-mono text-xs">
          {q.data?.items.map((l) => (
            <li key={l.id}>
              <button className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-subtle" onClick={() => setOpen(open === l.id ? null : l.id)}>
                <ChevronRight className={cn('mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform', open === l.id && 'rotate-90')} />
                <span className="w-32 shrink-0 text-muted-foreground">{fmtDateTime(l.createdAt)}</span>
                <Badge variant={LV[l.level]} className="w-14 justify-center">{l.level}</Badge>
                <span className="w-28 shrink-0 truncate text-muted-foreground">{l.scope}</span>
                <span className="flex-1 break-words font-sans text-[13px]">{l.message}</span>
              </button>
              {open === l.id && (
                <pre className="mx-3 mb-2 overflow-x-auto rounded-lg bg-muted p-3 text-[11px] scrollbar-thin">{JSON.stringify({ context: l.context, userId: l.userId, ip: l.ip }, null, 2)}</pre>
              )}
            </li>
          ))}
        </ul>
        {q.data && !q.data.items.length && <EmptyState icon={FileText} title="Nenhum log" />}
        {q.data && q.data.total > 0 && <Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
