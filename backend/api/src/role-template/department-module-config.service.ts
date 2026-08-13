import { Injectable } from "@nestjs/common";
import { Department } from "@prisma/client";

export interface DepartmentModuleConfigEntry {
  enabledModules: string[];
  codingLanguages?: string[];
  codingCategories?: string[];
}

export const DEPARTMENT_MODULE_CONFIG: Record<Department, DepartmentModuleConfigEntry> = {
  [Department.SOFTWARE_ENGINEERING]: {
    enabledModules: ["MCQ", "SQL", "CODING", "DEBUGGING", "AI_PROMPTING", "SIMULATION", "TEST_SCENARIOS"],
    codingLanguages: ["python", "javascript", "java", "cpp"],
    codingCategories: ["ALGORITHM"],
  },
  [Department.DATA_ENGINEERING]: {
    enabledModules: ["MCQ", "SQL", "CODING"],
    codingLanguages: ["python"],
    codingCategories: ["ALGORITHM"],
  },
  [Department.QA]: {
    enabledModules: ["MCQ", "SQL", "CODING", "DEBUGGING", "TEST_SCENARIOS"],
    codingLanguages: ["python", "javascript", "java"],
    codingCategories: ["ALGORITHM", "AUTOMATION"],
  },
  [Department.SRE]: {
    enabledModules: ["MCQ", "TEST_SCENARIOS"],
  },
  [Department.SYSOPS]: {
    enabledModules: ["MCQ", "TEST_SCENARIOS"],
  },
  [Department.ITOPS]: {
    enabledModules: ["MCQ", "TEST_SCENARIOS"],
  },
  [Department.PMO]: {
    enabledModules: ["MCQ", "TEST_SCENARIOS"],
  },
  [Department.SECOPS]: {
    enabledModules: ["MCQ", "TEST_SCENARIOS"],
  },
};

@Injectable()
export class DepartmentModuleConfigService {
  getConfigForDepartment(department: Department): DepartmentModuleConfigEntry {
    const config = DEPARTMENT_MODULE_CONFIG[department];
    if (!config) {
      throw new Error(`Unconfigured department: ${department}`);
    }
    return config;
  }

  isModuleEnabledForDepartment(department: Department, moduleType: string): boolean {
    const config = this.getConfigForDepartment(department);
    return config.enabledModules.includes(moduleType);
  }
}
