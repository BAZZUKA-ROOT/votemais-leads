'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MessageCircle, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { fmtPhone, fmtRelative } from '@/lib/format';
import type { GeneratedMessage, LeadDetail } from '@/lib/types';
import { PendingIntegration } from './common';

/** Abre uma aba em branco de forma síncrona (evita bloqueio de pop-up) e navega após a API responder. */
export async function openExternal(fetchUrl: () => Promise<{ url: string; warning?: string | null }>) {
  const w = window.open('about:blank', '_blank');
  try {
    const { url, warning } = await fetchUrl();
    if (warning) toast.warning(warning);
    if (w) {
      w.opener = null;
      w.location.href = url;
    } else window.location.href = url;
  } catch (err) {
    w?.close();
    toast.error((err as Error).message);
  }
}

export function openChannel(leadId: string, channel: 'instagram' | 'email' | 'website', qc?: ReturnType<typeof useQueryClient>) {
  return openExternal(async () => {
    const r = await api.post<{ url: string; warning?: string }>(`/leads/${leadId}/open`, { channel });
    qc?.invalidateQueries({ queryKey: ['lead', leadId] });
    return r;
  });
}

export function WhatsAppComposer({ leadId, open, onOpenChange, kind = 'initial' }: { leadId: string | null; open: boolean; onOpenChange: (o: boolean) => void; kind?: 'initial' | 'followup' }) {
  const qc = useQueryClient();
  const lead = useQuery({ queryKey: ['lead', leadId], queryFn: () => api.get<LeadDetail>(`/leads/${leadId}`), enabled: open && !!leadId });
  const [text, setText] = useState('');
  const [msgId, setMsgId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');

  const messages = (lead.data?.messages ?? []).filter((m) => m.status !== 'discarded' && m.kind === kind);
  const latest: GeneratedMessage | undefined = messages[0];

  useEffect(() => {
    if (!open) return;
    if (latest) {
      setMsgId(latest.id);
      setText(latest.editedContent ?? latest.content);
    } else {
      setMsgId(null);
      setText('');
    }
    const p = lead.data?.lead.primaryWhatsapp ?? lead.data?.lead.primaryPhone;
    setPhone(p ? fmtPhone(p) : '');
  }, [open, latest?.id, lead.data?.lead.primaryWhatsapp, lead.data?.lead.primaryPhone]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = useMutation({
    mutationFn: () => (msgId ? api.post<GeneratedMessage>(`/messages/${msgId}/regenerate`) : api.post<GeneratedMessage>(`/leads/${leadId}/messages`, { kind })),
    onSuccess: (m) => {
      setMsgId(m.id);
      setText(m.content);
      qc.invalidateQueries({ queryKey: ['lead', leadId] });
      qc.invalidateQueries({ queryKey: ['messages'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const aiPending = generate.error instanceof ApiError && generate.error.status === 503;
  const noPhone = !lead.data?.lead.primaryWhatsapp && !lead.data?.lead.primaryPhone;

  const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  const primary = lead.data?.lead.primaryWhatsapp ?? lead.data?.lead.primaryPhone ?? null;
  const phoneChanged = !!phone && digits(phone) !== digits(primary);

  const send = () =>
    openExternal(async () => {
      const r = await api.post<{ url: string; warning?: string }>(`/leads/${leadId}/open`, {
        channel: 'whatsapp',
        messageId: msgId,
        text: text.trim() || null,
        phone: phoneChanged ? phone : null,
      });
      qc.invalidateQueries({ queryKey: ['lead', leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['pipeline'] });
      toast.success('WhatsApp aberto. Revise e envie manualmente; depois marque como contatado.');
      onOpenChange(false);
      return r;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={kind === 'initial' ? 'Mensagem para WhatsApp' : 'Follow-up por WhatsApp'} description={lead.data ? lead.data.event.name : 'Carregando…'} wide>
        <div className="space-y-3">
          {!lead.data?.lead.primaryWhatsapp && lead.data?.lead.primaryPhone && (
            <div className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs">
              <AlertTriangle className="size-4 text-warning" /> Celular encontrado, mas não confirmado como WhatsApp na fonte.
            </div>
          )}
          {noPhone && lead.data && (
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="size-4" /> Nenhum WhatsApp/celular comercial localizado. Informe um número publicado pelo organizador, se tiver.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(DDD) número do WhatsApp" inputMode="tel" />
            <div className="flex items-center gap-2">
              {latest && (
                <Badge variant="neutral">
                  {latest.approach ? latest.approach.split(',')[0] : 'IA'} · {fmtRelative(latest.createdAt)}
                </Badge>
              )}
            </div>
          </div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder={lead.isPending ? 'Carregando…' : 'Gere uma mensagem com IA ou escreva a sua.'} />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{text.length} caracteres</span>
            <span>A mensagem é aberta no WhatsApp para você revisar e enviar. Nada é enviado automaticamente.</span>
          </div>
          {aiPending && <PendingIntegration what="nenhum modo de geração ativo — ative o modo regras (gratuito), o Ollama ou a Anthropic, ou escreva manualmente." />}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => generate.mutate()} loading={generate.isPending}>
              {msgId ? <RefreshCw /> : <Sparkles />} {msgId ? 'Regenerar' : 'Gerar com IA'}
            </Button>
            <Button variant="whatsapp" onClick={send} disabled={!text.trim() || (!phone && noPhone)}>
              <MessageCircle /> Abrir WhatsApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
