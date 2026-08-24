import { Controller, Get, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { StaffRole } from "@cd-recruit/shared-types";

@Controller("admin/drives/sample-csv")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(StaffRole.RECRUITER, StaffRole.ADMIN)
export class SampleCsvController {
  @Get("questions")
  getSampleQuestionsCsv(@Res() res: Response) {
    const csvContent = `moduleType,title,description,difficulty,targetLevel,preferredLanguage,options,correctAnswer
MCQ,Array Complexity,What is the worst case time complexity of accessing an array element by index?,EASY,0-1,javascript,"O(1)|O(n)|O(log n)|O(n^2)",O(1)
MCQ,SQL Joins,Which join returns all matching rows from both tables?,MEDIUM,2-5,sql,"INNER JOIN|LEFT JOIN|FULL OUTER JOIN|CROSS JOIN",FULL OUTER JOIN
DEBUGGING,Fix Array Index Bug,Fix off-by-one error in array loop,MEDIUM,6-10,javascript,"[{\"input\":\"[1,2,3]\",\"expected\":\"3\"}]",let i=0; i<arr.length; i++
CODING,Binary Search Implementation,Implement binary search for a sorted array,HARD,11-15,python,"[{\"input\":\"[1,3,5], 3\",\"expected\":\"1\"}]",def search(nums, target): return nums.index(target) if target in nums else -1`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="sample_questions.csv"');
    return res.send(csvContent);
  }

  @Get("candidates")
  getSampleCandidatesCsv(@Res() res: Response) {
    const csvContent = `name,email
Alice Johnson,alice.johnson@example.com
Bob Smith,bob.smith@example.com
Carol White,carol.white@example.com
David Miller,david.miller@example.com`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="sample_candidates.csv"');
    return res.send(csvContent);
  }
}
