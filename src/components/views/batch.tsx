import Link from "next/link";
import { ArrowLeft, ChartColumn, Download, FileText } from "@/components/icons";
import { z } from "zod";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CopyButton } from "@/components/copy-button";
import { BatchResults } from "@/components/batch-results";
import { ScriptBrowser, type Script } from "@/components/levas/script-browser";
import { BatchActions } from "@/components/levas/batch-actions";
import { Badge } from "@/components/ui/badge";
import { csvImportPeriods, defaultMetricsPeriod } from "@/lib/default-period";
import { hasWebhookSource } from "@/lib/metric-sources";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireTenant } from "@/lib/tenant";
import { getBatch } from "@/lib/batches";
import { batchText, creativeText } from "@/lib/export";

function formatDate(date: Date) {
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export async function BatchView({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { tenantId } = await requireTenant();
  const id = z.uuid().safeParse((await params).batchId);
  if (!id.success) notFound();
  const [batch, resultsPeriod, showSource, csvPeriods] = await Promise.all([
    getBatch(tenantId, id.data),
    defaultMetricsPeriod(tenantId),
    hasWebhookSource(tenantId),
    csvImportPeriods(tenantId),
  ]);
  if (!batch) notFound();

  const handle = batch.especialistaHandle?.replace(/^@/, "");
  const meta = [
    `Rodada ${batch.roundNumber}`,
    batch.produtoNome,
    handle && `@${handle}`,
    formatDate(batch.createdAt),
    // The generated title already names product and date; skip repeats.
  ].filter((part): part is string => Boolean(part) && !batch.title.includes(part as string));
  // Only the fields the client needs cross the server/client boundary.
  const scripts: Script[] = batch.items.map((item) => ({
    id: item.id,
    creativeKey: item.creativeKey,
    ideia: item.ideia,
    formato: item.formato,
    referencia: item.referencia,
    instrucoesGravacao: item.instrucoesGravacao,
    instrucoesEdicao: item.instrucoesEdicao,
    g1: item.g1,
    g2: item.g2,
    g3: item.g3,
    g4: item.g4,
    corpo: item.corpo,
    narrativa: item.narrativa,
    awarenessEntry: item.awarenessEntry,
    awarenessExit: item.awarenessExit,
    skeleton: item.skeleton,
    hipotese: item.hipotese,
    blocoTestado: item.blocoTestado,
    provaUsada: item.provaUsada,
    duracaoEstimada: item.duracaoEstimada,
    copyText: creativeText(item),
  }));
  const names = Object.fromEntries(
    batch.items.map((item) => [item.creativeKey, item.ideia]),
  );

  return (
    <div className="space-y-6 break-words">
      <div className="space-y-3">
        <Link
          href="/levas"
          className="-ml-1 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-1 text-sm text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground pointer-coarse:min-h-11"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Levas
        </Link>
        <PageHeader
          title={batch.title}
          description={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {meta.map((part, index) => (
                <span key={index} className="inline-flex items-center gap-2">
                  {index > 0 && <span aria-hidden>·</span>}
                  {part}
                </span>
              ))}
              {batch.archivedAt && <Badge variant="outline">Arquivada</Badge>}
            </span>
          }
          actions={
            <>
              <CopyButton
                label="Copiar leva"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                text={batchText(batch)}
              />
              <a
                className={buttonVariants()}
                href={`/api/export/batch/${batch.id}`}
              >
                <Download aria-hidden />
                Exportar .docx
              </a>
              <BatchActions
                batch={{
                  id: batch.id,
                  title: batch.title,
                  archived: batch.archivedAt !== null,
                }}
              />
            </>
          }
        />
      </div>

      <Tabs defaultValue="roteiros" className="gap-6">
        <TabsList
          variant="line"
          className="w-full justify-start gap-6 rounded-none border-b p-0 group-data-horizontal/tabs:h-10"
        >
          <TabsTrigger
            value="roteiros"
            className="h-full flex-none rounded-none border-0 px-0.5 after:bottom-[-1px]!"
          >
            <FileText aria-hidden />
            Roteiros
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
              {batch.items.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="resultados"
            className="h-full flex-none rounded-none border-0 px-0.5 after:bottom-[-1px]!"
          >
            <ChartColumn aria-hidden />
            Resultados
          </TabsTrigger>
        </TabsList>
        <TabsContent value="roteiros">
          <ScriptBrowser scripts={scripts} />
        </TabsContent>
        <TabsContent value="resultados">
          <BatchResults
            batchId={batch.id}
            defaultFilters={resultsPeriod}
            names={names}
            showSource={showSource}
            csvPeriods={csvPeriods}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
