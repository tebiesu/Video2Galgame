"use client";

import { FancySelect } from "@/components/FancySelect";
import { TEMPLATES } from "@/lib/templates";
import type { JobInput, ModelConfig, ParseOptions, Platform } from "@/lib/types";
import { useMemo, useState } from "react";

interface Props {
  onSubmit: (input: JobInput) => Promise<void>;
  disabled: boolean;
  modelConfig: ModelConfig;
  templateId: string;
  onTemplateChange: (id: string) => void;
  summaryMode: "template" | "role";
  onSummaryModeChange: (mode: "template" | "role") => void;
  onOpenSettings: () => void;
  roleOptions: Array<{ value: string; label: string }>;
  selectedRoleId: string;
  onRoleChange: (id: string) => void;
  roleName: string;
  roleStylePrompt: string;
  submitError?: string;
}

const platformOptions = [
  { value: "youtube", label: "YouTube" },
  { value: "bilibili", label: "Bilibili" }
] satisfies Array<{ value: Platform; label: string }>;

export function InputPanel({
  onSubmit,
  disabled,
  modelConfig,
  templateId,
  onTemplateChange,
  summaryMode,
  onSummaryModeChange,
  onOpenSettings,
  roleOptions,
  selectedRoleId,
  onRoleChange,
  roleName,
  roleStylePrompt,
  submitError
}: Props): React.ReactNode {
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [url, setUrl] = useState("");
  const [customSystemPrompt, setCustomSystemPrompt] = useState("");
  const [lang, setLang] = useState("");
  const [commentNum, setCommentNum] = useState("0");
  const [danmakuNum, setDanmakuNum] = useState("0");
  const [snapshots, setSnapshots] = useState("30,60");
  const [needSubs, setNeedSubs] = useState(true);
  const [needPbp, setNeedPbp] = useState(true);

  const selectedTemplate = useMemo(
    () => TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[0],
    [templateId]
  );

  const providerReady =
    Boolean(modelConfig.baseUrl?.trim()) &&
    Boolean(modelConfig.apiKey?.trim()) &&
    Boolean(modelConfig.model?.trim());

  async function submitForm(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!providerReady) return;
    const parseOptions: ParseOptions = {
      lang: lang || undefined,
      commentNum: Number(commentNum || 0),
      danmakuNum: Number(danmakuNum || 0),
      snapshots: snapshots || "",
      needSubs,
      needPbp
    };

    await onSubmit({
      platform,
      url,
      templateId,
      summaryMode,
      customSystemPrompt,
      modelConfig,
      parseOptions
    });
  }

  return (
    <form className="panel stack-lg hover-float kawaii-panel" onSubmit={submitForm}>
      <div className="stack-sm">
        <h2 className="panel-title">视频输入</h2>
        <p className="muted">支持 YouTube / Bilibili 链接，自动解析、转写并生成 Markdown 总结。</p>
      </div>

      {!providerReady ? (
        <p className="warn-text">Provider 未配置完整，请先在「设置」中填写 Base URL / API Key / Model。</p>
      ) : null}
      {submitError ? <p className="error-text">提交失败：{submitError}</p> : null}

      <label className="field">
        <span>平台</span>
        <FancySelect
          value={platform}
          options={platformOptions}
          onChange={(v) => setPlatform(v as Platform)}
          disabled={disabled}
        />
      </label>

      <label className="field">
        <span>视频 URL</span>
        <input
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          disabled={disabled}
        />
      </label>

      <label className="field">
        <span>总结模式</span>
        <div className="switch-row mode-switch-row">
          <button type="button" className={`switch-chip ${summaryMode === "template" ? "on" : ""}`} onClick={() => onSummaryModeChange("template")}>
            <span className="dot" /> 模板总结
          </button>
          <button type="button" className={`switch-chip ${summaryMode === "role" ? "on" : ""}`} onClick={() => onSummaryModeChange("role")}>
            <span className="dot" /> 角色总结
          </button>
        </div>
      </label>

      <section className="field mode-config-card">
        <span>{summaryMode === "template" ? "模板总结配置" : "角色总结配置"}</span>
        <div className="mode-config-body">
          <div className="mode-config-scroll">
            {summaryMode === "template" ? (
              <>
                <label className="field">
                  <span>预设模板</span>
                  <FancySelect
                    value={templateId}
                    options={TEMPLATES.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
                    onChange={onTemplateChange}
                    disabled={disabled}
                  />
                </label>
                <p className="muted mode-config-desc">{selectedTemplate.description}</p>
              </>
            ) : (
              <>
                <label className="field">
                  <span>选择角色</span>
                  <FancySelect
                    value={selectedRoleId}
                    options={roleOptions}
                    onChange={onRoleChange}
                    disabled={disabled}
                  />
                </label>
                <p className="muted">当前角色：{roleName || "解析助手"}</p>
                <p className="muted">角色风格词：{roleStylePrompt?.trim() ? roleStylePrompt : "未设置，将按默认角色口吻输出。"}</p>
                <p className="muted mode-config-desc">你在下方填写的“自定义系统提示词”会拼接在角色风格词后一起生效。</p>
              </>
            )}
          </div>
        </div>
        <div className="mode-config-actions">
          <button type="button" className="ghost-btn mini" onClick={onOpenSettings}>打开设置中心</button>
        </div>
      </section>

      <label className="field">
        <span>{summaryMode === "role" ? "追加系统提示词（与角色风格词拼接）" : "自定义系统提示词"}</span>
        <textarea
          value={customSystemPrompt}
          onChange={(e) => setCustomSystemPrompt(e.target.value)}
          rows={4}
          placeholder={summaryMode === "role" ? "例如：先给结论，再给证据，最后给行动建议" : "例如：重点关注商业模式与增长策略"}
          disabled={disabled}
        />
      </label>

      <details className="soft-group">
        <summary>高级解析参数</summary>
        <div className="stack-sm">
          <div className="split">
            <label className="field">
              <span>字幕语言</span>
              <input
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                placeholder="en / zh-Hans / ai-zh"
                disabled={disabled}
              />
            </label>
            <label className="field">
              <span>快照时间点（逗号）</span>
              <input
                value={snapshots}
                onChange={(e) => setSnapshots(e.target.value)}
                placeholder="30,60,90"
                disabled={disabled}
              />
            </label>
          </div>

          <div className="split">
            <label className="field">
              <span>评论数量</span>
              <input
                type="number"
                min={0}
                value={commentNum}
                onChange={(e) => setCommentNum(e.target.value)}
                disabled={disabled}
              />
            </label>
            <label className="field">
              <span>弹幕数量（B站）</span>
              <input
                type="number"
                min={0}
                value={danmakuNum}
                onChange={(e) => setDanmakuNum(e.target.value)}
                disabled={disabled}
              />
            </label>
          </div>

          <div className="switch-row">
            <button type="button" className={`switch-chip ${needSubs ? "on" : ""}`} onClick={() => setNeedSubs((x) => !x)}>
              <span className="dot" /> 获取字幕
            </button>
            <button type="button" className={`switch-chip ${needPbp ? "on" : ""}`} onClick={() => setNeedPbp((x) => !x)}>
              <span className="dot" /> 获取高能时间点（B站）
            </button>
          </div>
        </div>
      </details>

      <button type="submit" className="primary-btn" disabled={disabled || !providerReady}>
        {disabled ? "处理中..." : "开始解析与总结"}
      </button>
    </form>
  );
}
