'use client';
import * as T from '@radix-ui/react-tooltip';
import * as React from 'react';

export const TooltipProvider = T.Provider;

export function Tip({ content, children, side = 'top' }: { content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-50 max-w-xs rounded-md bg-foreground px-2 py-1 text-[11px] text-background shadow-md animate-in">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
