'use client';
import { useQuery } from '@tanstack/react-query';
import { Repeat } from 'lucide-react';
import { useState } from 'react';
import { DonutChart, VBarChart } from '@/components/app/charts';
import { EmptyState, PageHeader } from '@/components/app/common';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { stageLabel } from '@/lib/constants';
import { fmtNum } from '@/lib/format';

type R = Record<string, number | string>;
interface Report {
  weekly: R[];
  bySourceType: Array<{ type: string; total: number }>;
  connectors: R[];
  byRegion: R[];
  categoryConversion: R[];
  recurringOrganizers: Array<{ id: string; name: string; state: string | null; eventsCount: number; instagramHandle: string | null }>;
  stageTransitions: R[];
}
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—');
const SOURCE_LABEL: Record<string, string> = { event_site: 'Site do evento', government: 'Prefeituras/gov', news: 'Portais de notícia', instagram_search: 'Busca Instagram', ticketing: 'Ingressos', directory: 'Diretórios', search_result: 'Resultado de busca', other: 'Outros' };

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const q = useQuery({ queryKey: ['reports', from, to], queryFn: () => api.get<Report>('/reports', { from, to }) });
  const d = q.data;
  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Desempenho da prospecção e da conversão no período."
        actions={
          <div className="flex items-center gap-2 text-xs">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-36" />
            <span className="text-muted-foreground">até</span>
            <Input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="w-36" />
          </div>
        }
      />
      {q.isPending ? (
        <Skeleton className="h-[70vh]" />
      ) : (
        d && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Evolução semanal</CardTitle>
                  <CardDescription>Descobertos, qualificados, contatados e convertidos por semana de descoberta</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {d.weekly.length ? (
                  <VBarChart
                    data={d.weekly.map((w) => ({ ...w, week: String(w.week).slice(8, 10) + '/' + String(w.week).slice(5, 7) }))}
                    labelKey="week"
                    series={[
                      { key: 'discovered', label: 'Descobertos' },
                      { key: 'qualified', label: 'Qualificados', color: 'var(--color-chart-2)' },
                      { key: 'contacted', label: 'Contatados', color: 'var(--color-chart-3)' },
                      { key: 'converted', label: 'Convertidos', color: 'var(--color-chart-4)' },
                    ]}
                    height={260}
                  />
                ) : (
                  <EmptyState title="Sem leads no período" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversão por categoria</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <THead>
                    <Tr className="hover:bg-transparent"><Th>Categoria</Th><Th className="text-right">Leads</Th><Th className="text-right">Contatados</Th><Th className="text-right">Interessados</Th><Th className="text-right">Clientes</Th><Th className="text-right">Conv.</Th></Tr>
                  </THead>
                  <TBody>
                    {d.categoryConversion.map((r) => (
                      <Tr key={String(r.category)}>
                        <Td className="max-w-48 truncate">{r.category}</Td>
                        <Td className="text-right tabular">{fmtNum(Number(r.total))}</Td>
                        <Td className="text-right tabular">{fmtNum(Number(r.contacted))}</Td>
                        <Td className="text-right tabular">{fmtNum(Number(r.interested))}</Td>
                        <Td className="text-right tabular font-medium">{fmtNum(Number(r.converted))}</Td>
                        <Td className="text-right tabular text-muted-foreground">{pct(Number(r.converted), Number(r.contacted))}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
                {!d.categoryConversion.length && <EmptyState title="Sem dados" />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Leads por região</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <THead>
                    <Tr className="hover:bg-transparent"><Th>Região</Th><Th className="text-right">Leads</Th><Th className="text-right">Qualificados</Th><Th className="text-right">Clientes</Th></Tr>
                  </THead>
                  <TBody>
                    {d.byRegion.map((r) => (
                      <Tr key={String(r.region)}>
                        <Td>{r.region}</Td>
                        <Td className="text-right tabular">{fmtNum(Number(r.total))}</Td>
                        <Td className="text-right tabular">{fmtNum(Number(r.qualified))} <span className="text-[11px] text-muted-foreground">({pct(Number(r.qualified), Number(r.total))})</span></Td>
                        <Td className="text-right tabular">{fmtNum(Number(r.converted))}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
                {!d.byRegion.length && <EmptyState title="Sem dados" />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Eficiência dos provedores de pesquisa</CardTitle>
                  <CardDescription>Resultados que viraram leads novos</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <THead>
                    <Tr className="hover:bg-transparent"><Th>Provedor</Th><Th className="text-right">Resultados</Th><Th className="text-right">Leads</Th><Th className="text-right">Duplicados</Th><Th className="text-right">Descartados</Th><Th className="text-right">Aproveit.</Th></Tr>
                  </THead>
                  <TBody>
                    {d.connectors.map((r) => (
                      <Tr key={String(r.connector)}>
                        <Td className="font-medium">{r.connector}</Td>
                        <Td className="text-right tabular">{fmtNum(Number(r.results))}</Td>
                        <Td className="text-right tabular text-success">{fmtNum(Number(r.leads))}</Td>
                        <Td className="text-right tabular">{fmtNum(Number(r.duplicates))}</Td>
                        <Td className="text-right tabular">{fmtNum(Number(r.discarded))}</Td>
                        <Td className="text-right tabular text-muted-foreground">{pct(Number(r.leads), Number(r.results))}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
                {!d.connectors.length && <EmptyState title="Sem pesquisas no período" />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Origem das informações</CardTitle>
              </CardHeader>
              <CardContent>
                {d.bySourceType.length ? <DonutChart data={d.bySourceType.map((s) => ({ name: SOURCE_LABEL[s.type] ?? s.type, value: s.total }))} /> : <EmptyState title="Sem fontes" />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Repeat className="size-4 text-primary" /> Organizadores recorrentes
                  </CardTitle>
                  <CardDescription>Realizam mais de uma edição — bons candidatos a contratos recorrentes</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {d.recurringOrganizers.length ? (
                  <ul className="divide-y">
                    {d.recurringOrganizers.map((o) => (
                      <li key={o.id} className="flex items-center gap-2 py-2">
                        <span className="flex-1 truncate font-medium">{o.name}</span>
                        {o.instagramHandle && <span className="text-xs text-muted-foreground">@{o.instagramHandle}</span>}
                        <Badge variant="neutral">{o.state ?? '—'}</Badge>
                        <Badge>{o.eventsCount} eventos</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="Nenhum organizador recorrente identificado ainda" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Movimentações no pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                {d.stageTransitions.length ? (
                  <VBarChart data={d.stageTransitions.map((s) => ({ stage: stageLabel(String(s.stage)), total: Number(s.total) }))} labelKey="stage" series={[{ key: 'total', label: 'Entradas na etapa' }]} />
                ) : (
                  <EmptyState title="Sem movimentações no período" />
                )}
              </CardContent>
            </Card>
          </div>
        )
      )}
    </>
  );
}
