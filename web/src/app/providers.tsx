'use client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { toast, Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2, refetchOnWindowFocus: false },
        },
        queryCache: new QueryCache({
          onError: (err) => {
            if (err instanceof ApiError && err.status === 401) return;
            toast.error(err.message);
          },
        }),
        mutationCache: new MutationCache({
          onError: (err, _v, _c, m) => {
            if (m.options.onError) return;
            toast.error(err.message);
          },
        }),
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          {children}
          <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: 'text-[13px]' }} />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
