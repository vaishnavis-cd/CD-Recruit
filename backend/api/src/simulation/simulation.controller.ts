import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common";
import { SimulationService } from "./simulation.service";
import { SessionLogService } from "./session-log.service";
import { PrismaService } from "@app/prisma/prisma.service";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { SessionOwnerGuard } from "../common/guards/session-owner.guard";
import { StaffRole } from "@cd-recruit/shared-types";
import { ScenarioOrchestratorService } from "./scenario-orchestrator.service";
import { TelemetryEventType } from "./simulation-telemetry.service";

@Controller("sessions")
export class SimulationController {
  constructor(
    private simulationService: SimulationService,
    private sessionLogService: SessionLogService,
    private scenarioOrchestrator: ScenarioOrchestratorService,
    private prisma: PrismaService,
  ) {}

  @Get(":id/simulation/scenario")
  getScenarioConfig(@Param("id") sessionId: string) {
    return this.simulationService.getSanitizedScenarioConfig(sessionId);
  }

  @Post(":id/simulation/initial-say")
  @UseGuards(SessionOwnerGuard)
  async saveInitialSay(
    @Param("id") sessionId: string,
    @Body() body: { text: string },
  ) {
    return this.simulationService.saveInitialSay(sessionId, body.text);
  }

  @Post(":id/simulation/telemetry")
  @UseGuards(SessionOwnerGuard)
  async recordTelemetry(
    @Param("id") sessionId: string,
    @Body() body: { type: TelemetryEventType; filepath?: string; metadata?: Record<string, any> },
  ) {
    return this.simulationService.recordTelemetry(sessionId, body);
  }

  @Post(":id/simulation/run-code")
  @UseGuards(SessionOwnerGuard)
  async runSimulationCode(
    @Param("id") sessionId: string,
    @Body() body: { code: string; language: "python" | "javascript"; testCases?: any[] },
  ) {
    return this.simulationService.runSimulationCode(sessionId, body);
  }

  @Get(":id/simulation/actions")
  @UseGuards(SessionOwnerGuard)
  async getCandidateActions(@Param("id") sessionId: string) {
    return this.simulationService.getCandidateActions(sessionId);
  }

  @Get(":id/simulation/inbox")
  @UseGuards(SessionOwnerGuard)
  getInbox(@Param("id") sessionId: string) {
    return this.simulationService.getInbox(sessionId);
  }

  @Post(":id/simulation/inbox/read")
  @UseGuards(SessionOwnerGuard)
  markInboxRead(@Param("id") sessionId: string) {
    return this.simulationService.markInboxRead(sessionId);
  }

  @Post(":id/simulation/email-reply")
  @UseGuards(SessionOwnerGuard)
  async saveEmailReply(
    @Param("id") sessionId: string,
    @Body() body: { messageId?: number; text?: string; replyText?: string },
  ) {
    const msgId = Number(body.messageId) || 101;
    const text = body.replyText || body.text || "";
    return this.simulationService.saveEmailReply(sessionId, msgId, text);
  }

  @Get(":sessionId/simulation/triggered-messages")
  async getTriggeredMessages(@Param("sessionId") sessionId: string) {
    return this.simulationService.getInbox(sessionId);
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
    return this.simulationService.submitSimulation(sessionId, response);
  }

  @Post(":id/simulation/execute")
  @UseGuards(SessionOwnerGuard)
  async executeTerminalCommand(
    @Param("id") sessionId: string,
    @Body() body: { command: string },
  ) {
    return this.simulationService.executeTerminalCommand(sessionId, body.command);
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
