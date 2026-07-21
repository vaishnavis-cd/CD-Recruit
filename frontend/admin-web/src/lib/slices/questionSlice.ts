import { StateCreator } from "zustand";
import { type Question } from "../types";
import { getAuthHeaders, API_BASE } from "../store";

export interface QuestionSlice {
  questions: Question[];

  fetchQuestions: (query?: {
    moduleType?: string;
    difficulty?: string;
    search?: string;
    status?: string;
    role?: string;
  }) => Promise<void>;
  createQuestion: (input: {
    moduleType: string;
    role?: string;
    content: any;
    scoringConfig?: any;
    difficulty?: string;
    tags?: string[];
  }) => Promise<void>;
  archiveQuestion: (id: string) => Promise<void>;
  updateQuestion: (
    id: string,
    input: {
      moduleType?: string;
      role?: string;
      content?: any;
      scoringConfig?: any;
      difficulty?: string;
      tags?: string[];
      status?: string;
    },
  ) => Promise<void>;
  bulkUploadQuestions: (moduleType: string, questions: any[]) => Promise<void>;
}

export const createQuestionSlice: StateCreator<any, [], [], QuestionSlice> = (set, get) => ({
  questions: [],

  fetchQuestions: async (query) => {
    set({ loading: true });
    try {
      const headers = await getAuthHeaders();
      let url = `${API_BASE}/admin/questions?page=1&pageSize=100`;
      if (query?.moduleType) url += `&moduleType=${query.moduleType}`;
      if (query?.difficulty) url += `&difficulty=${query.difficulty}`;
      if (query?.search) url += `&search=${encodeURIComponent(query.search)}`;
      if (query?.status) url += `&status=${query.status}`;
      if (query?.role) url += `&role=${encodeURIComponent(query.role)}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("Failed to fetch questions");
      const data = await res.json();
      set({ questions: data.items, loading: false });
    } catch (err: any) {
      console.error(err);
      set({ error: err.message, loading: false });
    }
  },

  createQuestion: async (input) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/admin/questions`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error("Failed to create question");
    get().fetchQuestions();
  },

  archiveQuestion: async (id: string) => {
    const headers = await getAuthHeaders();
    await fetch(`${API_BASE}/admin/questions/${id}`, {
      method: "DELETE",
      headers,
    });
    get().fetchQuestions();
  },

  updateQuestion: async (id: string, input) => {
    const headers = await getAuthHeaders();
    await fetch(`${API_BASE}/admin/questions/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(input),
    });
    get().fetchQuestions();
  },

  bulkUploadQuestions: async (moduleType: string, questions: any[]) => {
    const headers = await getAuthHeaders();
    await fetch(`${API_BASE}/admin/questions/bulk`, {
      method: "POST",
      headers,
      body: JSON.stringify({ moduleType, questions }),
    });
    get().fetchQuestions();
  },
});
