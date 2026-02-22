from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# 读取仓库根目录 .env，保证本地手动启动 adapter 也能拿到配置。
load_dotenv(Path(__file__).resolve().parents[3] / ".env", override=False)


class ParseRequest(BaseModel):
    url: str
    lang: str | None = None
    comment_num: int = 0
    danmaku_num: int = 0
    snapshots: str | list[str] = Field(default="")
    need_subs: bool = True
    need_pbp: bool = True


class ParseResponse(BaseModel):
    ok: bool
    platform: str
    metadata: dict[str, str]
    transcriptText: str
    rawText: str
    snapshotHtmlTags: list[str]
    warnings: list[str]


app = FastAPI(title="VideoFetch Adapter", version="0.1.0")


def _plugin_file(platform: str) -> Path:
    built_in_root = Path(__file__).resolve().parents[1] / "plugins"
    if platform == "youtube":
        path = os.environ.get(
            "YOUTUBE_PLUGIN_FILE",
            str((built_in_root / "YouTubeFetch.py").resolve()),
        )
    else:
        path = os.environ.get(
            "BILIBILI_PLUGIN_FILE",
            str((built_in_root / "BilibiliFetch.py").resolve()),
        )
    return Path(path)


def _extract_block(raw_text: str, title: str) -> str:
    # 提取例如【字幕内容】这样的段落内容，直到下一个段落标题或文本结束。
    pattern = rf"【{re.escape(title)}】\s*(.*?)(?=\n【|\Z)"
    m = re.search(pattern, raw_text, flags=re.S)
    return m.group(1).strip() if m else ""


def _extract_img_tags(raw_text: str) -> list[str]:
    return re.findall(r"<img\s+[^>]*>", raw_text, flags=re.I)


def _extract_metadata(raw_text: str) -> dict[str, str]:
    meta: dict[str, str] = {}
    for key in ("视频标题", "频道作者", "视频作者", "发布时间", "播放量", "链接"):
        m = re.search(rf"{re.escape(key)}[:：]\s*(.+)", raw_text)
        if m:
            meta[key] = m.group(1).strip()
    return meta


def _invoke_plugin(plugin_file: Path, payload: dict[str, Any]) -> dict[str, Any]:
    if not plugin_file.exists():
        raise HTTPException(status_code=500, detail=f"插件文件不存在: {plugin_file}")

    # 兼容被双引号包裹的 cookie 值，防止原样透传导致请求异常。
    cookie = os.environ.get("BILIBILI_COOKIE", "")
    if cookie and len(cookie) > 1 and cookie[0] == cookie[-1] and cookie[0] in ("'", '"'):
        os.environ["BILIBILI_COOKIE"] = cookie[1:-1]

    env = os.environ.copy()
    env.setdefault("PROJECT_BASE_PATH", str(Path(__file__).resolve().parents[3]))

    proc = subprocess.run(
        ["python", str(plugin_file)],
        input=json.dumps(payload, ensure_ascii=False),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        timeout=300,
    )
    if proc.returncode != 0:
        raise HTTPException(
            status_code=502,
            detail=f"插件执行失败，code={proc.returncode}, stderr={proc.stderr.strip()}",
        )
    stdout = proc.stdout.strip()
    if not stdout:
        raise HTTPException(status_code=502, detail="插件输出为空")
    try:
        parsed = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502, detail=f"插件返回非 JSON: {exc}; raw={stdout[:300]}"
        ) from exc
    return parsed


def _normalize(platform: str, plugin_result: dict[str, Any]) -> ParseResponse:
    status = plugin_result.get("status")
    if status != "success":
        raise HTTPException(status_code=502, detail=plugin_result.get("error") or "插件返回失败")

    raw_text = str(plugin_result.get("result", "")).strip()
    transcript = _extract_block(raw_text, "字幕内容")
    if not transcript:
        transcript = raw_text

    warnings: list[str] = []
    if "未配置" in raw_text or "失败" in raw_text:
        warnings.append("解析流程包含失败或降级信息，请留意原始文本。")

    return ParseResponse(
        ok=True,
        platform=platform,
        metadata=_extract_metadata(raw_text),
        transcriptText=transcript,
        rawText=raw_text,
        snapshotHtmlTags=_extract_img_tags(raw_text),
        warnings=warnings,
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/parse/youtube", response_model=ParseResponse)
def parse_youtube(req: ParseRequest) -> ParseResponse:
    payload = {
        "url": req.url,
        "lang": req.lang,
        "comment_num": req.comment_num,
        "snapshots": req.snapshots,
        "need_subs": req.need_subs,
    }
    result = _invoke_plugin(_plugin_file("youtube"), payload)
    return _normalize("youtube", result)


@app.post("/parse/bilibili", response_model=ParseResponse)
def parse_bilibili(req: ParseRequest) -> ParseResponse:
    payload = {
        "url": req.url,
        "lang": req.lang,
        "comment_num": req.comment_num,
        "danmaku_num": req.danmaku_num,
        "snapshots": req.snapshots,
        "need_subs": req.need_subs,
        "need_pbp": req.need_pbp,
    }
    result = _invoke_plugin(_plugin_file("bilibili"), payload)
    return _normalize("bilibili", result)
