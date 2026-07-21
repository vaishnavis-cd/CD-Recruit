import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { InviteStatus } from "@prisma/client";

@Injectable()
export class DriveRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find active drive by ID with pre-fetched role template and questions.
   */
  async findDriveById(driveId: string) {
    return this.prisma.drive.findUnique({
      where: { id: driveId },
      include: {
        roleTemplate: true,
        createdBy: true,
        questions: true,
      },
    });
  }

  /**
   * Find pending candidate invites for a drive.
   */
  async findPendingInvitesForDrive(driveId: string) {
    return this.prisma.invite.findMany({
      where: {
        driveId,
        status: InviteStatus.PENDING,
      },
      include: {
        session: true,
      },
    });
  }

  /**
   * Count generated invites for a drive.
   */
  async countGeneratedInvites(driveId: string): Promise<number> {
    return this.prisma.invite.count({
      where: {
        driveId,
        isGenerated: true,
      },
    });
  }
}
