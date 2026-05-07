import type { BaseComponentProps } from '@json-render/react';
import type { CSSProperties } from 'react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import { AppActionList } from '../AppActionControl';

type ImageSectionProps = z.infer<(typeof componentPropsSchemas)['ImageSection']>;

const aspectRatioStyle: Record<ImageSectionProps['aspectRatio'], CSSProperties> = {
  wide: { aspectRatio: '16 / 9' },
  square: { aspectRatio: '1 / 1' },
  portrait: { aspectRatio: '4 / 5' },
};

export function ImageSection({ props }: BaseComponentProps<ImageSectionProps>) {
  const aspectRatio = props.aspectRatio ?? 'wide';

  return (
    <section
      className={visualIntentClassName(
        props.visualIntent,
        'overflow-hidden rounded-lg border p-[var(--ui-card-padding)]'
      )}
    >
      {props.title || props.description ? (
        <div className="mb-4">
          {props.title ? <h2 className="text-lg font-semibold">{props.title}</h2> : null}
          {props.description ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{props.description}</p>
          ) : null}
        </div>
      ) : null}
      <figure>
        <div
          className="overflow-hidden rounded-md border border-border bg-muted"
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
      <AppActionList actions={props.actions} />
    </section>
  );
}
