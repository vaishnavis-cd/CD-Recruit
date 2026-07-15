import { Controller, Get, Post, Body, Param } from "@nestjs/common";
import { SimulationService } from "./simulation.service";
import { SessionLogService } from "./session-log.service";
import { PrismaService } from "../common/prisma.service";

@Controller()
export class SimulationController {
  constructor(
    private simulationService: SimulationService,
    private sessionLogService: SessionLogService,
    private prisma: PrismaService,
  ) {}

  @Get("admin/sessions")
  async listSessions() {
    return this.prisma.session.findMany({
      include: {
        candidate: true,
        roleTemplate: true,
        score: true,
      },
      orderBy: { startedAt: "desc" },
    });
  }

  @Post("sessions/mock-create")
  async createMockSession(
    @Body() body: { role: string; name: string; email: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Get or create candidate
      let candidate = await tx.candidate.findUnique({
        where: { email: body.email },
      });
      if (!candidate) {
        candidate = await tx.candidate.create({
          data: {
            email: body.email,
            name: body.name,
          },
        });
      }

      // 2. Get or create RoleTemplate
      let roleTemplate = await tx.roleTemplate.findFirst({
        where: { roleName: body.role },
      });
      if (!roleTemplate) {
        roleTemplate = await tx.roleTemplate.create({
          data: {
            roleName: body.role,
            weightingPreset: {
              MCQ: 0.15,
              SQL: 0.2,
              CODING: 0.3,
              AI_PROMPTING: 0.2,
              SIMULATION: 0.15,
            },
            durationMinutes: 90,
          },
        });
      }

      // 3. Get or create a Drive for this mock session
      let drive = await tx.drive.findFirst({
        where: { roleTemplateId: roleTemplate.id },
      });
      if (!drive) {
        drive = await tx.drive.create({
          data: {
            name: `Mock Drive for ${roleTemplate.roleName}`,
            roleTemplateId: roleTemplate.id,
            moduleConfig: {},
            createdById: "SYSTEM", // Placeholder ID or real system staff ID
          },
        });
      }

      // Find if there's any simulation question seeded
      const seededQuestion = await tx.question.findFirst({
        where: { moduleType: "SIMULATION" },
      });

      let simQuestion = seededQuestion;
      if (!simQuestion) {
        simQuestion = await tx.question.create({
          data: {
            moduleType: "SIMULATION",
            content: {
              title: "Default Simulation Outage",
              description: "Workspace simulation outage scenario.",
              triggers: [],
              rubric: [],
            },
          },
        });
      }

      // Link Question to Drive if not already linked
      let driveQuestion = await tx.driveQuestion.findUnique({
        where: {
          driveId_questionId: {
            driveId: drive.id,
            questionId: simQuestion.id,
          },
        },
      });
      if (!driveQuestion) {
        driveQuestion = await tx.driveQuestion.create({
          data: {
            driveId: drive.id,
            questionId: simQuestion.id,
            moduleType: "SIMULATION",
          },
        });
      }

      // 4. Create Session
      const session = await tx.session.create({
        data: {
          candidateId: candidate.id,
          roleTemplateId: roleTemplate.id,
          driveId: drive.id,
          cvMode: "FULL",
          status: "IN_PROGRESS",
          startedAt: new Date(),
          deadlineAt: new Date(Date.now() + 90 * 60000),
        },
      });

      return session;
    });
  }

  @Post("sessions/:id/simulation/start")
  async startSimulation(@Param("id") sessionId: string) {
    return this.simulationService.startSimulation(sessionId);
  }

  @Get("sessions/:id/simulation/current")
  async getCurrentEvent(@Param("id") sessionId: string) {
    return this.simulationService.getCurrentEvent(sessionId);
  }

  @Post("sessions/:id/simulation/state")
  async logEventState(
    @Param("id") sessionId: string,
    @Body() body: { state: string; action: string; payload?: any },
  ) {
    await this.simulationService.logEventState(
      sessionId,
      body.state,
      body.action,
      body.payload,
    );
    return { ok: true };
  }

  @Post("sessions/:id/simulation/submit")
  async submitEvent(@Param("id") sessionId: string, @Body() response: any) {
    return this.simulationService.submitEvent(sessionId, response);
  }

  @Post("sessions/:id/simulation/skip")
  async skipEvent(@Param("id") sessionId: string) {
    return this.simulationService.skipEvent(sessionId);
  }

  @Get("sessions/:id/simulation/summary")
  async getSessionSummary(@Param("id") sessionId: string) {
    return this.simulationService.getSessionSummary(sessionId);
  }

  @Get("sessions/:id/simulation/timeline")
  async getRecruiterTimeline(@Param("id") sessionId: string) {
    return this.sessionLogService.getTimeline(sessionId);
  }

  @Get("sessions/:id/simulation/logs")
  async getSessionLogs(@Param("id") sessionId: string) {
    return this.sessionLogService.getSession(sessionId);
  }
}
