import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/* ============================================================
   TYPES
============================================================ */

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
  score: number;
  explanation: string;
  createdAt: number;
}

/* ============================================================
   STORAGE HELPERS
============================================================ */

const surveyKey = (id: string) => `survey:${id}`;
const responsePrefix = (surveyId: string) => `response:${surveyId}:`;
const responseKey = (surveyId: string, responseId: string) =>
  `${responsePrefix(surveyId)}${responseId}`;

/* ============================================================
   STATS HELPER
============================================================ */

function buildStats_andResponses(
  responses: SurveyResponse[]
) {
  const valid = responses.filter(r => r.status === "VALID");

  const walletSet = new Set(valid.map(r => r.wallet.toLowerCase()));

  const avgScore =
    valid.length > 0
      ? valid.reduce((s, r) => s + (r.score ?? 0), 0) / valid.length
      : null;

  return {
    stats: {
      totalResponses: responses.length,
      totalValidWallets: walletSet.size,
      avgScore,
      wallets: Array.from(walletSet),
    },
    responses, // ⬅️ FULL RESPONSE LIST (NEW)
  };
}

/* ============================================================
   MAIN SETUP
============================================================ */

export function setupServerTools(server: McpServer, storage: DurableObjectStorage) {

  /* -----------------------------------------------------------
     1. HEALTH CHECK
  ------------------------------------------------------------ */
  server.tool("ping", "Ping test", {}, async () => ({
    content: [{ type: "text", text: "pong 🚀 SurveySensei MCP operational!" }],
  }));

  /* -----------------------------------------------------------
     2. SCORE SINGLE ANSWER (OPTIONAL)
  ------------------------------------------------------------ */
  server.tool(
    "scoreSurveyAnswer",
    "Debug scoring tool",
    { answer: z.string() },
    async ({ answer }) => {
      const trimmed = answer.trim();
      const len = trimmed.length;
      const verdict = len >= 40 ? "VALID" : "REJECTED";
      const score = Math.min(10, Math.floor(len / 20));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { verdict, score, length: len },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  /* -----------------------------------------------------------
     3. CREATE SURVEY META
  ------------------------------------------------------------ */
  server.tool(
    "createSurveyMeta",
    "Create metadata for a survey",
    {
      title: z.string(),
      description: z.string().optional(),
      questions: z.array(z.string()).min(1),
      creatorWallet: z.string(),
      totalReward: z.number().positive(),
      targetResponses: z.number().int().positive(),
    },
    async (args) => {
      const id = crypto.randomUUID();
      const survey: Survey = {
        id,
        title: args.title,
        description: args.description,
        questions: args.questions,
        creatorWallet: args.creatorWallet,
        totalReward: args.totalReward,
        targetResponses: args.targetResponses,
        createdAt: Date.now(),
      };

      await storage.put(surveyKey(id), survey);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, survey }, null, 2),
          },
        ],
      };
    }
  );

  /* -----------------------------------------------------------
     4. SUBMIT RESPONSE
  ------------------------------------------------------------ */
  server.tool(
    "submitResponse",
    "Store response for a survey",
    {
      surveyId: z.string(),
      wallet: z.string(),
      answers: z.array(z.string()),
      verdict: z.enum(["VALID", "REJECTED"]),
      score: z.number(),
      explanation: z.string(),
    },
    async ({ surveyId, wallet, answers, verdict, score, explanation }) => {
      const survey = await storage.get<Survey>(surveyKey(surveyId));
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

      const responseId = crypto.randomUUID();
      const response: SurveyResponse = {
        id: responseId,
        surveyId,
        wallet,
        answers,
        status: verdict,
        score,
        explanation,
        createdAt: Date.now(),
      };

      await storage.put(responseKey(surveyId, responseId), response);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, response }, null, 2),
          },
        ],
      };
    }
  );

  /* -----------------------------------------------------------
     5. GET SURVEY BY ID
  ------------------------------------------------------------ */
  server.tool(
    "getSurveyById",
    "Fetch a survey metadata only",
    { surveyId: z.string() },
    async ({ surveyId }) => {
      const survey = await storage.get<Survey>(surveyKey(surveyId));

      if (!survey) {
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: "SURVEY_NOT_FOUND" }) }],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, survey }, null, 2) }],
      };
    }
  );

  /* -----------------------------------------------------------
     6. LIST SURVEYS BY CREATOR (WITH STATS)
  ------------------------------------------------------------ */
  server.tool(
    "listSurveysByCreator",
    "List surveys + stats for a creator",
    { creatorWallet: z.string() },
    async ({ creatorWallet }) => {
      const iter = await storage.list<Survey>({ prefix: "survey:" });
      const surveys: any[] = [];

      for (const [, s] of iter) {
        const survey = s as Survey;
        if (survey.creatorWallet !== creatorWallet) continue;

        // load responses
        const respIter = await storage.list<SurveyResponse>({
          prefix: responsePrefix(survey.id),
        });

        const responses = [...respIter].map(([, r]) => r as SurveyResponse);

        const { stats } = buildStats_andResponses(responses);

        surveys.push({
          ...survey,
          stats,
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, creatorWallet, surveys }, null, 2),
          },
        ],
      };
    }
  );

  /* -----------------------------------------------------------
     7. GET SURVEY DETAIL (META + STATS + RESPONSES)
  ------------------------------------------------------------ */
  server.tool(
    "getSurveyStats",
    "Survey detail with stats + full responses",
    { surveyId: z.string() },
    async ({ surveyId }) => {
      const survey = await storage.get<Survey>(surveyKey(surveyId));
      if (!survey) {
        return {
          content: [
            { type: "text", text: JSON.stringify({ ok: false, error: "SURVEY_NOT_FOUND" }) },
          ],
        };
      }

      const iter = await storage.list<SurveyResponse>({
        prefix: responsePrefix(surveyId),
      });

      const responses = [...iter].map(([, r]) => r as SurveyResponse);

      const { stats, responses: fullResponses } = buildStats_andResponses(responses);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: true,
                survey,
                stats,
                responses: fullResponses, // full list
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
