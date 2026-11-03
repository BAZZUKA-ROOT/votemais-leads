'use client';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, GripVertical, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, ScoreBadge } from '@/components/app/common';
import { WhatsAppComposer } from '@/components/app/composer';
import { Instagram } from '@/components/app/icons';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { STAGES, UFS } from '@/lib/constants';
import { fmtDate, fmtRelative } from '@/lib/format';
import type { LeadRow } from '@/lib/types';
import { cn } from '@/lib/utils';

type Column = { stage: string; total: number; items: LeadRow[] };

function CardBody({ lead, onWhatsApp, handle, className }: { lead: LeadRow; onWhatsApp?: () => void; handle?: React.ReactNode; className?: string }) {
  const overdue = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date();
  return (
    <div className={cn('group rounded-lg border bg-card p-2.5 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]', className)}>
      <div className="flex items-start gap-1.5">
        {handle ?? <GripVertical className="-ml-1 mt-0.5 size-3.5 text-muted-foreground/50" />}
        <div className="min-w-0 flex-1">
          <Link href={`/leads/${lead.id}`} className="line-clamp-2 text-[13px] font-medium leading-snug hover:text-primary">
            {lead.eventName}
          </Link>
          <div className="mt-1 truncate text-[11px] text-muted-foreground">
            {[lead.city, lead.state].filter(Boolean).join(' / ') || '—'}
            {lead.eventDate && ` · ${fmtDate(lead.eventDate)}`}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <ScoreBadge score={lead.score} />
        <div className="ml-auto flex items-center gap-1">
          {lead.primaryInstagram && <Instagram className="size-3.5 text-muted-foreground" />}
          {(lead.primaryWhatsapp || lead.primaryPhone) && (
            <button onClick={onWhatsApp} className="rounded p-0.5 text-whatsapp hover:bg-success-soft" aria-label="WhatsApp">
              <MessageCircle className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {lead.nextFollowUpAt && (
        <div className={cn('mt-1.5 flex items-center gap-1 text-[11px]', overdue ? 'text-destructive' : 'text-muted-foreground')}>
          <CalendarClock className="size-3" /> follow-up {fmtRelative(lead.nextFollowUpAt)}
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead, onWhatsApp }: { lead: LeadRow; onWhatsApp?: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, data: { stage: lead.stage } });
  const drop = useDroppable({ id: `card:${lead.id}`, data: { stage: lead.stage, beforeId: lead.id } });
  return (
    <div ref={drop.setNodeRef} className={cn('rounded-lg transition-shadow', drop.isOver && !isDragging && 'shadow-[0_-2px_0_0_var(--color-primary)]')}>
      <div ref={setNodeRef}>
        <CardBody
          lead={lead}
          onWhatsApp={onWhatsApp}
          className={cn(isDragging && 'opacity-40')}
          handle={
            <button className="-ml-1 mt-0.5 cursor-grab rounded p-0.5 text-muted-foreground/50 hover:bg-accent hover:text-foreground active:cursor-grabbing" {...listeners} {...attributes} aria-label="Arrastar">
              <GripVertical className="size-3.5" />
            </button>
          }
        />
      </div>
    </div>
  );
}

function StageColumn({ col, onWhatsApp }: { col: Column; onWhatsApp: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.stage}`, data: { stage: col.stage } });
  const s = STAGES.find((x) => x.id === col.stage)!;
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn('size-2 rounded-full', s.color)} />
        <span className="text-xs font-semibold">{s.label}</span>
        <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground tabular">{col.total}</span>
      </div>
      <div ref={setNodeRef} className={cn('flex min-h-40 flex-1 flex-col gap-2 rounded-xl border border-dashed border-transparent bg-muted/50 p-2 transition-colors', isOver && 'border-primary/40 bg-primary-soft/40')}>
        {col.items.map((l) => (
          <LeadCard key={l.id} lead={l} onWhatsApp={() => onWhatsApp(l.id)} />
        ))}
        {col.total > col.items.length && <div className="py-1 text-center text-[11px] text-muted-foreground">+{col.total - col.items.length} não exibidos</div>}
        {!col.items.length && <div className="flex flex-1 items-center justify-center text-[11px] text-muted-foreground/70">Arraste leads para cá</div>}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<{ state?: string; q?: string }>({});
  const [dragging, setDragging] = useState<LeadRow | null>(null);
  const [composer, setComposer] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const key = ['pipeline', filters];
  const board = useQuery({ queryKey: key, queryFn: () => api.get<Column[]>('/pipeline', filters) });

  const move = useMutation({
    mutationFn: ({ id, stage, position }: { id: string; stage: string; position?: number }) => api.post(`/leads/${id}/stage`, { stage, position }),
    onMutate: async ({ id, stage, position }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Column[]>(key);
      if (prev) {
        const lead = prev.flatMap((c) => c.items).find((l) => l.id === id);
        if (lead) {
          const next = prev.map((c) => ({ ...c, items: c.items.filter((l) => l.id !== id), total: c.items.some((l) => l.id === id) ? c.total - 1 : c.total }));
          const target = next.find((c) => c.stage === stage)!;
          const items = [...target.items];
          items.splice(position ?? items.length, 0, { ...lead, stage });
          target.items = items;
          target.total += 1;
          qc.setQueryData(key, next);
        }
      }
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error((err as Error).message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const onDragStart = (e: DragStartEvent) => setDragging(board.data?.flatMap((c) => c.items).find((l) => l.id === e.active.id) ?? null);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (!e.over || !board.data) return;
    const stage = e.over.data.current?.stage as string;
    const beforeId = e.over.data.current?.beforeId as string | undefined;
    const id = String(e.active.id);
    if (beforeId === id) return;
    const col = board.data.find((c) => c.stage === stage)!;
    const position = beforeId ? col.items.filter((l) => l.id !== id).findIndex((l) => l.id === beforeId) : undefined;
    const current = board.data.flatMap((c) => c.items).find((l) => l.id === id);
    if (current?.stage === stage && position === undefined) return;
    move.mutate({ id, stage, position: position !== undefined && position >= 0 ? position : undefined });
  };

  return (
    <>
      <PageHeader
        title="Pipeline comercial"
        description="Arraste os cartões entre as etapas. Cada mudança é registrada no histórico do lead."
        actions={
          <>
            <Input className="w-56" placeholder="Filtrar…" onKeyDown={(e) => e.key === 'Enter' && setFilters({ ...filters, q: (e.target as HTMLInputElement).value || undefined })} />
            <Select className="w-28" value={filters.state ?? ''} onChange={(e) => setFilters({ ...filters, state: e.target.value || undefined })}>
              <option value="">UF</option>
              {UFS.map(([uf]) => (
                <option key={uf}>{uf}</option>
              ))}
            </Select>
          </>
        }
      />
      {board.isPending ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 scrollbar-thin sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            {board.data?.map((col) => (
              <StageColumn key={col.stage} col={col} onWhatsApp={setComposer} />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>{dragging && <CardBody lead={dragging} className="rotate-1 shadow-xl" />}</DragOverlay>
        </DndContext>
      )}
      <WhatsAppComposer leadId={composer} open={!!composer} onOpenChange={(o) => !o && setComposer(null)} />
    </>
  );
}
