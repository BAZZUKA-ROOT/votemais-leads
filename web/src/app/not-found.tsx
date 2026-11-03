import Link from 'next/link';
import { LogoMark } from '@/components/app/logo';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-center">
      <LogoMark className="size-10" />
      <h1 className="text-lg font-semibold">Página não encontrada</h1>
      <Link href="/" className="text-sm text-primary hover:underline">
        Voltar ao dashboard
      </Link>
    </div>
  );
}
