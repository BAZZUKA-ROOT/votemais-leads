'use client';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Plug } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FACT_LABEL, stageColor, stageLabel } from '@/lib/constants';
import { fmtNum } from '@/lib/format';
import { cn } from '@/lib/utils';

export function PageHeader({ title, description, actions, children }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function KpiCard({ label, value, hint, icon: Icon, tone = 'default', href }: { label: string; value: number | string | undefined; hint?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>; tone?: 'default' | 'success' | 'warning' | 'primary'; href?: string }) {
  const body = (
    <Card className={cn('group relative h-full overflow-hidden p-4 transition-shadow', href && 'hover:shadow-md')}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span
            className={cn(
              'flex size-7 items-center justify-center rounded-lg',
              tone === 'success' && 'bg-success-soft text-success',
              tone === 'warning' && 'bg-warning-soft text-warning',
              tone === 'primary' && 'bg-primary-soft text-primary-soft-foreground',
              tone === 'default' && 'bg-muted text-muted-foreground',
            )}
          >
            <Icon className="size-3.5" />
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular">{typeof value === 'number' ? fmtNum(value) : (value ?? '—')}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export function EmptyState({ title, description, action, icon: Icon = Inbox }: { title: string; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      {description && <div className="mt-1 max-w-md text-xs text-muted-foreground">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PendingIntegration({ what, href = '/integrations' }: { what: string; href?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft/60 px-3 py-2.5 text-xs">
      <Plug className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="flex-1">
        <span className="font-medium text-foreground">Integração pendente:</span> <span className="text-muted-foreground">{what}</span>
      </div>
      <Link href={href} className="font-medium text-primary hover:underline">
        Configurar
      </Link>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-danger-soft px-3 py-2 text-xs text-destructive">
      <AlertTriangle className="size-4" /> {message}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t px-3 py-2.5 text-xs text-muted-foreground">
      <span className="tabular">
        {fmtNum(from)}–{fmtNum(to)} de {fmtNum(total)}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
          <ChevronLeft />
        </Button>
        <span className="tabular px-1">
          {page} / {pages}
        </span>
        <Button variant="ghost" size="icon-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Próxima página">
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <Badge variant="neutral">pendente</Badge>;
  const tone = score >= 70 ? 'bg-success' : score >= 40 ? 'bg-warning' : 'bg-destructive/70';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative h-1.5 w-10 overflow-hidden rounded-full bg-muted">
        <span className={cn('absolute inset-y-0 left-0 rounded-full', tone)} style={{ width: `${score}%` }} />
      </span>
      <span className="text-xs font-medium tabular">{score}</span>
    </span>
  );
}

export function PotentialBadge({ potential }: { potential: string | null | undefined }) {
  if (!potential) return <Badge variant="neutral">em análise</Badge>;
  const v = potential === 'alta' ? 'success' : potential === 'media' ? 'warning' : 'danger';
  return <Badge variant={v}>{potential === 'media' ? 'média' : potential}</Badge>;
}

export function StageBadge({ stage }: { stage: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-card px-1.5 py-0.5 text-[11px] font-medium">
      <span className={cn('size-1.5 rounded-full', stageColor(stage))} />
      {stageLabel(stage)}
    </span>
  );
}

export function FactBadge({ status }: { status: string }) {
  const v = status === 'confirmed' ? 'success' : status === 'denied' ? 'danger' : status === 'not_found' ? 'neutral' : 'warning';
  return <Badge variant={v}>{FACT_LABEL[status] ?? status}</Badge>;
}

export function useConfirm() {
  const [state, setState] = React.useState<{ title: string; description?: string; confirmLabel?: string; destructive?: boolean; resolve: (v: boolean) => void } | null>(null);
  const confirm = React.useCallback(
    (opts: { title: string; description?: string; confirmLabel?: string; destructive?: boolean }) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  );
  const dialog = (
    <Dialog
      open={!!state}
      onOpenChange={(o) => {
        if (!o) {
          state?.resolve(false);
          setState(null);
        }
      }}
    >
      {state && (
        <DialogContent title={state.title} description={state.description}>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                state.resolve(false);
                setState(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant={state.destructive ? 'destructive' : 'default'}
              onClick={() => {
                state.resolve(true);
                setState(null);
              }}
            >
              {state.confirmLabel ?? 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
  return { confirm, dialog };
}
