'use client';
import { useQuery } from '@tanstack/react-query';
import { Coins, Cpu, DollarSign, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { VBarChart } from '@/components/app/charts';
import { EmptyState, KpiCard, PageHeader } from '@/components/app/common';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { fmtNum, fmtUsd } from '@/lib/format';

type R = Record<string, number | string>;
interface Usage {
  byDay: R[];
  byProvider: R[];
  byOperation: R[];
  totals: { costUsd: number; monthUsd: number; leads: number; qualified: number; costPerQualifiedLead: number | null };
}

export default function UsagePage() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ['usage', days], queryFn: () => api.get<Usage>('/usage', { days }) });
  const providers = useMemo(() => [...new Set((q.data?.byDay ?? []).map((r) => String(r.provider)))], [q.data]);
  const chart = useMemo(() => {
    const m = new Map<string, R>();
    for (const r of q.data?.byDay ?? []) {
      const d = String(r.day);
      const row = m.get(d) ?? { day: `${d.slice(8, 10)}/${d.slice(5, 7)}` };
      row[String(r.provider)] = Number(r.costUsd);
      m.set(d, row);
    }
    return [...m.values()];
  }, [q.data]);
  const t = q.data?.totals;
  return (
    <>
      <PageHeader
        title="Consumo e custos de APIs"
        description="Registro de cada chamada a provedores de pesquisa, IA e enriquecimento. Custos são estimativas com base na tabela de preços configurada."
        actions={
          <Select className="w-40" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={365}>Últimos 12 meses</option>
          </Select>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={`Custo no período`} value={t ? fmtUsd(t.costUsd) : undefined} icon={DollarSign} tone="warning" />
        <KpiCard label="Custo no mês atual" value={t ? fmtUsd(t.monthUsd) : undefined} icon={Coins} />
        <KpiCard label="Leads qualificados no período" value={t?.qualified} icon={Target} tone="success" hint={t ? `${fmtNum(t.leads)} descobertos` : undefined} />
        <KpiCard label="Custo por lead qualificado" value={t ? (t.costPerQualifiedLead !== null ? fmtUsd(t.costPerQualifiedLead) : '—') : undefined} icon={Cpu} tone="primary" />
      </div>
      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Custo diário por provedor (US$)</CardTitle>
            <CardDescription>Empilhado</CardDescription>
          </div>
        </CardHeader>
        <CardContent>{q.isPending ? <Skeleton className="h-60" /> : chart.length ? <VBarChart data={chart} labelKey="day" stacked series={providers.map((p) => ({ key: p, label: p }))} /> : <EmptyState title="Nenhum consumo registrado" />}</CardContent>
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por provedor</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <THead>
                <Tr className="hover:bg-transparent"><Th>Provedor</Th><Th className="text-right">Chamadas</Th><Th className="text-right">Erros</Th><Th className="text-right">Tokens</Th><Th className="text-right">Latência</Th><Th className="text-right">Custo</Th></Tr>
              </THead>
              <TBody>
                {q.data?.byProvider.map((r) => (
                  <Tr key={String(r.provider)}>
                    <Td className="font-medium">{r.provider}</Td>
                    <Td className="text-right tabular">{fmtNum(Number(r.calls))}</Td>
                    <Td className="text-right tabular">{Number(r.errors) ? <span className="text-destructive">{fmtNum(Number(r.errors))}</span> : 0}</Td>
                    <Td className="text-right tabular">{fmtNum(Number(r.inputTokens) + Number(r.outputTokens))}</Td>
                    <Td className="text-right tabular">{fmtNum(Number(r.avgMs))} ms</Td>
                    <Td className="text-right tabular font-medium">{fmtUsd(Number(r.costUsd))}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            {q.data && !q.data.byProvider.length && <EmptyState title="Sem dados" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Por operação e modelo</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <THead>
                <Tr className="hover:bg-transparent"><Th>Provedor</Th><Th>Operação</Th><Th>Modelo</Th><Th className="text-right">Chamadas</Th><Th className="text-right">Custo</Th></Tr>
              </THead>
              <TBody>
                {q.data?.byOperation.map((r, i) => (
                  <Tr key={i}>
                    <Td>{r.provider}</Td>
                    <Td>{r.operation}</Td>
                    <Td className="font-mono text-[11px]">{r.model || '—'}</Td>
                    <Td className="text-right tabular">{fmtNum(Number(r.calls))}</Td>
                    <Td className="text-right tabular">{fmtUsd(Number(r.costUsd))}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            {q.data && !q.data.byOperation.length && <EmptyState title="Sem dados" />}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
