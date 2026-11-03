'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ExternalLink, Play, RefreshCw, RotateCcw, Search as SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader, Pagination, PendingIntegration } from '@/components/app/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/switch';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { CATEGORY_GROUPS, JOB_STATUS, REGIONS, RESULT_STATUS, UFS } from '@/lib/constants';
import { fmtDateTime, fmtNum, fmtRelative } from '@/lib/format';
import type { Category, Paged } from '@/lib/types';
import { cn } from '@/lib/utils';

interface Job {
  id: string; type: string; status: string; params: Record<string, unknown>; totalQueries: number; completedQueries: number; failedQueries: number;
  resultsFound: number; leadsCreated: number; duplicates: number; discarded: number; error: string | null; startedAt: string | null; finishedAt: string | null; createdAt: string; contextEventId: string | null;
}
interface JobDetail {
  job: Job;
  queries: Array<{ id: string; query: string; connector: string | null; status: string; origin: string; depth: number; resultsCount: number; newResultsCount: number; durationMs: number | null; error: string | null; state: string | null }>;
  results: Array<{ id: string; url: string; title: string; domain: string; connector: string; status: string; relevanceScore: number | null; discardReason: string | null; error: string | null; eventId: string | null }>;
}
interface Control {
  results: { awaitingAi: number; failed: number; pending: number };
}

const TYPE_LABEL: Record<string, string> = { scheduled: 'Agendada', manual: 'Manual', followup: 'Complementar (IA)', refresh: 'Novas edições' };
const statusVariant = (s: string) => (s === 'completed' ? 'success' : s === 'failed' ? 'danger' : s === 'running' ? 'info' : s === 'cancelled' ? 'neutral' : 'warning');
const resultVariant = (s: string) => (s === 'processed' ? 'success' : s === 'duplicate' ? 'info' : s === 'failed' ? 'danger' : s === 'awaiting_ai' ? 'warning' : 'neutral');

function NewSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/categories'), enabled: open });
  const [catIds, setCatIds] = useState<number[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [maxQueries, setMax] = useState(30);
  const [custom, setCustom] = useState('');
  const run = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ status: string }>('/search/run', body),
    onSuccess: () => {
      toast.success('Pesquisa enfileirada');
      qc.invalidateQueries({ queryKey: ['search-jobs'] });
      onOpenChange(false);
    },
  });
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Nova pesquisa" description="Execute uma rodada fora do agendamento." wide>
        <Tabs defaultValue="plan">
          <TabsList>
            <TabsTrigger value="plan">Por categoria e estado</TabsTrigger>
            <TabsTrigger value="custom">Consultas livres</TabsTrigger>
          </TabsList>
          <TabsContent value="plan">
            <div className="grid gap-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-medium">
                  Categorias <span className="font-normal text-muted-foreground">{catIds.length ? `${catIds.length} selecionadas` : 'todas ativas (rotação)'}</span>
                </div>
                <div className="max-h-48 space-y-3 overflow-y-auto rounded-lg border p-3 scrollbar-thin">
                  {Object.entries(CATEGORY_GROUPS).map(([g, label]) => (
                    <div key={g}>
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
                      <div className="grid grid-cols-2 gap-1">
                        {cats.data?.filter((c) => c.group === g && c.isActive).map((c) => (
                          <label key={c.id} className="flex items-center gap-2 text-xs">
                            <Checkbox checked={catIds.includes(c.id)} onCheckedChange={() => setCatIds(toggle(catIds, c.id))} /> {c.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-medium">
                  Estados <span className="font-normal text-muted-foreground">{states.length ? `${states.length} selecionados` : 'rotação automática'}</span>
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {REGIONS.map((r) => (
                    <Button key={r} size="sm" variant="outline" type="button" onClick={() => setStates([...new Set([...states, ...UFS.filter((u) => u[2] === r).map((u) => u[0])])])}>
                      + {r}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" type="button" onClick={() => setStates([])}>
                    Limpar
                  </Button>
                </div>
                <div className="grid grid-cols-9 gap-1">
                  {UFS.map(([uf]) => (
                    <button
                      type="button"
                      key={uf}
                      onClick={() => setStates(toggle(states, uf))}
                      className={cn('h-7 rounded-md border text-[11px] font-medium', states.includes(uf) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}
                    >
                      {uf}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Máximo de consultas" hint="Cada consulta conta no limite do provedor de pesquisa.">
                <Input type="number" min={1} max={200} value={maxQueries} onChange={(e) => setMax(Number(e.target.value))} className="w-32" />
              </Field>
            </div>
            <DialogFooter>
              <Button onClick={() => run.mutate({ categoryIds: catIds.length ? catIds : undefined, states: states.length ? states : undefined, maxQueries })} loading={run.isPending}>
                <Play /> Iniciar pesquisa
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="custom">
            <Field label="Uma consulta por linha" hint="Ex.: “Rainha da Expo” 2027 Uberaba · site:instagram.com “garota expo” MS">
              <Textarea rows={8} value={custom} onChange={(e) => setCustom(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button
                onClick={() => run.mutate({ customQueries: custom.split('\n').map((s) => s.trim()).filter((s) => s.length >= 3) })}
                disabled={!custom.trim()}
                loading={run.isPending}
              >
                <Play /> Executar consultas
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function JobDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['search-job', id],
    queryFn: () => api.get<JobDetail>(`/search/jobs/${id}`),
    enabled: !!id,
    refetchInterval: (query) => (['queued', 'running'].includes(query.state.data?.job.status ?? '') ? 4000 : false),
  });
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Detalhes da pesquisa" description={q.data ? `${TYPE_LABEL[q.data.job.type]} · ${fmtDateTime(q.data.job.createdAt)}` : undefined} wide className="max-w-5xl">
        {q.isPending ? (
          <Skeleton className="h-60" />
        ) : (
          q.data && (
            <Tabs defaultValue="results">
              <TabsList>
                <TabsTrigger value="results">Resultados ({q.data.results.length})</TabsTrigger>
                <TabsTrigger value="queries">Consultas ({q.data.queries.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="results">
                <Table>
                  <THead>
                    <Tr className="hover:bg-transparent"><Th>Resultado</Th><Th>Provedor</Th><Th>Relev.</Th><Th>Status</Th></Tr>
                  </THead>
                  <TBody>
                    {q.data.results.map((r) => (
                      <Tr key={r.id}>
                        <Td className="max-w-md">
                          <a href={r.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 truncate font-medium hover:text-primary">
                            {r.title || r.url} <ExternalLink className="size-3 shrink-0" />
                          </a>
                          <div className="truncate text-[11px] text-muted-foreground">{r.domain}{(r.discardReason || r.error) && ` · ${r.error ?? r.discardReason}`}</div>
                        </Td>
                        <Td className="text-xs">{r.connector}</Td>
                        <Td className="tabular">{r.relevanceScore ?? '—'}</Td>
                        <Td><Badge variant={resultVariant(r.status)}>{RESULT_STATUS[r.status] ?? r.status}</Badge></Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
                {!q.data.results.length && <EmptyState title="Sem resultados ainda" />}
              </TabsContent>
              <TabsContent value="queries">
                <Table>
                  <THead>
                    <Tr className="hover:bg-transparent"><Th>Consulta</Th><Th>Origem</Th><Th>Provedor</Th><Th>Resultados</Th><Th>Tempo</Th><Th>Status</Th></Tr>
                  </THead>
                  <TBody>
                    {q.data.queries.map((x) => (
                      <Tr key={x.id}>
                        <Td className="max-w-md">
                          <div className="truncate font-mono text-xs">{x.query}</div>
                          {x.error && <div className="truncate text-[11px] text-destructive">{x.error}</div>}
                        </Td>
                        <Td className="text-xs">{x.origin === 'ai_followup' ? `IA (nível ${x.depth})` : x.origin}</Td>
                        <Td className="text-xs">{x.connector ?? '—'}</Td>
                        <Td className="tabular">{x.resultsCount} <span className="text-muted-foreground">({x.newResultsCount} novos)</span></Td>
                        <Td className="tabular text-xs">{x.durationMs ? `${(x.durationMs / 1000).toFixed(1)}s` : '—'}</Td>
                        <Td><Badge variant={statusVariant(x.status === 'done' ? 'completed' : x.status)}>{x.status}</Badge></Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </TabsContent>
            </Tabs>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function SearchPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const jobs = useQuery({
    queryKey: ['search-jobs', page, status],
    queryFn: () => api.get<Paged<Job>>('/search/jobs', { page, status: status || undefined }),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.items.some((j) => ['queued', 'running'].includes(j.status)) ? 5000 : 30_000),
  });
  const control = useQuery({ queryKey: ['control'], queryFn: () => api.get<Control>('/control'), refetchInterval: 30_000 });
  const integ = useQuery({ queryKey: ['integrations'], queryFn: () => api.get<{ integrations: Array<{ kind: string; status: string; enabled: boolean; provider: string }> }>('/integrations') });
  const searchReady = integ.data?.integrations.some((i) => i.kind === 'search' && i.enabled && i.status !== 'not_configured');
  const aiReady = integ.data?.integrations.some((i) => i.provider === 'anthropic' && i.enabled && i.status !== 'not_configured');

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['search-jobs'] });
    qc.invalidateQueries({ queryKey: ['control'] });
  };
  const cancel = useMutation({ mutationFn: (id: string) => api.post(`/search/jobs/${id}/cancel`), onSuccess: () => (inv(), toast.success('Pesquisa cancelada')) });
  const retry = useMutation({ mutationFn: (id: string) => api.post<{ queries: number; results: number }>(`/search/jobs/${id}/retry`), onSuccess: (r) => (inv(), toast.success(`${r.queries} consultas e ${r.results} resultados reenfileirados`)) });
  const reprocess = useMutation({ mutationFn: () => api.post<{ requeued: number }>('/search/results/reprocess', { status: 'awaiting_ai' }), onSuccess: (r) => (inv(), toast.success(`${r.requeued} resultados reenfileirados`)) });

  return (
    <>
      <PageHeader
        title="Pesquisas"
        description="Rodadas de busca em fontes públicas e autorizadas. A IA gera consultas complementares conforme encontra eventos."
        actions={
          <Button onClick={() => setOpen(true)} disabled={integ.isSuccess && !searchReady}>
            <SearchIcon /> Nova pesquisa
          </Button>
        }
      />
      <div className="mb-4 space-y-2">
        {integ.isSuccess && !searchReady && <PendingIntegration what="nenhum provedor de pesquisa configurado (SearXNG, Brave, Serper, Tavily ou Google)." />}
        {integ.isSuccess && !aiReady && <PendingIntegration what="IA (Anthropic) não configurada — resultados ficam aguardando análise e nenhum lead é criado sem ela." />}
        {(control.data?.results.awaitingAi ?? 0) > 0 && (
          <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-xs">
            <span className="flex-1">
              <span className="font-medium">{fmtNum(control.data!.results.awaitingAi)}</span> resultado(s) aguardando análise da IA.
            </span>
            <Button size="sm" variant="outline" disabled={!aiReady} onClick={() => reprocess.mutate()} loading={reprocess.isPending}>
              <RefreshCw /> Reprocessar
            </Button>
          </div>
        )}
      </div>
      <Tabs value={status} onValueChange={(v) => (setStatus(v), setPage(1))} className="mb-3">
        <TabsList>
          <TabsTrigger value="">Todas</TabsTrigger>
          <TabsTrigger value="running">Em andamento</TabsTrigger>
          <TabsTrigger value="completed">Concluídas</TabsTrigger>
          <TabsTrigger value="failed">Com falha</TabsTrigger>
          <TabsTrigger value="cancelled">Canceladas</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <Tr className="hover:bg-transparent">
              <Th>Pesquisa</Th><Th>Status</Th><Th>Progresso</Th><Th>Resultados</Th><Th>Leads</Th><Th>Duplicados</Th><Th>Descartados</Th><Th>Duração</Th><Th className="w-24" />
            </Tr>
          </THead>
          <TBody>
            {jobs.isPending && Array.from({ length: 6 }).map((_, i) => <Tr key={i}><Td colSpan={9}><Skeleton className="h-6" /></Td></Tr>)}
            {jobs.data?.items.map((j) => {
              const done = j.completedQueries + j.failedQueries;
              const pct = j.totalQueries ? Math.round((done / j.totalQueries) * 100) : 0;
              const dur = j.startedAt ? ((j.finishedAt ? new Date(j.finishedAt) : new Date()).getTime() - new Date(j.startedAt).getTime()) / 1000 : null;
              const params = j.params as { states?: string[]; categories?: string[]; reason?: string };
              return (
                <Tr key={j.id} className="cursor-pointer" onClick={() => setDetail(j.id)}>
                  <Td>
                    <div className="font-medium">{TYPE_LABEL[j.type]}</div>
                    <div className="max-w-64 truncate text-[11px] text-muted-foreground">
                      {fmtRelative(j.createdAt)}
                      {params.states?.length ? ` · ${params.states.join(', ')}` : ''}
                      {params.reason ? ` · ${params.reason}` : ''}
                    </div>
                  </Td>
                  <Td>
                    <Badge variant={statusVariant(j.status)}>{JOB_STATUS[j.status]}</Badge>
                    {j.error && <div className="mt-0.5 max-w-48 truncate text-[11px] text-destructive">{j.error}</div>}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', j.failedQueries ? 'bg-warning' : 'bg-primary')} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] tabular text-muted-foreground">{done}/{j.totalQueries}</span>
                    </div>
                  </Td>
                  <Td className="tabular">{fmtNum(j.resultsFound)}</Td>
                  <Td className="tabular font-medium text-success">{fmtNum(j.leadsCreated)}</Td>
                  <Td className="tabular">{fmtNum(j.duplicates)}</Td>
                  <Td className="tabular">{fmtNum(j.discarded)}</Td>
                  <Td className="tabular text-xs">{dur !== null ? (dur > 90 ? `${Math.round(dur / 60)} min` : `${Math.round(dur)}s`) : '—'}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      {['queued', 'running'].includes(j.status) && (
                        <Button size="icon-sm" variant="ghost" aria-label="Cancelar" onClick={() => cancel.mutate(j.id)}>
                          <Ban />
                        </Button>
                      )}
                      {(j.failedQueries > 0 || ['failed', 'cancelled'].includes(j.status)) && (
                        <Button size="icon-sm" variant="ghost" aria-label="Reexecutar falhas" onClick={() => retry.mutate(j.id)}>
                          <RotateCcw />
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
        {jobs.data && !jobs.data.items.length && (
          <EmptyState icon={SearchIcon} title="Nenhuma pesquisa executada" description="As rodadas agendadas aparecem aqui automaticamente. Você também pode iniciar uma manualmente." action={<Button asChild variant="outline"><Link href="/automations">Configurar automações</Link></Button>} />
        )}
        {jobs.data && jobs.data.total > 0 && <Pagination page={page} pageSize={jobs.data.pageSize} total={jobs.data.total} onPage={setPage} />}
      </Card>
      <NewSearchDialog open={open} onOpenChange={setOpen} />
      <JobDialog id={detail} onClose={() => setDetail(null)} />
    </>
  );
}
