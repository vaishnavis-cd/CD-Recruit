export enum Judge0Language {
  CPP = 54,
  GO = 60,
  JAVA = 62,
  JAVASCRIPT = 63,
  PYTHON = 71,
  TYPESCRIPT = 74,
}

export const JUDGE0_LANGUAGE_SLUG_MAP: Record<string, Judge0Language> = {
  python: Judge0Language.PYTHON,
  python3: Judge0Language.PYTHON,
  javascript: Judge0Language.JAVASCRIPT,
  js: Judge0Language.JAVASCRIPT,
  typescript: Judge0Language.TYPESCRIPT,
  ts: Judge0Language.TYPESCRIPT,
  java: Judge0Language.JAVA,
  cpp: Judge0Language.CPP,
  "c++": Judge0Language.CPP,
  go: Judge0Language.GO,
  golang: Judge0Language.GO,
};
