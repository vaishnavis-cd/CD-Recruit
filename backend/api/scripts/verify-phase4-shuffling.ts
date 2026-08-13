import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
import { DriveShufflerService } from "../src/drive/drive-shuffler.service";

console.log("=== PHASE 4 QUESTION SHUFFLING VERIFICATION ===");

const shuffler = new DriveShufflerService();

const sampleQuestions = [
  { questionId: "q-sec-1", moduleType: "MCQ", question: { content: { prompt: "Protocol at Transport layer?" }, difficulty: "easy" } },
  { questionId: "q-sec-2", moduleType: "MCQ", question: { content: { prompt: "Default port for HTTPS?" }, difficulty: "easy" } },
  { questionId: "q-sec-3", moduleType: "MCQ", question: { content: { prompt: "Command for file permissions?" }, difficulty: "easy" } },
  { questionId: "q-sec-4", moduleType: "MCQ", question: { prompt: "CIA Triad C meaning?", difficulty: "easy" } },
  { questionId: "q-sec-5", moduleType: "MCQ", question: { prompt: "Nmap primary use?", difficulty: "easy" } },
  { questionId: "q-sec-6", moduleType: "TEST_SCENARIOS", question: { prompt: "Malicious IP alert response", difficulty: "medium" } },
  { questionId: "q-sec-7", moduleType: "TEST_SCENARIOS", question: { prompt: "Phishing reset link response", difficulty: "medium" } },
];

const driveId = "drive-secops-test-101";

// Candidate A
const candidateA = "candidate-1111-aaa";
const shuffledA = shuffler.shuffleQuestionsForCandidate(sampleQuestions as any, candidateA, driveId);
const orderA = shuffledA.map(q => q.questionId);

// Candidate B
const candidateB = "candidate-2222-bbb";
const shuffledB = shuffler.shuffleQuestionsForCandidate(sampleQuestions as any, candidateB, driveId);
const orderB = shuffledB.map(q => q.questionId);

console.log(`Candidate A (${candidateA}) question order:`);
console.log(orderA.join(", "));

console.log(`\nCandidate B (${candidateB}) question order:`);
console.log(orderB.join(", "));

const isDifferent = JSON.stringify(orderA) !== JSON.stringify(orderB);
console.log(`\nShuffling Result: ${isDifferent ? "DIFFERENT ORDERINGS PRODUCED (CONFIRMED WORKING)" : "SAME ORDERING (FAILED)"}`);

// Verify determinism / resume survival for Candidate A
const reShuffledA = shuffler.shuffleQuestionsForCandidate(sampleQuestions as any, candidateA, driveId);
const reOrderA = reShuffledA.map(q => q.questionId);
const isDeterministic = JSON.stringify(orderA) === JSON.stringify(reOrderA);
console.log(`Resume Determinism Check for Candidate A: ${isDeterministic ? "DETERMINISTIC & RESUME-SAFE (CONFIRMED)" : "FAILED"}`);
