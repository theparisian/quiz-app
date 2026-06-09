import { create } from 'zustand';
import { readAnswerDisplayStyle, type AnswerDisplayStyle } from '@quiz-app/design-tokens';

export type AnswerPos = 'A' | 'B' | 'C' | 'D';

export interface EditorAnswer {
  tempId: string;
  id?: string;
  position: AnswerPos;
  text: string;
  isCorrect: boolean;
}

export interface EditorQuestion {
  tempId: string;
  id?: string;
  position: number;
  text: string;
  imageUrl: string | null;
  timeLimitSeconds: number;
  pointsMax: number;
  pointsFloor: number;
  explanation: string | null;
  answers: EditorAnswer[];
}

export interface AiGeneratedAnswer {
  position: AnswerPos;
  text: string;
  isCorrect: boolean;
}

export interface AiGeneratedQuestion {
  text: string;
  imageUrl?: string | null;
  timeLimitSeconds: number;
  pointsMax: number;
  pointsFloor: number;
  explanation?: string | null;
  answers: AiGeneratedAnswer[];
}

export interface QuizApiDetail {
  slug: string;
  status: string;
  title: string;
  description: string | null;
  type: 'standard' | 'sponsored' | 'custom';
  sponsorId: string | null;
  language: string;
  durationEstimateSeconds: number | null;
  brandingJson: unknown;
  coverImageUrl: string | null;
  backgroundMediaUrl: string | null;
  backgroundMediaType: 'image' | 'video' | null;
  backgroundOverlayOpacity: number;
  questions: {
    id: string;
    position: number;
    text: string;
    imageUrl: string | null;
    timeLimitSeconds: number;
    pointsMax: number;
    pointsFloor: number;
    explanation: string | null;
    answers: {
      id: string;
      position: string;
      text: string;
      isCorrect: boolean;
    }[];
  }[];
}

function readBrandingColors(json: unknown): { primary: string; secondary: string } {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    const p = typeof o.primary === 'string' ? o.primary : '#1e40af';
    const s = typeof o.secondary === 'string' ? o.secondary : '#64748b';
    return { primary: p, secondary: s };
  }
  return { primary: '#1e40af', secondary: '#64748b' };
}

function buildBrandingJson(
  primary: string,
  secondary: string,
  answerDisplayStyle: AnswerDisplayStyle,
): Record<string, unknown> {
  return { primary, secondary, answerDisplayStyle };
}

function defaultAnswers(): EditorAnswer[] {
  return (['A', 'B', 'C', 'D'] as const).map((pos) => ({
    tempId: crypto.randomUUID(),
    position: pos,
    text: pos === 'A' ? 'Réponse A' : `Réponse ${pos}`,
    isCorrect: pos === 'A',
  }));
}

export interface QuizEditorState {
  slug: string;
  quizStatus: string;
  title: string;
  description: string | null;
  type: 'standard' | 'sponsored' | 'custom';
  sponsorId: string | null;
  language: string;
  durationEstimateSeconds: number | null;
  brandingPrimary: string;
  brandingSecondary: string;
  answerDisplayStyle: AnswerDisplayStyle;
  coverImageUrl: string | null;
  backgroundMediaUrl: string | null;
  backgroundMediaType: 'image' | 'video' | null;
  backgroundOverlayOpacity: number;
  questions: EditorQuestion[];
  expandedTempId: string | null;
  isDirty: boolean;

  hydrate: (api: QuizApiDetail) => void;
  markSaved: (api: QuizApiDetail) => void;
  setExpanded: (tempId: string | null) => void;
  updateMetadata: (patch: {
    title?: string;
    description?: string | null;
    type?: 'standard' | 'sponsored' | 'custom';
    sponsorId?: string | null;
    language?: string;
    durationEstimateSeconds?: number | null;
    brandingPrimary?: string;
    brandingSecondary?: string;
    answerDisplayStyle?: AnswerDisplayStyle;
    coverImageUrl?: string | null;
    backgroundMediaUrl?: string | null;
    backgroundMediaType?: 'image' | 'video' | null;
    backgroundOverlayOpacity?: number;
  }) => void;
  addQuestion: () => void;
  updateQuestion: (
    tempId: string,
    patch: Partial<Omit<EditorQuestion, 'answers' | 'tempId'>>,
  ) => void;
  removeQuestion: (tempId: string) => void;
  reorderQuestions: (fromIndex: number, toIndex: number) => void;
  duplicateQuestion: (tempId: string) => void;
  updateAnswer: (qTempId: string, pos: AnswerPos, patch: Partial<EditorAnswer>) => void;
  setCorrectAnswer: (qTempId: string, pos: AnswerPos) => void;
  resetFromApi: (api: QuizApiDetail) => void;
  replaceQuestions: (questions: AiGeneratedQuestion[]) => void;
  appendQuestions: (questions: AiGeneratedQuestion[]) => void;
  toSavePayload: () => object;
}

function mergeAnswersFromApi(
  answers: { id: string; position: string; text: string; isCorrect: boolean }[],
): EditorAnswer[] {
  const map = new Map(answers.map((a) => [a.position as AnswerPos, a]));
  return (['A', 'B', 'C', 'D'] as const).map((pos) => {
    const f = map.get(pos);
    if (f) {
      return {
        tempId: f.id,
        id: f.id,
        position: pos,
        text: f.text,
        isCorrect: f.isCorrect,
      };
    }
    return {
      tempId: crypto.randomUUID(),
      position: pos,
      text: '—',
      isCorrect: false,
    };
  });
}

function mapAiQuestionToEditor(q: AiGeneratedQuestion, position: number): EditorQuestion {
  const byPos = new Map(q.answers.map((a) => [a.position, a]));
  return {
    tempId: crypto.randomUUID(),
    position,
    text: q.text,
    imageUrl: q.imageUrl ?? null,
    timeLimitSeconds: q.timeLimitSeconds,
    pointsMax: q.pointsMax,
    pointsFloor: q.pointsFloor,
    explanation: q.explanation ?? null,
    answers: (['A', 'B', 'C', 'D'] as const).map((pos) => {
      const a = byPos.get(pos);
      return {
        tempId: crypto.randomUUID(),
        position: pos,
        text: a?.text ?? '',
        isCorrect: a?.isCorrect ?? false,
      };
    }),
  };
}

function mapQuestionsFromApi(api: QuizApiDetail): EditorQuestion[] {
  const sorted = [...api.questions].sort((a, b) => a.position - b.position);
  return sorted.map((q, idx) => ({
    tempId: q.id,
    id: q.id,
    position: idx,
    text: q.text,
    imageUrl: q.imageUrl,
    timeLimitSeconds: q.timeLimitSeconds,
    pointsMax: q.pointsMax,
    pointsFloor: q.pointsFloor,
    explanation: q.explanation,
    answers: mergeAnswersFromApi(q.answers),
  }));
}

export const useQuizEditorStore = create<QuizEditorState>((set, get) => ({
  slug: '',
  quizStatus: 'draft',
  title: '',
  description: null,
  type: 'standard',
  sponsorId: null,
  language: 'fr',
  durationEstimateSeconds: null,
  brandingPrimary: '#1e40af',
  brandingSecondary: '#64748b',
  answerDisplayStyle: 'multicolor',
  coverImageUrl: null,
  backgroundMediaUrl: null,
  backgroundMediaType: null,
  backgroundOverlayOpacity: 0,
  questions: [],
  expandedTempId: null,
  isDirty: false,

  hydrate(api) {
    const colors = readBrandingColors(api.brandingJson);
    set({
      slug: api.slug,
      quizStatus: api.status,
      title: api.title,
      description: api.description,
      type: api.type,
      sponsorId: api.sponsorId,
      language: api.language,
      durationEstimateSeconds: api.durationEstimateSeconds,
      brandingPrimary: colors.primary,
      brandingSecondary: colors.secondary,
      answerDisplayStyle: readAnswerDisplayStyle(api.brandingJson),
      coverImageUrl: api.coverImageUrl,
      backgroundMediaUrl: api.backgroundMediaUrl,
      backgroundMediaType: api.backgroundMediaType,
      backgroundOverlayOpacity: api.backgroundOverlayOpacity,
      questions: mapQuestionsFromApi(api),
      expandedTempId: null,
      isDirty: false,
    });
  },

  markSaved(api) {
    get().hydrate(api);
  },

  setExpanded(tempId) {
    set({ expandedTempId: tempId });
  },

  updateMetadata(patch) {
    set((s) => ({
      ...s,
      ...patch,
      isDirty: true,
    }));
  },

  addQuestion() {
    const qs = [...get().questions];
    const tempId = crypto.randomUUID();
    qs.push({
      tempId,
      position: qs.length,
      text: 'Nouvelle question',
      imageUrl: null,
      timeLimitSeconds: 20,
      pointsMax: 1000,
      pointsFloor: 500,
      explanation: null,
      answers: defaultAnswers(),
    });
    set({
      questions: qs.map((q, i) => ({ ...q, position: i })),
      expandedTempId: tempId,
      isDirty: true,
    });
  },

  updateQuestion(tempId, patch) {
    set({
      questions: get().questions.map((q) => (q.tempId === tempId ? { ...q, ...patch } : q)),
      isDirty: true,
    });
  },

  removeQuestion(tempId) {
    const filtered = get().questions.filter((q) => q.tempId !== tempId);
    set({
      questions: filtered.map((q, i) => ({ ...q, position: i })),
      isDirty: true,
    });
  },

  reorderQuestions(fromIndex, toIndex) {
    const qs = [...get().questions];
    const [m] = qs.splice(fromIndex, 1);
    if (m) qs.splice(toIndex, 0, m);
    set({
      questions: qs.map((q, i) => ({ ...q, position: i })),
      isDirty: true,
    });
  },

  duplicateQuestion(tempId) {
    const qs = [...get().questions];
    const idx = qs.findIndex((q) => q.tempId === tempId);
    if (idx < 0) return;
    const src = qs[idx];
    if (!src) return;
    const { id: _dropQId, ...restQ } = src;
    const copy: EditorQuestion = {
      ...restQ,
      tempId: crypto.randomUUID(),
      answers: src.answers.map((a) => {
        const { id: _dropAid, ...restA } = a;
        return { ...restA, tempId: crypto.randomUUID() };
      }),
    };
    qs.splice(idx + 1, 0, copy);
    set({
      questions: qs.map((q, i) => ({ ...q, position: i })),
      expandedTempId: copy.tempId,
      isDirty: true,
    });
  },

  updateAnswer(qTempId, pos, patch) {
    set({
      questions: get().questions.map((q) => {
        if (q.tempId !== qTempId) return q;
        return {
          ...q,
          answers: q.answers.map((a) => (a.position === pos ? { ...a, ...patch } : a)),
        };
      }),
      isDirty: true,
    });
  },

  setCorrectAnswer(qTempId, pos) {
    set({
      questions: get().questions.map((q) => {
        if (q.tempId !== qTempId) return q;
        return {
          ...q,
          answers: q.answers.map((a) => ({
            ...a,
            isCorrect: a.position === pos,
          })),
        };
      }),
      isDirty: true,
    });
  },

  replaceQuestions(questions) {
    const mapped = questions.map((q, i) => mapAiQuestionToEditor(q, i));
    set({
      questions: mapped,
      expandedTempId: mapped[0]?.tempId ?? null,
      isDirty: true,
    });
  },

  appendQuestions(questions) {
    const qs = [...get().questions].sort((a, b) => a.position - b.position);
    const start = qs.length;
    const mapped = questions.map((q, i) => mapAiQuestionToEditor(q, start + i));
    const combined = [...qs, ...mapped].map((q, i) => ({ ...q, position: i }));
    set({
      questions: combined,
      expandedTempId: mapped[0]?.tempId ?? null,
      isDirty: true,
    });
  },

  resetFromApi(api) {
    get().hydrate(api);
  },

  toSavePayload(): object {
    const s = get();
    const ordered = [...s.questions].sort((a, b) => a.position - b.position);
    return {
      title: s.title,
      description: s.description,
      type: s.type,
      sponsorId: s.sponsorId,
      language: s.language,
      durationEstimateSeconds: s.durationEstimateSeconds,
      brandingJson: buildBrandingJson(s.brandingPrimary, s.brandingSecondary, s.answerDisplayStyle),
      coverImageUrl: s.coverImageUrl,
      backgroundOverlayOpacity: s.backgroundOverlayOpacity,
      questions: ordered.map((q, idx) => ({
        id: q.id,
        position: idx,
        text: q.text,
        imageUrl: q.imageUrl,
        timeLimitSeconds: q.timeLimitSeconds,
        pointsMax: q.pointsMax,
        pointsFloor: q.pointsFloor,
        explanation: q.explanation,
        answers: q.answers.map((a) => ({
          id: a.id,
          position: a.position,
          text: a.text,
          isCorrect: a.isCorrect,
        })),
      })),
    };
  },
}));

export function buildQuizSavePayload(): object {
  return useQuizEditorStore.getState().toSavePayload();
}
