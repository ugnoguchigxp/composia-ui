import type { VisualIntent, VisualTone } from '../../../../shared/schemas/visual-intent.schema';
import { cn } from '../../../lib/utils';

const toneClasses: Record<VisualTone, string> = {
  neutral: 'border-border bg-card text-card-foreground',
  primary: 'border-primary/30 bg-primary/10 text-foreground',
  success: 'border-success/30 bg-success/10 text-foreground',
  warning: 'border-warning/30 bg-warning/10 text-foreground',
  danger: 'border-destructive/30 bg-destructive/10 text-foreground',
};

export function visualIntentClassName(intent?: VisualIntent, className?: string) {
  return cn(
    toneClasses[intent?.tone ?? 'neutral'],
    intent?.emphasis === 'high' && 'shadow-md',
    intent?.emphasis === 'low' && 'shadow-none',
    intent?.density === 'compact' && 'text-sm',
    intent?.density === 'spacious' && 'text-base',
    className
  );
}
