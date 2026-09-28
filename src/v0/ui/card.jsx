import { cn } from '@/lib/utils';

// shadcn/ui Card (new-york), themed through src/styles/v0-bridge.css.
function Card({ className, ...props }) {
  return <div data-slot="card" className={cn('flex flex-col gap-6 rounded-lg border border-border bg-card py-6 text-card-foreground', className)} {...props} />;
}
function CardHeader({ className, ...props }) {
  return <div data-slot="card-header" className={cn('grid auto-rows-min items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]', className)} {...props} />;
}
function CardTitle({ className, ...props }) {
  return <div data-slot="card-title" className={cn('font-serif text-xl leading-none', className)} {...props} />;
}
function CardDescription({ className, ...props }) {
  return <div data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
function CardAction({ className, ...props }) {
  return <div data-slot="card-action" className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)} {...props} />;
}
function CardContent({ className, ...props }) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />;
}
function CardFooter({ className, ...props }) {
  return <div data-slot="card-footer" className={cn('flex items-center px-6', className)} {...props} />;
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
