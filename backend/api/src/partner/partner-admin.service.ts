import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePartnerDto, UpdatePartnerDto } from "./dto/partner-admin.dto";
import { hashApiKey } from "../common/utils/api-key.util";
import * as crypto from "crypto";

@Injectable()
export class PartnerAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.partner.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        callbackUrl: true,
        rateLimit: true,
        isRevoked: true,
        createdAt: true,
      },
    });
  }

  async create(dto: CreatePartnerDto, actorStaffId: string) {
    const rawApiKey = `pk_live_${crypto.randomBytes(24).toString("hex")}`;
    const hashedApiKey = hashApiKey(rawApiKey);

    const partner = await this.prisma.partner.create({
      data: {
        name: dto.name.trim(),
        hashedApiKey,
        callbackUrl: dto.callbackUrl || null,
        rateLimit: dto.rateLimit || 100,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        staffId: actorStaffId,
        action: "PARTNER_CREATED",
        entityType: "Partner",
        entityId: partner.id,
        metadata: {
          partnerName: partner.name,
          rateLimit: partner.rateLimit,
          callbackUrl: partner.callbackUrl,
        },
      },
    });

    return {
      id: partner.id,
      name: partner.name,
      apiKey: rawApiKey,
      callbackUrl: partner.callbackUrl,
      rateLimit: partner.rateLimit,
      isRevoked: partner.isRevoked,
      createdAt: partner.createdAt,
    };
  }

  async rotateKey(partnerId: string, actorStaffId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw new NotFoundException(`Partner not found with ID ${partnerId}`);
    }

    const newRawApiKey = `pk_live_${crypto.randomBytes(24).toString("hex")}`;
    const hashedApiKey = hashApiKey(newRawApiKey);

    const updated = await this.prisma.partner.update({
      where: { id: partnerId },
      data: {
        hashedApiKey,
        isRevoked: false,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        staffId: actorStaffId,
        action: "PARTNER_API_KEY_ROTATED",
        entityType: "Partner",
        entityId: updated.id,
        metadata: {
          partnerName: updated.name,
          rotatedAt: new Date().toISOString(),
        },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      apiKey: newRawApiKey,
      callbackUrl: updated.callbackUrl,
      rateLimit: updated.rateLimit,
      isRevoked: updated.isRevoked,
      createdAt: updated.createdAt,
    };
  }

  async update(partnerId: string, dto: UpdatePartnerDto, actorStaffId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw new NotFoundException(`Partner not found with ID ${partnerId}`);
    }

    const updated = await this.prisma.partner.update({
      where: { id: partnerId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.callbackUrl !== undefined ? { callbackUrl: dto.callbackUrl } : {}),
        ...(dto.rateLimit !== undefined ? { rateLimit: dto.rateLimit } : {}),
        ...(dto.isRevoked !== undefined ? { isRevoked: dto.isRevoked } : {}),
      },
      select: {
        id: true,
        name: true,
        callbackUrl: true,
        rateLimit: true,
        isRevoked: true,
        createdAt: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        staffId: actorStaffId,
        action: "PARTNER_UPDATED",
        entityType: "Partner",
        entityId: updated.id,
        metadata: { dto: dto as any },
      },
    });

    return updated;
  }

  async revoke(partnerId: string, actorStaffId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      throw new NotFoundException(`Partner not found with ID ${partnerId}`);
    }

    const updated = await this.prisma.partner.update({
      where: { id: partnerId },
      data: { isRevoked: true },
      select: {
        id: true,
        name: true,
        callbackUrl: true,
        rateLimit: true,
        isRevoked: true,
        createdAt: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        staffId: actorStaffId,
        action: "PARTNER_REVOKED",
        entityType: "Partner",
        entityId: updated.id,
        metadata: {
          partnerName: updated.name,
          revokedAt: new Date().toISOString(),
        },
      },
    });

    return updated;
  }
}
