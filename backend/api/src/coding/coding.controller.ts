import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe } from "@nestjs/common";
import { CodingService } from "./coding.service";
import { RunCodingDto, SubmitCodingDto, DraftCodingDto } from "./dto/coding.dto";

@Controller("coding")
export class CodingController {
  constructor(private readonly codingService: CodingService) {}

  @Post("run")
  @HttpCode(HttpStatus.OK)
  async run(@Body() dto: RunCodingDto) {
    return this.codingService.run(dto);
  }

  @Get("execution/:id")
  @HttpCode(HttpStatus.OK)
  async getExecution(@Param("id", ParseUUIDPipe) id: string) {
    return this.codingService.getExecution(id);
  }

  @Post("submit")
  @HttpCode(HttpStatus.OK)
  async submit(@Body() dto: SubmitCodingDto) {
    return this.codingService.submit(dto);
  }

  @Post("draft")
  @HttpCode(HttpStatus.OK)
  async draft(@Body() dto: DraftCodingDto) {
    return this.codingService.draft(dto);
  }
}
