import type { BaseComponentProps } from '@json-render/react';
import type { CSSProperties } from 'react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type ImageSectionProps = z.infer<(typeof componentPropsSchemas)['ImageSection']>;

const aspectRatioStyle: Record<ImageSectionProps['aspectRatio'], CSSProperties> = {
  wide: { aspectRatio: '16 / 9' },
  square: { aspectRatio: '1 / 1' },
  portrait: { aspectRatio: '4 / 5' },
};

export function ImageSection({ props }: BaseComponentProps<ImageSectionProps>) {
  const aspectRatio = props.aspectRatio ?? 'wide';

  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <figure>
        <div
          className="overflow-hidden rounded-md border border-border/70 bg-muted/40"
          style={aspectRatioStyle[aspectRatio]}
        >
          <img
            alt={props.image.alt}
            className="h-full w-full object-cover"
            decoding="async"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={props.image.src}
          />
        </div>
        {props.image.caption || props.image.credit ? (
          <figcaption className="mt-2 text-xs leading-5 text-muted-foreground">
            {props.image.caption}
            {props.image.caption && props.image.credit ? ' ' : null}
            {props.image.credit ? <span>{props.image.credit}</span> : null}
          </figcaption>
        ) : null}
      </figure>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
