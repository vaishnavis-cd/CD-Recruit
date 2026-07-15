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
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { UUIDValidationPipe } from "../common/pipes/uuid-validation.pipe";
import { StaffRole, ModuleType } from "@cd-recruit/shared-types";
import { QuestionService } from "./question.service";
import { CreateQuestionDto, UpdateQuestionDto, ListQuestionsQueryDto } from "../common/dto/question.dto";

@Controller("admin/questions")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(StaffRole.RECRUITER, StaffRole.ADMIN)
export class QuestionController {
  constructor(private readonly questionService: QuestionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateQuestionDto) {
    return this.questionService.create(dto);
  }

  @Get()
  async list(@Query() query: ListQuestionsQueryDto) {
    return this.questionService.list(query);
  }

  @Get(":questionId")
  async findOne(@Param("questionId", UUIDValidationPipe) questionId: string) {
    return this.questionService.findOne(questionId);
  }

  @Patch(":questionId")
  async update(
    @Param("questionId", UUIDValidationPipe) questionId: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questionService.update(questionId, dto);
  }

  @Delete(":questionId")
  async remove(@Param("questionId", UUIDValidationPipe) questionId: string) {
    return this.questionService.remove(questionId);
  }

  @Post("bulk-upload")
  @HttpCode(HttpStatus.CREATED)
  async bulkUpload(
    @Body("moduleType") moduleType: ModuleType,
    @Body("questions") questions: any[],
  ) {
    return this.questionService.bulkUpload(moduleType, questions);
  }

  @Get(":questionId/stats")
  async getStats(@Param("questionId", UUIDValidationPipe) questionId: string) {
    return this.questionService.getStats(questionId);
  }
}
