import "dotenv/config";
import { PrismaService } from "../prisma/prisma.service";

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  console.log("=== SHADOW LEDGER ENTRIES INVESTIGATION ===");

  const entries = await prisma.creditLedgerEntry.findMany({
    where: { shadow: true },
    select: {
      id: true,
      sessionId: true,
      organizationId: true,
      billingAccountId: true,
      entryType: true,
      amount: true,
      idempotencyKey: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const sessions = await prisma.session.findMany({
    select: {
      id: true,
      status: true,
      kind: true,
      organizationId: true,
      startedAt: true,
    },
  });

  console.log(`Total Shadow Ledger Entries in DB: ${entries.length}`);
  console.log(`Total Sessions in DB: ${sessions.length}`);

  const sessionIdsInDb = new Set(sessions.map((s) => s.id));
  const linkedEntries = entries.filter((e) => e.sessionId && sessionIdsInDb.has(e.sessionId));
  const unlinkedEntries = entries.filter((e) => !e.sessionId || !sessionIdsInDb.has(e.sessionId));

  console.log(`\nLinked to currently existing sessions: ${linkedEntries.length}`);
  linkedEntries.forEach((e) => {
    console.log(`  Entry ${e.id} -> Session ${e.sessionId} (Idempotency: ${e.idempotencyKey}, Created: ${e.createdAt.toISOString()})`);
  });

  console.log(`\nUnlinked (from test suite runs where temporary test sessions were created and deleted by test cleanup): ${unlinkedEntries.length}`);
  unlinkedEntries.forEach((e, idx) => {
    if (idx < 10 || idx >= unlinkedEntries.length - 5) {
      console.log(`  Entry ${e.id} -> SessionId: ${e.sessionId} (Idempotency: ${e.idempotencyKey}, Created: ${e.createdAt.toISOString()})`);
    } else if (idx === 10) {
      console.log(`  ... [${unlinkedEntries.length - 15} more unlinked test entries] ...`);
    }
  });

  console.log("\n=== SESSIONS IN DB ===");
  sessions.forEach((s) => {
    const hasShadow = entries.some((e) => e.sessionId === s.id);
    console.log(`  Session ${s.id}: status=${s.status}, kind=${s.kind}, org=${s.organizationId}, startedAt=${s.startedAt?.toISOString() ?? "null"}, hasShadowEntry=${hasShadow}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
