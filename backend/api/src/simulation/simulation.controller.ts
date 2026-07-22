import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common";
import { SimulationService } from "./simulation.service";
import { SessionLogService } from "./session-log.service";
import { PrismaService } from "@app/prisma/prisma.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { SessionOwnerGuard } from "../common/guards/session-owner.guard";
import { StaffRole } from "@cd-recruit/shared-types";

@Controller("sessions")
export class SimulationController {
  constructor(
    private simulationService: SimulationService,
    private sessionLogService: SessionLogService,
    private prisma: PrismaService,
  ) {}

  @Get("admin/sessions")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.ADMIN, StaffRole.RECRUITER)
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

  @Post("mock-create")
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

  @Post(":id/simulation/start")
  @UseGuards(SessionOwnerGuard)
  async startSimulation(@Param("id") sessionId: string) {
    return this.simulationService.startSimulation(sessionId);
  }

  @Get(":id/simulation/current")
  @UseGuards(SessionOwnerGuard)
  async getCurrentEvent(@Param("id") sessionId: string) {
    return this.simulationService.getCurrentEvent(sessionId);
  }

  @Post(":id/simulation/state")
  @UseGuards(SessionOwnerGuard)
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

  @Post(":id/simulation/submit")
  @UseGuards(SessionOwnerGuard)
  async submitEvent(@Param("id") sessionId: string, @Body() response: any) {
    return this.simulationService.submitEvent(sessionId, response);
  }

  @Post(":id/simulation/skip")
  @UseGuards(SessionOwnerGuard)
  async skipEvent(@Param("id") sessionId: string) {
    return this.simulationService.skipEvent(sessionId);
  }

  @Get(":id/simulation/summary")
  @UseGuards(SessionOwnerGuard)
  async getSessionSummary(@Param("id") sessionId: string) {
    return this.simulationService.getSessionSummary(sessionId);
  }

  @Get(":id/simulation/timeline")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.ADMIN, StaffRole.RECRUITER)
  async getRecruiterTimeline(@Param("id") sessionId: string) {
    return this.sessionLogService.getTimeline(sessionId);
  }

  @Get(":id/simulation/logs")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.ADMIN, StaffRole.RECRUITER)
  async getSessionLogs(@Param("id") sessionId: string) {
    return this.sessionLogService.getSession(sessionId);
  }
}
