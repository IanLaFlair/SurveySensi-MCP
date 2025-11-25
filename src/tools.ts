import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function setupServerTools(server: McpServer) {
  // ============================================================
  // 1. PING TOOL
  // ============================================================
  server.tool(
    "ping",
    "Ping test tool to verify MCP server is responding",
    {},
    async () => {
      return {
        content: [
          {
            type: "text",
            text: "pong 🚀 SurveySensei MCP is alive!",
          }
        ]
      };
    }
  );

  // ============================================================
  // 2. SCORE ANSWER (Validator simple)
  // ============================================================
  server.tool(
    "scoreSurveyAnswer",
    "Score and validate a survey answer with simple heuristics",
    {
      answer: z.string().describe("Jawaban survei dari responden")
    },
    async ({ answer }) => {
      const length = answer.trim().length;

      // simple heuristic
      const isValid = length >= 20;
      const score = Math.min(5, Math.floor(length / 20) + 1);

      const verdict = isValid ? "VALID" : "REJECTED";
      const explanation = isValid
        ? "Jawaban cukup panjang sehingga dianggap asli dan bukan spam."
        : "Jawaban terlalu pendek. Kemungkinan spam / tidak niat.";

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { verdict, score, length, explanation },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  //TODO: Setup additional tools
  // server.tool(
  //   'create_todo',
  //   'Create a new todo item',
  //   {
  //     title: z.string().describe('The title of the todo'),
  //     description: z.string().describe('The description of the todo'),
  //     status: z.enum([TodoStatus.NOT_STARTED, TodoStatus.IN_PROGRESS, TodoStatus.COMPLETED, TodoStatus.CANCELED]).optional().describe('The status of the todo'),
  //     due_date: z.string().optional().describe('The due date of the todo'),
  //   },       
  //   async ({ title, description, status, due_date }: { 
  //     title: string; 
  //     description: string; 
  //     status?: TodoStatus; 
  //     due_date?: string; 
  //   }) => {
  //     const now = new Date().toISOString();
  //     const todo: Todo = {
  //       id: crypto.randomUUID(),
  //       title,
  //       description,
  //       status: status || TodoStatus.NOT_STARTED,
  //       due_date,
  //       created_at: now,
  //       updated_at: now
  //     };
  //     console.log("Result: ", todo);
  //    
  //       return {
  //         content: [
  //           {
  //             type: "text",
  //             text: `Todo created with id: ${todo.id}`
  //           }
  //         ],
  //         todo
  //       };
  //   }
  // );
} 