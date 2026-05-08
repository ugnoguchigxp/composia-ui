import type { BaseComponentProps } from '@json-render/react';
import { Bot, Send, User } from 'lucide-react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import { AppActionList } from '../AppActionControl';

type ChatPanelSectionProps = z.infer<(typeof componentPropsSchemas)['ChatPanelSection']>;

export function ChatPanelSection({ props }: BaseComponentProps<ChatPanelSectionProps>) {
  return (
    <section
      className={visualIntentClassName(
        props.visualIntent,
        'overflow-hidden rounded-section border border-border/70 bg-gradient-to-b from-card to-card/85 shadow-sm ring-1 ring-border/30'
      )}
    >
      <div className="border-border/70 border-b bg-muted/20 p-section">
        <h2 className="text-lg font-semibold">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 text-muted-foreground text-sm leading-6">{props.description}</p>
        ) : null}
      </div>
      <div className="grid max-h-[28rem] gap-4 overflow-y-auto p-section">
        {props.messages.map((message, index) => {
          const isUser = message.role === 'user';
          return (
            <article
              className={cn('flex gap-3', isUser && 'justify-end')}
              key={`${message.author}-${index}`}
            >
              {!isUser ? (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </div>
              ) : null}
              <div
                className={cn(
                  'max-w-[32rem] rounded-lg px-4 py-3 text-sm leading-6',
                  isUser ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'
                )}
              >
                <div className="mb-1 font-medium text-xs opacity-80">{message.author}</div>
                {message.content}
                {message.timestamp ? (
                  <div className="mt-2 text-xs opacity-70">{message.timestamp}</div>
                ) : null}
              </div>
              {isUser ? (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      <div className="flex items-center gap-2 border-border/70 border-t bg-muted/20 p-section">
        <input
          aria-label="Message composer"
          className="h-ui min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none"
          placeholder={props.composerPlaceholder ?? 'Message'}
          readOnly
        />
        <button
          aria-label="Send message"
          className="inline-flex h-ui w-ui items-center justify-center rounded-md bg-primary text-primary-foreground"
          type="button"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <AppActionList
        actions={props.actions}
        className="mx-[var(--ui-section-padding-x)] mb-[var(--ui-section-padding-y)]"
      />
    </section>
  );
}
