import type { BaseComponentProps } from '@json-render/react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';
import {
  findActionForLabel,
  type RenderableAppActionProps,
  useAppActionRenderContext,
} from '../AppActionControl';
import { formatDisplayMetadata } from './display-metadata';
import { SectionShell } from './SectionShell';

type CardGridSectionProps = z.infer<(typeof componentPropsSchemas)['CardGridSection']> &
  RenderableAppActionProps;

export function CardGridSection({ props }: BaseComponentProps<CardGridSectionProps>) {
  const { onAction, pendingActionId, selectedActionId } = useAppActionRenderContext();
  const itemActions = props.items.map((item) =>
    findActionForLabel(props.actions, item.title, item.href)
  );
  const handleActionKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    action: NonNullable<(typeof itemActions)[number]>
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onAction?.(action);
  };

  return (
    <SectionShell
      title={props.title}
      description={props.description}
      visualIntent={props.visualIntent}
      bodyClassName="space-y-[var(--ui-section-gap)]"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {props.items.map((item, index) => {
          const action = itemActions[index];
          const meta = formatDisplayMetadata(item.meta);
          const isSelected = Boolean(action && action.id === selectedActionId);
          const isPending = Boolean(action && action.id === pendingActionId);
          const href = action?.kind !== 'submit' ? (action?.target ?? item.href) : item.href;
          const isActionCard = Boolean(action && onAction);
          const cardClassName = cn(
            'group block h-full w-full overflow-hidden rounded-md border border-border/70 bg-background/95 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md',
            (isActionCard || href) && 'cursor-pointer',
            isSelected && 'border-primary ring-2 ring-primary/40 ring-offset-1',
            isPending && 'pointer-events-none opacity-60'
          );
          const content = (
            <CardGridItemContent
              image={item.image}
              interactive={isActionCard}
              linkLabel={action?.label ?? (href ? item.title : undefined)}
              meta={meta}
              title={item.title}
              badge={item.badge}
              description={item.description}
            />
          );

          if (action && onAction) {
            return (
              <button
                aria-pressed={isSelected}
                className={cardClassName}
                data-action-id={action.id}
                data-selected={isSelected ? 'true' : undefined}
                disabled={isPending}
                key={`${item.title}-${item.href ?? ''}`}
                onClick={() => {
                  if (!isPending) onAction(action);
                }}
                onKeyDown={(event) => handleActionKeyDown(event, action)}
                type="button"
              >
                {content}
              </button>
            );
          }

          if (href) {
            return (
              <a className={cardClassName} href={href} key={`${item.title}-${item.href ?? ''}`}>
                {content}
              </a>
            );
          }

          return (
            <article className={cardClassName} key={`${item.title}-${item.href ?? ''}`}>
              {content}
            </article>
          );
        })}
      </div>
    </SectionShell>
  );
}

type CardGridItemContentProps = {
  badge?: string;
  description?: string;
  image?: { alt: string; src: string };
  interactive?: boolean;
  linkLabel?: string;
  meta?: string;
  title: string;
};

function CardGridItemContent({
  badge,
  description,
  image,
  interactive = false,
  linkLabel,
  meta,
  title,
}: CardGridItemContentProps): ReactNode {
  const BodyElement = interactive ? 'span' : 'div';
  const HeaderElement = interactive ? 'span' : 'div';
  const TitleElement = interactive ? 'span' : 'h3';
  const MetaElement = interactive ? 'span' : 'div';
  const DescriptionElement = interactive ? 'span' : 'p';

  return (
    <>
      {image ? (
        <img
          alt={image.alt}
          className="aspect-[16/9] w-full object-cover"
          decoding="async"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={image.src}
        />
      ) : null}
      <BodyElement className="block p-4">
        <HeaderElement className="flex items-start justify-between gap-3">
          <TitleElement className="block line-clamp-2 font-semibold text-foreground leading-5">
            {title}
          </TitleElement>
          {badge ? (
            <span className="rounded-sm bg-secondary px-2 py-1 text-secondary-foreground text-xs">
              {badge}
            </span>
          ) : null}
        </HeaderElement>
        {meta ? (
          <MetaElement className="mt-1 block text-muted-foreground/90 text-xs">{meta}</MetaElement>
        ) : null}
        {description ? (
          <DescriptionElement className="mt-2 block line-clamp-2 text-muted-foreground text-sm leading-6">
            {description}
          </DescriptionElement>
        ) : null}
        {linkLabel ? (
          <span className="mt-4 inline-flex items-center rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5 text-primary text-xs font-medium underline-offset-4 group-hover:bg-muted/50">
            {linkLabel}
          </span>
        ) : null}
      </BodyElement>
    </>
  );
}
