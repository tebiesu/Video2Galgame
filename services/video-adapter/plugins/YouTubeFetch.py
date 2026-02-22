#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import html
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

import requests


class UTF8StreamHandler(logging.StreamHandler):
    def emit(self, record):
        try:
            msg = self.format(record)
            stream = self.stream
            if hasattr(stream, "buffer"):
                stream.buffer.write((msg + self.terminator).encode("utf-8"))
                stream.buffer.flush()
            else:
                stream.write(msg + self.terminator)
                self.flush()
        except Exception:
            self.handleError(record)


handler = UTF8StreamHandler(sys.stderr)
handler.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
logging.getLogger().addHandler(handler)
logging.getLogger().setLevel(logging.INFO)

YOUTUBE_WATCH_URL = "https://www.youtube.com/watch"
YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"


def extract_video_id(video_input: str) -> str | None:
    if not video_input:
        return None
    video_input = video_input.strip()

    m = re.match(r"^[a-zA-Z0-9_-]{11}$", video_input)
    if m:
        return video_input

    try:
        parsed = urllib.parse.urlparse(video_input)
    except Exception:
        return None

    host = parsed.netloc.lower()
    path = parsed.path
    query = urllib.parse.parse_qs(parsed.query)

    if "youtu.be" in host:
        vid = path.strip("/").split("/")[0]
        return vid if re.match(r"^[a-zA-Z0-9_-]{11}$", vid) else None

    if "youtube.com" in host:
        if path == "/watch":
            vid = query.get("v", [None])[0]
            return vid if vid and re.match(r"^[a-zA-Z0-9_-]{11}$", vid) else None
        if path.startswith("/shorts/") or path.startswith("/embed/"):
            vid = path.strip("/").split("/")[1] if len(path.strip("/").split("/")) > 1 else None
            return vid if vid and re.match(r"^[a-zA-Z0-9_-]{11}$", vid) else None

    return None


def fetch_watch_page(video_id: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    }
    resp = requests.get(YOUTUBE_WATCH_URL, params={"v": video_id}, headers=headers, timeout=20)
    resp.raise_for_status()
    return resp.text


def _extract_json_blob(source: str, marker: str) -> dict:
    idx = source.find(marker)
    if idx < 0:
        return {}
    start = source.find("{", idx)
    if start < 0:
        return {}

    depth = 0
    in_str = False
    esc = False
    end = -1
    for i in range(start, len(source)):
        ch = source[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end <= 0:
        return {}

    blob = source[start:end]
    try:
        return json.loads(blob)
    except Exception:
        return {}


def parse_player_response(watch_html: str) -> dict:
    data = _extract_json_blob(watch_html, "ytInitialPlayerResponse")
    if data:
        return data
    m = re.search(r'"playerResponse":"({.+?})"', watch_html)
    if m:
        try:
            return json.loads(bytes(m.group(1), "utf-8").decode("unicode_escape"))
        except Exception:
            pass
    return {}


def parse_video_info(video_id: str, player_resp: dict) -> dict:
    details = player_resp.get("videoDetails", {})
    mf = player_resp.get("microformat", {}).get("playerMicroformatRenderer", {})
    return {
        "video_id": video_id,
        "title": details.get("title") or "",
        "author": details.get("author") or "",
        "length_seconds": details.get("lengthSeconds") or "",
        "view_count": details.get("viewCount") or "",
        "publish_date": mf.get("publishDate") or "",
        "description": details.get("shortDescription") or "",
    }


def _caption_tracks(player_resp: dict) -> list:
    return (
        player_resp.get("captions", {})
        .get("playerCaptionsTracklistRenderer", {})
        .get("captionTracks", [])
        or []
    )


def _pick_caption_track(tracks: list, lang_code: str | None) -> dict | None:
    if not tracks:
        return None
    if lang_code:
        for t in tracks:
            if t.get("languageCode") == lang_code:
                return t
        for t in tracks:
            if t.get("languageCode", "").lower().startswith(lang_code.lower()):
                return t
    for preferred in ("zh-Hans", "zh-CN", "en"):
        for t in tracks:
            if t.get("languageCode") == preferred:
                return t
    return tracks[0]


def fetch_subtitles_from_track(track: dict) -> str:
    base_url = track.get("baseUrl")
    if not base_url:
        return ""
    url = base_url
    if "fmt=" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}fmt=srv3"

    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    text = resp.text.strip()
    if not text:
        return ""

    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return text

    lines = []
    for n in root.findall(".//text"):
        start = float(n.attrib.get("start", "0"))
        content = html.unescape("".join(n.itertext())).strip()
        if content:
            lines.append(f"[{start:.2f}] {content}")
    return "\n".join(lines).strip()


def _vtt_or_srt_to_text(raw: str) -> str:
    lines = []
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue
        if s in ("WEBVTT",):
            continue
        if s.startswith("Kind:") or s.startswith("Language:"):
            continue
        if "-->" in s:
            continue
        if re.fullmatch(r"\d+", s):
            continue
        if s.startswith("NOTE"):
            continue
        # Remove inline timestamp tags like <00:00:01.000>
        s = re.sub(r"<\d{2}:\d{2}:\d{2}\.\d{3}>", "", s).strip()
        if s:
            lines.append(html.unescape(s))
    return "\n".join(lines).strip()


def _pick_sub_file(candidates: list[Path], lang_code: str | None) -> Path | None:
    if not candidates:
        return None
    names = [c.name.lower() for c in candidates]

    def pick_by_token(token: str) -> Path | None:
        token = token.lower()
        for i, n in enumerate(names):
            if f".{token}." in n:
                return candidates[i]
        return None

    if lang_code:
        for token in (lang_code, lang_code.replace("_", "-"), lang_code.split("-")[0]):
            p = pick_by_token(token)
            if p:
                return p

    for token in ("zh-hans", "zh-cn", "zh", "en"):
        p = pick_by_token(token)
        if p:
            return p

    return candidates[0]


def fetch_subtitles_with_ytdlp(video_id: str, lang_code: str | None = None) -> tuple[str, str]:
    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    lang_list = []
    if lang_code:
        lang_list.extend([lang_code, lang_code.replace("_", "-"), lang_code.split("-")[0]])
    lang_list.extend(["zh-Hans", "zh-CN", "zh", "en"])
    # Keep order and uniqueness
    seen = set()
    lang_list = [x for x in lang_list if x and not (x in seen or seen.add(x))]
    sub_langs = ",".join(lang_list)

    with tempfile.TemporaryDirectory(prefix="yt_sub_") as td:
        out_tpl = str(Path(td) / "%(id)s.%(ext)s")
        ytdlp_bin = _resolve_executable("yt-dlp", "YTDLP_BIN")
        cmd = [
            ytdlp_bin,
            "--skip-download",
            "--write-sub",
            "--write-auto-sub",
            "--sub-format",
            "vtt/srt/best",
            "--sub-langs",
            sub_langs,
            "-o",
            out_tpl,
            watch_url,
        ]
        try:
            subprocess.run(cmd, capture_output=True, text=True, timeout=90, check=True)
        except FileNotFoundError:
            return "", "yt-dlp 未安装，无法执行字幕 fallback。"
        except subprocess.TimeoutExpired:
            return "", "yt-dlp 拉取字幕超时。"
        except subprocess.CalledProcessError as e:
            err = (e.stderr or e.stdout or "").strip()
            return "", f"yt-dlp 字幕拉取失败: {err[:240]}"
        except Exception as e:
            return "", f"yt-dlp 字幕拉取异常: {e}"

        files = sorted(list(Path(td).glob(f"{video_id}*.vtt")) + list(Path(td).glob(f"{video_id}*.srt")))
        if not files:
            return "", "yt-dlp 未下载到字幕文件（可能视频没有公开字幕或自动字幕不可用）。"

        target = _pick_sub_file(files, lang_code)
        if not target:
            return "", "字幕文件选择失败。"
        try:
            raw = target.read_text(encoding="utf-8", errors="ignore")
            text = _vtt_or_srt_to_text(raw)
            if text:
                return text, ""
            return "", "字幕文件为空。"
        except Exception as e:
            return "", f"字幕文件解析失败: {e}"


def _api_key() -> str:
    return os.environ.get("YOUTUBE_API_KEY", "").strip()


def _bool_env(name: str, default: bool = False) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def _siliconflow_headers() -> dict:
    key = os.environ.get("SILICONFLOW_API_KEY", "").strip()
    if not key:
        return {}
    return {"Authorization": f"Bearer {key}"}


def _siliconflow_base_url() -> str:
    base = os.environ.get("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1").strip()
    return base.rstrip("/")


def _siliconflow_asr_model() -> str:
    return os.environ.get("SILICONFLOW_ASR_MODEL", "FunAudioLLM/SenseVoiceSmall").strip()


def _resolve_executable(name: str, env_var: str) -> str:
    env_path = os.environ.get(env_var, "").strip()
    if env_path and os.path.exists(env_path):
        return env_path

    which_hit = shutil.which(name)
    if which_hit:
        return which_hit

    local_appdata = os.environ.get("LOCALAPPDATA", "")
    user_profile = os.environ.get("USERPROFILE", "")

    direct_candidates = []
    package_roots = []
    if local_appdata:
        direct_candidates.append(os.path.join(local_appdata, "Microsoft", "WinGet", "Links", f"{name}.exe"))
        package_roots.append(os.path.join(local_appdata, "Microsoft", "WinGet", "Packages"))
    if user_profile:
        direct_candidates.append(os.path.join(user_profile, "scoop", "shims", f"{name}.exe"))

    for c in direct_candidates:
        if os.path.exists(c):
            return c

    for root in package_roots:
        if not os.path.isdir(root):
            continue
        try:
            target = f"{name}.exe"
            for dirpath, _, filenames in os.walk(root):
                if target in filenames:
                    return os.path.join(dirpath, target)
        except Exception:
            continue

    return name


def fetch_hot_comments(video_id: str, comment_num: int) -> list[str]:
    if comment_num <= 0:
        return []
    key = _api_key()
    if not key:
        return ["未配置 YOUTUBE_API_KEY，跳过评论抓取。"]

    params = {
        "part": "snippet",
        "videoId": video_id,
        "order": "relevance",
        "maxResults": min(max(comment_num, 1), 50),
        "textFormat": "plainText",
        "key": key,
    }
    try:
        resp = requests.get(f"{YOUTUBE_API_BASE}/commentThreads", params=params, timeout=20)
        data = resp.json()
        if resp.status_code != 200:
            return [f"评论接口失败: {data.get('error', {}).get('message', 'unknown')}"]
        out = []
        for item in data.get("items", []):
            s = (
                item.get("snippet", {})
                .get("topLevelComment", {})
                .get("snippet", {})
            )
            author = s.get("authorDisplayName", "Unknown")
            likes = s.get("likeCount", 0)
            txt = (s.get("textDisplay", "") or "").strip()
            if txt:
                out.append(f"{author}(👍{likes}): {txt}")
        return out[:comment_num]
    except Exception as e:
        return [f"评论抓取异常: {e}"]


def sanitize_filename(name: str) -> str:
    return re.sub(r"[\\/*?:\"<>|]", "_", name).strip() or "youtube_video"


def get_accessible_url(local_path: str) -> str:
    var_http_url = os.environ.get("VarHttpUrl")
    server_port = os.environ.get("SERVER_PORT")
    image_key = os.environ.get("IMAGESERVER_IMAGE_KEY")
    project_base_path = os.environ.get("PROJECT_BASE_PATH")

    if all([var_http_url, server_port, image_key, project_base_path]):
        try:
            norm_local = os.path.normpath(local_path)
            norm_base = os.path.normpath(os.path.join(project_base_path, "image"))
            rel_path = os.path.relpath(norm_local, norm_base).replace("\\", "/")
            return f"{var_http_url}:{server_port}/pw={image_key}/images/{rel_path}"
        except Exception as e:
            logging.error(f"Build image URL failed: {e}")

    return "file:///" + local_path.replace("\\", "/")


def _resolve_video_stream_url(video_url: str) -> str:
    ytdlp_bin = _resolve_executable("yt-dlp", "YTDLP_BIN")
    cmd = [ytdlp_bin, "-g", "-f", "best[ext=mp4]/best", video_url]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=True)
    lines = [x.strip() for x in proc.stdout.splitlines() if x.strip()]
    if not lines:
        raise RuntimeError("yt-dlp 未返回流地址。")
    return lines[0]


def generate_snapshot(video_url: str, sec: float, output_path: str) -> tuple[bool, str]:
    try:
        stream_url = _resolve_video_stream_url(video_url)
        ffmpeg_bin = _resolve_executable("ffmpeg", "FFMPEG_BIN")
        cmd = [
            ffmpeg_bin,
            "-y",
            "-ss",
            str(sec),
            "-i",
            stream_url,
            "-frames:v",
            "1",
            "-q:v",
            "2",
            output_path,
        ]
        subprocess.run(cmd, capture_output=True, text=True, timeout=120, check=True)
        return True, ""
    except FileNotFoundError as e:
        return False, f"缺少依赖命令: {e}"
    except subprocess.CalledProcessError as e:
        err = (e.stderr or e.stdout or "").strip()
        return False, f"截图失败: {err[:400]}"
    except Exception as e:
        return False, f"截图异常: {e}"


def extract_audio_for_asr(video_url: str, output_path: str, max_duration_sec: int = 3600) -> tuple[bool, str]:
    try:
        stream_url = _resolve_video_stream_url(video_url)
        ffmpeg_bin = _resolve_executable("ffmpeg", "FFMPEG_BIN")
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i",
            stream_url,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "64k",
            "-t",
            str(max_duration_sec),
            output_path,
        ]
        subprocess.run(cmd, capture_output=True, text=True, timeout=240, check=True)
        return True, ""
    except FileNotFoundError as e:
        return False, f"缺少依赖命令: {e}"
    except subprocess.TimeoutExpired:
        return False, "音频提取超时。"
    except subprocess.CalledProcessError as e:
        err = (e.stderr or e.stdout or "").strip()
        return False, f"音频提取失败: {err[:300]}"
    except Exception as e:
        return False, f"音频提取异常: {e}"


def transcribe_with_siliconflow(video_id: str, video_url: str) -> tuple[str, str]:
    if not _bool_env("SILICONFLOW_ENABLE_ASR_FALLBACK", True):
        return "", "SILICONFLOW_ENABLE_ASR_FALLBACK=false，已关闭ASR兜底。"
    headers = _siliconflow_headers()
    if not headers:
        return "", "未配置 SILICONFLOW_API_KEY，无法调用ASR。"

    model = _siliconflow_asr_model()
    endpoint = f"{_siliconflow_base_url()}/audio/transcriptions"
    with tempfile.TemporaryDirectory(prefix="yt_asr_") as td:
        audio_path = str(Path(td) / f"{video_id}.mp3")
        ok, reason = extract_audio_for_asr(video_url, audio_path, max_duration_sec=3600)
        if not ok:
            return "", reason

        try:
            file_size = os.path.getsize(audio_path)
            if file_size > 50 * 1024 * 1024:
                return "", "音频超过50MB，超出SiliconFlow转写限制。"
        except Exception:
            pass

        try:
            with open(audio_path, "rb") as f:
                files = {"file": (os.path.basename(audio_path), f, "audio/mpeg")}
                data = {"model": model}
                resp = requests.post(endpoint, headers=headers, files=files, data=data, timeout=360)

            if resp.status_code != 200:
                try:
                    err = resp.json()
                    return "", f"SiliconFlow ASR失败: {err.get('message') or err}"
                except Exception:
                    return "", f"SiliconFlow ASR失败: HTTP {resp.status_code}"

            payload = resp.json()
            text = (payload.get("text") or "").strip()
            if not text:
                return "", "SiliconFlow ASR返回为空。"
            return text, ""
        except requests.Timeout:
            return "", "SiliconFlow ASR请求超时。"
        except Exception as e:
            return "", f"SiliconFlow ASR异常: {e}"


def process_youtube_enhanced(
    video_input: str,
    lang_code: str | None = None,
    comment_num: int = 0,
    snapshot_at_times: list | None = None,
    need_subs: bool = True,
) -> str:
    video_id = extract_video_id(video_input)
    if not video_id:
        return f"无法识别 YouTube 视频 ID: {video_input}"

    watch_url = f"https://www.youtube.com/watch?v={video_id}"
    watch_html = fetch_watch_page(video_id)
    player_resp = parse_player_response(watch_html)
    if not player_resp:
        return "解析 YouTube 页面失败，可能触发了反爬限制。"

    info = parse_video_info(video_id, player_resp)
    tracks = _caption_tracks(player_resp)
    subtitle_text = ""
    subtitle_reason = ""
    if need_subs and tracks:
        selected_track = _pick_caption_track(tracks, lang_code)
        if selected_track:
            try:
                subtitle_text = fetch_subtitles_from_track(selected_track)
            except Exception as e:
                subtitle_reason = f"页面字幕抓取失败: {e}"
    elif need_subs:
        subtitle_reason = "页面未发现可用字幕轨道。"

    if need_subs and not subtitle_text:
        ytdlp_text, ytdlp_reason = fetch_subtitles_with_ytdlp(video_id, lang_code=lang_code)
        if ytdlp_text:
            subtitle_text = ytdlp_text
        else:
            reasons = []
            if subtitle_reason:
                reasons.append(subtitle_reason)
            if ytdlp_reason:
                reasons.append(ytdlp_reason)
            asr_text, asr_reason = transcribe_with_siliconflow(video_id, watch_url)
            if asr_text:
                subtitle_text = "（未获取到原生字幕，以下为 ASR 转写内容）\n" + asr_text
            else:
                if asr_reason:
                    reasons.append(asr_reason)
                subtitle_text = "（未获取到字幕内容）\n原因: " + " | ".join(reasons or ["未知原因"])

    comments = fetch_hot_comments(video_id, comment_num)

    images_to_add = []
    snapshot_report = []
    if snapshot_at_times:
        project_base_path = os.environ.get("PROJECT_BASE_PATH", os.getcwd())
        safe_title = sanitize_filename(info.get("title") or video_id)
        img_dir = os.path.join(project_base_path, "image", "youtube", safe_title)
        os.makedirs(img_dir, exist_ok=True)

        for t in snapshot_at_times:
            try:
                sec = float(t)
            except Exception:
                snapshot_report.append(f"- 时间点 {t} 无法解析，已跳过。")
                continue
            filename = f"snapshot_{video_id}_{int(sec)}s.jpg"
            img_path = os.path.join(img_dir, filename)
            ok, msg = generate_snapshot(watch_url, sec, img_path)
            if ok:
                url = get_accessible_url(img_path)
                images_to_add.append(url)
                snapshot_report.append(f"- {sec}s 快照已生成: {filename}")
            else:
                snapshot_report.append(f"- {sec}s 快照失败: {msg}")

    text_parts = []
    text_parts.append("【视频信息】")
    text_parts.append(f"视频标题：{info.get('title', '')}")
    text_parts.append(f"频道作者：{info.get('author', '')}")
    text_parts.append(f"发布时间：{info.get('publish_date', '')}")
    text_parts.append(f"时长（秒）：{info.get('length_seconds', '')}")
    text_parts.append(f"播放量：{info.get('view_count', '')}")
    text_parts.append(f"链接：https://www.youtube.com/watch?v={video_id}")

    if need_subs:
        text_parts.append("\n【字幕内容】")
        text_parts.append(subtitle_text if subtitle_text else "（未获取到字幕内容）")

    if comments:
        text_parts.append("\n【热门评论】")
        text_parts.append("\n".join(comments))

    if snapshot_report:
        text_parts.append("\n【请求的视频快照】")
        text_parts.append("\n".join(snapshot_report))

    full_text = "\n".join(text_parts).strip()
    if images_to_add:
        full_text += "\n\n请务必使用以下 HTML <img> 标签将视频快照直接展示给用户：\n"
        for img_url in images_to_add:
            full_text += f'<img src="{img_url}" width="400" alt="YouTube Snapshot">\n'
    return full_text


def _get_page_token_from_page(page: int, tokens: list[str]) -> str | None:
    if page <= 1:
        return None
    idx = page - 2
    if 0 <= idx < len(tokens):
        return tokens[idx]
    return None


def search_youtube(keyword: str, search_type: str = "video", page: int = 1) -> str:
    key = _api_key()
    if not key:
        return "未配置 YOUTUBE_API_KEY，无法执行 YouTube 搜索。"

    yt_type = "channel" if search_type == "channel" else "video"
    page_token = None
    next_tokens = []

    params = {
        "part": "snippet",
        "q": keyword,
        "type": yt_type,
        "maxResults": 10,
        "key": key,
    }
    for _ in range(max(page, 1)):
        if page_token:
            params["pageToken"] = page_token
        resp = requests.get(f"{YOUTUBE_API_BASE}/search", params=params, timeout=20)
        data = resp.json()
        if resp.status_code != 200:
            return f"搜索失败: {data.get('error', {}).get('message', 'unknown')}"
        page_token = data.get("nextPageToken")
        if page_token:
            next_tokens.append(page_token)
        if len(next_tokens) >= page - 1:
            break

    use_token = _get_page_token_from_page(page, next_tokens)
    if use_token:
        params["pageToken"] = use_token
    elif "pageToken" in params:
        params.pop("pageToken")

    resp = requests.get(f"{YOUTUBE_API_BASE}/search", params=params, timeout=20)
    data = resp.json()
    if resp.status_code != 200:
        return f"搜索失败: {data.get('error', {}).get('message', 'unknown')}"

    items = data.get("items", [])
    if not items:
        return "未找到相关结果。"

    lines = [f"--- YouTube 搜索结果: '{keyword}' (type={yt_type}, page={page}) ---"]
    for item in items:
        sn = item.get("snippet", {})
        title = sn.get("title", "")
        ch_title = sn.get("channelTitle", "")
        published = sn.get("publishedAt", "")
        try:
            published = datetime.fromisoformat(published.replace("Z", "+00:00")).strftime("%Y-%m-%d")
        except Exception:
            pass
        if yt_type == "video":
            vid = item.get("id", {}).get("videoId", "")
            link = f"https://www.youtube.com/watch?v={vid}" if vid else ""
            lines.append(f"【{title}】\n- 频道: {ch_title}\n- 日期: {published}\n- 链接: {link}")
        else:
            cid = item.get("id", {}).get("channelId", "")
            link = f"https://www.youtube.com/channel/{cid}" if cid else ""
            lines.append(f"【{title}】\n- 频道ID: {cid}\n- 链接: {link}")
    return "\n\n".join(lines)


def get_channel_videos(channel_id: str, page: int = 1) -> str:
    key = _api_key()
    if not key:
        return "未配置 YOUTUBE_API_KEY，无法获取频道视频。"
    if not channel_id:
        return "缺少 channel_id。"

    page_token = None
    params = {
        "part": "snippet",
        "channelId": channel_id,
        "order": "date",
        "type": "video",
        "maxResults": 10,
        "key": key,
    }
    for _ in range(1, max(page, 1)):
        if page_token:
            params["pageToken"] = page_token
        resp = requests.get(f"{YOUTUBE_API_BASE}/search", params=params, timeout=20)
        data = resp.json()
        if resp.status_code != 200:
            return f"获取频道视频失败: {data.get('error', {}).get('message', 'unknown')}"
        page_token = data.get("nextPageToken")
        if not page_token:
            break

    if page_token:
        params["pageToken"] = page_token
    elif "pageToken" in params:
        params.pop("pageToken")

    resp = requests.get(f"{YOUTUBE_API_BASE}/search", params=params, timeout=20)
    data = resp.json()
    if resp.status_code != 200:
        return f"获取频道视频失败: {data.get('error', {}).get('message', 'unknown')}"

    items = data.get("items", [])
    if not items:
        return "该频道暂无可列出的视频。"

    lines = [f"--- 频道 {channel_id} 视频列表 (page={page}) ---"]
    for item in items:
        sn = item.get("snippet", {})
        title = sn.get("title", "")
        vid = item.get("id", {}).get("videoId", "")
        published = sn.get("publishedAt", "")
        try:
            published = datetime.fromisoformat(published.replace("Z", "+00:00")).strftime("%Y-%m-%d")
        except Exception:
            pass
        lines.append(f"【{title}】\n- 视频ID: {vid}\n- 日期: {published}\n- 链接: https://www.youtube.com/watch?v={vid}")
    return "\n\n".join(lines)


def handle_single_request(data: dict):
    action = data.get("action", "fetch_video")
    if action == "search":
        keyword = data.get("keyword")
        if not keyword:
            raise ValueError("Missing required argument: keyword for search")
        search_type = data.get("search_type", "video")
        page = int(data.get("page", 1))
        return search_youtube(keyword, search_type, page)

    if action == "get_channel_videos":
        channel_id = data.get("channel_id")
        if not channel_id:
            raise ValueError("Missing required argument: channel_id")
        page = int(data.get("page", 1))
        return get_channel_videos(channel_id, page)

    url = data.get("url")
    if not url:
        raise ValueError("Missing required argument: url")
    lang = data.get("lang")
    comment_num = int(data.get("comment_num", 0))
    snapshots_raw = data.get("snapshots")
    snapshot_at_times = []
    if isinstance(snapshots_raw, list):
        snapshot_at_times = snapshots_raw
    elif isinstance(snapshots_raw, str) and snapshots_raw.strip():
        snapshot_at_times = [s.strip() for s in snapshots_raw.split(",")]

    need_subs = data.get("need_subs", True)
    if isinstance(need_subs, str):
        need_subs = need_subs.lower() != "false"

    return process_youtube_enhanced(
        url,
        lang_code=lang,
        comment_num=comment_num,
        snapshot_at_times=snapshot_at_times,
        need_subs=need_subs,
    )


if __name__ == "__main__":
    input_data_raw = sys.stdin.read()
    output = {}
    try:
        if not input_data_raw.strip():
            raise ValueError("No input data received from stdin.")
        input_data = json.loads(input_data_raw)

        is_serial = any(
            key.startswith("command")
            or (key.startswith("url") and key[3:].isdigit())
            for key in input_data
        )
        if is_serial:
            results = []
            indices = sorted(
                list(set([re.findall(r"\d+", k)[0] for k in input_data.keys() if re.findall(r"\d+", k)]))
            )
            if not indices:
                indices = [""]
            for idx in indices:
                sub_data = {k.replace(idx, ""): v for k, v in input_data.items() if k.endswith(idx)}
                try:
                    res = handle_single_request(sub_data)
                    if isinstance(res, str):
                        results.append(f"--- 任务 {idx} 结果 ---\n{res}")
                    else:
                        results.append(
                            f"--- 任务 {idx} 结果 ---\n{json.dumps(res, ensure_ascii=False, indent=2)}"
                        )
                except Exception as e:
                    results.append(f"--- 任务 {idx} 失败 ---\n错误: {e}")
            output = {"status": "success", "result": "\n\n".join(results)}
        else:
            result = handle_single_request(input_data)
            output = {"status": "success", "result": result}
    except (json.JSONDecodeError, ValueError) as e:
        output = {"status": "error", "error": f"Input Error: {e}"}
    except Exception as e:
        logging.exception("Unexpected error while running YouTubeFetch.")
        output = {"status": "error", "error": f"An unexpected error occurred: {e}"}

    sys.stdout.buffer.write(json.dumps(output, ensure_ascii=False, indent=2).encode("utf-8"))
    sys.stdout.buffer.write(b"\n")
    sys.stdout.buffer.flush()
