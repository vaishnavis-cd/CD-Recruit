import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ResponseService } from "./response.service";
import { DraftResponseDto, SubmitResponseDto } from "./dto/response.dto";

@Controller("sessions/:sessionId/responses")
export class ResponseController {
  constructor(private readonly responseService: ResponseService) {}

  @Post("draft")
  @HttpCode(HttpStatus.OK)
  async saveDraft(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body() dto: DraftResponseDto,
  ): Promise<{ ok: boolean }> {
    return this.responseService.saveDraft(sessionId, dto);
  }

  @Post("submit")
  @HttpCode(HttpStatus.OK)
  async submit(
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body() dto: SubmitResponseDto,
  ): Promise<{ ok: boolean; score?: number | null }> {
    return this.responseService.submitResponse(sessionId, dto);
  }
}
