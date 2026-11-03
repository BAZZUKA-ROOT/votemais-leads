'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Download,
  Eye,
  Filter,
  Globe,
  Handshake,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { Instagram } from '@/components/app/icons';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader, Pagination, ScoreBadge, StageBadge, useConfirm } from '@/components/app/common';
import { openChannel, WhatsAppComposer } from '@/components/app/composer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { Field, Input, Select } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/switch';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { Tip } from '@/components/ui/tooltip';
import { api, qs } from '@/lib/api';
import { ORGANIZER_TYPES, REGIONS, STAGES, UFS } from '@/lib/constants';
import { fmtDate, fmtPhone, fmtRelative } from '@/lib/format';
import type { Category, LeadRow, Paged } from '@/lib/types';

const FILTER_KEYS = ['q', 'state', 'city', 'region', 'categoryId', 'stage', 'qualification', 'potential', 'scoreMin', 'year', 'organizerType', 'discoveredFrom', 'discoveredTo', 'eventFrom', 'eventTo', 'hasWhatsapp', 'hasInstagram', 'hasEmail', 'sort', 'dir', 'page'] as const;
type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

function useFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const filters: Filters = {};
  for (const k of FILTER_KEYS) {
    const v = sp.get(k);
    if (v) filters[k] = v;
  }
  const set = (patch: Filters) => {
    const next = { ...filters, ...patch };
    if (!('page' in patch)) delete next.page;
    router.replace(`${path}${qs(next)}`, { scroll: false });
  };
  return { filters, set, clear: () => router.replace(path) };
}

function TriToggle({ label, value, onChange }: { label: string; value?: string; onChange: (v?: string) => void }) {
  return (
    <Field label={label}>
      <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">Indiferente</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </Select>
    </Field>
  );
}

function LeadsInner() {
  const qc = useQueryClient();
  const { filters, set, clear } = useFilters();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composer, setComposer] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const page = Number(filters.page ?? 1);

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/categories'), staleTime: 300_000 });
  const leads = useQuery({
    queryKey: ['leads', filters],
    queryFn: () => api.get<Paged<LeadRow>>('/leads', { ...filters, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['leads'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['pipeline'] });
  };
  const stage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => api.post(`/leads/${id}/stage`, { stage }),
    onSuccess: () => {
      invalidate();
      toast.success('Estágio atualizado');
    },
  });
  const bulk = useMutation({
    mutationFn: (body: { ids: string[]; action: 'stage' | 'delete' | 'analyze'; stage?: string }) => api.post<{ affected: number }>('/leads/bulk', body),
    onSuccess: (r) => {
      setSelected(new Set());
      invalidate();
      toast.success(`${r.affected} lead(s) atualizados`);
    },
  });
  const remove = useMutation({
    mutationFn: ({ id, suppress }: { id: string; suppress: boolean }) => api.del(`/leads/${id}?suppress=${suppress}`),
    onSuccess: () => {
      invalidate();
      toast.success('Lead excluído');
    },
  });

  const items = leads.data?.items ?? [];
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const someSelected = items.some((i) => selected.has(i.id));
  const activeFilters = useMemo(() => Object.keys(filters).filter((k) => !['sort', 'dir', 'page', 'q'].includes(k)).length, [filters]);

  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) items.forEach((i) => next.delete(i.id));
    else items.forEach((i) => next.add(i.id));
    setSelected(next);
  };

  const sortBy = (key: string) => set({ sort: key, dir: filters.sort === key && filters.dir !== 'asc' ? 'asc' : 'desc' });
  const SortTh = ({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) => (
    <Th className={className}>
      <button className="inline-flex items-center gap-1 uppercase hover:text-foreground" onClick={() => sortBy(k)}>
        {children}
        {(filters.sort ?? 'discoveredAt') === k && <span className="text-[9px]">{filters.dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </Th>
  );

  return (
    <>
      <PageHeader
        title="Leads"
        description="Potenciais clientes descobertos automaticamente. Cada informação tem a fonte registrada."
        actions={
          <Button variant="outline" asChild>
            <a href={`/api/leads/export.csv${qs(filters)}`}>
              <Download /> Exportar CSV
            </a>
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="w-64" placeholder="Buscar…" defaultValue={filters.q} onKeyDown={(e) => e.key === 'Enter' && set({ q: (e.target as HTMLInputElement).value || undefined })} />
        <Select className="w-36" value={filters.stage ?? ''} onChange={(e) => set({ stage: e.target.value || undefined })}>
          <option value="">Todos estágios</option>
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select className="w-32" value={filters.state ?? ''} onChange={(e) => set({ state: e.target.value || undefined })}>
          <option value="">Todos UFs</option>
          {UFS.map(([uf, name]) => (
            <option key={uf} value={uf}>
              {uf} — {name}
            </option>
          ))}
        </Select>
        <Select className="w-48" value={filters.categoryId ?? ''} onChange={(e) => set({ categoryId: e.target.value || undefined })}>
          <option value="">Todas categorias</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select className="w-36" value={filters.qualification ?? ''} onChange={(e) => set({ qualification: e.target.value || undefined })}>
          <option value="">Qualificação</option>
          <option value="qualified">Qualificados</option>
          <option value="pending_analysis">Em análise</option>
          <option value="disqualified">Não qualificados</option>
          <option value="analysis_failed">Análise falhou</option>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <Filter /> Mais filtros {activeFilters > 0 && <Badge className="ml-0.5">{activeFilters}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[22rem]" align="end">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Região">
                <Select value={filters.region ?? ''} onChange={(e) => set({ region: e.target.value || undefined })}>
                  <option value="">Todas</option>
                  {REGIONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Cidade">
                <Input defaultValue={filters.city} onBlur={(e) => set({ city: e.target.value || undefined })} placeholder="ex.: Barretos" />
              </Field>
              <Field label="Potencial">
                <Select value={filters.potential ?? ''} onChange={(e) => set({ potential: e.target.value || undefined })}>
                  <option value="">Todos</option>
                  <option value="alta">Alta</option>
                  <option value="media">Média</option>
                  <option value="baixa">Baixa</option>
                </Select>
              </Field>
              <Field label="Pontuação mínima">
                <Input type="number" min={0} max={100} defaultValue={filters.scoreMin} onBlur={(e) => set({ scoreMin: e.target.value || undefined })} />
              </Field>
              <Field label="Descoberto de">
                <Input type="date" value={filters.discoveredFrom ?? ''} onChange={(e) => set({ discoveredFrom: e.target.value || undefined })} />
              </Field>
              <Field label="até">
                <Input type="date" value={filters.discoveredTo ?? ''} onChange={(e) => set({ discoveredTo: e.target.value || undefined })} />
              </Field>
              <Field label="Evento de">
                <Input type="date" value={filters.eventFrom ?? ''} onChange={(e) => set({ eventFrom: e.target.value || undefined })} />
              </Field>
              <Field label="até">
                <Input type="date" value={filters.eventTo ?? ''} onChange={(e) => set({ eventTo: e.target.value || undefined })} />
              </Field>
              <Field label="Ano do evento">
                <Input type="number" min={2000} max={2100} defaultValue={filters.year} onBlur={(e) => set({ year: e.target.value || undefined })} />
              </Field>
              <Field label="Tipo de organizador">
                <Select value={filters.organizerType ?? ''} onChange={(e) => set({ organizerType: e.target.value || undefined })}>
                  <option value="">Todos</option>
                  {Object.entries(ORGANIZER_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <TriToggle label="Possui WhatsApp" value={filters.hasWhatsapp} onChange={(v) => set({ hasWhatsapp: v })} />
              <TriToggle label="Possui Instagram" value={filters.hasInstagram} onChange={(v) => set({ hasInstagram: v })} />
              <TriToggle label="Possui e-mail" value={filters.hasEmail} onChange={(v) => set({ hasEmail: v })} />
            </div>
          </PopoverContent>
        </Popover>
        {Object.keys(filters).length > 0 && (
          <Button variant="ghost" onClick={clear}>
            <X /> Limpar
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary-soft/50 px-3 py-2 text-xs animate-in">
          <span className="font-medium">{selected.size} selecionado(s)</span>
          <span className="mx-1 h-4 w-px bg-border" />
          <Select className="h-7 w-44" defaultValue="" onChange={(e) => e.target.value && bulk.mutate({ ids: [...selected], action: 'stage', stage: e.target.value })}>
            <option value="">Mover para…</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="outline" onClick={() => bulk.mutate({ ids: [...selected], action: 'analyze' })}>
            <Sparkles /> Reanalisar com IA
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={async () => {
              if (await confirm({ title: `Excluir ${selected.size} lead(s)?`, description: 'Evento, contatos, fontes, mensagens e histórico serão removidos definitivamente.', destructive: true, confirmLabel: 'Excluir' }))
                bulk.mutate({ ids: [...selected], action: 'delete' });
            }}
          >
            <Trash2 /> Excluir
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <Tr className="hover:bg-transparent">
              <Th className="w-9">
                <Checkbox checked={allSelected ? true : someSelected ? 'indeterminate' : false} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
              </Th>
              <SortTh k="eventName">Evento</SortTh>
              <Th>Organizador</Th>
              <Th>Categoria</Th>
              <Th>Cidade</Th>
              <SortTh k="state">UF</SortTh>
              <SortTh k="eventDate">Data</SortTh>
              <SortTh k="score">Potencial</SortTh>
              <Th>WhatsApp</Th>
              <Th>Instagram</Th>
              <Th>Status</Th>
              <SortTh k="discoveredAt">Descoberta</SortTh>
              <Th className="w-10" />
            </Tr>
          </THead>
          <TBody>
            {leads.isPending &&
              Array.from({ length: 8 }).map((_, i) => (
                <Tr key={i}>
                  <Td colSpan={13}>
                    <Skeleton className="h-6" />
                  </Td>
                </Tr>
              ))}
            {items.map((l) => (
              <Tr key={l.id} data-selected={selected.has(l.id)}>
                <Td>
                  <Checkbox
                    checked={selected.has(l.id)}
                    onCheckedChange={() => {
                      const n = new Set(selected);
                      if (n.has(l.id)) n.delete(l.id);
                      else n.add(l.id);
                      setSelected(n);
                    }}
                    aria-label="Selecionar"
                  />
                </Td>
                <Td className="max-w-64">
                  <Link href={`/leads/${l.id}`} className="block truncate font-medium hover:text-primary">
                    {l.eventName}
                  </Link>
                  {l.isSuppressed && <Badge variant="danger">suprimido</Badge>}
                  {l.hasPopularVoting === 'confirmed' && <span className="text-[11px] text-success">votação popular confirmada</span>}
                </Td>
                <Td className="max-w-36 truncate text-muted-foreground">{l.organizerName ?? <span className="text-muted-foreground/60">não localizado</span>}</Td>
                <Td className="max-w-32 truncate text-muted-foreground">{l.categoryName ?? '—'}</Td>
                <Td className="max-w-28 truncate">{l.city ?? '—'}</Td>
                <Td>{l.state ?? '—'}</Td>
                <Td className="whitespace-nowrap tabular">{fmtDate(l.eventDate)}</Td>
                <Td>
                  <Tip content={l.potential ? `Potencial ${l.potential === 'media' ? 'médio' : l.potential}` : 'Aguardando análise da IA'}>
                    <span>
                      <ScoreBadge score={l.score} />
                    </span>
                  </Tip>
                </Td>
                <Td>
                  {l.primaryWhatsapp ? (
                    <button className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-whatsapp hover:underline" onClick={() => setComposer(l.id)}>
                      <MessageCircle className="size-3.5" /> {fmtPhone(l.primaryWhatsapp)}
                    </button>
                  ) : l.primaryPhone ? (
                    <Tip content="Telefone encontrado, WhatsApp não confirmado">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                        <Phone className="size-3.5" /> {fmtPhone(l.primaryPhone)}
                      </span>
                    </Tip>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </Td>
                <Td>
                  {l.primaryInstagram ? (
                    <button className="inline-flex max-w-32 items-center gap-1 text-xs hover:text-primary" onClick={() => openChannel(l.id, 'instagram', qc)} title={`@${l.primaryInstagram}`}>
                      <Instagram className="size-3.5 shrink-0" /> <span className="truncate">@{l.primaryInstagram}</span>
                    </button>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </Td>
                <Td>
                  <StageBadge stage={l.stage} />
                </Td>
                <Td className="whitespace-nowrap text-xs text-muted-foreground">{fmtRelative(l.discoveredAt)}</Td>
                <Td>
                  <Dropdown>
                    <DropdownTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Ações">
                        <MoreHorizontal />
                      </Button>
                    </DropdownTrigger>
                    <DropdownContent>
                      <DropdownItem asChild>
                        <Link href={`/leads/${l.id}`}>
                          <Eye /> Ver detalhes
                        </Link>
                      </DropdownItem>
                      <DropdownItem onSelect={() => setComposer(l.id)} disabled={l.isSuppressed}>
                        <MessageCircle /> Gerar mensagem / WhatsApp
                      </DropdownItem>
                      {l.primaryInstagram && (
                        <DropdownItem onSelect={() => openChannel(l.id, 'instagram', qc)}>
                          <Instagram /> Abrir Instagram
                        </DropdownItem>
                      )}
                      {l.primaryEmail && (
                        <DropdownItem onSelect={() => openChannel(l.id, 'email', qc)}>
                          <Mail /> Abrir e-mail
                        </DropdownItem>
                      )}
                      {l.primaryWebsite && (
                        <DropdownItem onSelect={() => openChannel(l.id, 'website', qc)}>
                          <Globe /> Abrir site
                        </DropdownItem>
                      )}
                      <DropdownSeparator />
                      <DropdownItem onSelect={() => stage.mutate({ id: l.id, stage: 'contatado' })}>
                        <MessageCircle /> Marcar como contatado
                      </DropdownItem>
                      <DropdownItem onSelect={() => stage.mutate({ id: l.id, stage: 'interessado' })}>
                        <Handshake /> Marcar como interessado
                      </DropdownItem>
                      <DropdownItem onSelect={() => stage.mutate({ id: l.id, stage: 'cliente' })}>
                        <CheckCircle2 /> Marcar como cliente
                      </DropdownItem>
                      <DropdownItem onSelect={() => stage.mutate({ id: l.id, stage: 'sem_interesse' })}>
                        <XCircle /> Marcar sem interesse
                      </DropdownItem>
                      <DropdownSeparator />
                      <DropdownItem
                        destructive
                        onSelect={async () => {
                          const ok = await confirm({ title: 'Excluir lead?', description: 'Remove evento, contatos e histórico. Os contatos serão adicionados à lista de supressão para não serem abordados novamente.', destructive: true, confirmLabel: 'Excluir e suprimir' });
                          if (ok) remove.mutate({ id: l.id, suppress: true });
                        }}
                      >
                        <Trash2 /> Excluir lead
                      </DropdownItem>
                    </DropdownContent>
                  </Dropdown>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        {!leads.isPending && !items.length && (
          <EmptyState
            title={Object.keys(filters).length ? 'Nenhum lead com esses filtros' : 'Nenhum lead descoberto ainda'}
            description={Object.keys(filters).length ? 'Ajuste ou limpe os filtros.' : 'Configure um provedor de pesquisa e a IA em Integrações, depois execute uma pesquisa.'}
            action={
              Object.keys(filters).length ? (
                <Button variant="outline" onClick={clear}>
                  Limpar filtros
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/search">Ir para Pesquisas</Link>
                </Button>
              )
            }
          />
        )}
        {leads.data && leads.data.total > 0 && <Pagination page={page} pageSize={25} total={leads.data.total} onPage={(p) => set({ page: String(p) })} />}
      </Card>

      <WhatsAppComposer leadId={composer} open={!!composer} onOpenChange={(o) => !o && setComposer(null)} />
      {dialog}
    </>
  );
}

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsInner />
    </Suspense>
  );
}
