# 真实剧情视频资源规范与验收清单

## 当前验收状态

> 状态：播放器与上传规范已切换为 PC 16:9。仓库内 Node001–004 仍是早期 720 × 1280 竖屏联调文件，仅用于兼容性回归，不能通过新的 1920 × 1080 上传校验。正式横屏 MP4/JPG、正式 MinIO/CDN 和目标浏览器验收尚未完成，不得把当前测试素材标记为“正式素材已验收”。

| 节点 | 视频文件 | 封面文件 | 当前剧情类型 | 状态 |
| --- | --- | --- | --- | --- |
| Node001 | `Node001.mp4` | `Node001.jpg` | video | 本地测试 MP4 已接入；正式 MP4/JPG 待交付 |
| Node002 | `Node002.mp4` | `Node002.jpg` | video | 本地测试 MP4 已接入；正式 MP4/JPG 待交付 |
| Node003 | `Node003.mp4` | `Node003.jpg` | video | 本地测试 MP4 已接入；正式 MP4/JPG 待交付 |
| Node004 | `Node004.mp4` | `Node004.jpg` | video | 本地测试 MP4 已接入；正式 MP4/JPG 待交付 |

建议交付目录：

```text
apps/h5/public/media/chapter01/
├── Node001.mp4
├── Node001.jpg
├── Node002.mp4
├── Node002.jpg
├── Node003.mp4
├── Node003.jpg
├── Node004.mp4
└── Node004.jpg
```

当前目录中的四个 MP4 是 4 秒竖屏联调测试素材，使用不同纯色画面和音调区分节点。它们仍为旧的 720 × 1280 规格，待正式 1920 × 1080 横屏素材替换。封面仍使用 `/posters/node001.svg` 至 `/posters/node004.svg` 占位资源。

## 1. 文件命名

- 当前接入模板固定使用 `Node001` 至 `Node004` 作为文件名主体。
- 文件名区分大小写；必须严格使用大写 `N`、三位节点编号，不使用中文、空格或括号。
- 视频与封面必须使用相同的文件名主体。
- 第一章示例：`Node001.mp4`、`Node001.jpg`。
- 第一版静态目录允许覆盖同名文件；进入 CDN 发布后应改用资源版本或内容哈希处理缓存，不在本阶段扩展。

## 2. 视频技术规范

| 项目 | 强制要求 |
| --- | --- |
| 容器 | MP4，MIME 为 `video/mp4` |
| 画面方向 | 横屏 16:9，不依赖 Rotation 元数据 |
| 播放分辨率 | 1920 × 1080；不接受竖屏或依赖 Rotation 元数据的文件 |
| 视频编码 | H.264/AVC，`codec_name=h264`，Main Profile，Level 4.0 或以下 |
| 像素格式 | `yuv420p`，SDR/BT.709，不使用 HDR |
| 帧率 | 恒定 25 或 30 fps；同一章节保持一致 |
| 视频码率 | 建议 1.8–2.5 Mbps，峰值不超过 3 Mbps |
| 关键帧间隔 | 不超过 2 秒 |
| 音频编码 | AAC-LC，`codec_name=aac` |
| 音频参数 | 48 kHz、双声道、128 kbps |
| Web 优化 | `ftyp` 后为 `moov`，且 `moov` 必须早于第一个 `mdat`（Fast Start） |
| 文件体积 | 建议每分钟不超过 20 MB |

Apple 建议 Safari 的静态视频使用 H.264 MP4；Android 原生支持 MP4 中的 H.264 与 AAC-LC，并明确要求 HTTP 播放的 MP4 将 `moov` 放在 `mdat` 之前。

推荐转码模板（需要根据源素材是否允许补边进行人工确认）：

```text
ffmpeg -i INPUT \
  -map 0:v:0 -map 0:a:0 \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p" \
  -c:v libx264 -profile:v main -level:v 4.0 -r 30 -g 60 \
  -crf 21 -maxrate 2500k -bufsize 5000k \
  -c:a aac -profile:a aac_low -b:a 128k -ar 48000 -ac 2 \
  -movflags +faststart OUTPUT.mp4
```

## 3. 封面技术规范

| 项目 | 强制要求 |
| --- | --- |
| 格式 | JPEG，MIME 为 `image/jpeg` |
| 尺寸 | 1920 × 1080，16:9 |
| 色彩 | sRGB |
| 文件体积 | 不超过 300 KB |
| 内容 | 与对应节点首个镜头或关键剧情一致，不包含播放按钮图形 |
| 安全区 | 关键人物与文字避开上下各 120 px 的播放器覆盖区域 |

JPEG 作为第一版封面格式，避免再增加 `<picture>` 或多格式封面回退逻辑。

## 4. 单文件验收

使用 `ffprobe` 输出流信息：

```text
ffprobe -v error \
  -show_entries stream=index,codec_type,codec_name,profile,level,pix_fmt,width,height,r_frame_rate,sample_rate,channels,channel_layout \
  -show_entries format=format_name,duration,size,bit_rate \
  -of json Node001.mp4
```

每个文件必须确认：

- 仅有一个主视频流和一个主音频流。
- 视频为 H.264、1920 × 1080、`yuv420p`、25/30 fps。
- 音频为 AAC-LC、48 kHz、双声道。
- 不包含意外的字幕、时间码、封面视频流或多语言音轨。
- MP4 顶层 Atom 顺序为 `ftyp` → `moov` → `mdat`；FFmpeg 的 `-movflags +faststart` 会把索引移动到文件前部。

## 5. HTTP Range 验收

视频部署到最终域名或测试域名后执行：

```text
curl -sS -D - -o NUL -H "Range: bytes=0-1" VIDEO_URL
```

通过标准：

- 状态码为 `206 Partial Content`，不能是 `200`。
- `Content-Range` 为 `bytes 0-1/完整文件大小`。
- `Content-Length` 为 `2`。
- `Content-Type` 为 `video/mp4`。
- 响应包含 `Accept-Ranges: bytes`。
- CDN、反向代理和源站行为一致；关闭缓存和命中缓存各测一次。

2026-09-20 本地联调结果：Vite 开发服务和生产预览服务中的 Node001–004 均返回 `206 Partial Content`、正确的 `Content-Range`、`Content-Length: 2`、`Content-Type: video/mp4` 和 `Accept-Ranges: bytes`。该结果仅覆盖本地 Vite 服务，不代表未来 CDN 或对象存储已经验收。

## 6. 移动端验收矩阵

“真机测试”必须使用真实 Safari/Chrome 内核，桌面浏览器调整 User-Agent 或 viewport 不能替代。

2026-09-20 已完成 390 × 844 移动视口浏览器验证：9:16 布局、`playsinline`、视频加载、播放结束和选择展示正常，控制台无错误。此结果不计为 iOS/Android 真机通过。

| 平台 | 最低覆盖 | 验收场景 |
| --- | --- | --- |
| iOS Safari | 项目最低支持 iOS 版本 + 当前正式版 | 首帧、内联播放、自动播放拦截、声音、切后台恢复、三条分支 |
| Android Chrome | 项目最低支持 Android 版本 + 当前 Chrome 正式版 | 首帧、内联播放、声音、切后台恢复、三条分支 |

每台设备均需验证：

1. 冷启动显示正确封面，不出现上一节点画面。
2. 自动播放被拦截时出现“点击播放”，点击后有声播放。
3. 播放中进入后台再返回，不重复触发 `video_completed`。
4. 节点切换后旧视频停止下载和播放。
5. 视频结束只显示一次选择；连续点击不会重复跳转。
6. 页面刷新能恢复当前节点或选择状态。

## 7. 弱网验收

至少执行两档冷缓存测试：

| 档位 | 下载 | 上传 | RTT | 预期 |
| --- | --- | --- | --- | --- |
| 弱 4G | 1.5 Mbps | 750 Kbps | 150 ms | 5 秒内出现首帧；缓冲时显示提示；可继续播放 |
| 严重弱网 | 512 Kbps | 256 Kbps | 400 ms | 不白屏；15 秒超时提示生效；最多允许 2 次重试 |

同时检查：封面持续可见、加载状态正确、恢复后不从错误节点继续、超时或重试不会重复推进剧情。

## 8. A/B/C 完整回归

当前已经采用以下拓扑：

```text
Node001(video)
├── A → Node002(video) → Ending002
├── B → Node003(video) → Ending003
└── C → Node004(video) → Ending004
```

三条路径分别从清空本地进度开始，完整播放两个视频，验证正确封面、正确视频、结局文案和路径历史。正式素材尚未上传，因此当前仍使用四个可独立映射的联调占位资源。

## 9. 完成定义

只有以下条件全部满足，才能将第五阶段标记为完成：

- 八个正式文件已交付并映射到 Node001–004。
- 四个 MP4 的 H.264、AAC、Fast Start 检查通过。
- 最终托管地址的 Range 请求检查通过。
- iOS Safari 与 Android Chrome 真机矩阵通过。
- 弱网两档通过。
- A/B/C 三条真实视频路径通过。

## 参考依据

- Apple Developer：[Delivering Video Content for Safari](https://developer.apple.com/documentation/webkit/delivering-video-content-for-safari)
- Android Developers：[Supported media formats](https://developer.android.com/media/platform/supported-formats)
- FFmpeg：[Formats documentation / `movflags=+faststart`](https://ffmpeg.org/ffmpeg-formats.html)
- FFmpeg：[ffprobe documentation](https://ffmpeg.org/ffprobe.html)
- IETF：[RFC 9110 HTTP Range Requests](https://www.rfc-editor.org/rfc/rfc9110.html#name-range-requests)
