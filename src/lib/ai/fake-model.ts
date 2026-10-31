import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

// Deterministic stand-in for the text model, enabled only by AI_PROVIDER=fake outside
// production (src/lib/env.ts). It never touches the network and follows a fixed script:
// a message about the offer saves a demo context, a message asking for a "leva" generates
// two demo scripts, anything else gets a short reply. Structured calls (batch, quality
// review, item regeneration) are answered from the requested JSON schema.

type CallOptions = Parameters<MockLanguageModelV4["doGenerate"]>[0];
type PromptMessage = CallOptions["prompt"][number];
type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;

const label = "(IA de teste)";
const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};
const finished = (unified: "stop" | "tool-calls") => ({ unified, raw: "fake" });

export const demoContext = {
  produtoNome: "Método Rotina Leve",
  produto: "Curso online de organização de rotina para mães que trabalham fora",
  publico: "Mães de 28 a 45 anos com filhos pequenos e jornada de trabalho integral",
  transformacao: "Sair do caos diário para uma rotina previsível em 30 dias",
  mecanismo: "Blocos de 15 minutos planejados no domingo",
  ticketCents: "19700",
  tipoFunil: "Página de vendas direta",
  proximoPassoFunil: "Clicar no link e comprar na página de vendas",
  provasAutorizadas: ["Mais de 1.200 alunas formadas desde 2024"],
};

function demoItem(position: number) {
  return {
    ideia: `Roteiro de teste ${position}: a rotina de 15 minutos no domingo`,
    formato: "Fala direta para a câmera",
    referencia: "",
    instrucoes_gravacao: "",
    instrucoes_edicao: "",
    g1: "Você chega em casa e a semana já começou atrasada?",
    g2: "Quinze minutos no domingo mudaram a minha semana inteira.",
    g3: "O problema não é falta de tempo, é falta de bloco.",
    g4: "Sua agenda vive cheia e a semana não anda?",
    corpo:
      "Eu vivia apagando incêndio. Aí comecei a planejar a semana em blocos de 15 minutos no domingo. Mais de 1.200 alunas já fizeram o mesmo. Clique no link e conheça o Método Rotina Leve.",
    narrativa: "Dor da rotina caótica, virada com o bloco de 15 minutos, prova e convite.",
    awareness_entry: "problem_aware",
    awareness_exit: "product_aware",
    skeleton: "E1",
    hipotese: `Hipótese de teste ${position}: o gancho de dor da rotina prende mais que o de resultado.`,
    bloco_testado: "H",
    prova_usada: "Mais de 1.200 alunas formadas desde 2024",
    duracao_estimada: 45,
  };
}

function lastUserText(prompt: PromptMessage[]) {
  const message = prompt.findLast((entry) => entry.role === "user");
  if (!message || message.role !== "user") return "";
  return message.content.map((part) => (part.type === "text" ? part.text : "")).join("\n");
}

function untrustedValue(text: string, name: string): unknown {
  const match = text.match(new RegExp(`<UNTRUSTED_DATA label="${name}">\\n([\\s\\S]*?)\\n</UNTRUSTED_DATA>`));
  if (!match) return null;
  return JSON.parse(match[1]);
}

function structuredAnswer(options: CallOptions) {
  const format = options.responseFormat;
  const schema = format?.type === "json" ? format.schema : undefined;
  const properties = typeof schema === "object" && schema.properties ? schema.properties : {};
  const prompt = lastUserText(options.prompt);
  if ("items" in properties) {
    const quantity = Number(prompt.match(/exatamente (\d+) criativos/)?.[1] ?? 1);
    return { items: Array.from({ length: quantity }, (_, index) => demoItem(index + 1)) };
  }
  if ("checks" in properties) {
    const items = untrustedValue(prompt, "items");
    const count = Array.isArray(items) ? items.length : 0;
    return { checks: Array.from({ length: count }, (_, index) => ({ index, passed: true, issues: [] })) };
  }
  if ("ideia" in properties) return demoItem(1);
  throw new Error("Fake model has no answer for this structured request");
}

function textParts(text: string): StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "fake-text" },
    ...text.split(/(?<= )/).map((delta): StreamPart => ({ type: "text-delta", id: "fake-text", delta })),
    { type: "text-end", id: "fake-text" },
    { type: "finish", usage, finishReason: finished("stop") },
  ];
}

function toolCallParts(toolName: string, input: unknown): StreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId: `fake-${toolName}`, toolName, input: JSON.stringify(input) },
    { type: "finish", usage, finishReason: finished("tool-calls") },
  ];
}

function replyAfterTool(message: PromptMessage) {
  if (message.role !== "tool") return null;
  const result = message.content.find((part) => part.type === "tool-result");
  if (!result || result.type !== "tool-result") return null;
  const failed = result.output.type.startsWith("error");
  if (result.toolName === "generateBatch")
    return failed
      ? `${label} Não consegui gerar a leva. Confira a sua oferta e peça de novo.`
      : `${label} Comecei a gerar a leva. Ela aparece no cartão acima quando ficar pronta.`;
  if (result.toolName === "updateClientContext")
    return failed
      ? `${label} Não consegui salvar a sua oferta. Tente de novo.`
      : `${label} Anotei a sua oferta. Quando quiser, peça: gere uma leva.`;
  return `${label} Pronto.`;
}

function chatAnswer(options: CallOptions): StreamPart[] {
  const afterTool = replyAfterTool(options.prompt.at(-1)!);
  if (afterTool) return textParts(afterTool);
  const text = lastUserText(options.prompt);
  const tools = new Set((options.tools ?? []).map((entry) => entry.name));
  if (/\bleva\b/i.test(text) && tools.has("generateBatch"))
    return toolCallParts("generateBatch", { quantidade: 2, instrucoes: text.slice(0, 6000) });
  if (/\b(vendo|produto|oferta)\b/i.test(text) && tools.has("updateClientContext"))
    return toolCallParts("updateClientContext", demoContext);
  return textParts(`${label} Recebi a sua mensagem. Conte o que você vende ou peça: gere uma leva.`);
}

export function fakeLanguageModel() {
  return new MockLanguageModelV4({
    provider: "fake",
    modelId: "fake-text",
    doGenerate: async (options) => ({
      content: [{ type: "text", text: JSON.stringify(structuredAnswer(options)) }],
      finishReason: finished("stop"),
      usage,
      warnings: [],
    }),
    doStream: async (options) => ({
      stream: simulateReadableStream({ chunks: chatAnswer(options), chunkDelayInMs: 15 }),
    }),
  });
}
