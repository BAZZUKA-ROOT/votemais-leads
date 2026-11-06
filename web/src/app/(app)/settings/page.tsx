'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader, useConfirm } from '@/components/app/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { UFS } from '@/lib/constants';
import { fmtDateTime } from '@/lib/format';
import type { Category } from '@/lib/types';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
}
interface Suppression {
  id: number;
  type: string;
  value: string;
  reason: string | null;
  createdAt: string;
}
interface Campaign {
  id: number;
  name: string;
  description: string | null;
  categoryIds: number[];
  states: string[];
  isActive: boolean;
  leads: number;
  converted: number;
}

function Account() {
  const router = useRouter();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const change = useMutation({
    mutationFn: () => api.post('/auth/password', { current: f.current, next: f.next }),
    onSuccess: () => {
      toast.success('Senha alterada. Faça login novamente.');
      router.replace('/login');
    },
  });
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <div>
          <CardTitle>Alterar senha</CardTitle>
          <CardDescription>Mínimo de 12 caracteres com maiúsculas, minúsculas e números. Todas as sessões serão encerradas.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (f.next !== f.confirm) return toast.error('As senhas não conferem');
            change.mutate();
          }}
        >
          <Field label="Senha atual">
            <Input type="password" autoComplete="current-password" required value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
          </Field>
          <Field label="Nova senha">
            <Input type="password" autoComplete="new-password" required minLength={12} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
          </Field>
          <Field label="Confirmar nova senha">
            <Input type="password" autoComplete="new-password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
          </Field>
          <Button type="submit" className="justify-self-start" loading={change.isPending}>
            Alterar senha
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Users() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['users'], queryFn: () => api.get<User[]>('/users') });
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'operator' });
  const create = useMutation({
    mutationFn: () => api.post('/users', f),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['users'] }), setF({ name: '', email: '', password: '', role: 'operator' }), toast.success('Usuário criado')),
  });
  const update = useMutation({ mutationFn: ({ id, ...b }: { id: string; isActive?: boolean; role?: string }) => api.patch(`/users/${id}`, b), onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }) });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Usuários</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <THead>
              <Tr className="hover:bg-transparent"><Th>Nome</Th><Th>Perfil</Th><Th>Último acesso</Th><Th>Ativo</Th></Tr>
            </THead>
            <TBody>
              {q.data?.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-[11px] text-muted-foreground">{u.email}</div>
                  </Td>
                  <Td>
                    <Select className="h-7 w-32" value={u.role} onChange={(e) => update.mutate({ id: u.id, role: e.target.value })}>
                      <option value="admin">Administrador</option>
                      <option value="operator">Operador</option>
                    </Select>
                  </Td>
                  <Td className="text-xs text-muted-foreground">{fmtDateTime(u.lastLoginAt)}</Td>
                  <Td>
                    <Switch checked={u.isActive} onCheckedChange={(v) => update.mutate({ id: u.id, isActive: v })} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {q.isError && <p className="px-4 text-xs text-muted-foreground">Apenas administradores gerenciam usuários.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-4" /> Novo usuário
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Field label="Nome">
              <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="E-mail">
              <Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label="Senha inicial" hint="Mín. 12 caracteres, maiúscula, minúscula e número">
              <Input type="password" required minLength={12} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </Field>
            <Field label="Perfil">
              <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                <option value="operator">Operador</option>
                <option value="admin">Administrador</option>
              </Select>
            </Field>
            <Button type="submit" loading={create.isPending}>
              Criar usuário
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Campaigns() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const q = useQuery({ queryKey: ['campaigns'], queryFn: () => api.get<Campaign[]>('/campaigns') });
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/categories') });
  const [f, setF] = useState({ name: '', description: '', categoryIds: [] as number[], states: [] as string[] });
  const create = useMutation({
    mutationFn: () => api.post('/campaigns', { ...f, description: f.description || null }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['campaigns'] }), setF({ name: '', description: '', categoryIds: [], states: [] }), toast.success('Campanha criada')),
  });
  const toggle = useMutation({ mutationFn: (c: Campaign) => api.put(`/campaigns/${c.id}`, { isActive: !c.isActive }), onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }) });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/campaigns/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }) });
  const run = useMutation({
    mutationFn: (c: Campaign) => api.post('/search/run', { campaignId: c.id, categoryIds: c.categoryIds.length ? c.categoryIds : undefined, states: c.states.length ? c.states : undefined }),
    onSuccess: () => toast.success('Pesquisa da campanha enfileirada'),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div>
            <CardTitle>Campanhas</CardTitle>
            <CardDescription>Agrupe pesquisas por foco (ex.: temporada de rodeios no Centro-Oeste) e acompanhe os resultados.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {q.data?.length ? (
            <ul className="divide-y">
              {q.data.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {c.states.length ? c.states.join(', ') : 'todos os estados'} · {c.categoryIds.length ? `${c.categoryIds.length} categorias` : 'todas as categorias'} · {c.leads} leads · {c.converted} clientes
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={c.isActive} onCheckedChange={() => toggle.mutate(c)} />
                    <Button size="sm" variant="outline" onClick={() => run.mutate(c)} disabled={!c.isActive}>
                      Pesquisar
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label="Excluir" onClick={async () => (await confirm({ title: `Excluir campanha "${c.name}"?`, description: 'Os leads permanecem, apenas sem vínculo.', destructive: true })) && del.mutate(c.id)}>
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Megaphone} title="Nenhuma campanha" />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-4" /> Nova campanha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Field label="Nome">
              <Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Descrição">
              <Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
            <Field label="Categorias" hint="Ctrl/Cmd para selecionar várias">
              <select multiple className="h-28 rounded-md border bg-card p-1 text-base md:text-xs" value={f.categoryIds.map(String)} onChange={(e) => setF({ ...f, categoryIds: [...e.target.selectedOptions].map((o) => Number(o.value)) })}>
                {cats.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estados">
              <select multiple className="h-28 rounded-md border bg-card p-1 text-base md:text-xs" value={f.states} onChange={(e) => setF({ ...f, states: [...e.target.selectedOptions].map((o) => o.value) })}>
                {UFS.map(([uf, n]) => (
                  <option key={uf} value={uf}>
                    {uf} — {n}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit" loading={create.isPending}>
              Criar campanha
            </Button>
          </form>
        </CardContent>
      </Card>
      {dialog}
    </div>
  );
}

function Privacy() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const q = useQuery({ queryKey: ['suppression'], queryFn: () => api.get<Suppression[]>('/suppression') });
  const [s, setS] = useState({ type: 'phone', value: '', reason: '' });
  const [er, setEr] = useState({ type: 'phone', value: '' });
  const add = useMutation({
    mutationFn: () => api.post('/suppression', { ...s, reason: s.reason || null }),
    onSuccess: () => (qc.invalidateQueries({ queryKey: ['suppression'] }), setS({ ...s, value: '', reason: '' }), toast.success('Adicionado à lista de supressão')),
  });
  const remove = useMutation({ mutationFn: (id: number) => api.del(`/suppression/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['suppression'] }) });
  const erase = useMutation({
    mutationFn: () => api.post<{ removed: number }>('/privacy/erase', er),
    onSuccess: (r) => (qc.invalidateQueries({ queryKey: ['suppression'] }), setEr({ ...er, value: '' }), toast.success(`${r.removed} registro(s) de contato removidos e valor suprimido`)),
  });
  const TYPES = (
    <>
      <option value="phone">Telefone/WhatsApp</option>
      <option value="email">E-mail</option>
      <option value="instagram">Instagram</option>
      <option value="domain">Domínio</option>
    </>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" /> Lista de supressão
            </CardTitle>
            <CardDescription>Contatos que não desejam novas abordagens. Novas descobertas com esses dados são descartadas e leads existentes ficam bloqueados.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="mb-4 grid gap-2 sm:grid-cols-[10rem_1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <Select value={s.type} onChange={(e) => setS({ ...s, type: e.target.value })}>
              {TYPES}
            </Select>
            <Input required placeholder="Valor" value={s.value} onChange={(e) => setS({ ...s, value: e.target.value })} />
            <Input placeholder="Motivo (opcional)" value={s.reason} onChange={(e) => setS({ ...s, reason: e.target.value })} />
            <Button type="submit" variant="outline" loading={add.isPending}>
              <Plus /> Adicionar
            </Button>
          </form>
          {q.data?.length ? (
            <ul className="divide-y rounded-lg border">
              {q.data.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-3 py-2">
                  <Badge variant="outline">{x.type}</Badge>
                  <span className="font-mono text-xs">{x.value}</span>
                  <span className="flex-1 truncate text-[11px] text-muted-foreground">{x.reason}</span>
                  <span className="text-[11px] text-muted-foreground">{fmtDateTime(x.createdAt)}</span>
                  <Button size="icon-sm" variant="ghost" aria-label="Remover" onClick={async () => (await confirm({ title: 'Remover da supressão?', description: 'O contato poderá voltar a ser abordado.' })) && remove.mutate(x.id)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Lista vazia" />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Exclusão de dados pessoais</CardTitle>
            <CardDescription>Atende pedidos de titulares (LGPD art. 18): remove o contato de toda a base e impede nova coleta.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await confirm({ title: 'Excluir dado pessoal?', description: `Todas as ocorrências de "${er.value}" serão removidas definitivamente.`, destructive: true, confirmLabel: 'Excluir' })) erase.mutate();
            }}
          >
            <Field label="Tipo">
              <Select value={er.type} onChange={(e) => setEr({ ...er, type: e.target.value })}>
                {TYPES}
              </Select>
            </Field>
            <Field label="Valor">
              <Input required value={er.value} onChange={(e) => setEr({ ...er, value: e.target.value })} />
            </Field>
            <Button type="submit" variant="destructive" loading={erase.isPending}>
              Excluir dados
            </Button>
          </form>
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            Política de retenção: leads descartados sem uso comercial e logs são removidos automaticamente conforme os prazos definidos em Automações. Somente dados comerciais publicados voluntariamente em fontes públicas são coletados.
          </p>
        </CardContent>
      </Card>
      {dialog}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Configurações" description="Conta, usuários, campanhas e privacidade (LGPD)." />
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Conta</TabsTrigger>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
          <TabsTrigger value="privacy">Privacidade e LGPD</TabsTrigger>
        </TabsList>
        <TabsContent value="account">
          <Account />
        </TabsContent>
        <TabsContent value="users">
          <Users />
        </TabsContent>
        <TabsContent value="campaigns">
          <Campaigns />
        </TabsContent>
        <TabsContent value="privacy">
          <Privacy />
        </TabsContent>
      </Tabs>
    </>
  );
}
