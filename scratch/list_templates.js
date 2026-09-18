require("dotenv").config({ path: require("path").join(__dirname, "..", "backend", "api", ".env") });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const templates = await prisma.roleTemplate.findMany({
    select: {
      id: true,
      roleName: true,
      department: true,
      category: true,
      experienceTier: true,
      version: true,
      isActive: true,
    },
    orderBy: { roleName: "asc" },
  });
  console.log(`Found ${templates.length} templates:`);
  templates.forEach(t => {
    console.log(`- [${t.department || 'CUSTOM'}] "${t.roleName}" | Tier: ${t.experienceTier || 'none'} | v${t.version} | active: ${t.isActive}`);
  });
  await prisma.$disconnect();
}

main().catch(console.error);
