import { batchItemSchema } from "./schemas";

// Counted from the schema so the instruction never asks for a different number of hooks than
// the output must contain.
const hookCount = Object.keys(batchItemSchema.shape).filter((key) => /^g\d+$/.test(key)).length;

/**
 * Builds the fixed instruction sent with every batch generation.
 *
 * @param quantity - Number of scripts the batch must contain.
 * @returns The instruction text, before the client's own request.
 */
export function batchRequest(quantity: number) {
  return `Crie exatamente ${quantity} criativos no template. instrucoes_gravacao e instrucoes_edicao devem ser vazias salvo necessidade real. ${hookCount} hooks (g1 a g${hookCount}) compatíveis com o mesmo corpo completo falado com CTA. Use somente provas autorizadas. Cada item é uma hipótese explícita.`;
}
