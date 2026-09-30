import { type CardForDecomposition, streamDecomposition } from "@/lib/ai/decompose";
import { PROMPT_VERSION } from "@/lib/ai/prompts/decompose-v2";

import { decomposeCases } from "../datasets/decompose";
import { mockJsonModel } from "../mock";
import {
  decomposeScorers,
  type DecomposeExpected,
  type DecomposeOutput,
} from "../scorers/decompose";
import type { Feature } from "../types";
import { collect } from "./collect";

const MOCK_SUBTASKS = {
  es: [
    "Crear el modelo de datos",
    "Implementar la lógica en el servidor",
    "Escribir tests de la funcionalidad",
  ],
  en: [
    "Add the data model for the feature",
    "Implement the server logic",
    "Write tests for the feature",
  ],
};

export const decomposeFeature: Feature<CardForDecomposition, DecomposeOutput, DecomposeExpected> = {
  name: "decompose",
  promptVersion: PROMPT_VERSION,
  cases: decomposeCases,
  scorers: decomposeScorers,
  async run(card, model) {
    const { output, raw, error, usage, cost } = await collect(streamDecomposition({ model, card }));
    return { output: { raw, proposal: output, error }, usage, cost };
  },
  mockModel({ expected }) {
    const estimates = [2, 3, 5];
    return mockJsonModel({
      subtasks: MOCK_SUBTASKS[expected.language].map((title, i) => ({
        title,
        estimate: estimates[i],
      })),
    });
  },
};
