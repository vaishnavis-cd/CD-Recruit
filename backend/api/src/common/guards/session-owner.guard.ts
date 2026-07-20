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

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException("Session not found.");
    }

    if (["SUBMITTED", "CLOSED", "ABANDONED"].includes(session.status)) {
      throw new ForbiddenException(`Session is already ${session.status.toLowerCase()}.`);
    }

    // Attach to request
    request.session = session;
    return true;
  }
}
