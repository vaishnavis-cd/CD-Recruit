import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://cdrecruit:cdrecruit123@localhost:5434/cdrecruit",
      },
    },
  });

  await prisma.$connect();
  console.log("Connected to PostgreSQL via PrismaClient.");

  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS coding_execution_session_id_idx ON coding_execution(session_id);");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS coding_execution_status_idx ON coding_execution(status);");
  await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS coding_execution_created_at_idx ON coding_execution(created_at);");

  const res: any[] = await prisma.$queryRawUnsafe("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'coding_execution'");
  console.log("\nActive indexes on coding_execution:");
  console.table(res);

  const explainSession: any[] = await prisma.$queryRawUnsafe("EXPLAIN ANALYZE SELECT * FROM coding_execution WHERE session_id = 'test-session'");
  console.log("\nEXPLAIN ANALYZE session_id:");
  console.log(explainSession.map((r) => r["QUERY PLAN"]).join("\n"));

  const explainStatus: any[] = await prisma.$queryRawUnsafe("EXPLAIN ANALYZE SELECT * FROM coding_execution WHERE status = 'PENDING'");
  console.log("\nEXPLAIN ANALYZE status:");
  console.log(explainStatus.map((r) => r["QUERY PLAN"]).join("\n"));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
