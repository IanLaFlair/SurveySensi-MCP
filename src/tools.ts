import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Basic types for SurveySensei
 */

export type ResponseStatus = "PENDING" | "VALID" | "REJECTED";

export interface Survey {
  id: string;
  title: string;
  description?: string;
  questions: string[];
  creatorWallet: string;
  totalReward: number;
  targetResponses: number;
  createdAt: number;
}


export interface SurveyResponse {
  id: string;
  surveyId: string;
  wallet: string;
  answers: string[];
  status: ResponseStatus;
  score: number;        // ⬅️ tambah
  explanation: string;  // ⬅️ tambah
  createdAt: number;
}
/**
 * Storage key helpers
 */

const surveyKey = (id: string) => `survey:${id}`;
const responsePrefix = (surveyId: string) => `response:${surveyId}:`;
const responseKey = (surveyId: string, responseId: string) =>
  `${responsePrefix(surveyId)}${responseId}`;

/**
 * Simple answer evaluation helper
 * (optional; mainly for debugging or future agents)
 */
function evaluateAnswerText(text: string) {
  const trimmed = text.trim();
  const length = trimmed.length;

  const isValid = length >= 40;
  const score = Math.min(10, Math.floor(length / 20));

  const verdict: "VALID" | "REJECTED" = isValid ? "VALID" : "REJECTED";
  const explanation = isValid
    ? "Answer is long enough to likely be thoughtful and not spam."
    : "Answer is too short and likely low-effort or spammy.";

  return { verdict, score, length, explanation };
}

/**
 * Main entry: register all tools
 */
export function setupServerTools(
  server: McpServer,
  storage: DurableObjectStorage
) {
  // -------------------------------------------------------------
  // 1. Health check
  // -------------------------------------------------------------
  server.tool(
    "ping",
    "Ping test tool to verify MCP server is responding",
    {},
    async () => {
      return {
        content: [
          {
            type: "text",
            text: "pong 🚀 SurveySensei MCP + Durable Object is alive!",
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------
  // 2. Standalone answer scoring (optional debugging tool)
  // -------------------------------------------------------------
  server.tool(
    "scoreSurveyAnswer",
    "Score and validate a single survey answer using simple heuristics",
    {
      answer: z.string().describe("Free-text survey answer from a respondent"),
    },
    async ({ answer }) => {
      const result = evaluateAnswerText(answer);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------
  // 3. createSurveyMeta
  // -------------------------------------------------------------
  server.tool(
    "createSurveyMeta",
    "Create a new survey metadata entry and store it in Durable Object storage",
    {
      title: z.string().describe("Survey title"),
      description: z
        .string()
        .describe("Short description of the survey")
        .optional(),
      questions: z
        .array(z.string())
        .min(1)
        .describe("List of survey questions in order"),
      creatorWallet: z
        .string()
        .describe("Solana public key of the survey creator"),
      totalReward: z
        .number()
        .positive()
        .describe(
          "Total reward budget (plain number for now, e.g. SOL or token units)"
        ),
      targetResponses: z
        .number()
        .int()
        .positive()
        .describe("Target number of valid responses"),
    },
    async ({
      title,
      description,
      questions,
      creatorWallet,
      totalReward,
      targetResponses,
    }) => {
      const id = crypto.randomUUID();

      const survey: Survey = {
        id,
        title,
        description,
        questions,
        creatorWallet,
        totalReward,
        targetResponses,
        createdAt: Date.now(),
      };

      await storage.put(surveyKey(id), survey);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: true,
                survey,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // -------------------------------------------------------------
  // 4. submitResponse  ✅ dipanggil oleh Agent
  // -------------------------------------------------------------
 // -------------------------------------------------------------
// 4. submitResponse
// -------------------------------------------------------------
server.tool(
  "submitResponse",
  "Store a respondent's answers for a survey and assign an initial status",
  {
    surveyId: z.string(),
    wallet: z.string(),
    answers: z.array(z.string()),
    verdict: z.enum(["VALID", "REJECTED"]),
    score: z.number(),
    explanation: z.string(),
  },
  async ({ surveyId, wallet, answers, verdict, score, explanation }) => {
    console.log("[MCP] submitResponse called", {
      surveyId,
      wallet,
      verdict,
      score,
    });

    const survey = (await storage.get<Survey>(surveyKey(surveyId))) || null;
    if (!survey) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: false,
                error: `Survey ${surveyId} not found`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const status: ResponseStatus = verdict === "VALID" ? "VALID" : "REJECTED";
    const responseId = crypto.randomUUID();

    const response: SurveyResponse = {
      id: responseId,
      surveyId,
      wallet,
      answers,
      status,
      score,
      explanation,
      createdAt: Date.now(),
    };

    await storage.put(responseKey(surveyId, responseId), response);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              surveyId,
              response,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// 🔹 Ambil 1 survey by ID
server.tool(
  "getSurveyById",
  "Get full survey metadata by its ID",
  {
    surveyId: z.string().describe("ID of the survey"),
  },
  async ({ surveyId }) => {
    const survey = (await storage.get<Survey>(surveyKey(surveyId))) || null;

    if (!survey) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: false,
                error: `Survey ${surveyId} not found`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              survey,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// 🔹 List semua survey milik creatorWallet tertentu
server.tool(
  "listSurveysByCreator",
  "List all surveys created by a specific wallet address",
  {
    creatorWallet: z.string().describe("Creator wallet address"),
  },
  async ({ creatorWallet }) => {
    const iter = await storage.list<Survey>({ prefix: "survey:" });

    const surveys: Survey[] = [];
    for (const [, value] of iter) {
      const s = value as Survey;
      if (s.creatorWallet === creatorWallet) {
        surveys.push(s);
      }
    }

    // Bisa diperkecil field kalau mau, tapi untuk sekarang kirim full
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              creatorWallet,
              total: surveys.length,
              surveys,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// 🔹 Detail survey + statistik respon
server.tool(
  "getSurveyStats",
  "Get survey metadata plus basic response stats",
  {
    surveyId: z.string(),
  },
  async ({ surveyId }) => {
    const survey = (await storage.get<Survey>(surveyKey(surveyId))) || null;

    if (!survey) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { ok: false, error: `Survey ${surveyId} not found` },
              null,
              2
            ),
          },
        ],
      };
    }

    const iter = await storage.list<SurveyResponse>({
      prefix: responsePrefix(surveyId),
    });

    const walletSet = new Set<string>();
    const responses: SurveyResponse[] = [];
    let totalScore = 0;
    let scoredCount = 0;

    for (const [, value] of iter) {
      const resp = value as SurveyResponse;
      responses.push(resp);
      if (resp.status === "VALID") {
        walletSet.add(resp.wallet);
        if (typeof resp.score === "number") {
          totalScore += resp.score;
          scoredCount += 1;
        }
      }
    }

    const wallets = Array.from(walletSet);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              survey,
              stats: {
                totalResponses: responses.length,
                totalValidWallets: wallets.length,
                avgScore:
                  scoredCount > 0 ? totalScore / scoredCount : null,
                wallets,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
);


  // -------------------------------------------------------------
  // 5. listValidWallets
  // -------------------------------------------------------------
  server.tool(
  "listValidWallets",
  "List all wallets that have at least one VALID response for a survey",
  {
    surveyId: z.string().describe("ID of the survey"),
  },
  async ({ surveyId }) => {
    const survey = (await storage.get<Survey>(surveyKey(surveyId))) || null;

    if (!survey) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: false,
                error: `Survey ${surveyId} not found`,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const iter = await storage.list<SurveyResponse>({
      prefix: responsePrefix(surveyId),
    });

    const walletSet = new Set<string>();
    const responses: SurveyResponse[] = [];

    for (const [, value] of iter) {
      const resp = value as SurveyResponse;
      responses.push(resp);
      if (resp.status === "VALID") {
        walletSet.add(resp.wallet);
      }
    }

    const wallets = Array.from(walletSet);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              surveyId,
              totalResponses: responses.length,
              totalValidWallets: wallets.length,
              wallets,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);
}
