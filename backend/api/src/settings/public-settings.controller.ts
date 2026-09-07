import { Controller, Get } from "@nestjs/common";
import { SettingsService } from "./settings.service";

@Controller("settings")
export class PublicSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("public-proctoring")
  async getPublicProctoringConfig() {
    return this.settingsService.getPublicProctoringConfig();
  }

  @Get("time-matrix")
  async getTimeMatrix() {
    return this.settingsService.getTimeMatrixConfig();
  }

  @Get("seniority-ratios")
  async getSeniorityRatios() {
    return this.settingsService.getSeniorityRatiosConfig();
  }
}
