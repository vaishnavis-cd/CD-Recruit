import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { CodingService } from "./coding.service";
import { RunCodingDto, SubmitCodingDto, DraftCodingDto } from "./dto/coding.dto";
import { SessionOwnerGuard } from "../common/guards/session-owner.guard";

@Controller("coding")
export class CodingController {
  constructor(private readonly codingService: CodingService) {}

  @Post("run")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async run(@Body() dto: RunCodingDto) {
    return this.codingService.run(dto);
  }

  @Get("execution/:id")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async getExecution(@Param("id", ParseUUIDPipe) id: string) {
    return this.codingService.getExecution(id);
  }

  @Post("submit")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
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
