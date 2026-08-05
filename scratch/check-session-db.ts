import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const sessions = await prisma.candidateSession.findMany({
    include: {
      drive: true,
      moduleResponses: {
        include: {
          question: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  console.log(`Found ${sessions.length} recent candidate sessions:`)
  for (const s of sessions) {
    console.log(`\nSession ID: ${s.id}`)
    console.log(`Candidate ID: ${s.candidateId}`)
    console.log(`Drive ID: ${s.driveId}, Drive Name: ${s.drive?.name}`)
    console.log(`Drive moduleConfig:`, JSON.stringify(s.drive?.moduleConfig))
    console.log(`Module Responses Count: ${s.moduleResponses.length}`)
    for (const mr of s.moduleResponses) {
      console.log(`  Response ID: ${mr.id}`)
      console.log(`  Question ID: ${mr.questionId}`)
      console.log(`  Response question.moduleType: ${mr.question?.moduleType}`)
      console.log(`  Response question.tags:`, mr.question?.tags)
      console.log(`  Response payload moduleType:`, (mr.responsePayload as any)?.moduleType)
      console.log(`  Response payload keys:`, Object.keys((mr.responsePayload as any) || {}))
      console.log(`  Prompt snippet:`, String((mr.question?.content as any)?.prompt || '').substring(0, 100))
    }
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
