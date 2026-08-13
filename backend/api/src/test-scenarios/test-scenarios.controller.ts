import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from "@nestjs/common";
import { TestScenariosService } from "./test-scenarios.service";
import { SubmitTestScenarioDto } from "./dto/test-scenarios.dto";
import { SessionOwnerGuard } from "../common/guards/session-owner.guard";

@Controller("test-scenarios")
@UseGuards(SessionOwnerGuard)
export class TestScenariosController {
  constructor(private readonly testScenariosService: TestScenariosService) {}

  @Post("submit")
  @HttpCode(HttpStatus.OK)
  async submit(@Body() dto: SubmitTestScenarioDto) {
    return this.testScenariosService.submit(dto);
  }
}
