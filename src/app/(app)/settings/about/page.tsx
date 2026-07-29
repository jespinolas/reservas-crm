import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AboutPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Reservas CRM</CardTitle>
            <Badge variant="secondary">Open source</Badge>
            <Badge variant="secondary">MIT</Badge>
          </div>
          <CardDescription>
            CRM self-hosted para WhatsApp, reservas, conversaciones asistidas
            por IA y operación diaria de negocios que atienden por mensajería.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-text-2">
          <p>
            Este proyecto es mantenido por Martin Espinola como parte del
            ecosistema reservas.AI. La ventaja comercial de reservas.AI vive en
            la plataforma, el backend operativo y los servicios administrados;
            el CRM se publica para que cualquier equipo pueda usarlo, adaptarlo
            y mejorarlo.
          </p>
          <p>
            Reservas CRM comenzó como un fork de Vocero CRM y conserva la
            atribución requerida por su licencia MIT. El baseline upstream está
            documentado en el archivo <code>NOTICE</code> del repositorio.
          </p>
          <div className="rounded-md border bg-subtle p-4">
            <p className="font-medium text-foreground">Créditos upstream</p>
            <p className="mt-1">
              Vocero CRM fue creado por{" "}
              <Link
                href="https://www.youtube.com/@KevinBelier"
                className="text-brand-text underline-offset-4 hover:underline"
              >
                Kevin Belier
              </Link>
              . Reservas CRM preserva esa atribución y continúa el desarrollo
              como un proyecto mantenido de forma independiente.
            </p>
          </div>
          <p>
            Repositorio público:{" "}
            <Link
              href="https://github.com/jespinolas/reservas-crm"
              className="text-brand-text underline-offset-4 hover:underline"
            >
              github.com/jespinolas/reservas-crm
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
