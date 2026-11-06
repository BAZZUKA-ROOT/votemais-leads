'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MessageCircle, PhoneOff, RefreshCw, Sparkles } from 'lucide-react';
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
import { Instagram } from './icons';

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

  const instagram = lead.data?.lead.primaryInstagram ?? null;
  const afterOpen = (msg: string) => {
    qc.invalidateQueries({ queryKey: ['lead', leadId] });
    qc.invalidateQueries({ queryKey: ['leads'] });
    qc.invalidateQueries({ queryKey: ['pipeline'] });
    toast.success(msg);
    onOpenChange(false);
  };

  const send = () =>
    openExternal(async () => {
      const r = await api.post<{ url: string; warning?: string }>(`/leads/${leadId}/open`, {
        channel: 'whatsapp',
        messageId: msgId,
        text: text.trim() || null,
        phone: phoneChanged ? phone : null,
      });
      afterOpen('WhatsApp aberto. Revise e envie manualmente; depois registre o contato.');
      return r;
    });

  const sendInstagram = () =>
    openExternal(async () => {
      let copied = false;
      try {
        await navigator.clipboard.writeText(text.trim());
        copied = true;
      } catch {
        /* sem permissão de área de transferência: o usuário copia manualmente */
      }
      const r = await api.post<{ url: string; warning?: string }>(`/leads/${leadId}/open`, { channel: 'instagram', messageId: msgId, text: text.trim() || null });
      afterOpen(copied ? 'Mensagem copiada. No Instagram, cole no Direct e envie; depois registre o contato.' : 'Instagram aberto. Copie a mensagem do painel e cole no Direct.');
      return r;
    });

  const noWhatsapp = useMutation({
    mutationFn: () => api.post<{ primaryWhatsapp: string | null; primaryPhone: string | null }>(`/leads/${leadId}/no-whatsapp`, { phone: phone || null }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['lead', leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      setPhone(r.primaryWhatsapp || r.primaryPhone ? fmtPhone((r.primaryWhatsapp ?? r.primaryPhone)!) : '');
      toast.success(instagram ? 'Número marcado como sem WhatsApp. Tente pelo Instagram.' : 'Número marcado como sem WhatsApp.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={kind === 'initial' ? 'Mensagem de abordagem' : 'Mensagem de follow-up'} description={lead.data ? lead.data.event.name : 'Carregando…'} wide>
        <div className="space-y-3">
          {!lead.data?.lead.primaryWhatsapp && lead.data?.lead.primaryPhone && (
            <div className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs">
              <AlertTriangle className="size-4 text-warning" /> Celular encontrado, mas não confirmado como WhatsApp na fonte.
            </div>
          )}
          {noPhone && lead.data && (
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              <AlertTriangle className="size-4" /> Nenhum WhatsApp/celular comercial localizado.{' '}
              {lead.data.lead.primaryInstagram ? `Use o Instagram Direct (@${lead.data.lead.primaryInstagram}) ou informe um número publicado pelo organizador.` : 'Informe um número publicado pelo organizador, se tiver.'}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="flex gap-2">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(DDD) número do WhatsApp" inputMode="tel" />
              {phone && !phoneChanged && (
                <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => noWhatsapp.mutate()} loading={noWhatsapp.isPending} title="O WhatsApp informou que este número não tem conta">
                  <PhoneOff /> Sem WhatsApp
                </Button>
              )}
            </div>
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
            <span>Você revisa e envia pelo WhatsApp ou pelo Instagram. Nada é enviado automaticamente.</span>
          </div>
          {aiPending && <PendingIntegration what="nenhum modo de geração ativo — ative o modo regras (gratuito), o Ollama ou a Anthropic, ou escreva manualmente." />}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => generate.mutate()} loading={generate.isPending}>
              {msgId ? <RefreshCw /> : <Sparkles />} {msgId ? 'Regenerar' : 'Gerar com IA'}
            </Button>
            {instagram && (
              <Button variant="outline" onClick={sendInstagram} disabled={!text.trim()} title={`Copia a mensagem e abre o Direct de @${instagram}`}>
                <Instagram /> Instagram Direct
              </Button>
            )}
            <Button variant="whatsapp" onClick={send} disabled={!text.trim() || (!phone && noPhone)}>
              <MessageCircle /> Abrir WhatsApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
