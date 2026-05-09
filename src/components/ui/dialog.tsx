import * as BaseDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../../lib/utils';

const Dialog = BaseDialog.Root;
const DialogTrigger = BaseDialog.Trigger;
const DialogClose = BaseDialog.Close;

const DialogPortal = BaseDialog.Portal;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof BaseDialog.Overlay>,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Overlay>
>(({ className, ...props }, ref) => (
  <BaseDialog.Overlay
    className={cn('fixed inset-0 z-50 bg-black/50', className)}
    ref={ref}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

const DialogContent = React.forwardRef<
  React.ElementRef<typeof BaseDialog.Content>,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Content>
>(({ children, className, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <BaseDialog.Content
      className={cn(
        'fixed top-1/2 left-1/2 z-50 grid max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-lg outline-none',
        className
      )}
      ref={ref}
      {...props}
    >
      {children}
      <BaseDialog.Close className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
        <X className="h-4 w-4" />
      </BaseDialog.Close>
    </BaseDialog.Content>
  </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('grid gap-1 pr-9', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof BaseDialog.Title>,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Title>
>(({ className, ...props }, ref) => (
  <BaseDialog.Title className={cn('font-semibold text-lg', className)} ref={ref} {...props} />
));
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof BaseDialog.Description>,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Description>
>(({ className, ...props }, ref) => (
  <BaseDialog.Description
    className={cn('text-muted-foreground text-sm', className)}
    ref={ref}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
