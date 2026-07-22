import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@app/prisma/prisma.service";
import { SimulationTrigger } from "@cd-recruit/shared-types";

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
    });

    if (!session) {
      return [];
    }

    // Use session simulationSnapshot or bound drive question
    let content: any = session.simulationSnapshot;
    if (!content && session.drive?.questions[0]?.question) {
      content = session.drive.questions[0].question.content;
    }

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
