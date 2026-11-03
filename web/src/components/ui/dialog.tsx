'use client';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, title, description, wide }: { className?: string; children: React.ReactNode; title: string; description?: string; wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[enter_120ms_ease-out]" />
      <D.Content
        className={cn(
          'fixed left-1/2 top-[8vh] z-50 max-h-[84vh] w-[calc(100vw-2rem)] -translate-x-1/2 overflow-y-auto rounded-xl border bg-popover p-5 shadow-2xl shadow-black/10 animate-in scrollbar-thin',
          wide ? 'max-w-3xl' : 'max-w-lg',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-[15px] font-semibold tracking-tight">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-xs text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Fechar">
            <X className="size-4" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex justify-end gap-2">{children}</div>;
}
