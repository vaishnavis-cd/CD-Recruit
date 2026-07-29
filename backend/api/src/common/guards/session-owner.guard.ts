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
    });

    if (!session) {
      const invite = await this.prisma.invite.findFirst({
        where: { OR: [{ token: sessionId }, { id: sessionId }] },
        include: { session: true },
      });
      if (invite?.session) {
        session = invite.session;
      }
    }

    if (!session) {
      throw new NotFoundException("Session not found.");
    }

    if (["SUBMITTED", "CLOSED", "ABANDONED"].includes(session.status)) {
      throw new ForbiddenException(`Session is already ${session.status.toLowerCase()}.`);
    }

    if (session.deadlineAt && new Date() > session.deadlineAt) {
      throw new ForbiddenException("Assessment session has expired (past deadline).");
    }

    // Attach to request
    request.session = session;
    return true;
  }
}
