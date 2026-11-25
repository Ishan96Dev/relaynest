import type { AgentCommand } from "../../lib/validation/schemas";

/** Splits "/imagine@my_bot a red fox" into the command name and what follows it. */
export function parseCommandText(text: string): { cmd: string | null; input: string } {
  const m = /^\/([a-zA-Z0-9_]{1,32})(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return { cmd: null, input: text.trim() };
  return { cmd: m[1]!.toLowerCase(), input: (m[2] ?? "").trim() };
}

/** Image commands use {input} in their instruction as a prompt template; without it the instruction is a style prefix. */
export function imagePrompt(command: Pick<AgentCommand, "instruction">, input: string): string {
  const tpl = command.instruction.trim();
  const prompt = !tpl ? input : tpl.includes("{input}") ? tpl.split("{input}").join(input) : `${tpl} ${input}`;
  return prompt.slice(0, 2000);
}

/** What a chat command asks the model to do, appended to the system prompt. */
export function commandTask(command: Pick<AgentCommand, "command" | "description" | "instruction">): string {
  const task = command.instruction.trim() || command.description;
  return `The person used the /${command.command} command. Task: ${task}`;
}

export const usageText = (c: Pick<AgentCommand, "command" | "kind">) =>
  c.kind === "image"
    ? `Usage: /${c.command} <what to draw>`
    : c.kind === "describe"
      ? `Send a photo with the caption /${c.command}`
      : c.kind === "search"
        ? `Usage: /${c.command} <what to search on the web>`
        : `Usage: /${c.command} <your text>`;
