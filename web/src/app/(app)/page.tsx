'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CalendarPlus, CheckCircle2, Handshake, MessageCircle, Play, Sparkles, Target, Ticket, TrendingUp, UserCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { Instagram } from '@/components/app/icons';
import { toast } from 'sonner';
import { DonutChart, HBarChart, TimeAreaChart, VBarChart } from '@/components/app/charts';
import { EmptyState, KpiCard, PageHeader, PotentialBadge, ScoreBadge } from '@/components/app/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { STAGES } from '@/lib/constants';
import { fmtRelative } from '@/lib/format';

interface Dashboard {
  kpis: Record<string, number>;
  perDay: Array<{ day: string; total: number; qualified: number }>;
  byState: Array<{ state: string; total: number }>;
  byCategory: Array<{ category: string; total: number }>;
  byPotential: Array<{ potential: string; total: number }>;
  contactsEvolution: Array<{ day: string; opened: number; contacted: number }>;
  funnel: Array<{ stage: string; total: number }>;
  recent: Array<{ id: string; eventName: string; city: string | null; state: string | null; score: number | null; potential: string | null; discoveredAt: string; primaryWhatsapp: string | null }>;
}

const POT_COLORS: Record<string, string> = { alta: 'var(--color-success)', media: 'var(--color-warning)', baixa: 'var(--color-destructive)', pendente: 'var(--color-muted-foreground)' };

export default function DashboardPage() {
  const { data, isPending } = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard'), refetchInterval: 60_000 });
  const k = data?.kpis ?? {};

  const runNow = async () => {
    try {
      await api.post('/automation/run-now');
      toast.success('Rodada de pesquisa enfileirada. Acompanhe em Pesquisas.');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const funnel = STAGES.map((s) => ({ stage: s.short, total: data?.funnel.find((f) => f.stage === s.id)?.total ?? 0 }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão geral da prospecção — todos os números vêm do banco de dados."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/leads?qualification=qualified&stage=qualificado">
                <Sparkles /> Novos qualificados
              </Link>
            </Button>
            <Button onClick={runNow}>
              <Play /> Pesquisar agora
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total de leads" value={k.totalLeads} icon={Users} tone="primary" href="/leads" />
        <KpiCard label="Novos hoje" value={k.newToday} icon={CalendarPlus} hint={`${k.thisWeek ?? 0} nesta semana`} href="/leads" />
        <KpiCard label="Qualificados" value={k.qualified} icon={Target} tone="success" href="/leads?qualification=qualified" />
        <KpiCard label="Contatados" value={k.contacted} icon={MessageCircle} href="/pipeline" />
        <KpiCard label="Interessados" value={k.interested} icon={Handshake} tone="warning" href="/leads?stage=interessado,negociacao" />
        <KpiCard label="Clientes" value={k.converted} icon={CheckCircle2} tone="success" hint={`Conversão ${k.conversionRate ?? 0}%`} href="/leads?stage=cliente" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Eventos identificados" value={k.events} icon={Ticket} href="/events" />
        <KpiCard label="Organizadores" value={k.organizers} icon={UserCheck} href="/organizers" />
        <KpiCard label="Com WhatsApp" value={k.withWhatsapp} icon={MessageCircle} href="/leads?hasWhatsapp=true" />
        <KpiCard label="Com Instagram" value={k.withInstagram} icon={Instagram} href="/leads?hasInstagram=true" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Leads encontrados por dia</CardTitle>
              <CardDescription>Últimos 30 dias</CardDescription>
            </div>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isPending ? <Skeleton className="h-[220px]" /> : <TimeAreaChart data={data!.perDay} series={[{ key: 'total', label: 'Descobertos' }, { key: 'qualified', label: 'Qualificados', color: 'var(--color-chart-4)' }]} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Leads por classificação</CardTitle>
              <CardDescription>Potencial comercial atribuído pela IA</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <Skeleton className="h-[200px]" />
            ) : data!.byPotential.length ? (
              <DonutChart data={data!.byPotential.map((p) => ({ name: p.potential === 'media' ? 'média' : p.potential, value: p.total, color: POT_COLORS[p.potential] }))} />
            ) : (
              <EmptyState title="Sem leads ainda" description="Configure as integrações e execute a primeira pesquisa." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Leads por estado</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? <Skeleton className="h-[240px]" /> : data!.byState.length ? <HBarChart data={data!.byState.slice(0, 10)} labelKey="state" valueKey="total" /> : <EmptyState title="Sem dados" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Leads por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {isPending ? <Skeleton className="h-[240px]" /> : data!.byCategory.length ? <HBarChart data={data!.byCategory.slice(0, 8)} labelKey="category" valueKey="total" color="var(--color-chart-2)" /> : <EmptyState title="Sem dados" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Evolução dos contatos</CardTitle>
              <CardDescription>WhatsApp aberto × contato registrado</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isPending ? <Skeleton className="h-[240px]" /> : <TimeAreaChart height={240} data={data!.contactsEvolution} series={[{ key: 'opened', label: 'WhatsApp aberto', color: 'var(--color-whatsapp)' }, { key: 'contacted', label: 'Contatados', color: 'var(--color-chart-1)' }]} />}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Conversão comercial</CardTitle>
              <CardDescription>Leads em cada etapa do pipeline</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/pipeline">
                Pipeline <ArrowUpRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>{isPending ? <Skeleton className="h-[240px]" /> : <VBarChart data={funnel} labelKey="stage" series={[{ key: 'total', label: 'Leads' }]} />}</CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Prontos para abordagem</CardTitle>
              <CardDescription>Qualificados mais recentes</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {isPending ? (
              <div className="space-y-2 px-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : data!.recent.length ? (
              <ul className="divide-y">
                {data!.recent.map((r) => (
                  <li key={r.id}>
                    <Link href={`/leads/${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-subtle">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{r.eventName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {[r.city, r.state].filter(Boolean).join(' / ') || 'local não identificado'} · {fmtRelative(r.discoveredAt)}
                        </div>
                      </div>
                      {r.primaryWhatsapp && <MessageCircle className="size-3.5 text-whatsapp" />}
                      <PotentialBadge potential={r.potential} />
                      <ScoreBadge score={r.score} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nenhum lead qualificado aguardando" description="Os leads qualificados pela IA aparecem aqui." />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
