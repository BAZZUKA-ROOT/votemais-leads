'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, Clock, MessageCircle, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader, StageBadge } from '@/components/app/common';
import { WhatsAppComposer } from '@/components/app/composer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { fmtDateTime, fmtRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Fu {
  id: string;
  leadId: string;
  dueAt: string;
  title: string;
  notes: string | null;
  suggestedMessage: string | null;
  status: string;
  eventName: string;
  city: string | null;
  state: string | null;
  stage: string;
  primaryWhatsapp: string | null;
}

export default function FollowUpsPage() {
  const qc = useQueryClient();
  const [range, setRange] = useState<'overdue' | 'today' | 'week' | 'all'>('overdue');
  const [composer, setComposer] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['followups', range], queryFn: () => api.get<Fu[]>('/followups', { range, status: range === 'all' ? undefined : 'pending' }) });
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['followups'] });
    qc.invalidateQueries({ queryKey: ['lead'] });
  };
  const update = useMutation({ mutationFn: ({ id, ...body }: { id: string; status?: string; dueAt?: string }) => api.patch(`/followups/${id}`, body), onSuccess: inv });
  const suggest = useMutation({
    mutationFn: (id: string) => api.post(`/followups/${id}/suggest`),
    onSuccess: () => (inv(), toast.success('Sugestão de follow-up gerada')),
  });
  const snooze = (f: Fu, days: number) => update.mutate({ id: f.id, dueAt: new Date(Date.now() + days * 86400_000).toISOString() });

  return (
    <>
      <PageHeader title="Follow-ups" description="Lembretes de retorno. A IA prepara sugestões de mensagem; o envio é sempre feito por você." />
      <Tabs value={range} onValueChange={(v) => setRange(v as typeof range)} className="mb-3">
        <TabsList>
          <TabsTrigger value="overdue">Vencidos</TabsTrigger>
          <TabsTrigger value="today">Hoje</TabsTrigger>
          <TabsTrigger value="week">Próximos 7 dias</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="divide-y">
        {q.isPending && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="m-3 h-14" />)}
        {q.data?.map((f) => {
          const overdue = f.status === 'pending' && new Date(f.dueAt) < new Date();
          return (
            <div key={f.id} className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-start', f.status !== 'pending' && 'opacity-60')}>
              <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', overdue ? 'bg-danger-soft text-destructive' : 'bg-primary-soft text-primary-soft-foreground')}>
                <CalendarClock className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{f.title}</span>
                  <StageBadge stage={f.stage} />
                </div>
                <Link href={`/leads/${f.leadId}`} className="text-xs text-muted-foreground hover:text-primary">
                  {f.eventName} · {[f.city, f.state].filter(Boolean).join(' / ')}
                </Link>
                <div className={cn('mt-0.5 text-[11px]', overdue ? 'text-destructive' : 'text-muted-foreground')}>
                  {fmtDateTime(f.dueAt)} ({fmtRelative(f.dueAt)})
                </div>
                {f.suggestedMessage && <p className="mt-2 rounded-lg bg-subtle p-2.5 text-xs leading-relaxed">{f.suggestedMessage}</p>}
              </div>
              {f.status === 'pending' && (
                <div className="flex flex-wrap gap-1.5">
                  {!f.suggestedMessage && (
                    <Button size="sm" variant="outline" onClick={() => suggest.mutate(f.id)} loading={suggest.isPending && suggest.variables === f.id}>
                      <Sparkles /> Sugerir mensagem
                    </Button>
                  )}
                  <Button size="sm" variant="whatsapp" onClick={() => setComposer(f.leadId)}>
                    <MessageCircle /> WhatsApp
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => snooze(f, 2)}>
                    <Clock /> +2 dias
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => update.mutate({ id: f.id, status: 'done' })}>
                    <Check /> Concluir
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => update.mutate({ id: f.id, status: 'cancelled' })} aria-label="Cancelar">
                    <X />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {q.data && !q.data.length && <EmptyState title="Nada por aqui" description="Ao marcar um lead como contatado, um follow-up é criado automaticamente conforme a configuração." icon={CalendarClock} />}
      </Card>
      <WhatsAppComposer leadId={composer} kind="followup" open={!!composer} onOpenChange={(o) => !o && setComposer(null)} />
    </>
  );
}
