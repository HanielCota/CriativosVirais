import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  WidthType,
  HeadingLevel,
  TextRun,
  BorderStyle,
} from "docx";
import type { getBatch } from "./batches";
type Batch = NonNullable<Awaited<ReturnType<typeof getBatch>>>;
type Item = Batch["items"][number];
/** Hooks labelled G1 to G4; batches generated before the fourth hook have three. */
function hooks(item: Item) {
  return [item.g1, item.g2, item.g3, item.g4]
    .filter((hook) => hook != null)
    .map((hook, index) => ({ label: `G${index + 1}`, text: hook }));
}
export function creativeText(item: Item) {
  const hookLines = hooks(item).map((hook) => `${hook.label}: ${hook.text}`).join("\n");
  return `${item.creativeKey}\n\nINSTRUÇÕES\nIdeia: ${item.ideia}\nFormato: ${item.formato}\nReferência: ${item.referencia}\nInstruções gravação: ${item.instrucoesGravacao}\nInstruções edição: ${item.instrucoesEdicao}\n\nHOOK\n${hookLines}\n\nCORPO\n${item.corpo}`;
}
export function batchText(batch: Batch) {
  return `${batch.title}\n${batch.produtoNome}\n${batch.especialistaHandle ? "@" + batch.especialistaHandle.replace(/^@/, "") : ""}\n\n${batch.items.map(creativeText).join("\n\n")}`;
}
function paragraphs(text: string) {
  return text.split("\n").map(
    (line) =>
      new Paragraph({
        children: [new TextRun(line)],
        spacing: { after: 100 },
      }),
  );
}
export function batchDocument(batch: Batch) {
  const heading = (text: string) =>
    new Paragraph({
      text,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 120 },
      keepNext: true,
    });
  const row = (label: string, text: string) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: label, bold: true })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 75, type: WidthType.PERCENTAGE },
          children: paragraphs(text),
        }),
      ],
    });
  const table = (rows: TableRow[]) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: Object.fromEntries(
        [
          "top",
          "bottom",
          "left",
          "right",
          "insideHorizontal",
          "insideVertical",
        ].map((k) => [
          k,
          { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" },
        ]),
      ),
      rows,
    });
  return new Document({
    creator: "Criativos Virais",
    styles: {
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          run: { color: "000000", size: 30, bold: true },
          paragraph: { spacing: { after: 220 } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          run: { color: "000000", size: 26, bold: true },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          run: { color: "000000", size: 23, bold: true },
        },
      ],
      default: {
        document: {
          run: { font: "Arial", size: 22 },
          paragraph: { spacing: { after: 120 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children: [
          new Paragraph({ text: batch.title, heading: HeadingLevel.TITLE }),
          new Paragraph({ text: batch.produtoNome, spacing: { after: 100 } }),
          new Paragraph({
            text: batch.especialistaHandle
              ? "@" + batch.especialistaHandle.replace(/^@/, "")
              : "",
          }),
          ...batch.items.flatMap((item, index) => [
            new Paragraph({
              text: item.creativeKey,
              heading: HeadingLevel.HEADING_1,
              pageBreakBefore: index > 0,
              keepNext: true,
            }),
            heading("INSTRUÇÕES"),
            table([
              row("Ideia", item.ideia),
              row("Formato", item.formato),
              row("Referência", item.referencia),
              row("Instruções gravação", item.instrucoesGravacao),
              row("Instruções edição", item.instrucoesEdicao),
            ]),
            heading("HOOK"),
            table(hooks(item).map((hook) => row(hook.label, hook.text))),
            heading("CORPO"),
            ...paragraphs(item.corpo),
          ]),
        ],
      },
    ],
  });
}
export function exportBatch(batch: Batch) {
  return Packer.toBuffer(batchDocument(batch));
}
