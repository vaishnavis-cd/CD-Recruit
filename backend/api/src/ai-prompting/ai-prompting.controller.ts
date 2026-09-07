import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from "@nestjs/common";
import { AiPromptingService } from "./ai-prompting.service";
import { RunAiPromptDto, SubmitAiPromptDto } from "./dto/ai-prompting.dto";
import { SessionOwnerGuard } from "../common/guards/session-owner.guard";

@Controller("ai-prompting")
export class AiPromptingController {
  constructor(private readonly aiPromptingService: AiPromptingService) {}

  @Post("run")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async run(@Body() dto: RunAiPromptDto) {
    return this.aiPromptingService.run(dto);
  }

  @Post("submit")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionOwnerGuard)
  async submit(@Body() dto: SubmitAiPromptDto) {
    return this.aiPromptingService.submit(dto);
  }
}
