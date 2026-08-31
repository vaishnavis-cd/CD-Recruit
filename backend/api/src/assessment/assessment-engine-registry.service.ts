import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { ModuleType } from "@cd-recruit/shared-types";
import { AssessmentModuleEngine, ModuleEvaluationResult } from "./assessment-module-engine.interface";

@Injectable()
export class AssessmentEngineRegistry {
  private readonly logger = new Logger(AssessmentEngineRegistry.name);
  private readonly engines = new Map<ModuleType, AssessmentModuleEngine>();

  /**
   * Register a module engine for dynamic strategy resolution.
   */
  registerEngine(engine: AssessmentModuleEngine): void {
    if (!engine || !engine.moduleType) {
      throw new Error("Cannot register an assessment engine without a defined moduleType.");
    }
    this.engines.set(engine.moduleType, engine);
    this.logger.log(`Registered assessment module engine for ModuleType.${engine.moduleType}`);
  }

  /**
   * Unregister an engine (useful for dynamic plugins or test isolation).
   */
  unregisterEngine(moduleType: ModuleType): boolean {
    return this.engines.delete(moduleType);
  }

  /**
   * Get an engine by its module type.
   */
  getEngine(moduleType: ModuleType): AssessmentModuleEngine | undefined {
    return this.engines.get(moduleType);
  }

  /**
   * Check if an engine is registered for a module type.
   */
  hasEngine(moduleType: ModuleType): boolean {
    return this.engines.has(moduleType);
  }

  /**
   * Retrieve all currently registered engines.
   */
  getAllEngines(): AssessmentModuleEngine[] {
    return Array.from(this.engines.values());
  }

  /**
   * Validate a submission payload format against the corresponding module engine.
   */
  async validateSubmission(moduleType: ModuleType, submission: unknown): Promise<boolean> {
    const engine = this.getEngine(moduleType);
    if (!engine) {
      this.logger.warn(`No assessment engine found to validate submission for ModuleType.${moduleType}`);
      return false;
    }
    try {
      return await engine.validateSubmission(submission);
    } catch (err: any) {
      this.logger.error(`Validation error in engine for ModuleType.${moduleType}: ${err.message}`);
      return false;
    }
  }

  /**
   * Grade and evaluate a submission using the appropriate module engine.
   */
  async evaluateSubmission(
    moduleType: ModuleType,
    sessionId: string,
    questionId: string,
    submission: unknown,
  ): Promise<ModuleEvaluationResult> {
    const engine = this.getEngine(moduleType);
    if (!engine) {
      throw new NotFoundException(
        `No assessment engine registered for module type '${moduleType}'.`,
      );
    }

    const startTime = Date.now();
    try {
      const result = await engine.evaluateSubmission(sessionId, questionId, submission);
      return {
        ...result,
        durationMs: result.durationMs ?? Date.now() - startTime,
      };
    } catch (err: any) {
      this.logger.error(
        `Evaluation failed for session=${sessionId} question=${questionId} moduleType=${moduleType}: ${err.message}`,
      );
      throw err;
    }
  }
}
