'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, Bot, CalendarClock, Clock, Copy, Cpu, DollarSign, Pause, Play, Plus, RefreshCw, RotateCcw, Search, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KpiCard, PageHeader } from '@/components/app/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { fmtDateTime, fmtNum, fmtUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

type Settings = Record<string, unknown> & {
  enabled: boolean; paused: boolean; timezone: string; runTimes: string[]; daysOfWeek: number[]; searchConnectorOrder: string[];
  autoGenerateMessages: boolean; refreshEnabled: boolean;
};
interface Control {
  jobs: Record<string, number>;
  queries: Record<string, number>;
  results: Record<string, number>;
  usage: { searchCalls: number; aiCalls: number; aiTokens: number; costUsd: number; aiCostUsd: number };
}
interface QueueInfo {
  name: string;
  paused: boolean;
  counts: Record<string, number>;
}

const MAINT_LABEL: Record<string, string> = { 'maint-refresh': 'Atualização de eventos', 'maint-retention': 'Política de retenção', 'maint-resume': 'Retomada de pesquisas interrompidas', 'maint-followups': 'Follow-ups vencidos' };
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const QUEUE_LABEL: Record<string, string> = { plan: 'Planejamento', search: 'Consultas de busca', process: 'Processamento de resultados', analyze: 'Classificação por IA', message: 'Geração de mensagens', maintenance: 'Manutenção' };
const NUM_FIELDS: Array<{ section: string; fields: Array<[string, string, string?]> }> = [
  {
    section: 'Volume e limites',
    fields: [
      ['concurrency', 'Pesquisas simultâneas', 'Workers em paralelo para busca e processamento'],
      ['queriesPerRun', 'Consultas por rodada'],
      ['resultsPerQuery', 'Resultados por consulta'],
      ['statesPerRun', 'Estados por rodada', 'Alternados automaticamente'],
      ['categoriesPerRun', 'Categorias por rodada'],
      ['dailyLeadLimit', 'Limite diário de novos leads'],
      ['dailyQualifiedTarget', 'Meta diária de qualificados', 'Ao atingir, rodadas agendadas param no dia'],
      ['queryCacheDays', 'Não repetir consulta por (dias)'],
    ],
  },
  {
    section: 'Qualificação e IA',
    fields: [
      ['minQualifiedScore', 'Pontuação mínima para qualificar'],
      ['enrichmentMinScore', 'Pontuação para pesquisa complementar'],
      ['maxFollowupDepth', 'Profundidade da pesquisa progressiva', '0 desativa consultas geradas pela IA'],
    ],
  },
  {
    section: 'Atualização, follow-up e retenção',
    fields: [
      ['refreshIntervalDays', 'Reverificar eventos a cada (dias)'],
      ['refreshBatchSize', 'Eventos por atualização'],
      ['followUpDefaultDays', 'Follow-up automático após (dias)'],
      ['dataRetentionDays', 'Reter leads descartados por (dias)', 'LGPD: leads sem uso comercial são removidos'],
      ['logRetentionDays', 'Reter logs por (dias)'],
    ],
  },
];

function FailedJobs({ queue, onClose }: { queue: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['failed', queue], queryFn: () => api.get<Array<{ id: string; name: string; failedReason: string; attemptsMade: number; finishedOn: number; data: unknown }>>('/automation/failed-jobs', { queue }), enabled: !!queue });
  const retry = useMutation({
    mutationFn: (jobId?: string) => api.post<{ retried: number }>('/automation/failed-jobs/retry', { queue, jobId }),
    onSuccess: (r) => {
      toast.success(`${r.retried} tarefa(s) reenfileiradas`);
      qc.invalidateQueries({ queryKey: ['failed'] });
      qc.invalidateQueries({ queryKey: ['queues'] });
    },
  });
  return (
    <Dialog open={!!queue} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Tarefas com erro — ${QUEUE_LABEL[queue ?? ''] ?? ''}`} wide>
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={() => retry.mutate(undefined)} disabled={!q.data?.length} loading={retry.isPending}>
            <RotateCcw /> Reexecutar todas
          </Button>
        </div>
        {q.isPending ? (
          <Skeleton className="h-40" />
        ) : q.data?.length ? (
          <ul className="max-h-[60vh] divide-y overflow-y-auto rounded-lg border scrollbar-thin">
            {q.data.map((j) => (
              <li key={j.id} className="flex items-start gap-3 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <div className="break-words text-xs font-medium">{j.failedReason}</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{JSON.stringify(j.data)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {j.attemptsMade} tentativa(s) · {j.finishedOn ? fmtDateTime(new Date(j.finishedOn)) : '—'}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => retry.mutate(j.id)}>
                  <RotateCcw />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">Nenhuma tarefa com erro.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AutomationsPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/automation/settings') });
  const control = useQuery({ queryKey: ['control'], queryFn: () => api.get<Control>('/control'), refetchInterval: 15_000 });
  const queues = useQuery({ queryKey: ['queues'], queryFn: () => api.get<QueueInfo[]>('/automation/queues'), refetchInterval: 5_000 });
  const schedules = useQuery({ queryKey: ['schedules'], queryFn: () => api.get<Array<{ id: string; pattern: string | null; tz: string | null; next: string | null }>>('/automation/schedules') });
  const integ = useQuery({ queryKey: ['integrations'], queryFn: () => api.get<{ integrations: Array<{ provider: string; kind: string; label: string; enabled: boolean; status: string }> }>('/integrations') });
  const [form, setForm] = useState<Settings | null>(null);
  const [newTime, setNewTime] = useState('09:00');
  const [failedQueue, setFailedQueue] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['settings'] });
    qc.invalidateQueries({ queryKey: ['schedules'] });
    qc.invalidateQueries({ queryKey: ['queues'] });
  };
  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) => api.put<Settings>('/automation/settings', patch),
    onSuccess: () => (inv(), toast.success('Configurações salvas e agendamentos sincronizados')),
  });
  const pause = useMutation({ mutationFn: (p: boolean) => api.post(p ? '/automation/pause' : '/automation/resume'), onSuccess: (_d, p) => (inv(), toast.success(p ? 'Automações pausadas' : 'Automações retomadas')) });
  const runNow = useMutation({ mutationFn: () => api.post('/automation/run-now'), onSuccess: () => toast.success('Rodada enfileirada') });
  const task = useMutation({ mutationFn: (t: string) => api.post(`/automation/tasks/${t}`), onSuccess: () => toast.success('Tarefa enfileirada') });

  if (!form) return <Skeleton className="h-[70vh]" />;

  const dirty = JSON.stringify(form) !== JSON.stringify(settings.data);
  const searchProviders = (integ.data?.integrations ?? []).filter((i) => i.kind === 'search');
  const order = [...form.searchConnectorOrder.filter((p) => searchProviders.some((s) => s.provider === p)), ...searchProviders.map((s) => s.provider).filter((p) => !form.searchConnectorOrder.includes(p))];
  const moveProvider = (i: number, d: number) => {
    const next = [...order];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x!);
    setForm({ ...form, searchConnectorOrder: next });
  };
  const c = control.data;
  const status = !form.enabled ? 'desativada' : form.paused ? 'pausada' : 'ativa';

  return (
    <>
      <PageHeader
        title="Central de automações"
        description="Controle da operação contínua: agendamento, limites, filas, falhas e custos."
        actions={
          <>
            <Badge variant={status === 'ativa' ? 'success' : status === 'pausada' ? 'warning' : 'neutral'} className="h-7 px-2.5 text-xs">
              <Activity /> Automação {status}
            </Badge>
            {settings.data?.paused ? (
              <Button variant="outline" onClick={() => pause.mutate(false)} loading={pause.isPending}>
                <Play /> Retomar
              </Button>
            ) : (
              <Button variant="outline" onClick={() => pause.mutate(true)} loading={pause.isPending}>
                <Pause /> Pausar
              </Button>
            )}
            <Button onClick={() => runNow.mutate()} loading={runNow.isPending}>
              <Search /> Executar rodada agora
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KpiCard label="Pesquisas (30d)" value={c?.jobs.total} icon={Search} />
        <KpiCard label="Em andamento" value={(c?.jobs.running ?? 0) + (c?.jobs.queued ?? 0)} icon={Activity} tone="primary" />
        <KpiCard label="Concluídas" value={c?.jobs.completed} />
        <KpiCard label="Com falha" value={c?.jobs.failed} tone={c?.jobs.failed ? 'warning' : 'default'} icon={AlertTriangle} />
        <KpiCard label="Resultados" value={c?.jobs.resultsFound} />
        <KpiCard label="Leads aprovados" value={c?.jobs.leadsApproved} tone="success" />
        <KpiCard label="Duplicados" value={c?.jobs.duplicates} icon={Copy} />
        <KpiCard label="Tempo médio" value={c ? (c.jobs.avgDurationSec! > 90 ? `${Math.round(c.jobs.avgDurationSec! / 60)} min` : `${c.jobs.avgDurationSec}s`) : undefined} icon={Clock} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Chamadas de busca (mês)" value={c?.usage.searchCalls} icon={Search} href="/usage" />
        <KpiCard label="Chamadas de IA (mês)" value={c?.usage.aiCalls} icon={Cpu} hint={c ? `${fmtNum(Number(c.usage.aiTokens))} tokens` : undefined} href="/usage" />
        <KpiCard label="Custo IA (mês)" value={c ? fmtUsd(c.usage.aiCostUsd) : undefined} icon={Bot} href="/usage" />
        <KpiCard label="Custo total estimado (mês)" value={c ? fmtUsd(c.usage.costUsd) : undefined} icon={DollarSign} tone="warning" href="/usage" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-primary" /> Agendamento
                </CardTitle>
                <CardDescription>Rodadas automáticas diárias. Fuso: {form.timezone}</CardDescription>
              </div>
              <div className="flex items-center gap-2 text-xs">
                Ativo <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">Horários</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {form.runTimes.map((t) => (
                    <span key={t} className="inline-flex h-7 items-center gap-1 rounded-md border bg-subtle pl-2 pr-1 text-xs font-medium tabular">
                      {t}
                      <button className="rounded p-0.5 hover:bg-accent" onClick={() => setForm({ ...form, runTimes: form.runTimes.filter((x) => x !== t) })} aria-label={`Remover ${t}`}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="h-7 w-28" />
                  <Button size="sm" variant="outline" onClick={() => newTime && !form.runTimes.includes(newTime) && setForm({ ...form, runTimes: [...form.runTimes, newTime].sort() })}>
                    <Plus /> Adicionar
                  </Button>
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">Dias da semana</div>
                <div className="flex gap-1">
                  {DAYS.map((d, i) => (
                    <button
                      key={d}
                      onClick={() => setForm({ ...form, daysOfWeek: form.daysOfWeek.includes(i) ? form.daysOfWeek.filter((x) => x !== i) : [...form.daysOfWeek, i].sort() })}
                      className={cn('h-8 w-11 rounded-md border text-xs font-medium', form.daysOfWeek.includes(i) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Fuso horário" className="max-w-xs">
                <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
              </Field>
              {schedules.data && schedules.data.length > 0 && (
                <div className="rounded-lg border bg-subtle p-3 text-xs">
                  <div className="mb-1.5 font-medium">Próximas execuções</div>
                  <ul className="grid gap-1">
                    {schedules.data.map((s) => (
                      <li key={s.id} className="flex justify-between gap-2 text-muted-foreground">
                        <span className="truncate">{s.id?.startsWith('plan') ? `Rodada de pesquisa (${s.id.slice(5, 7)}:${s.id.slice(7)})` : (MAINT_LABEL[s.id ?? ''] ?? s.id)}</span>
                        <span className="tabular">{s.next ? fmtDateTime(s.next) : s.pattern}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {NUM_FIELDS.map((sec) => (
            <Card key={sec.section}>
              <CardHeader>
                <CardTitle>{sec.section}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {sec.fields.map(([k, label, hint]) => (
                    <Field key={k} label={label} hint={hint} className="content-start [&>label]:flex [&>label]:min-h-8 [&>label]:items-end">
                      <Input type="number" value={String(form[k] ?? '')} onChange={(e) => setForm({ ...form, [k]: e.target.value === '' ? '' : Number(e.target.value) })} />
                    </Field>
                  ))}
                </div>
                {sec.section === 'Qualificação e IA' && (
                  <label className="mt-4 flex items-center gap-2 text-xs">
                    <Switch checked={form.autoGenerateMessages} onCheckedChange={(v) => setForm({ ...form, autoGenerateMessages: v })} /> Gerar mensagem automaticamente após a qualificação (nunca envia)
                  </label>
                )}
                {sec.section.startsWith('Atualização') && (
                  <label className="mt-4 flex items-center gap-2 text-xs">
                    <Switch checked={form.refreshEnabled} onCheckedChange={(v) => setForm({ ...form, refreshEnabled: v })} /> Atualização automática (disponibilidade de sites, contatos, cancelamentos e novas edições)
                  </label>
                )}
              </CardContent>
            </Card>
          ))}

          <div className="sticky bottom-4 z-10 flex justify-end">
            <div className={cn('flex items-center gap-2 rounded-xl border bg-card/95 p-2 shadow-lg backdrop-blur transition-opacity', dirty ? 'opacity-100' : 'pointer-events-none opacity-0')}>
              <span className="px-2 text-xs text-muted-foreground">Alterações não salvas</span>
              <Button variant="ghost" onClick={() => setForm(settings.data!)}>
                Descartar
              </Button>
              <Button
                loading={save.isPending}
                onClick={() => {
                  const { id: _id, updatedAt: _u, stateCursor: _s, categoryCursor: _c, ...rest } = form as Record<string, unknown>;
                  save.mutate(rest as Partial<Settings>);
                }}
              >
                Salvar alterações
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Filas de processamento</CardTitle>
                <CardDescription>BullMQ · atualiza a cada 5s</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <THead>
                  <Tr className="hover:bg-transparent">
                    <Th>Fila</Th>
                    <Th className="text-right">Fila</Th>
                    <Th className="text-right">Ativas</Th>
                    <Th className="text-right">Erros</Th>
                  </Tr>
                </THead>
                <TBody>
                  {queues.data?.map((q) => (
                    <Tr key={q.name}>
                      <Td>
                        <div className="text-xs font-medium">{QUEUE_LABEL[q.name]}</div>
                        {q.paused && <Badge variant="warning">pausada</Badge>}
                      </Td>
                      <Td className="text-right tabular">{(q.counts.waiting ?? 0) + (q.counts.delayed ?? 0) + (q.counts.prioritized ?? 0) + (q.counts.paused ?? 0)}</Td>
                      <Td className="text-right tabular">{q.counts.active ?? 0}</Td>
                      <Td className="text-right">
                        {q.counts.failed ? (
                          <button className="font-medium text-destructive tabular hover:underline" onClick={() => setFailedQueue(q.name)}>
                            {q.counts.failed}
                          </button>
                        ) : (
                          <span className="tabular text-muted-foreground">0</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Ordem dos provedores de pesquisa</CardTitle>
                <CardDescription>O primeiro disponível é usado; os seguintes servem de fallback.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {order.map((p, i) => {
                  const it = searchProviders.find((s) => s.provider === p);
                  const ready = it?.enabled && it.status !== 'not_configured';
                  return (
                    <li key={p} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
                      <span className="w-4 text-xs text-muted-foreground tabular">{i + 1}</span>
                      <span className="flex-1 truncate text-xs font-medium">{it?.label ?? p}</span>
                      <Badge variant={ready ? 'success' : 'neutral'}>{ready ? 'pronto' : 'pendente'}</Badge>
                      <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => moveProvider(i, -1)} aria-label="Subir">
                        <ArrowUp />
                      </Button>
                      <Button size="icon-sm" variant="ghost" disabled={i === order.length - 1} onClick={() => moveProvider(i, 1)} aria-label="Descer">
                        <ArrowDown />
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <Button asChild variant="link" size="sm" className="mt-2">
                <Link href="/integrations">Configurar integrações</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tarefas de manutenção</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button variant="outline" className="justify-start" onClick={() => task.mutate('refresh')}>
                <RefreshCw /> Atualizar eventos agora
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => task.mutate('resume')}>
                <RotateCcw /> Retomar pesquisas interrompidas
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => task.mutate('followups_due')}>
                <CalendarClock /> Preparar follow-ups vencidos
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => task.mutate('retention')}>
                <Trash2 /> Aplicar política de retenção
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      <FailedJobs queue={failedQueue} onClose={() => setFailedQueue(null)} />
    </>
  );
}
