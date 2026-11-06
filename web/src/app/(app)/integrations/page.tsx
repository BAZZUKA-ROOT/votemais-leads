'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, CircleAlert, Cpu, Database, ExternalLink, KeyRound, Plug, Server, Workflow, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface FieldDef {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
  type?: string;
  options?: string[];
}
interface Integration {
  provider: string;
  kind: 'search' | 'ai' | 'enrichment' | 'automation';
  label: string;
  description: string;
  docsUrl: string;
  pricingNote: string;
  fields: FieldDef[];
  enabled: boolean;
  status: 'not_configured' | 'configured' | 'connected' | 'error';
  config: Record<string, unknown>;
  secrets: Record<string, string>;
  lastCheckedAt: string | null;
  lastError: string | null;
  missing: string[];
}
type Health = Record<'database' | 'redis' | 'worker' | 'ai', { ok: boolean; detail?: string }>;

const STATUS: Record<Integration['status'], { label: string; v: 'neutral' | 'info' | 'success' | 'danger'; icon: React.ComponentType<{ className?: string }> }> = {
  not_configured: { label: 'Pendente', v: 'neutral', icon: Circle },
  configured: { label: 'Configurada (não testada)', v: 'info', icon: CircleAlert },
  connected: { label: 'Conectada', v: 'success', icon: CheckCircle2 },
  error: { label: 'Erro', v: 'danger', icon: XCircle },
};
const KIND: Record<string, string> = { search: 'Provedores de pesquisa', ai: 'Análise e mensagens (prioridade: Anthropic → Ollama → regras)', enrichment: 'Enriquecimento de dados', automation: 'Automação' };

function IntegrationCard({ it }: { it: Integration }) {
  const qc = useQueryClient();
  const [config, setConfig] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(it.enabled);
  useEffect(() => {
    setEnabled(it.enabled);
    setConfig(Object.fromEntries(Object.entries(it.config).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])));
    setSecrets({});
  }, [it]);

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['integrations'] });
    qc.invalidateQueries({ queryKey: ['health'] });
  };
  const save = useMutation({
    mutationFn: () => {
      const cfg: Record<string, string | number | null> = {};
      for (const f of it.fields.filter((x) => !x.secret)) cfg[f.key] = config[f.key] ?? null;
      if ('pricePer1000' in it.config || it.kind === 'search') cfg.pricePer1000 = config.pricePer1000 === '' || config.pricePer1000 === undefined ? null : Number(config.pricePer1000);
      const creds = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== ''));
      return api.put<{ ok: boolean; error?: string }>(`/integrations/${it.provider}`, { enabled, config: cfg, credentials: creds });
    },
    onSuccess: (r) => {
      inv();
      if (r.ok) toast.success(`${it.label}: salvo${enabled ? ' e conexão verificada' : ''}`);
      else toast.error(`${it.label}: salvo, mas o teste falhou — ${r.error}`);
    },
  });
  const test = useMutation({
    mutationFn: () => api.post<{ ok: boolean; error?: string }>(`/integrations/${it.provider}/test`),
    onSuccess: (r) => {
      inv();
      if (r.ok) toast.success(`${it.label}: conexão OK`);
      else toast.error(`${it.label}: ${r.error}`);
    },
  });
  const clearSecret = useMutation({
    mutationFn: (key: string) => api.put(`/integrations/${it.provider}`, { credentials: { [key]: '' } }),
    onSuccess: () => (inv(), toast.success('Credencial removida')),
  });

  const S = STATUS[it.status];
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{it.label}</CardTitle>
          <CardDescription className="mt-1">{it.description}</CardDescription>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Ativar" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={S.v}>
            <S.icon /> {S.label}
          </Badge>
          {it.lastCheckedAt && <span className="text-[11px] text-muted-foreground">verificado {fmtDateTime(it.lastCheckedAt)}</span>}
        </div>
        {it.missing.length > 0 && <p className="text-[11px] text-muted-foreground">Falta informar: {it.missing.join(', ')}</p>}
        {it.lastError && it.status === 'error' && <p className="break-words rounded-md bg-danger-soft px-2 py-1.5 text-[11px] text-destructive">{it.lastError}</p>}
        <div className="grid gap-3">
          {it.fields.map((f) =>
            f.secret ? (
              <Field key={f.key} label={`${f.label}${f.required ? '' : ' (opcional)'}`}>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="password"
                      autoComplete="off"
                      className="pl-8"
                      placeholder={it.secrets[f.key] ? `${it.secrets[f.key]} (salva — digite para substituir)` : (f.placeholder ?? 'não configurada')}
                      value={secrets[f.key] ?? ''}
                      onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })}
                    />
                  </div>
                  {it.secrets[f.key] && (
                    <Button variant="ghost" size="sm" onClick={() => clearSecret.mutate(f.key)}>
                      Remover
                    </Button>
                  )}
                </div>
              </Field>
            ) : f.type === 'select' ? (
              <Field key={f.key} label={f.label}>
                <Select value={config[f.key] ?? ''} onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}>
                  {f.options?.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field key={f.key} label={`${f.label}${f.required ? '' : ' (opcional)'}`}>
                <Input type={f.type === 'url' ? 'url' : 'text'} placeholder={f.placeholder} value={config[f.key] ?? ''} onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })} />
              </Field>
            ),
          )}
          {it.kind === 'search' && (
            <Field label="Preço por 1.000 consultas (US$)" hint={it.pricingNote}>
              <Input type="number" step="0.01" min={0} value={config.pricePer1000 ?? ''} onChange={(e) => setConfig({ ...config, pricePer1000: e.target.value })} className="w-32" />
            </Field>
          )}
          {it.kind !== 'search' && <p className="text-[11px] text-muted-foreground">{it.pricingNote}</p>}
        </div>
        <div className="mt-auto flex items-center gap-2 pt-2">
          <a href={it.docsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary">
            <ExternalLink className="size-3" /> Documentação
          </a>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => test.mutate()} loading={test.isPending} disabled={it.missing.length > 0}>
              Testar
            </Button>
            <Button size="sm" onClick={() => save.mutate()} loading={save.isPending}>
              Salvar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function IntegrationsPage() {
  const q = useQuery({ queryKey: ['integrations'], queryFn: () => api.get<{ integrations: Integration[]; system: Health }>('/integrations') });
  const sys = q.data?.system;
  const services: Array<[string, React.ComponentType<{ className?: string }>, { ok: boolean; detail?: string } | undefined, string | null]> = [
    ['PostgreSQL', Database, sys?.database, 'DATABASE_URL'],
    ['Redis', Server, sys?.redis, 'REDIS_URL'],
    ['Workers (BullMQ)', Workflow, sys?.worker, 'processo worker'],
    ['IA', Cpu, sys?.ai, null],
  ];
  return (
    <>
      <PageHeader title="Integrações" description="Chaves ficam cifradas (AES-256-GCM) no backend e nunca são enviadas ao navegador. Integrações sem configuração aparecem como pendentes — nada é simulado." />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="size-4 text-primary" /> Serviços do sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {services.map(([name, Icon, s, src]) => (
              <div key={name} className="flex items-start gap-3 rounded-lg border p-3">
                <Icon className="mt-0.5 size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    {name}
                    {s ? <span className={`size-2 rounded-full ${s.ok ? 'bg-success' : 'bg-destructive'}`} /> : null}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">{s ? (s.ok ? (src ? `conectado · ${src}` : s.detail) : (s.detail ?? 'indisponível')) : '…'}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {q.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : (
        (['search', 'ai', 'enrichment', 'automation'] as const).map((k) => (
          <section key={k} className="mb-6">
            <h2 className="mb-3 text-sm font-semibold">{KIND[k]}</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {q.data?.integrations.filter((i) => i.kind === k).map((it) => <IntegrationCard key={it.provider} it={it} />)}
            </div>
          </section>
        ))
      )}
    </>
  );
}
