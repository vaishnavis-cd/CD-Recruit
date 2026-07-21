import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { StaffRole, ModuleType } from "@cd-recruit/shared-types";
import { QuestionService } from "./question.service";
import { CreateQuestionDto, UpdateQuestionDto, ListQuestionsQueryDto } from "../common/dto/question.dto";

@Controller("admin/questions")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(StaffRole.RECRUITER, StaffRole.ADMIN)
export class QuestionController {
  constructor(private readonly questionService: QuestionService) {}

  @Get()
  async list(@Query() query: ListQuestionsQueryDto) {
    return this.questionService.list(query);
  }

  @Post()
  async create(@Body() dto: CreateQuestionDto) {
    return this.questionService.create(dto);
  }

  @Get(":questionId")
  async findOne(@Param("questionId", ParseUUIDPipe) questionId: string) {
    return this.questionService.findOne(questionId);
  }

  @Patch(":questionId")
  async update(
    @Param("questionId", ParseUUIDPipe) questionId: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questionService.update(questionId, dto);
  }

  @Delete(":questionId")
  async remove(@Param("questionId", ParseUUIDPipe) questionId: string) {
    return this.questionService.remove(questionId);
  }

  @Post("bulk")
  @HttpCode(HttpStatus.OK)
  async bulkUpload(
    @Body() body: { moduleType: ModuleType; questions: any[] },
  ) {
    return this.questionService.bulkUpload(body.moduleType, body.questions);
  }

  @Get(":questionId/stats")
  async getStats(@Param("questionId", ParseUUIDPipe) questionId: string) {
    return this.questionService.getStats(questionId);
  }
}
