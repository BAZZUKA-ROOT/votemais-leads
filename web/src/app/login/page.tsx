'use client';
import { ArrowRight, Lock } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { LogoMark } from '@/components/app/logo';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/login', { email, password });
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="E-mail">
        <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" autoFocus />
      </Field>
      <Field label="Senha">
        <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-9" />
      </Field>
      {error && <p className="rounded-md bg-danger-soft px-3 py-2 text-xs text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Entrar <ArrowRight />
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--color-primary)_14%,transparent),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] bg-[size:48px_48px] opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="size-11" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            VoteMais <span className="text-primary">Leads</span>
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Prospecção de organizadores de eventos em todo o Brasil</p>
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-xl shadow-black/[0.04]">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="size-3" /> Acesso restrito. Uso interno VoteMais.
        </p>
      </div>
    </div>
  );
}
