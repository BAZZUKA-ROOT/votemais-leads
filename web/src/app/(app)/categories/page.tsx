'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader, useConfirm } from '@/components/app/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { CATEGORY_GROUPS } from '@/lib/constants';
import type { Category } from '@/lib/types';

type Form = { id?: number; name: string; group: string; description: string; keywords: string; negativeKeywords: string; priority: number; isActive: boolean };
const empty: Form = { name: '', group: 'beleza', description: '', keywords: '', negativeKeywords: '', priority: 5, isActive: true };
const split = (v: string) => v.split(/\n|,/).map((s) => s.trim()).filter(Boolean);

export default function CategoriesPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState<Form | null>(null);
  const q = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/categories') });

  const save = useMutation({
    mutationFn: (f: Form) => {
      const body = { name: f.name, group: f.group, description: f.description || null, keywords: split(f.keywords), negativeKeywords: split(f.negativeKeywords), priority: f.priority, isActive: f.isActive };
      return f.id ? api.put(`/categories/${f.id}`, body) : api.post('/categories', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      setForm(null);
      toast.success('Categoria salva');
    },
  });
  const toggle = useMutation({
    mutationFn: (c: Category) => api.put(`/categories/${c.id}`, { isActive: !c.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.del<{ deleted: boolean; deactivated?: boolean }>(`/categories/${id}`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.success(r.deleted ? 'Categoria excluída' : 'Categoria possui eventos e foi apenas desativada');
    },
  });

  const groups = Object.keys(CATEGORY_GROUPS).map((g) => ({ g, items: (q.data ?? []).filter((c) => c.group === g) }));

  return (
    <>
      <PageHeader
        title="Categorias e palavras-chave"
        description="O planejador gera consultas a partir das palavras-chave de cada categoria ativa, alternando estados e regiões."
        actions={
          <Button onClick={() => setForm(empty)}>
            <Plus /> Nova categoria
          </Button>
        }
      />
      {q.isPending && <Skeleton className="h-96" />}
      <div className="space-y-4">
        {groups.map(({ g, items }) =>
          items.length ? (
            <Card key={g}>
              <CardHeader>
                <CardTitle>{CATEGORY_GROUPS[g]}</CardTitle>
                <span className="text-xs text-muted-foreground">{items.filter((i) => i.isActive).length} ativas</span>
              </CardHeader>
              <CardContent className="px-0">
                <ul className="divide-y">
                  {items.map((c) => (
                    <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          <Badge variant="neutral">prioridade {c.priority}</Badge>
                          <span className="text-[11px] text-muted-foreground tabular">{c.leads} leads</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.keywords.map((k) => (
                            <Badge key={k} variant="outline">
                              {k}
                            </Badge>
                          ))}
                          {c.negativeKeywords.length > 0 && <span className="text-[11px] text-muted-foreground">· {c.negativeKeywords.length} termos negativos</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={c.isActive} onCheckedChange={() => toggle.mutate(c)} aria-label="Ativa" />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Editar"
                          onClick={() => setForm({ id: c.id, name: c.name, group: c.group, description: c.description ?? '', keywords: c.keywords.join('\n'), negativeKeywords: c.negativeKeywords.join('\n'), priority: c.priority, isActive: c.isActive })}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Excluir"
                          onClick={async () => (await confirm({ title: `Excluir "${c.name}"?`, description: 'Se houver eventos vinculados, a categoria será apenas desativada.', destructive: true })) && del.mutate(c.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null,
        )}
        {q.data && !q.data.length && <EmptyState icon={Tags} title="Nenhuma categoria" description="Execute o seed ou crie categorias." />}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        {form && (
          <DialogContent title={form.id ? 'Editar categoria' : 'Nova categoria'}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(form);
              }}
              className="grid gap-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nome">
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Grupo">
                  <Select value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })}>
                    {Object.entries(CATEGORY_GROUPS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Palavras-chave (uma por linha)" hint="Usadas entre aspas nas consultas. Ex.: Rainha do Rodeio">
                <Textarea required rows={4} value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
              </Field>
              <Field label="Termos negativos (descartam resultados)">
                <Textarea rows={3} value={form.negativeKeywords} onChange={(e) => setForm({ ...form, negativeKeywords: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prioridade (1–10)">
                  <Input type="number" min={1} max={10} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
                </Field>
                <Field label="Ativa">
                  <div className="flex h-8 items-center">
                    <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                  </div>
                </Field>
              </div>
              <Field label="Descrição">
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={save.isPending}>
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
      {dialog}
    </>
  );
}
