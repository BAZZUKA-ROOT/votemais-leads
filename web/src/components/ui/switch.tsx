'use client';
import * as C from '@radix-ui/react-checkbox';
import * as S from '@radix-ui/react-switch';
import { Check, Minus } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn('peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input transition-colors data-[state=checked]:bg-primary disabled:opacity-50', className)}
      {...props}
    >
      <S.Thumb className="block size-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4" />
    </S.Root>
  );
}

export function Checkbox({ className, checked, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      checked={checked}
      className={cn('flex size-4 shrink-0 items-center justify-center rounded border border-input bg-card data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary text-primary-foreground', className)}
      {...props}
    >
      <C.Indicator>{checked === 'indeterminate' ? <Minus className="size-3" /> : <Check className="size-3" strokeWidth={3} />}</C.Indicator>
    </C.Root>
  );
}
