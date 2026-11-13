"use client";
import { useId, useState } from "react";
import { ChevronDown, Clock } from "@/components/icons";
import { CopyButton } from "@/components/copy-button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type Script = {
  id: string;
  creativeKey: string;
  ideia: string;
  formato: string;
  referencia: string;
  instrucoesGravacao: string;
  instrucoesEdicao: string;
  g1: string;
  g2: string;
  g3: string;
  g4: string | null;
  corpo: string;
  narrativa: string;
  awarenessEntry: string;
  awarenessExit: string;
  skeleton: string;
  hipotese: string;
  blocoTestado: string;
  provaUsada: string;
  duracaoEstimada: number;
  /** Plain-text version used by "Copiar roteiro". */
  copyText: string;
};

function Block({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 space-y-2", className)}>
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Full script: idea, ad code, hooks, body, recording/editing notes, test details. */
function ScriptDetail({
  script,
  number,
  showTitle = true,
}: {
  script: Script;
  /** Position in the leva, shown as "Roteiro N". */
  number: number;
  /** The accordion trigger already shows the idea. */
  showTitle?: boolean;
}) {
  const titleId = useId();
  const hooks = [script.g1, script.g2, script.g3, script.g4].filter((hook) => hook != null);
  const instructions = [
    { title: "Como gravar", text: script.instrucoesGravacao },
    { title: "Como editar", text: script.instrucoesEdicao },
    { title: "Referência", text: script.referencia },
  ].filter((block) => block.text.trim());
  const details = [
    { label: "Estrutura", value: script.skeleton },
    { label: "Narrativa", value: script.narrativa },
    {
      label: "Consciência do público (início → fim)",
      value: `${script.awarenessEntry} → ${script.awarenessExit}`,
    },
    { label: "Hipótese", value: script.hipotese },
    { label: "Parte testada", value: script.blocoTestado },
    { label: "Prova", value: script.provaUsada },
    { label: "Duração estimada", value: `${script.duracaoEstimada} segundos` },
  ];

  return (
    <article
      className="divide-y divide-border/60"
      aria-labelledby={showTitle ? titleId : undefined}
      aria-label={showTitle ? undefined : script.ideia}
    >
      <header className="space-y-4 p-5 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {showTitle && <span className="font-medium">Roteiro {number}</span>}
            {script.formato.trim() && <span>{script.formato}</span>}
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />~
              {script.duracaoEstimada} s
            </span>
          </div>
          <CopyButton label="Copiar roteiro" size="sm" text={script.copyText} />
        </div>
        {showTitle && (
          <h2
            id={titleId}
            className="text-lg leading-snug font-semibold tracking-tight text-balance"
          >
            {script.ideia}
          </h2>
        )}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Código para colar no anúncio
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-0.5 rounded-md border bg-muted/50 py-0.5 pr-0.5 pl-2">
              <code className="font-mono text-sm font-medium">
                {script.creativeKey}
              </code>
              <CopyButton
                iconOnly
                variant="ghost"
                size="xs"
                label={`Copiar código ${script.creativeKey}`}
                text={script.creativeKey}
              />
            </span>
            <span className="text-xs text-muted-foreground">
              Cole como nome do anúncio e no fim do link de vendas:{" "}
              <span className="whitespace-nowrap">?src={script.creativeKey}</span> na Hotmart,{" "}
              <span className="whitespace-nowrap">?utm_content={script.creativeKey}</span> nos outros
              checkouts
            </span>
          </div>
        </div>
      </header>

      <div className="p-5 sm:p-5">
        <Block title="Ganchos">
          <ol className="-mx-2">
            {hooks.map((hook, i) => (
              <li
                key={i}
                className="group/hook flex items-start gap-3 rounded-lg px-2 py-2"
              >
                <span
                  className="mt-0.5 w-4 shrink-0 text-right text-sm font-medium text-muted-foreground tabular-nums"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <p className="reading-copy min-w-0 flex-1 text-sm whitespace-pre-wrap">
                  <span className="sr-only">Gancho {i + 1}: </span>
                  {hook}
                </p>
                <CopyButton
                  iconOnly
                  variant="ghost"
                  size="sm"
                  label={`Copiar gancho ${i + 1}`}
                  text={hook}
                  className="-my-1 text-muted-foreground"
                />
              </li>
            ))}
          </ol>
        </Block>
      </div>

      <div className="p-5 sm:p-5">
        <Block title="Roteiro">
          <p className="reading-copy max-w-prose text-sm whitespace-pre-wrap">
            {script.corpo}
          </p>
        </Block>
      </div>

      {instructions.length > 0 && (
        <div className="grid gap-6 p-5 sm:grid-cols-2 sm:p-5">
          {instructions.map((block) => (
            <Block
              key={block.title}
              title={block.title}
              className={cn(block.title === "Referência" && "sm:col-span-2")}
            >
              <p className="reading-copy text-sm whitespace-pre-wrap">
                {block.text}
              </p>
            </Block>
          ))}
        </div>
      )}

      <Collapsible className="px-5 py-3 sm:px-6">
        <CollapsibleTrigger className="group/details -mx-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-fast) outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/70 pointer-coarse:min-h-11">
          Detalhes do teste
          <ChevronDown
            className="size-4 transition-transform duration-(--duration-fast) group-data-panel-open/details:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <dl className="grid gap-x-6 gap-y-4 pt-2 pb-3 text-sm sm:grid-cols-2">
            {details.map(({ label, value }) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </CollapsibleContent>
      </Collapsible>
    </article>
  );
}

/**
 * Scripts of a leva as a list that starts all closed, so the client sees every script at once;
 * one script opens at a time.
 */
export function ScriptBrowser({ scripts }: { scripts: Script[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (scripts.length === 0) return null;

  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Abra um roteiro para ver os ganchos e o texto.
      </p>
      <ol
        aria-label="Roteiros da leva"
        className="divide-y overflow-hidden rounded-xl border bg-card"
      >
        {scripts.map((script, index) => (
          <li key={script.id}>
            <Collapsible
              open={openId === script.id}
              onOpenChange={(open) => setOpenId(open ? script.id : null)}
            >
              <CollapsibleTrigger className="group/script flex w-full items-start gap-3 px-4 py-3.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/70 focus-visible:ring-inset data-panel-open:bg-muted/40 sm:px-5">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Roteiro {index + 1} · ~{script.duracaoEstimada} s
                  </span>
                  <span className="line-clamp-2 text-sm font-medium group-data-panel-open/script:line-clamp-none">
                    {script.ideia}
                  </span>
                </span>
                <ChevronDown
                  className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-(--duration-fast) group-data-panel-open/script:rotate-180"
                  aria-hidden
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t">
                <ScriptDetail
                  script={script}
                  number={index + 1}
                  showTitle={false}
                />
              </CollapsibleContent>
            </Collapsible>
          </li>
        ))}
      </ol>
    </>
  );
}
