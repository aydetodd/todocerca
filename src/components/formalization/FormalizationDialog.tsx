import { BookOpen, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Existing profile and enterprise entries share a document link, not a data form.
export default function FormalizationDialog() {
  return <Button asChild variant="outline" className="min-h-14 h-auto w-full justify-start gap-3 whitespace-normal text-left">
    <a href="/guia-formalizacion"><BookOpen className="h-5 w-5 shrink-0 text-primary" /><span>Guía de formalización: de cero a RESICO</span><ArrowUpRight className="ml-auto h-4 w-4 shrink-0" /></a>
  </Button>;
}