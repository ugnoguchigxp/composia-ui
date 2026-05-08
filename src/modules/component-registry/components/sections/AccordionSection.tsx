import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../../components/ui/accordion';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type AccordionSectionProps = z.infer<(typeof componentPropsSchemas)['AccordionSection']>;

export function AccordionSection({ props }: BaseComponentProps<AccordionSectionProps>) {
  const type = props.type ?? 'single';
  const defaultExpandedIds = props.defaultExpandedIds ?? [];
  const items = props.items.map((item) => (
    <AccordionItem className="border-border/70 bg-background/95" key={item.id} value={item.id}>
      <AccordionTrigger className="px-ui py-ui font-medium text-sm">{item.title}</AccordionTrigger>
      <AccordionContent className="px-ui py-ui">
        <div className="space-y-2">
          {item.meta ? (
            <div className="text-muted-foreground text-xs uppercase tracking-wide">{item.meta}</div>
          ) : null}
          <p className="text-muted-foreground text-sm leading-6">{item.content}</p>
        </div>
      </AccordionContent>
    </AccordionItem>
  ));

  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      {type === 'multiple' ? (
        <Accordion className="space-y-2" defaultValue={defaultExpandedIds} type="multiple">
          {items}
        </Accordion>
      ) : (
        <Accordion
          className="space-y-2"
          collapsible
          defaultValue={defaultExpandedIds[0] ?? props.items[0]?.id}
          type="single"
        >
          {items}
        </Accordion>
      )}
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
