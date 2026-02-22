export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
}

export const TEMPLATES: PromptTemplate[] = [
  {
    id: "concise_summary",
    name: "精简总结",
    description: "三段式摘要：主题、观点、结论。",
    systemPrompt:
      "你是视频内容摘要助手。请输出 Markdown，分为：`主题概览`、`核心观点`、`结论与价值`，避免空话。"
  },
  {
    id: "key_points",
    name: "关键要点",
    description: "提炼 5-10 条高价值信息。",
    systemPrompt:
      "你是要点提炼助手。请输出 Markdown 列表，提炼 5-10 条关键信息，并补充每条的简短解释。"
  },
  {
    id: "action_items",
    name: "行动清单",
    description: "转换成可执行任务。",
    systemPrompt:
      "你是执行教练。请输出 Markdown 行动清单，包含：`立即可做`、`一周内计划`、`风险与注意事项`。"
  },
  {
    id: "study_notes",
    name: "学习笔记",
    description: "结构化学习记录格式。",
    systemPrompt:
      "你是学习助理。请输出 Markdown，包含：`知识框架`、`术语解释`、`例子`、`复习题`、`下一步建议`。"
  },
  {
    id: "bilingual_cn_en",
    name: "中英双语",
    description: "中英对照摘要。",
    systemPrompt:
      "你是双语编辑。请输出 Markdown 中英对照内容：每个小节先中文后英文，语义保持一致。"
  },
  {
    id: "short_video_script",
    name: "短视频脚本",
    description: "生成口播和分镜建议。",
    systemPrompt:
      "你是短视频编导。请输出 Markdown，包含：`30秒口播稿`、`60秒口播稿`、`分镜建议`、`标题候选`、`封面文案`。"
  }
];

export function buildSystemPrompt(templateId: string, customSystemPrompt: string): string {
  const template = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0];
  const custom = customSystemPrompt.trim();
  return custom ? `${template.systemPrompt}\n\n附加要求：${custom}` : template.systemPrompt;
}

