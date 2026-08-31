import { CanActivate, ExecutionContext, Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class SessionOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const sessionId = request.params.sessionId || request.params.id || request.body.sessionId || request.query.sessionId;

    if (!sessionId) {
      throw new ForbiddenException("Session ID is required.");
    }

    let session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { drive: true },
    });

    if (!session) {
      const invite = await this.prisma.invite.findFirst({
        where: { OR: [{ token: sessionId }, { id: sessionId }] },
        include: { session: { include: { drive: true } } },
      });
      if (invite?.session) {
        session = invite.session as any;
      }
    }

    if (!session) {
      const execution = await this.prisma.codingExecution.findUnique({
        where: { id: sessionId },
        include: { session: { include: { drive: true } } },
      });
      if (execution?.session) {
        session = execution.session as any;
      }
    }

    if (!session) {
      const isDemoOrDev =
        sessionId === "demo-session" ||
        sessionId.startsWith("demo-") ||
        process.env.ALLOW_SYNTHETIC_SESSIONS === "true";

      if (isDemoOrDev) {
        try {
          let roleTemplate = await this.prisma.roleTemplate.findFirst();
          if (!roleTemplate) {
            roleTemplate = await this.prisma.roleTemplate.create({
              data: { roleName: "Software Engineer", durationMinutes: 60, weightingPreset: {} },
            });
          }
          let candidate = await this.prisma.candidate.findFirst({
            where: { email: `${sessionId}@example.com` },
          });
          if (!candidate) {
            candidate = await this.prisma.candidate.create({
              data: {
                email: `${sessionId}@example.com`,
                name: sessionId === "demo-session" ? "Demo Candidate" : `Candidate-${sessionId.slice(0, 8)}`,
              },
            });
          }
          let drive = await this.prisma.drive.findFirst();
          session = (await this.prisma.session.upsert({
            where: { id: sessionId },
            update: {},
            create: {
              id: sessionId,
              candidate: { connect: { id: candidate.id } },
              roleTemplate: { connect: { id: roleTemplate.id } },
              drive: drive?.id ? { connect: { id: drive.id } } : undefined,
              cvMode: "FACE_ONLY" as any,
              status: "IN_PROGRESS" as any,
            },
            include: { drive: true },
          })) as any;
        } catch {
          session = (await this.prisma.session.findUnique({
            where: { id: sessionId },
            include: { drive: true },
          })) as any;
        }
      }
    }

    if (!session) {
      throw new NotFoundException("Session not found.");
    }

    if (["SUBMITTED", "CLOSED", "ABANDONED"].includes(session.status)) {
      throw new ForbiddenException(`Session is already ${session.status.toLowerCase()}.`);
    }

    const now = new Date();
    if (session.deadlineAt && now > session.deadlineAt) {
      if (session.drive?.scheduleEnd && now <= session.drive.scheduleEnd && session.drive.status !== "CLOSED") {
        await this.prisma.session.update({
          where: { id: session.id },
          data: { deadlineAt: session.drive.scheduleEnd },
        });
        session.deadlineAt = session.drive.scheduleEnd;
      } else {
        throw new ForbiddenException("Assessment session has expired (past deadline).");
      }
    }

    // Attach to request
    request.session = session;
    return true;
  }
}
