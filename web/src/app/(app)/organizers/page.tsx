'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FolderKanban, Repeat } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { EmptyState, PageHeader, Pagination, ScoreBadge, StageBadge } from '@/components/app/common';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { ORGANIZER_TYPES, UFS } from '@/lib/constants';
import { fmtPhone, fmtRelative } from '@/lib/format';
import type { Contact, Paged } from '@/lib/types';

interface OrgRow {
  id: string; name: string; companyName: string | null; personName: string | null; type: string; city: string | null; state: string | null; website: string | null;
  instagramHandle: string | null; isRecurring: boolean; eventsCount: number; createdAt: string; contactsCount: number;
}
interface OrgDetail {
  organizer: OrgRow & { notes: string | null };
  events: Array<{ id: string; name: string; year: number | null; city: string | null; state: string | null; status: string; leadId: string | null; stage: string | null; score: number | null }>;
  contacts: Contact[];
}

function OrganizersInner() {
  const sp = useSearchParams();
  const [f, setF] = useState<Record<string, string | undefined>>({ q: sp.get('q') ?? undefined });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['organizers', f, page], queryFn: () => api.get<Paged<OrgRow>>('/organizers', { ...f, page }), placeholderData: keepPreviousData });
  const detail = useQuery({ queryKey: ['organizer', open], queryFn: () => api.get<OrgDetail>(`/organizers/${open}`), enabled: !!open });
  const set = (k: string, v?: string) => (setF({ ...f, [k]: v || undefined }), setPage(1));
  return (
    <>
      <PageHeader title="Organizadores" description="Quem organiza os eventos. Um organizador pode ter vários eventos e edições." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="w-64" defaultValue={f.q} placeholder="Nome, empresa ou @instagram…" onKeyDown={(e) => e.key === 'Enter' && set('q', (e.target as HTMLInputElement).value)} />
        <Select className="w-28" onChange={(e) => set('state', e.target.value)}>
          <option value="">UF</option>
          {UFS.map(([uf]) => <option key={uf}>{uf}</option>)}
        </Select>
        <Select className="w-44" onChange={(e) => set('type', e.target.value)}>
          <option value="">Tipo de organizador</option>
          {Object.entries(ORGANIZER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select className="w-40" onChange={(e) => set('recurring', e.target.value)}>
          <option value="">Recorrência</option>
          <option value="true">Recorrentes</option>
          <option value="false">Não recorrentes</option>
        </Select>
      </div>
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <Tr className="hover:bg-transparent"><Th>Organizador</Th><Th>Tipo</Th><Th>Local</Th><Th>Instagram</Th><Th>Eventos</Th><Th>Contatos</Th><Th>Desde</Th></Tr>
          </THead>
          <TBody>
            {q.isPending && Array.from({ length: 6 }).map((_, i) => <Tr key={i}><Td colSpan={7}><Skeleton className="h-6" /></Td></Tr>)}
            {q.data?.items.map((o) => (
              <Tr key={o.id} className="cursor-pointer" onClick={() => setOpen(o.id)}>
                <Td className="max-w-80">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{o.name}</span>
                    {o.isRecurring && <Badge variant="success"><Repeat /> recorrente</Badge>}
                  </div>
                  {(o.companyName || o.personName) && <div className="truncate text-[11px] text-muted-foreground">{[o.companyName, o.personName].filter(Boolean).join(' · ')}</div>}
                </Td>
                <Td>{ORGANIZER_TYPES[o.type]}</Td>
                <Td>{[o.city, o.state].filter(Boolean).join(' / ') || '—'}</Td>
                <Td>{o.instagramHandle ? `@${o.instagramHandle}` : '—'}</Td>
                <Td className="tabular">{o.eventsCount}</Td>
                <Td className="tabular">{o.contactsCount}</Td>
                <Td className="text-xs text-muted-foreground">{fmtRelative(o.createdAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        {q.data && !q.data.items.length && <EmptyState icon={FolderKanban} title="Nenhum organizador" />}
        {q.data && q.data.total > 0 && <Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
      </Card>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent title={detail.data?.organizer.name ?? 'Organizador'} description={detail.data ? ORGANIZER_TYPES[detail.data.organizer.type] : undefined} wide>
          {detail.isPending ? <Skeleton className="h-40" /> : detail.data && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs font-medium">Eventos ({detail.data.events.length})</div>
                <ul className="divide-y rounded-lg border">
                  {detail.data.events.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        {e.leadId ? <Link href={`/leads/${e.leadId}`} className="truncate font-medium hover:text-primary">{e.name}</Link> : e.name}
                        <div className="text-[11px] text-muted-foreground">{[e.year, e.city, e.state].filter(Boolean).join(' · ')}</div>
                      </div>
                      {e.stage && <StageBadge stage={e.stage} />}
                      <ScoreBadge score={e.score} />
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-2 text-xs font-medium">Contatos públicos</div>
                {detail.data.contacts.length ? (
                  <ul className="space-y-1.5 text-[13px]">
                    {detail.data.contacts.map((c) => (
                      <li key={c.id} className="flex items-center gap-2">
                        <Badge variant="outline">{c.type}</Badge>
                        <span>{c.type === 'whatsapp' || c.type === 'phone' ? fmtPhone(c.normalizedValue) : c.value}</span>
                        <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener" className="ml-auto truncate text-[11px] text-muted-foreground hover:text-primary">{c.sourceUrl}</a>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">Nenhum contato vinculado diretamente ao organizador.</p>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function OrganizersPage() {
  return <Suspense><OrganizersInner /></Suspense>;
}
