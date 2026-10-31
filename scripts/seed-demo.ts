import "dotenv/config";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

// Demo operation for local review and screenshots. Runs only against a database whose
// name ends in _test, so it can never write fixtures into development or production data.
const demoEmail = "demo@criativosvirais.test";
const demoPassword = process.env.DEMO_PASSWORD || "demo-criativos-2026";
const batchKeys = ["L01-C01", "L01-C02", "L01-C03"];

const offer = {
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

const hooks = [
  ["Você chega em casa e a semana já começou atrasada?", "Quinze minutos no domingo mudaram a minha semana.", "O problema não é falta de tempo, é falta de bloco.", "Sua agenda vive cheia e a semana não anda?"],
  ["Eu tentei todo aplicativo de agenda. Nenhum funcionou.", "A agenda que funciona cabe num papel.", "Pare de planejar o dia. Planeje a semana.", "Três apps de agenda e nenhuma semana organizada."],
  ["Mãe que trabalha fora: isso é para você.", "Três blocos por dia, e a casa parou de mandar em mim.", "Por que a sua rotina quebra toda quarta-feira?", "O domingo que salvou a minha segunda."],
];

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}

function demoItem(position: number) {
  const [g1, g2, g3, g4] = hooks[position - 1];
  return {
    position,
    creativeKey: batchKeys[position - 1],
    ideia: `Roteiro demo ${position}: rotina em blocos de 15 minutos`,
    formato: "Fala direta para a câmera",
    g1,
    g2,
    g3,
    g4,
    corpo: "Eu vivia apagando incêndio. Comecei a planejar a semana em blocos de 15 minutos no domingo. Mais de 1.200 alunas já fizeram o mesmo. Clique no link e conheça o Método Rotina Leve.",
    narrativa: "Dor da rotina caótica, virada com o bloco de 15 minutos, prova e convite.",
    awarenessEntry: "problem_aware",
    awarenessExit: "product_aware",
    skeleton: "E1",
    hipotese: `Hipótese demo ${position}: o gancho de dor prende mais que o de resultado.`,
    blocoTestado: "H",
    provaUsada: offer.provasAutorizadas[0],
    duracaoEstimada: 45,
  };
}

function metricsCsv() {
  return [
    "utm_content,nome,campanha,gasto,impressoes,cliques,vendas,receita,lucro",
    "L01-C01,Roteiro demo 1,lancamento,450.00,38000,920,9,1773.00,1323.00",
    "L01-C02,Roteiro demo 2,lancamento,380.00,31000,610,4,788.00,408.00",
    "L01-C03,Roteiro demo 3,lancamento,410.00,35500,480,1,197.00,-213.00",
    "AD-ANTIGO-07,Depoimento antigo,perpetuo,300.00,22000,700,6,1182.00,882.00",
  ].join("\n");
}

async function main() {
  assert.ok(process.env.DATABASE_URL, "Set DATABASE_URL to a database whose name ends in _test.");
  assert.match(new URL(process.env.DATABASE_URL).pathname, /_test$/, "The seed only runs on a database whose name ends in _test.");
  const { db, pool } = await import("../src/db");
  const schema = await import("../src/db/schema");
  const { getAuth } = await import("../src/lib/auth");
  const { updateContext } = await import("../src/lib/context");
  const { parseCsv } = await import("../src/lib/connectors/csv");
  const { saveMetrics } = await import("../src/lib/connectors/persist");
  const { ingestEvent } = await import("../src/jobs/ingest-event");
  const { spDay, spDayBr } = await import("../src/lib/dates");
  try {
    const [existing] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, demoEmail));
    if (existing) {
      console.log(`Demo already seeded: ${demoEmail}. Nothing changed.`);
      return;
    }
    // Sign-up only accepts granted emails; the demo account grants itself first.
    await db.insert(schema.accessGrants).values({ email: demoEmail, note: "Conta de demonstração" }).onConflictDoNothing();
    const { user } = await getAuth().api.signUpEmail({ body: { name: "Operação Demo", email: demoEmail, password: demoPassword } });
    const [member] = await db.select({ tenantId: schema.tenantMembers.tenantId }).from(schema.tenantMembers).where(eq(schema.tenantMembers.userId, user.id));
    assert.ok(member, "Signup did not provision a tenant.");
    const tenantId = member.tenantId;
    await updateContext(tenantId, offer);

    const [conversation] = await db.insert(schema.conversations).values({ tenantId, title: "Leva demo da operação" }).returning();
    const [batch] = await db.insert(schema.batches).values({
      tenantId,
      conversationId: conversation.id,
      title: `Leva 01 · ${offer.produtoNome} · ${spDayBr(daysAgo(8))}`,
      produtoNome: offer.produtoNome,
      roundNumber: 1,
    }).returning();
    const items = [1, 2, 3].map(demoItem);
    await db.insert(schema.batchItems).values(items.map((item) => ({ tenantId, batchId: batch.id, ...item })));
    await db.insert(schema.creatives).values(items.map((item) => ({ tenantId, creativeKey: item.creativeKey, name: item.ideia, source: "generated" })));

    const period = { from: spDay(daysAgo(7)), to: spDay(daysAgo(1)) };
    await saveMetrics(tenantId, parseCsv({
      ...period,
      csv: metricsCsv(),
      decimal: "dot",
      moneyUnit: "major",
      mapping: {
        creative_key: "utm_content", creative_name: "nome", campaign_key: "campanha", spend_cents: "gasto",
        impressions: "impressoes", clicks: "cliques", approved_sales: "vendas", revenue_cents: "receita", profit_cents: "lucro",
      },
    }));

    const sales = [
      { eventId: "demo-order-1-paid", status: "approved", revenue: 19700n, key: "L01-C01" },
      { eventId: "demo-order-2-paid", status: "approved", revenue: 19700n, key: "L01-C01" },
      { eventId: "demo-order-3-paid", status: "approved", revenue: 19700n, key: "L01-C02" },
      { eventId: "demo-order-3-refund", status: "refunded", revenue: 19700n, key: "L01-C02" },
    ] as const;
    for (const sale of sales) {
      const [event] = await db.insert(schema.salesEvents).values({
        tenantId,
        eventId: sale.eventId,
        occurredAt: daysAgo(1),
        status: sale.status,
        currency: "BRL",
        revenueCents: sale.revenue,
        profitCents: sale.revenue - 5000n,
        creativeKey: sale.key,
        utmCampaign: "lancamento",
        utmContent: sale.key,
        source: "webhook",
        raw: { demo: true },
      }).returning({ id: schema.salesEvents.id });
      await ingestEvent({ tenantId, eventId: event.id });
    }
    console.log(`Demo seeded: sign in as ${demoEmail} (password from DEMO_PASSWORD or the default in scripts/seed-demo.ts).`);
    console.log(`Batch L01 with ${items.length} scripts, CSV metrics ${period.from}..${period.to} and ${sales.length} webhook sales.`);
  } finally {
    await pool.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
