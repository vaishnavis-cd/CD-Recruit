import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe, UseGuards, Req } from "@nestjs/common";
import { Request } from "express";
import { Throttle, SkipThrottle } from "@nestjs/throttler";
import { CodingService } from "./coding.service";
import { RunCodingDto, SubmitCodingDto, DraftCodingDto } from "./dto/coding.dto";
import { SessionOwnerGuard } from "../common/guards/session-owner.guard";

@Controller("coding")
export class CodingController {
  constructor(private readonly codingService: CodingService) {}

  @Post("run")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  @Throttle({ default: { limit: 20, ttl: 10000 } })
  async run(@Body() dto: RunCodingDto, @Req() req: Request) {
    return this.codingService.run(dto, req);
  }

  @Get("execution/:id")
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async getExecution(@Param("id", ParseUUIDPipe) id: string) {
    return this.codingService.getExecution(id);
  }

  @Post("submit")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  @Throttle({ default: { limit: 5, ttl: 10000 } })
  async submit(@Body() dto: SubmitCodingDto) {
    return this.codingService.submit(dto);
  }

  @Post("draft")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async draft(@Body() dto: DraftCodingDto) {
    return this.codingService.draft(dto);
  }
}
