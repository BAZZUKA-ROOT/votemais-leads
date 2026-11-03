'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ExternalLink, Ticket } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, FactBadge, PageHeader, Pagination } from '@/components/app/common';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { EVENT_STATUS, UFS } from '@/lib/constants';
import { fmtDate, fmtRelative } from '@/lib/format';
import type { Category, Paged } from '@/lib/types';

interface EventRow {
  id: string; name: string; edition: string | null; year: number | null; city: string | null; state: string | null; startDate: string | null; status: string;
  hasContest: string; hasPopularVoting: string; registrationOpen: string; website: string | null; instagramHandle: string | null; siteAvailable: boolean | null;
  lastVerifiedAt: string | null; createdAt: string; organizerId: string | null; organizerName: string | null; categoryName: string | null; leadId: string | null; sources: number;
}

export default function EventsPage() {
  const [f, setF] = useState<Record<string, string | undefined>>({});
  const [page, setPage] = useState(1);
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/categories'), staleTime: 300_000 });
  const q = useQuery({ queryKey: ['events', f, page], queryFn: () => api.get<Paged<EventRow>>('/events', { ...f, page }), placeholderData: keepPreviousData });
  const set = (k: string, v?: string) => (setF({ ...f, [k]: v || undefined }), setPage(1));
  return (
    <>
      <PageHeader title="Eventos encontrados" description="Eventos identificados nas fontes públicas, com situação dos fatos verificados." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="w-64" placeholder="Nome ou cidade…" onKeyDown={(e) => e.key === 'Enter' && set('q', (e.target as HTMLInputElement).value)} />
        <Select className="w-28" onChange={(e) => set('state', e.target.value)}>
          <option value="">UF</option>
          {UFS.map(([uf]) => <option key={uf}>{uf}</option>)}
        </Select>
        <Select className="w-48" onChange={(e) => set('categoryId', e.target.value)}>
          <option value="">Todas categorias</option>
          {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select className="w-36" onChange={(e) => set('status', e.target.value)}>
          <option value="">Situação</option>
          {Object.entries(EVENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select className="w-44" onChange={(e) => set('voting', e.target.value)}>
          <option value="">Votação popular</option>
          <option value="confirmed">Confirmada</option>
          <option value="unconfirmed">Não confirmada</option>
          <option value="not_found">Não localizada</option>
        </Select>
        <Input className="w-24" type="number" placeholder="Ano" onBlur={(e) => set('year', e.target.value)} />
      </div>
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <Tr className="hover:bg-transparent">
              <Th>Evento</Th><Th>Organizador</Th><Th>Local</Th><Th>Data</Th><Th>Situação</Th><Th>Concurso</Th><Th>Votação</Th><Th>Fontes</Th><Th>Verificado</Th>
            </Tr>
          </THead>
          <TBody>
            {q.isPending && Array.from({ length: 6 }).map((_, i) => <Tr key={i}><Td colSpan={9}><Skeleton className="h-6" /></Td></Tr>)}
            {q.data?.items.map((e) => (
              <Tr key={e.id}>
                <Td className="max-w-80">
                  {e.leadId ? <Link href={`/leads/${e.leadId}`} className="block truncate font-medium hover:text-primary">{e.name}</Link> : <span className="block truncate font-medium">{e.name}</span>}
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {e.categoryName}
                    {e.website && <a href={e.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 hover:text-primary"><ExternalLink className="size-3" /> site</a>}
                    {e.instagramHandle && <span>@{e.instagramHandle}</span>}
                  </div>
                </Td>
                <Td className="max-w-44 truncate text-muted-foreground">{e.organizerName ?? '—'}</Td>
                <Td className="whitespace-nowrap">{[e.city, e.state].filter(Boolean).join(' / ') || '—'}</Td>
                <Td className="whitespace-nowrap tabular">{e.startDate ? fmtDate(e.startDate) : (e.year ?? '—')}</Td>
                <Td><Badge variant={e.status === 'cancelled' ? 'danger' : e.status === 'past' ? 'neutral' : e.status === 'scheduled' ? 'success' : 'outline'}>{EVENT_STATUS[e.status]}</Badge></Td>
                <Td><FactBadge status={e.hasContest} /></Td>
                <Td><FactBadge status={e.hasPopularVoting} /></Td>
                <Td className="tabular">{e.sources}</Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">
                  {e.lastVerifiedAt ? fmtRelative(e.lastVerifiedAt) : '—'}
                  {e.siteAvailable === false && <Badge variant="danger" className="ml-1">site fora</Badge>}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        {q.data && !q.data.items.length && <EmptyState icon={Ticket} title="Nenhum evento encontrado" />}
        {q.data && q.data.total > 0 && <Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
      </Card>
    </>
  );
}
