import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from "@nestjs/common";
import { SqlService } from "./sql.service";
import { RunSqlDto, SubmitSqlDto, DraftSqlDto } from "./dto/sql.dto";
import { SessionOwnerGuard } from "../common/guards/session-owner.guard";

@Controller("sql")
@UseGuards(SessionOwnerGuard)
export class SqlController {
  constructor(private readonly sqlService: SqlService) {}

  @Post("run")
  @HttpCode(HttpStatus.OK)
  async run(@Body() dto: RunSqlDto) {
    return this.sqlService.run(dto);
  }

  @Post("submit")
  @HttpCode(HttpStatus.OK)
  async submit(@Body() dto: SubmitSqlDto) {
    return this.sqlService.submit(dto);
  }

  @Post("draft")
  @HttpCode(HttpStatus.OK)
  async draft(@Body() dto: DraftSqlDto) {
    return this.sqlService.draft(dto);
  }
}
