"use client";
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import type { z } from "zod";
import { ArrowRight, Check } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { offerProposalSchema } from "@/lib/ai/schemas";
import { api, formatCents, formatDay, savedSchema, spDay, toastError } from "@/lib/client";
import { proposalInOffer, savedOfferSchema } from "@/lib/offer-proposal";
import { cn } from "@/lib/utils";

type OfferProposal = z.infer<typeof offerProposalSchema>;
type CardState = "checking" | "pending" | "saving" | "confirmed" | "dismissed" | "replaced";

type Contents = "price" | "proofs" | "both";

// A card that only carries the price must not speak of proofs, or the client wonders which proofs.
function contentsOf(proposal: OfferProposal): Contents {
  if (proposal.provasAutorizadas === undefined) return "price";
  if (proposal.ticketCents === undefined) return "proofs";
  return "both";
}

const headings: Record<CardState, Record<Contents, string>> = {
  checking: { price: "Esse preço está certo?", proofs: "Esses dados estão certos?", both: "Esses dados estão certos?" },
  pending: { price: "Esse preço está certo?", proofs: "Esses dados estão certos?", both: "Esses dados estão certos?" },
  saving: { price: "Esse preço está certo?", proofs: "Esses dados estão certos?", both: "Esses dados estão certos?" },
  confirmed: {
    price: "Preço salvo na sua oferta",
    proofs: "Provas salvas na sua oferta",
    both: "Preço e provas salvos na sua oferta",
  },
  dismissed: {
    price: "Preço que você não usou",
    proofs: "Provas que você não usou",
    both: "Preço e provas que você não usou",
  },
  replaced: { price: "Preço de antes", proofs: "Provas de antes", both: "Preço e provas de antes" },
};

const correctionRequests: Record<Contents, string> = {
  price: "Não salvei. Me diga o preço certo na conversa.",
  proofs: "Não salvei. Me diga as provas certas na conversa.",
  both: "Não salvei. Me diga o preço e as provas certas na conversa.",
};

function StatusBadge({ state, confirmedOn }: { state: CardState; confirmedOn: string | null }) {
  if (state === "confirmed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-semibold text-background">
        <Check className="size-3" aria-hidden />
        {confirmedOn == null ? "Confirmado" : `Confirmado em ${confirmedOn}`}
      </span>
    );
  if (state === "dismissed")
    return (
      <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
        Não usado
      </span>
    );
  if (state === "replaced")
    return (
      <span className="inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
        Substituído
      </span>
    );
  // While checking, the badge keeps its place without claiming a state yet.
  return (
    <span
      aria-hidden={state === "checking"}
      className={cn(
        "inline-flex rounded-full bg-warning px-2.5 py-1 text-xs font-semibold text-background",
        state === "checking" && "invisible",
      )}
    >
      Falta você conferir
    </span>
  );
}

// Blocked storage (private mode, cleared site data) only means a dismissed card asks again.
function readDismissed(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function saveDismissed(key: string) {
  try {
    window.localStorage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

/** Shows the price and proofs the assistant heard and saves them only when the client confirms. */
export function OfferProposalCard({
  proposal,
  current,
  cardId,
}: {
  proposal: OfferProposal;
  /** Only the newest proposal of the conversation can still be confirmed. */
  current: boolean;
  /** Stable per card (message id and part position), to remember "Não usar" after a reload. */
  cardId: string;
}) {
  const dismissedKey = `offer-proposal-dismissed:${cardId}`;
  const titleId = useId();
  const [checkedState, setState] = useState<CardState>("checking");
  const state: CardState = current ? checkedState : "replaced";
  const [confirmedOn, setConfirmedOn] = useState<string | null>(null);
  // Parts are re-created while the reply streams; the text keeps the check to one request.
  const signature = JSON.stringify(proposal);

  useEffect(() => {
    if (current === false) return;
    let active = true;
    const expected = offerProposalSchema.parse(JSON.parse(signature));
    const next: Promise<CardState> = readDismissed(dismissedKey)
      ? Promise.resolve("dismissed")
      : api("/api/context", savedOfferSchema).then((offer) =>
          proposalInOffer(expected, offer) ? "confirmed" : "pending",
        );
    next
      .then((resolved) => {
        if (active) setState(resolved);
      })
      // Without the saved offer the card cannot tell it was confirmed, so it asks again.
      .catch(() => {
        if (active) setState("pending");
      });
    return () => {
      active = false;
    };
  }, [signature, current, dismissedKey]);

  function dismiss() {
    saveDismissed(dismissedKey);
    setState("dismissed");
  }

  async function confirm() {
    setState("saving");
    try {
      await api("/api/context", savedSchema, proposal, "PATCH");
      setConfirmedOn(formatDay(spDay()));
      setState("confirmed");
    } catch (error) {
      toastError(error, "Não foi possível salvar. Tente de novo.");
      setState("pending");
    }
  }

  const proofs = proposal.provasAutorizadas;
  const contents = contentsOf(proposal);
  // The buttons show while checking too: a card that grew after the reply ended left the chat above the bottom.
  const waiting = state === "checking" || state === "pending" || state === "saving";
  return (
    <section
      aria-labelledby={titleId}
      className="space-y-4 rounded-xl border bg-card p-4"
    >
      <div className="space-y-2">
        <p aria-live="polite">
          <StatusBadge state={state} confirmedOn={confirmedOn} />
        </p>
        <h4 id={titleId} className="text-sm font-semibold">
          {headings[state][contents]}
        </h4>
        {state === "replaced" ? (
          <p className="text-sm text-muted-foreground">
            Uma conferência mais nova, mais abaixo na conversa, vale no lugar desta.
          </p>
        ) : null}
        {state === "confirmed" || state === "replaced" || state === "dismissed" ? null : (
          <p className="text-sm text-muted-foreground">
            Vou usar isso nos seus anúncios.
          </p>
        )}
      </div>
      {proposal.ticketCents === undefined ? null : (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Preço</p>
          <p className="text-lg font-semibold">
            {proposal.ticketCents == null ? "Sem preço" : formatCents(proposal.ticketCents)}
          </p>
        </div>
      )}
      {proofs === undefined ? null : (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">
            Provas ({proofs.length})
          </p>
          {proofs.length === 0 ? (
            <p className="text-sm">Nenhuma prova</p>
          ) : (
            <ul className="space-y-1.5">
              {proofs.map((proof, index) => (
                <li key={index} className="rounded-lg bg-background px-3 py-2 text-sm">
                  {proof}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {waiting ? (
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button
            size="lg"
            disabled={state !== "pending"}
            onClick={() => void confirm()}
          >
            {state === "saving" ? "Salvando..." : "Sim, está certo"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={state !== "pending"}
            onClick={dismiss}
          >
            Não, quero corrigir
          </Button>
        </div>
      ) : null}
      {state === "dismissed" ? (
        <p className="text-sm text-muted-foreground">
          {correctionRequests[contents]}
        </p>
      ) : null}
      {state === "confirmed" ? (
        <Link
          href="/configuracoes"
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium outline-none",
            "hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          Mudar depois em Minha oferta
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      ) : null}
    </section>
  );
}
