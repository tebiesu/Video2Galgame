export interface VnLine {
  id: string;
  speaker: string;
  text: string;
  expression: "neutral" | "happy" | "serious";
}

const lineReg = /^[-*]\s+(.+)/;
const VN_MAX_LINES = 120;

function toNaturalText(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/^#{1,6}\s+/g, "")
    .replace(/^\d+\.\s+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/[_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickExpression(text: string): VnLine["expression"] {
  if (/风险|失败|问题|注意|警告/.test(text)) return "serious";
  if (/建议|价值|机会|亮点|增长/.test(text)) return "happy";
  return "neutral";
}

export function summaryToVnLines(summary: string, speaker: string): VnLine[] {
  const rows = summary
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x) => !x.startsWith("#"));

  const extracted = rows
    .map((x) => {
      const m = x.match(lineReg);
      return m ? m[1] : x;
    })
    .map(toNaturalText)
    .filter((x) => x.length > 4)
    .flatMap((x) => x.split(/(?<=[。！？!?；;])/).map((s) => s.trim()).filter((s) => s.length > 4))
    .slice(0, VN_MAX_LINES);

  const lines = extracted.map((text, i) => ({
    id: `line-${i}`,
    speaker,
    text,
    expression: pickExpression(text)
  }));

  if (lines.length) return lines;
  return [
    {
      id: "line-empty",
      speaker,
      text: "摘要内容为空，暂时无法生成视觉小说台词。",
      expression: "neutral"
    }
  ];
}

export function splitToSpeechChunks(text: string): string[] {
  return text
    .split(/(?<=[。！？!?;；])/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);
}
