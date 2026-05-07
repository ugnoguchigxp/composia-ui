import { ChevronDown } from 'lucide-react';
import { Accordion as BaseAccordion } from 'radix-ui';
import * as React from 'react';
import { cn } from '../../lib/utils';

const Accordion = BaseAccordion.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof BaseAccordion.Item>,
  React.ComponentPropsWithoutRef<typeof BaseAccordion.Item>
>(({ className, ...props }, ref) => (
  <BaseAccordion.Item
    className={cn('rounded-md border border-border bg-background', className)}
    ref={ref}
    {...props}
  />
));
AccordionItem.displayName = 'AccordionItem';

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof BaseAccordion.Trigger>,
  React.ComponentPropsWithoutRef<typeof BaseAccordion.Trigger>
>(({ children, className, ...props }, ref) => (
  <BaseAccordion.Header className="flex">
    <BaseAccordion.Trigger
      className={cn(
        'flex flex-1 items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/70 [&>svg]:transition-transform data-[state=open]:[&>svg]:rotate-180',
        className
      )}
      ref={ref}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </BaseAccordion.Trigger>
  </BaseAccordion.Header>
));
AccordionTrigger.displayName = 'AccordionTrigger';

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof BaseAccordion.Content>,
  React.ComponentPropsWithoutRef<typeof BaseAccordion.Content>
>(({ children, className, ...props }, ref) => (
  <BaseAccordion.Content className={cn('overflow-hidden text-sm', className)} ref={ref} {...props}>
    <div className="border-t border-border px-3 py-2 text-muted-foreground">{children}</div>
  </BaseAccordion.Content>
));
AccordionContent.displayName = 'AccordionContent';

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
