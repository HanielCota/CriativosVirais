"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Ellipsis, Pencil } from "@/components/icons";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RenameDialog } from "@/components/rename-dialog";
import { api, savedSchema } from "@/lib/client";

/** Rename and archive/restore for one leva; levas are never deleted. */
export function BatchActions({
  batch,
}: {
  batch: { id: string; title: string; archived: boolean };
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "archive">();
  const url = `/api/batches/${batch.id}`;

  async function rename(title: string) {
    await api(url, savedSchema, { title }, "PATCH");
    router.refresh();
  }

  async function setArchived(archived: boolean) {
    await api(url, savedSchema, { archived }, "PATCH");
    toast.success(archived ? "Leva arquivada." : "Leva restaurada.");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label="Mais ações da leva"
              className="min-h-11 sm:min-h-8 sm:pointer-coarse:min-h-10"
            />
          }
        >
          <Ellipsis aria-hidden />
          Mais
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setDialog("rename")}>
            <Pencil aria-hidden />
            Renomear
          </DropdownMenuItem>
          {batch.archived ? (
            <DropdownMenuItem
              onClick={() =>
                void setArchived(false).catch(() =>
                  toast.error("Não foi possível restaurar a leva. Tente novamente."),
                )
              }
            >
              <ArchiveRestore aria-hidden />
              Restaurar
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setDialog("archive")}>
              <Archive aria-hidden />
              Arquivar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameDialog
        open={dialog === "rename"}
        onOpenChange={(open) => setDialog(open ? "rename" : undefined)}
        title="Renomear leva"
        label="Nome da leva"
        value={batch.title}
        onSave={rename}
      />
      <ConfirmDialog
        open={dialog === "archive"}
        onOpenChange={(open) => setDialog(open ? "archive" : undefined)}
        title="Arquivar esta leva?"
        description="Ela sai da lista de levas, mas os roteiros e os resultados continuam guardados. Os códigos usados nos anúncios seguem funcionando."
        confirmLabel="Arquivar"
        icon={Archive}
        onConfirm={() => setArchived(true)}
      />
    </>
  );
}
