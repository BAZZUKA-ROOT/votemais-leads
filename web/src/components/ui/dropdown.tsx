'use client';
import * as M from '@radix-ui/react-dropdown-menu';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dropdown = M.Root;
export const DropdownTrigger = M.Trigger;

export function DropdownContent({ children, align = 'end', className }: { children: React.ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={4} className={cn('z-50 min-w-44 rounded-lg border bg-popover p-1 shadow-lg shadow-black/5 animate-in', className)}>
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function DropdownItem({ className, destructive, ...props }: React.ComponentProps<typeof M.Item> & { destructive?: boolean }) {
  return (
    <M.Item
      className={cn(
        'flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground',
        destructive && 'text-destructive [&_svg]:text-destructive',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return <M.Label className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</M.Label>;
}
