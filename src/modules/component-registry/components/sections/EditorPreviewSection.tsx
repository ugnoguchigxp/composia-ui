import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import { AppActionList } from '../AppActionControl';

type EditorPreviewSectionProps = z.infer<(typeof componentPropsSchemas)['EditorPreviewSection']>;

export function EditorPreviewSection({ props }: BaseComponentProps<EditorPreviewSectionProps>) {
  return (
    <section
      className={visualIntentClassName(
        props.visualIntent,
        'overflow-hidden rounded-section border border-border/70 bg-gradient-to-b from-card to-card/85 shadow-sm ring-1 ring-border/30'
      )}
    >
      <div className="border-border/70 border-b bg-muted/20 p-section">
        <h2 className="text-lg font-semibold">{props.title}</h2>
      </div>
      <div className="grid min-h-[26rem] md:grid-cols-2">
        <div className="border-border border-b md:border-r md:border-b-0">
          <div className="border-border border-b px-4 py-3 font-medium text-sm">
            {props.editorTitle ?? 'Editor'}
          </div>
          <pre className="min-h-[22rem] whitespace-pre-wrap bg-background p-4 font-mono text-sm leading-6">
            {props.editorContent}
          </pre>
        </div>
        <div>
          <div className="border-border border-b px-4 py-3 font-medium text-sm">
            {props.previewTitle ?? 'Preview'}
          </div>
          <article className="prose prose-sm max-w-none p-4 text-foreground">
            <p className="whitespace-pre-wrap leading-7">{props.previewContent}</p>
          </article>
        </div>
      </div>
      <AppActionList
        actions={props.actions}
        className="mx-[var(--ui-section-padding-x)] mb-[var(--ui-section-padding-y)]"
      />
    </section>
  );
}
