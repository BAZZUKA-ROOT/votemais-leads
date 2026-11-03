'use client';
import * as P from '@radix-ui/react-popover';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export function PopoverContent({ className, align = 'start', ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={6} className={cn('z-50 w-72 rounded-xl border bg-popover p-3 shadow-lg shadow-black/5 animate-in', className)} {...props} />
    </P.Portal>
  );
}
