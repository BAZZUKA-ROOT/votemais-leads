'use client';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bell,
  Bot,
  CalendarClock,
  FileText,
  FolderKanban,
  Gauge,
  Kanban,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  Plug,
  Search,
  Settings,
  Sparkles,
  Sun,
  Tags,
  Ticket,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tip } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Logo } from './logo';

interface Me {
  user: { id: string; email: string; name: string; role: string };
}
interface Health {
  database: { ok: boolean; detail?: string };
  redis: { ok: boolean; detail?: string };
  worker: { ok: boolean; detail?: string };
  ai: { ok: boolean; detail?: string };
}

const NAV = [
  {
    title: 'Comercial',
    items: [
      { href: '/', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/leads', label: 'Leads', icon: Users },
      { href: '/pipeline', label: 'Pipeline', icon: Kanban },
      { href: '/followups', label: 'Follow-ups', icon: CalendarClock, badge: 'followups' as const },
      { href: '/messages', label: 'Mensagens', icon: MessageSquareText },
    ],
  },
  {
    title: 'Descoberta',
    items: [
      { href: '/events', label: 'Eventos', icon: Ticket },
      { href: '/organizers', label: 'Organizadores', icon: FolderKanban },
      { href: '/search', label: 'Pesquisas', icon: Search },
      { href: '/categories', label: 'Categorias', icon: Tags },
    ],
  },
  {
    title: 'Operação',
    items: [
      { href: '/automations', label: 'Automações', icon: Bot },
      { href: '/reports', label: 'Relatórios', icon: BarChart3 },
      { href: '/usage', label: 'Consumo e custos', icon: Wallet },
      { href: '/logs', label: 'Logs do sistema', icon: FileText },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { href: '/integrations', label: 'Integrações', icon: Plug },
      { href: '/settings', label: 'Configurações', icon: Settings },
    ],
  },
];

function isActive(path: string, href: string) {
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}

function Sidebar({ onNavigate, dueCount }: { onNavigate?: () => void; dueCount: number }) {
  const path = usePathname();
  return (
    <nav className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Link href="/" onClick={onNavigate}>
          <Logo />
        </Link>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-2.5 py-3 scrollbar-thin">
        {NAV.map((g) => (
          <div key={g.title}>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">{g.title}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = isActive(path, it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={onNavigate}
                      className={cn(
                        'group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                        active && 'bg-card font-medium text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06)] ring-1 ring-border',
                      )}
                    >
                      <it.icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground/80 group-hover:text-foreground')} />
                      <span className="flex-1 truncate">{it.label}</span>
                      {'badge' in it && dueCount > 0 && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground tabular">{dueCount}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="m-2.5 rounded-lg border bg-card p-3 text-[11px] text-muted-foreground">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
          <Sparkles className="size-3.5 text-primary" /> Uso interno
        </div>
        Prospecção para <a className="text-primary hover:underline" href="https://votemais.online" target="_blank" rel="noreferrer">votemais.online</a>. Mensagens nunca são enviadas automaticamente.
      </div>
    </nav>
  );
}

function StatusDot({ health }: { health?: Health }) {
  if (!health) return <span className="size-2 rounded-full bg-muted-foreground/40" />;
  const items: Array<[string, { ok: boolean; detail?: string }]> = [
    ['Banco de dados', health.database],
    ['Redis', health.redis],
    ['Workers', health.worker],
    ['IA', health.ai],
  ];
  const bad = items.filter(([, v]) => !v.ok);
  const critical = !health.database.ok || !health.redis.ok || !health.worker.ok;
  return (
    <Tip
      content={
        <div className="space-y-0.5">
          {items.map(([k, v]) => (
            <div key={k}>
              {v.ok ? '●' : '○'} {k}: {v.ok ? 'ok' : (v.detail ?? 'indisponível')}
            </div>
          ))}
        </div>
      }
    >
      <Link href="/integrations" className="flex h-8 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent">
        <span className={cn('relative size-2 rounded-full', critical ? 'bg-destructive' : bad.length ? 'bg-warning' : 'bg-success')}>
          {!critical && !bad.length && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-40" />}
        </span>
        <span className="hidden sm:inline">{critical ? 'Sistema com falha' : bad.length ? 'Pendências' : 'Operacional'}</span>
      </Link>
    </Tip>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState('');
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/auth/me'), staleTime: 300_000 });
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.get<Health>('/health/system'), refetchInterval: 60_000, enabled: me.isSuccess });
  const due = useQuery({
    queryKey: ['followups', 'overdue-count'],
    queryFn: () => api.get<unknown[]>('/followups', { range: 'overdue' }),
    refetchInterval: 120_000,
    enabled: me.isSuccess,
  });

  useEffect(() => setMobileOpen(false), [path]);

  if (me.isPending) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-60 border-r bg-sidebar md:block" />
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-8 w-56" />
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  if (me.isError) return null;

  const logout = async () => {
    await api.post('/auth/logout');
    router.replace('/login');
  };

  return (
    <div className="flex min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-sidebar-border bg-sidebar md:block">
        <Sidebar dueCount={due.data?.length ?? 0} />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r bg-sidebar animate-in">
            <button className="absolute right-2 top-3 rounded-md p-1.5 hover:bg-accent" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
              <X className="size-4" />
            </button>
            <Sidebar dueCount={due.data?.length ?? 0} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col md:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md sm:px-5">
          <button className="rounded-md p-1.5 hover:bg-accent md:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu className="size-4" />
          </button>
          <form
            className="relative w-full max-w-sm"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(`/leads?q=${encodeURIComponent(q)}`);
            }}
          >
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar evento, organizador ou cidade…" className="h-8 bg-muted/60 pl-8 shadow-none" />
          </form>
          <div className="ml-auto flex items-center gap-1">
            <StatusDot health={health.data} />
            <Link href="/followups" className="relative rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Follow-ups">
              <Bell className="size-4" />
              {(due.data?.length ?? 0) > 0 && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" />}
            </Link>
            <button
              className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              aria-label="Alternar tema"
            >
              {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <Dropdown>
              <DropdownTrigger className="ml-1 flex size-8 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-soft-foreground">
                {me.data.user.name.slice(0, 1).toUpperCase()}
              </DropdownTrigger>
              <DropdownContent>
                <DropdownLabel>{me.data.user.email}</DropdownLabel>
                <DropdownSeparator />
                <DropdownItem onSelect={() => router.push('/settings')}>
                  <Settings /> Configurações
                </DropdownItem>
                <DropdownItem onSelect={() => router.push('/usage')}>
                  <Gauge /> Consumo e custos
                </DropdownItem>
                <DropdownSeparator />
                <DropdownItem destructive onSelect={logout}>
                  <LogOut /> Sair
                </DropdownItem>
              </DropdownContent>
            </Dropdown>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
