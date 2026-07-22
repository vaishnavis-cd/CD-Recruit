import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from "@nestjs/common";
import { McqService } from "./mcq.service";
import { SubmitMcqDto, DraftMcqDto } from "./dto/mcq.dto";
import { SessionOwnerGuard } from "../common/guards/session-owner.guard";

@Controller("mcq")
@UseGuards(SessionOwnerGuard)
export class McqController {
  constructor(private readonly mcqService: McqService) {}

  @Post("submit")
  @HttpCode(HttpStatus.OK)
  async submit(@Body() dto: SubmitMcqDto) {
    return this.mcqService.submit(dto);
  }

  @Post("draft")
  @HttpCode(HttpStatus.OK)
  async draft(@Body() dto: DraftMcqDto) {
    return this.mcqService.draft(dto);
  }
}
