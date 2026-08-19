import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@app/prisma/prisma.service";
import { SimulationTrigger } from "@cd-recruit/shared-types";
<<<<<<< HEAD
import { DriveShufflerService } from "../drive/drive-shuffler.service";
import { getScenarioById } from "./scenarios";
=======
>>>>>>> origin/dev-phase2

export interface ActiveSimulationMessage {
  id: string;
  type: "email" | "slack" | "ticket";
  from: string;
  channel?: string;
  subject?: string;
  body: string;
  timestamp: string;
  read: boolean;
  timeOffsetSeconds: number;
}

@Injectable()
export class ScenarioOrchestratorService {
  private readonly logger = new Logger(ScenarioOrchestratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates deterministic scenario trigger rules for a session.
   * Returns all triggered in-fiction messages up to the current session elapsed time.
   */
  async getTriggeredMessages(sessionId: string): Promise<ActiveSimulationMessage[]> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
<<<<<<< HEAD
=======
      include: {
        drive: {
          include: {
            questions: {
              where: { moduleType: "SIMULATION" },
              include: { question: true },
            },
          },
        },
      },
>>>>>>> origin/dev-phase2
    });

    if (!session) {
      return [];
    }

<<<<<<< HEAD
    // Resolve scenario content
    let content: any = null;
    const snapshot = session.simulationSnapshot as any;
    if (snapshot?.questionId) {
      const question = await this.prisma.question.findUnique({
        where: { id: snapshot.questionId }
      });
      if (question && question.content) {
        content = question.content;
      }
    }

    if (!content && session.driveId) {
      const driveQuestions = await this.prisma.driveQuestion.findMany({
        where: { driveId: session.driveId },
        include: { question: true },
        orderBy: [
          { moduleType: "asc" },
          { question: { id: "asc" } },
        ],
      });

      if (driveQuestions && driveQuestions.length > 0) {
        const driveShuffler = new DriveShufflerService();
        const shuffled = driveShuffler.shuffleQuestionsForCandidate(
          driveQuestions as any,
          session.candidateId,
          session.driveId
        );

        const selectedSimQuestion = shuffled.find((q: any) => q.moduleType === "SIMULATION");
        if (selectedSimQuestion) {
          const matchingDq = driveQuestions.find((dq) => dq.questionId === selectedSimQuestion.questionId);
          const rawQ = matchingDq?.question;
          if (rawQ) {
            content = rawQ.content;
          }
        }
      }
    }

    // Resolve scenario config config structure
    const scId = content?.id || content?.title || "";
    const scenarioConfig = getScenarioById(scId);

=======
    // Use session simulationSnapshot or bound drive question
    let content: any = session.simulationSnapshot;
    if (!content && session.drive?.questions[0]?.question) {
      content = session.drive.questions[0].question.content;
    }

>>>>>>> origin/dev-phase2
    if (!content || !Array.isArray(content.triggers)) {
      return [];
    }

    // Calculate elapsed time in seconds
    const startTime = session.actualStartAt || session.startedAt || new Date();
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startTime.getTime()) / 1000));

    const triggers: SimulationTrigger[] = content.triggers;

    // Filter triggered messages based on deterministic criteria
    const activeMessages: ActiveSimulationMessage[] = [];

    for (let idx = 0; idx < triggers.length; idx++) {
      const tr = triggers[idx];
      const timeOffset = tr.timeOffsetSeconds ?? idx * 120; // default 2-min intervals if unconfigured

      // Trigger condition: time-elapsed offset or initial message
      if (elapsedSeconds >= timeOffset) {
        const messageTime = new Date(startTime.getTime() + timeOffset * 1000);
        activeMessages.push({
          id: tr.id || `trg-${idx + 1}`,
          type: tr.type || "slack",
          from: tr.from || "Engineering Lead",
          channel: tr.channel || "#dev-team",
          subject: tr.subject,
          body: tr.body,
          timestamp: messageTime.toISOString(),
          read: false,
          timeOffsetSeconds: timeOffset,
        });
      }
    }

    return activeMessages;
  }
}
