'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  ExternalLink,
  Globe,
  History,
  Lightbulb,
  Link2,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { Instagram } from '@/components/app/icons';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, FactBadge, PotentialBadge, ScoreBadge, StageBadge, useConfirm } from '@/components/app/common';
import { openChannel, WhatsAppComposer } from '@/components/app/composer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tip } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { EVENT_STATUS, HISTORY_LABEL, ORGANIZER_TYPES, STAGES, stageLabel, UFS } from '@/lib/constants';
import { fmtDate, fmtDateTime, fmtPhone, fmtRelative, fmtUsd } from '@/lib/format';
import type { Category, LeadDetail } from '@/lib/types';
import { cn } from '@/lib/utils';

const CONTACT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  whatsapp: MessageCircle,
  phone: Phone,
  email: Mail,
  instagram: Instagram,
  website: Globe,
  facebook: Link2,
};

function SourceLink({ src }: { src?: string }) {
  if (!src) return null;
  if (!/^https?:/.test(src)) return <span className="text-[11px] text-muted-foreground">{src}</span>;
  return (
    <a href={src} target="_blank" rel="noreferrer noopener" className="inline-flex max-w-48 items-center gap-1 truncate text-[11px] text-muted-foreground hover:text-primary">
      <ExternalLink className="size-3 shrink-0" /> {new URL(src).hostname.replace(/^www\./, '')}
    </a>
  );
}

function Row({ label, value, source, stacked }: { label: string; value: React.ReactNode; source?: string; stacked?: boolean }) {
  const empty = value === null || value === undefined || value === '';
  if (stacked) {
    return (
      <div className="border-b py-2 last:border-0">
        <dt className="text-[11px] text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 min-w-0 break-words text-[13px]">{empty ? <span className="text-muted-foreground/60">não localizado</span> : value}</dd>
        {!empty && source && <SourceLink src={source} />}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[8rem_1fr] items-start gap-3 border-b py-2 last:border-0 sm:grid-cols-[9rem_1fr_auto]">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-[13px]">{empty ? <span className="text-muted-foreground/60">não localizado</span> : value}</dd>
      <div className="hidden sm:block">{!empty && source ? <SourceLink src={source} /> : null}</div>
    </div>
  );
}

const ChecklistIcon = ({ status }: { status: string }) =>
  status === 'confirmed' ? <CheckCircle2 className="size-4 text-success" /> : status === 'not_found' ? <CircleDashed className="size-4 text-muted-foreground" /> : <CircleHelp className="size-4 text-warning" />;

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [composer, setComposer] = useState<'initial' | 'followup' | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [note, setNote] = useState('');
  const [contactForm, setContactForm] = useState({ type: 'whatsapp', value: '', sourceUrl: '' });
  const [fuForm, setFuForm] = useState({ title: 'Retomar contato', dueAt: '' });
  const [contactAt, setContactAt] = useState(false);

  const q = useQuery({ queryKey: ['lead', id], queryFn: () => api.get<LeadDetail>(`/leads/${id}`) });
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/categories'), staleTime: 300_000 });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['lead', id] });
    qc.invalidateQueries({ queryKey: ['leads'] });
    qc.invalidateQueries({ queryKey: ['pipeline'] });
  };

  const stage = useMutation({ mutationFn: (s: string) => api.post(`/leads/${id}/stage`, { stage: s }), onSuccess: () => (refresh(), toast.success('Estágio atualizado')) });
  const analyze = useMutation({ mutationFn: () => api.post<{ score: number }>(`/leads/${id}/analyze`), onSuccess: (r) => (refresh(), toast.success(`Reanalisado: pontuação ${r.score}`)) });
  const addNote = useMutation({ mutationFn: () => api.post(`/leads/${id}/notes`, { content: note }), onSuccess: () => (setNote(''), refresh()) });
  const addContact = useMutation({
    mutationFn: () => api.post(`/leads/${id}/contacts`, { type: contactForm.type, value: contactForm.value, sourceUrl: contactForm.sourceUrl || undefined }),
    onSuccess: () => (setContactForm({ ...contactForm, value: '', sourceUrl: '' }), refresh(), toast.success('Contato adicionado')),
  });
  const delContact = useMutation({ mutationFn: (cid: string) => api.del(`/leads/${id}/contacts/${cid}`), onSuccess: refresh });
  const addFu = useMutation({
    mutationFn: () => api.post('/followups', { leadId: id, title: fuForm.title, dueAt: new Date(fuForm.dueAt).toISOString() }),
    onSuccess: () => (setFuForm({ title: 'Retomar contato', dueAt: '' }), refresh(), qc.invalidateQueries({ queryKey: ['followups'] }), toast.success('Follow-up agendado')),
  });
  const fuStatus = useMutation({ mutationFn: ({ fid, status }: { fid: string; status: string }) => api.patch(`/followups/${fid}`, { status }), onSuccess: () => (refresh(), qc.invalidateQueries({ queryKey: ['followups'] })) });
  const contactMade = useMutation({ mutationFn: (at: string | null) => api.post(`/leads/${id}/contact-made`, { channel: 'whatsapp', at }), onSuccess: () => (setContactAt(false), refresh(), toast.success('Contato registrado')) });
  const remove = useMutation({ mutationFn: (suppress: boolean) => api.del(`/leads/${id}?suppress=${suppress}`), onSuccess: () => (qc.invalidateQueries({ queryKey: ['leads'] }), router.replace('/leads')) });

  if (q.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-96" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }
  if (q.isError) return <EmptyState title="Lead não encontrado" action={<Button asChild variant="outline"><Link href="/leads">Voltar</Link></Button>} />;

  const { lead, event: ev, organizer: org, contacts, sources, analyses, messages, history, followUps, otherEvents } = q.data;
  const classification = analyses.find((a) => a.type === 'classification');
  const extraction = analyses.find((a) => a.type === 'extraction');
  const dropped = (extraction?.output as { dropped?: string[] } | null)?.dropped ?? [];

  return (
    <>
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Leads
      </Link>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{ev.name}</h1>
            <StageBadge stage={lead.stage} />
            {lead.isSuppressed && (
              <Badge variant="danger">
                <ShieldAlert /> lista de supressão
              </Badge>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{[ev.city, ev.state].filter(Boolean).join(' / ') || 'local não localizado'}</span>
            <span>·</span>
            <span>{q.data.category?.name ?? 'sem categoria'}</span>
            <span>·</span>
            <span>Data: {fmtDate(ev.startDate)}</span>
            <span>·</span>
            <span>Descoberto {fmtRelative(lead.discoveredAt)}</span>
            {lead.lastContactAt && (
              <>
                <span>·</span>
                <span>Último contato {fmtRelative(lead.lastContactAt)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="whatsapp" onClick={() => setComposer('initial')} disabled={lead.isSuppressed}>
            <MessageCircle /> Abrir WhatsApp
          </Button>
          <Tip content={lead.primaryInstagram ? `@${lead.primaryInstagram}` : 'Instagram não localizado'}>
            <span>
              <Button variant="outline" size="icon" disabled={!lead.primaryInstagram} onClick={() => openChannel(id, 'instagram', qc)} aria-label="Instagram">
                <Instagram />
              </Button>
            </span>
          </Tip>
          <Tip content={lead.primaryWebsite ?? 'Site não localizado'}>
            <span>
              <Button variant="outline" size="icon" disabled={!lead.primaryWebsite} onClick={() => openChannel(id, 'website', qc)} aria-label="Site">
                <Globe />
              </Button>
            </span>
          </Tip>
          <Tip content={lead.primaryEmail ?? 'E-mail comercial não localizado'}>
            <span>
              <Button variant="outline" size="icon" disabled={!lead.primaryEmail || lead.isSuppressed} onClick={() => openChannel(id, 'email', qc)} aria-label="E-mail">
                <Mail />
              </Button>
            </span>
          </Tip>
          <Select className="w-44" value={lead.stage} onChange={(e) => stage.mutate(e.target.value)}>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button variant="outline" onClick={() => setContactAt(true)}>
            <Check /> Registrar contato
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" /> Análise da oportunidade
                </CardTitle>
                <CardDescription>
                  {classification ? `${classification.model} · ${fmtDateTime(classification.createdAt)} · custo ${fmtUsd(Number(classification.costUsd ?? 0))}` : 'Ainda não analisado pela IA'}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => analyze.mutate()} loading={analyze.isPending}>
                <RefreshCw /> Reanalisar
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Pontuação', <ScoreBadge key="s" score={lead.score} />],
                  ['Potencial', <PotentialBadge key="p" potential={lead.potential} />],
                  ['Prob. votação online', lead.votingProbability !== null ? `${lead.votingProbability}%` : '—'],
                  ['Qualidade dos dados', lead.dataQuality !== null ? `${lead.dataQuality}/100` : '—'],
                ].map(([k, v]) => (
                  <div key={String(k)} className="rounded-lg border bg-subtle p-3">
                    <div className="text-[11px] text-muted-foreground">{k}</div>
                    <div className="mt-1 font-medium tabular">{v}</div>
                  </div>
                ))}
              </div>
              {lead.justification && <p className="mt-3 text-[13px] leading-relaxed">{lead.justification}</p>}
              {classification?.checklist && (
                <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
                  {classification.checklist.map((c) => (
                    <li key={c.item} className="flex items-center gap-2 text-[13px]">
                      <ChecklistIcon status={c.status} />
                      <span className="flex-1">{c.item}</span>
                      <FactBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
              {(classification?.facts?.length || classification?.hypotheses?.length) ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-success">
                      <CheckCircle2 className="size-3.5" /> Fatos confirmados
                    </div>
                    <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">{classification?.facts?.map((f) => <li key={f}>{f}</li>)}</ul>
                  </div>
                  <div className="rounded-lg border border-dashed p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-warning">
                      <Lightbulb className="size-3.5" /> Hipóteses (não confirmadas)
                    </div>
                    <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">{classification?.hypotheses?.map((f) => <li key={f}>{f}</li>)}</ul>
                  </div>
                </div>
              ) : null}
              {dropped.length > 0 && (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Validação: {dropped.length} campo(s) sugeridos pela IA foram descartados por não aparecerem na fonte ({dropped.join(', ')}).
                </p>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="event">
            <TabsList>
              <TabsTrigger value="event">Evento</TabsTrigger>
              <TabsTrigger value="contacts">Contatos ({contacts.length})</TabsTrigger>
              <TabsTrigger value="sources">Fontes ({sources.length})</TabsTrigger>
              <TabsTrigger value="messages">Mensagens ({messages.length})</TabsTrigger>
              <TabsTrigger value="history">
                <History /> Histórico
              </TabsTrigger>
            </TabsList>

            <TabsContent value="event">
              <Card>
                <CardHeader>
                  <CardTitle>Dados do evento</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                    <Pencil /> Editar
                  </Button>
                </CardHeader>
                <CardContent>
                  <dl>
                    <Row label="Nome" value={ev.name} source={ev.fieldSources.name} />
                    <Row label="Edição" value={ev.edition} source={ev.fieldSources.edition} />
                    <Row label="Ano" value={ev.year} />
                    <Row label="Data" value={ev.startDate ? `${fmtDate(ev.startDate)}${ev.endDate ? ` a ${fmtDate(ev.endDate)}` : ''}` : null} source={ev.fieldSources.start_date} />
                    <Row label="Cidade / UF" value={[ev.city, ev.state].filter(Boolean).join(' / ') || null} source={ev.fieldSources.city ?? ev.fieldSources.state} />
                    <Row label="Situação" value={EVENT_STATUS[ev.status]} />
                    <Row label="Concurso" value={<FactBadge status={ev.hasContest} />} />
                    <Row label="Participantes" value={<FactBadge status={ev.hasParticipants} />} />
                    <Row label="Inscrições abertas" value={<FactBadge status={ev.registrationOpen} />} />
                    <Row
                      label="Votação popular"
                      value={
                        <div>
                          <FactBadge status={ev.hasPopularVoting} />
                          {ev.votingEvidence && <blockquote className="mt-1.5 border-l-2 pl-2 text-xs italic text-muted-foreground">“{ev.votingEvidence}”</blockquote>}
                          {ev.currentVotingMethod && <div className="mt-1 text-xs text-muted-foreground">Método atual: {ev.currentVotingMethod}</div>}
                        </div>
                      }
                      source={ev.fieldSources.voting_evidence}
                    />
                    <Row label="Site oficial" source={ev.fieldSources.website} value={ev.website ? <a className="text-primary hover:underline" href={ev.website} target="_blank" rel="noreferrer noopener">{ev.website}</a> : null} />
                    <Row label="Instagram oficial" source={ev.fieldSources.instagram} value={ev.instagramHandle ? `@${ev.instagramHandle}` : null} />
                    <Row label="Descrição" value={ev.description} />
                    <Row label="Última verificação" value={ev.lastVerifiedAt ? `${fmtDateTime(ev.lastVerifiedAt)}${ev.siteAvailable === false ? ' — site indisponível' : ''}` : null} />
                  </dl>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="contacts">
              <Card>
                <CardContent className="pt-4">
                  {contacts.length ? (
                    <ul className="divide-y">
                      {contacts.map((c) => {
                        const Icon = CONTACT_ICON[c.type] ?? Link2;
                        return (
                          <li key={c.id} className="flex items-start gap-3 py-2.5">
                            <span className={cn('mt-0.5 flex size-7 items-center justify-center rounded-lg bg-muted', c.type === 'whatsapp' && 'bg-success-soft text-whatsapp')}>
                              <Icon className="size-3.5" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{c.type === 'whatsapp' || c.type === 'phone' ? fmtPhone(c.normalizedValue) : c.value}</span>
                                {!c.isCommercial && <Badge variant="neutral">não comercial</Badge>}
                                {c.label && <Badge variant="outline">{c.label}</Badge>}
                                <span className="text-[11px] text-muted-foreground">confiança {c.confidence}%</span>
                              </div>
                              {c.sourceExcerpt && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">“{c.sourceExcerpt}”</p>}
                              <SourceLink src={c.sourceUrl} />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Remover contato"
                              onClick={async () => (await confirm({ title: 'Remover contato?', destructive: true, confirmLabel: 'Remover' })) && delContact.mutate(c.id)}
                            >
                              <Trash2 />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <EmptyState title="Nenhum contato público localizado" description="O sistema registra apenas contatos publicados nas fontes. Você pode adicionar manualmente." />
                  )}
                  <form
                    className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-[8rem_1fr_1fr_auto]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addContact.mutate();
                    }}
                  >
                    <Select value={contactForm.type} onChange={(e) => setContactForm({ ...contactForm, type: e.target.value })}>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="phone">Telefone</option>
                      <option value="email">E-mail</option>
                      <option value="instagram">Instagram</option>
                      <option value="website">Site</option>
                      <option value="facebook">Facebook</option>
                    </Select>
                    <Input required placeholder="Valor" value={contactForm.value} onChange={(e) => setContactForm({ ...contactForm, value: e.target.value })} />
                    <Input placeholder="URL da fonte (opcional)" value={contactForm.sourceUrl} onChange={(e) => setContactForm({ ...contactForm, sourceUrl: e.target.value })} />
                    <Button type="submit" variant="outline" loading={addContact.isPending}>
                      <Plus /> Adicionar
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sources">
              <Card>
                <CardContent className="pt-4">
                  {sources.length ? (
                    <ul className="divide-y">
                      {sources.map((s) => (
                        <li key={s.id} className="py-2.5">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{s.type.replace('_', ' ')}</Badge>
                            <a href={s.url} target="_blank" rel="noreferrer noopener" className="truncate font-medium hover:text-primary">
                              {s.title || s.url}
                            </a>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {s.domain} · {fmtDateTime(s.createdAt)}
                            {s.httpStatus ? ` · HTTP ${s.httpStatus}` : ''}
                          </div>
                          {s.excerpt && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.excerpt}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState title="Sem fontes" />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="messages">
              <Card>
                <CardHeader>
                  <CardTitle>Mensagens geradas</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setComposer('followup')}>
                      Follow-up
                    </Button>
                    <Button size="sm" variant="whatsapp" onClick={() => setComposer('initial')}>
                      <MessageCircle /> Compor
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {messages.length ? (
                    <ul className="space-y-3">
                      {messages.map((m) => (
                        <li key={m.id} className={cn('rounded-lg border p-3', m.status === 'discarded' && 'opacity-50')}>
                          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <Badge variant={m.status === 'sent' ? 'success' : m.status === 'opened' ? 'info' : m.status === 'discarded' ? 'neutral' : 'default'}>
                              {{ draft: 'rascunho', opened: 'aberta no WhatsApp', sent: 'enviada', discarded: 'descartada' }[m.status]}
                            </Badge>
                            <span>{m.kind === 'initial' ? 'primeiro contato' : 'follow-up'}</span>
                            <span>· {fmtDateTime(m.createdAt)}</span>
                            {m.model && <span>· {m.model}</span>}
                          </div>
                          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{m.editedContent ?? m.content}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState title="Nenhuma mensagem" description="Mensagens são geradas automaticamente após a qualificação, ou sob demanda." />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardContent className="pt-4">
                  <form
                    className="mb-4 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (note.trim()) addNote.mutate();
                    }}
                  >
                    <Input placeholder="Adicionar observação…" value={note} onChange={(e) => setNote(e.target.value)} />
                    <Button type="submit" variant="outline" loading={addNote.isPending}>
                      Salvar
                    </Button>
                  </form>
                  <ol className="relative space-y-4 border-l pl-4">
                    {history.map((h) => (
                      <li key={h.id} className="relative">
                        <span className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-background bg-primary/70" />
                        <div className="text-xs font-medium">
                          {HISTORY_LABEL[h.type] ?? h.type}
                          {h.toStage && <span className="font-normal text-muted-foreground"> → {stageLabel(h.toStage)}</span>}
                        </div>
                        {h.content && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{h.content}</p>}
                        <div className="mt-0.5 text-[11px] text-muted-foreground/70">{fmtDateTime(h.createdAt)}</div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Organizador</CardTitle>
                <CardDescription>{org ? ORGANIZER_TYPES[org.type] : 'Não identificado publicamente'}</CardDescription>
              </div>
              {org?.isRecurring && <Badge variant="success">recorrente</Badge>}
            </CardHeader>
            <CardContent>
              {org ? (
                <dl>
                  <Row stacked label="Nome" value={org.name} source={org.fieldSources.name} />
                  <Row stacked label="Empresa" value={org.companyName} source={org.fieldSources.companyName} />
                  <Row stacked label="Responsável" value={org.personName} source={org.fieldSources.personName} />
                  <Row stacked label="Instagram" value={org.instagramHandle ? `@${org.instagramHandle}` : null} source={org.fieldSources.instagramHandle} />
                  <Row stacked label="Eventos" value={org.eventsCount} />
                </dl>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma fonte identificou o organizador. Use “Editar” para registrar manualmente.</p>
              )}
              {otherEvents.length > 0 && (
                <div className="mt-3 border-t pt-3">
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Outros eventos</div>
                  <ul className="space-y-1">
                    {otherEvents.map((o) => (
                      <li key={o.id}>
                        {o.leadId ? (
                          <Link href={`/leads/${o.leadId}`} className="text-xs hover:text-primary">
                            {o.name} {o.year && `(${o.year})`}
                          </Link>
                        ) : (
                          <span className="text-xs">{o.name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {org && (
                <Button asChild variant="link" size="sm" className="mt-2">
                  <Link href={`/organizers?q=${encodeURIComponent(org.name)}`}>Ver organizador</Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4 text-primary" /> Follow-ups
              </CardTitle>
            </CardHeader>
            <CardContent>
              {followUps.length ? (
                <ul className="mb-3 space-y-2">
                  {followUps.map((f) => (
                    <li key={f.id} className={cn('rounded-lg border p-2.5', f.status !== 'pending' && 'opacity-60')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium">{f.title}</span>
                        {f.status === 'pending' ? (
                          <Button size="sm" variant="ghost" onClick={() => fuStatus.mutate({ fid: f.id, status: 'done' })}>
                            <Check /> Concluir
                          </Button>
                        ) : (
                          <Badge variant="neutral">{f.status === 'done' ? 'concluído' : 'cancelado'}</Badge>
                        )}
                      </div>
                      <div className={cn('text-[11px]', new Date(f.dueAt) < new Date() && f.status === 'pending' ? 'text-destructive' : 'text-muted-foreground')}>
                        {fmtDateTime(f.dueAt)} · {fmtRelative(f.dueAt)}
                      </div>
                      {f.suggestedMessage && <p className="mt-1.5 line-clamp-3 text-xs text-muted-foreground">{f.suggestedMessage}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-xs text-muted-foreground">Nenhum follow-up. Ao marcar como contatado, um lembrete é criado automaticamente.</p>
              )}
              <form
                className="grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addFu.mutate();
                }}
              >
                <Input value={fuForm.title} onChange={(e) => setFuForm({ ...fuForm, title: e.target.value })} required />
                <div className="flex gap-2">
                  <Input type="datetime-local" required value={fuForm.dueAt} onChange={(e) => setFuForm({ ...fuForm, dueAt: e.target.value })} />
                  <Button type="submit" variant="outline" loading={addFu.isPending}>
                    <Plus />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <NotesCard leadId={id} notes={lead.notes} onSaved={refresh} />

          <Card>
            <CardContent className="pt-4">
              <Button
                variant="outline"
                className="w-full text-destructive"
                onClick={async () => {
                  if (await confirm({ title: 'Excluir dados deste lead?', description: 'Remove definitivamente evento, contatos, fontes, análises, mensagens e histórico (LGPD). Os contatos entram na lista de supressão.', destructive: true, confirmLabel: 'Excluir e suprimir' }))
                    remove.mutate(true);
                }}
              >
                <Trash2 /> Excluir lead e suprimir contatos
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <WhatsAppComposer leadId={id} open={!!composer} kind={composer ?? 'initial'} onOpenChange={(o) => !o && setComposer(null)} />
      <EditLeadDialog open={editOpen} onOpenChange={setEditOpen} data={q.data} categories={cats.data ?? []} onSaved={refresh} />
      <Dialog open={contactAt} onOpenChange={setContactAt}>
        <DialogContent title="Registrar contato realizado" description="Informe quando a mensagem foi enviada. Um follow-up será agendado automaticamente.">
          <ContactAtForm onSubmit={(at) => contactMade.mutate(at)} loading={contactMade.isPending} />
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}

function ContactAtForm({ onSubmit, loading }: { onSubmit: (at: string | null) => void; loading: boolean }) {
  const [at, setAt] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(at ? new Date(at).toISOString() : null);
      }}
    >
      <Field label="Data e hora do contato" hint="Deixe em branco para agora.">
        <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} max={new Date().toISOString().slice(0, 16)} />
      </Field>
      <DialogFooter>
        <Button type="submit" loading={loading}>
          Registrar
        </Button>
      </DialogFooter>
    </form>
  );
}

function NotesCard({ leadId, notes, onSaved }: { leadId: string; notes: string | null; onSaved: () => void }) {
  const [v, setV] = useState(notes ?? '');
  useEffect(() => setV(notes ?? ''), [notes]);
  const save = useMutation({ mutationFn: () => api.patch(`/leads/${leadId}`, { notes: v || null }), onSuccess: () => (onSaved(), toast.success('Observações salvas')) });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Observações</CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea value={v} onChange={(e) => setV(e.target.value)} rows={4} placeholder="Anotações internas sobre a negociação…" />
        <Button className="mt-2" size="sm" variant="outline" disabled={v === (notes ?? '')} loading={save.isPending} onClick={() => save.mutate()}>
          Salvar
        </Button>
      </CardContent>
    </Card>
  );
}

function EditLeadDialog({ open, onOpenChange, data, categories, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; data: LeadDetail; categories: Category[]; onSaved: () => void }) {
  const [ev, setEv] = useState(() => ({ ...data.event }));
  const [org, setOrg] = useState(() => ({ name: data.organizer?.name ?? '', companyName: data.organizer?.companyName ?? '', personName: data.organizer?.personName ?? '', type: data.organizer?.type ?? 'desconhecido' }));
  useEffect(() => {
    if (open) {
      setEv({ ...data.event });
      setOrg({ name: data.organizer?.name ?? '', companyName: data.organizer?.companyName ?? '', personName: data.organizer?.personName ?? '', type: data.organizer?.type ?? 'desconhecido' });
    }
  }, [open, data]);
  const save = useMutation({
    mutationFn: () => {
      const n = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : null);
      return api.patch(`/leads/${data.lead.id}`, {
        event: {
          name: ev.name,
          edition: n(ev.edition),
          city: n(ev.city),
          state: n(ev.state),
          startDate: n(ev.startDate),
          endDate: n(ev.endDate),
          categoryId: ev.categoryId ?? null,
          website: n(ev.website),
          instagramHandle: n(ev.instagramHandle),
          status: ev.status,
          hasPopularVoting: ev.hasPopularVoting,
          description: n(ev.description),
        },
        ...(org.name.trim() ? { organizer: { name: org.name.trim(), companyName: n(org.companyName), personName: n(org.personName), type: org.type } } : {}),
      });
    },
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
      toast.success('Informações atualizadas');
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Editar informações" description="Campos editados manualmente passam a ter a fonte “edição manual”." wide>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome do evento" className="sm:col-span-2">
              <Input required value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })} />
            </Field>
            <Field label="Edição">
              <Input value={ev.edition ?? ''} onChange={(e) => setEv({ ...ev, edition: e.target.value })} />
            </Field>
            <Field label="Categoria">
              <Select value={ev.categoryId ?? ''} onChange={(e) => setEv({ ...ev, categoryId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cidade">
              <Input value={ev.city ?? ''} onChange={(e) => setEv({ ...ev, city: e.target.value })} />
            </Field>
            <Field label="UF">
              <Select value={ev.state ?? ''} onChange={(e) => setEv({ ...ev, state: e.target.value })}>
                <option value="">—</option>
                {UFS.map(([uf]) => (
                  <option key={uf}>{uf}</option>
                ))}
              </Select>
            </Field>
            <Field label="Data de início">
              <Input type="date" value={ev.startDate ?? ''} onChange={(e) => setEv({ ...ev, startDate: e.target.value })} />
            </Field>
            <Field label="Data de término">
              <Input type="date" value={ev.endDate ?? ''} onChange={(e) => setEv({ ...ev, endDate: e.target.value })} />
            </Field>
            <Field label="Situação">
              <Select value={ev.status} onChange={(e) => setEv({ ...ev, status: e.target.value })}>
                {Object.entries(EVENT_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Votação popular">
              <Select value={ev.hasPopularVoting} onChange={(e) => setEv({ ...ev, hasPopularVoting: e.target.value })}>
                <option value="confirmed">Confirmada</option>
                <option value="unconfirmed">Não confirmada</option>
                <option value="not_found">Não localizada</option>
                <option value="denied">Não possui</option>
              </Select>
            </Field>
            <Field label="Site oficial">
              <Input type="url" value={ev.website ?? ''} onChange={(e) => setEv({ ...ev, website: e.target.value })} />
            </Field>
            <Field label="Instagram oficial">
              <Input value={ev.instagramHandle ?? ''} onChange={(e) => setEv({ ...ev, instagramHandle: e.target.value })} placeholder="@perfil" />
            </Field>
            <Field label="Descrição" className="sm:col-span-2">
              <Textarea value={ev.description ?? ''} onChange={(e) => setEv({ ...ev, description: e.target.value })} rows={3} />
            </Field>
          </div>
          <div className="mt-5 border-t pt-4">
            <div className="mb-3 text-xs font-medium">Organizador</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome">
                <Input value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} />
              </Field>
              <Field label="Tipo">
                <Select value={org.type} onChange={(e) => setOrg({ ...org, type: e.target.value })}>
                  {Object.entries(ORGANIZER_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Empresa responsável">
                <Input value={org.companyName} onChange={(e) => setOrg({ ...org, companyName: e.target.value })} />
              </Field>
              <Field label="Nome do responsável (se público)">
                <Input value={org.personName} onChange={(e) => setOrg({ ...org, personName: e.target.value })} />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={save.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
