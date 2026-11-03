'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, MessageCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader, Pagination, StageBadge } from '@/components/app/common';
import { WhatsAppComposer } from '@/components/app/composer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { fmtDateTime, fmtPhone } from '@/lib/format';
import type { GeneratedMessage, Paged } from '@/lib/types';

type Row = GeneratedMessage & { eventName: string; city: string | null; state: string | null; primaryWhatsapp: string | null; primaryPhone: string | null; stage: string };
const STATUS: Record<string, { label: string; v: 'default' | 'info' | 'success' | 'neutral' }> = {
  draft: { label: 'rascunho', v: 'default' },
  opened: { label: 'aberta no WhatsApp', v: 'info' },
  sent: { label: 'enviada', v: 'success' },
  discarded: { label: 'descartada', v: 'neutral' },
};

export default function MessagesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('draft');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [composer, setComposer] = useState<{ leadId: string; kind: 'initial' | 'followup' } | null>(null);
  const q = useQuery({
    queryKey: ['messages', status, kind, page],
    queryFn: () => api.get<Paged<Row>>('/messages', { status: status || undefined, kind: kind || undefined, page }),
    placeholderData: keepPreviousData,
  });
  const discard = useMutation({
    mutationFn: (id: string) => api.patch(`/messages/${id}`, { status: 'discarded' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  });

  return (
    <>
      <PageHeader title="Mensagens geradas" description="Mensagens personalizadas pela IA. Revise, edite e abra no WhatsApp — o envio é sempre manual." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs value={status} onValueChange={(v) => (setStatus(v), setPage(1))}>
          <TabsList>
            <TabsTrigger value="draft">Rascunhos</TabsTrigger>
            <TabsTrigger value="opened">Abertas</TabsTrigger>
            <TabsTrigger value="sent">Enviadas</TabsTrigger>
            <TabsTrigger value="discarded">Descartadas</TabsTrigger>
            <TabsTrigger value="">Todas</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select className="w-40" value={kind} onChange={(e) => (setKind(e.target.value), setPage(1))}>
          <option value="">Todos os tipos</option>
          <option value="initial">Primeiro contato</option>
          <option value="followup">Follow-up</option>
        </Select>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {q.isPending && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        {q.data?.items.map((m) => (
          <Card key={m.id} className="flex flex-col p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/leads/${m.leadId}`} className="block truncate font-medium hover:text-primary">
                  {m.eventName}
                </Link>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {[m.city, m.state].filter(Boolean).join(' / ') || '—'} · {m.primaryWhatsapp ? fmtPhone(m.primaryWhatsapp) : m.primaryPhone ? `${fmtPhone(m.primaryPhone)} (não confirmado)` : 'sem WhatsApp'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant={STATUS[m.status]!.v}>{STATUS[m.status]!.label}</Badge>
                <StageBadge stage={m.stage} />
              </div>
            </div>
            <p className="flex-1 whitespace-pre-wrap rounded-lg bg-subtle p-3 text-[13px] leading-relaxed">{m.editedContent ?? m.content}</p>
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>{m.kind === 'initial' ? 'Primeiro contato' : 'Follow-up'} · {fmtDateTime(m.createdAt)}</span>
              <div className="ml-auto flex gap-1.5">
                <Button size="icon-sm" variant="ghost" aria-label="Copiar" onClick={() => navigator.clipboard.writeText(m.editedContent ?? m.content).then(() => toast.success('Copiado'))}>
                  <Copy />
                </Button>
                {m.status === 'draft' && (
                  <Button size="icon-sm" variant="ghost" aria-label="Descartar" onClick={() => discard.mutate(m.id)}>
                    <Trash2 />
                  </Button>
                )}
                <Button size="sm" variant="whatsapp" onClick={() => setComposer({ leadId: m.leadId, kind: m.kind })} disabled={!m.primaryWhatsapp && !m.primaryPhone}>
                  <MessageCircle /> Revisar e abrir
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {q.data && !q.data.items.length && (
        <Card>
          <EmptyState title="Nenhuma mensagem nesta visão" description="Mensagens são geradas automaticamente quando um lead é qualificado (configurável em Automações)." />
        </Card>
      )}
      {q.data && q.data.total > q.data.pageSize && (
        <Card className="mt-3">
          <Pagination page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        </Card>
      )}
      <WhatsAppComposer leadId={composer?.leadId ?? null} kind={composer?.kind} open={!!composer} onOpenChange={(o) => !o && setComposer(null)} />
    </>
  );
}
