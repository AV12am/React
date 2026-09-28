// Reference block, written the way v0 writes code: Tailwind + shadcn/ui + the Reaction kit.
// Every block in src/v0/blocks shows up in the dev sandbox (#/v0) automatically.
import { ArrowDown, EyeOff } from 'lucide-react';
import { Button } from '@/v0/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/v0/ui/card';
import { ClassBadge, SealBadge, LEVELS, SEAL, useStore } from '@/v0/reaction';

export default function ClearanceSummary() {
  const { state } = useStore();
  const files = (id) => state.files.filter((f) => f.clearance === id).length;
  const due = state.files.filter((f) => f.downgrade?.kind === 'date' && new Date(f.downgrade.at) <= new Date()).length;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {LEVELS.map((l) => (
        <Card key={l.id}>
          <CardHeader>
            <CardDescription>{l.tier}</CardDescription>
            <CardTitle className="text-2xl">{l.name} <span className="text-base italic text-muted-foreground">{l.gloss}</span></CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ClassBadge level={l.id} />
            <p className="border-l-2 border-brand pl-3 text-sm">{l.rule}</p>
            <p className="font-mono text-3xl">{files(l.id)}</p>
          </CardContent>
        </Card>
      ))}
      <Card className="border-brand">
        <CardHeader>
          <CardDescription>{SEAL.tier}</CardDescription>
          <CardTitle className="flex items-center gap-2 text-2xl"><EyeOff className="size-5" /> {SEAL.short}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <SealBadge />
          <p className="border-l-2 border-brand pl-3 text-sm">{SEAL.rule}</p>
          <p className="font-mono text-3xl">{state.files.filter((f) => f.sealed).length}</p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" size="sm" disabled={!due}><ArrowDown /> До зниження: {due}</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
