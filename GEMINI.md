# VideoFetch 项目指南

VideoFetch 是一个全栈视频解析与 AI 摘要系统（MVP），支持 YouTube 和 Bilibili 平台。它能够提取视频字幕、元数据，并通过大语言模型（LLM）生成结构化摘要，支持 GalGame 风格的沉浸式展示及 TTS 语音合成。

## 项目架构

项目采用前后端分离架构，通过 Docker 进行容器化部署：

- **Frontend (App Root)**: 基于 Next.js (React 19, App Router) 的 Web 应用。
    - **任务编排**: `lib/jobs.ts` 负责管理任务生命周期（解析 -> 总结 -> 完成）。
    - **数据存储**: 使用 SQLite (`better-sqlite3`)，数据库文件位于 `.videofetch/videofetch.db`。
    - **实时更新**: 通过 Server-Sent Events (SSE) 向前端推送任务阶段变更。
- **Video Adapter (`services/video-adapter`)**: 基于 FastAPI 的解析适配层。
    - **插件系统**: 位于 `plugins/`，通过调用 `yt-dlp` 等工具执行具体的爬取任务。
    - **ASR/TTS**: 集成了 SiliconFlow 等第三方服务进行语音转文字兜底及语音合成。

## 关键技术栈

- **前端**: Next.js 16+, TypeScript, Tailwind CSS (Vanilla CSS 优先), React Markdown.
- **后端**: Python 3.10+, FastAPI, Pydantic.
- **数据**: SQLite, `better-sqlite3`.
- **工具**: yt-dlp, FFmpeg.

## 开发与运行

### 1. 环境配置
复制 `.env.example` 为 `.env` 并填写必要的 API Key：
- `NEXT_PUBLIC_NEWAPI_API_KEY`: 用于摘要生成的 LLM 密钥。
- `SILICONFLOW_API_KEY`: 用于 ASR/TTS 的密钥。
- `YOUTUBE_API_KEY` / `BILIBILI_COOKIE`: 提升解析成功率。

### 2. 本地开发
**启动后端适配层**:
```bash
cd services/video-adapter
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**启动前端**:
```bash
npm install
npm run dev
```

### 3. Docker 部署
```bash
docker compose up --build
```

## 开发规范

- **数据库修改**: 所有的数据库模式变更应在 `lib/db.ts` 的 `initDb` 函数中进行。
- **任务阶段**: 任务状态流转遵循 `queued` -> `parsing` -> `transcribing` -> `summarizing` -> `completed`/`failed`。
- **插件扩展**: 新的平台支持应在 `services/video-adapter/plugins/` 下新增 Python 脚本，并在 `app.main:app` 中暴露接口。
- **前端组件**: 遵循 `components/` 目录下的原子化原则，重要逻辑如 GalGame 渲染位于 `GalgamePlayer.tsx`。
- **测试**: 使用 Playwright 进行端到端测试，脚本位于 `scripts/`。

## 目录索引

- `/app/api/jobs`: 任务创建与状态查询 API。
- `/lib/jobs.ts`: 核心任务调度逻辑。
- `/services/video-adapter/plugins`: 视频解析插件核心实现。
- `/components/WorkBoard.tsx`: 核心工作台渲染逻辑。
