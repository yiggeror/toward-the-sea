# 去看海吧 · There is a bigger world

一部约 5 分钟、没有对白的 2D 动画短片（导演版 v2）。雨夜的城市里，一张印着大海和灯塔的明信片被风拍在灰白色小猫“小灰”的脸上；画里的海动了起来。它叼起明信片出发：跳过月亮下的屋顶，穿过森林和溪水，顶着暴雨冲进山顶的公交站过夜，在梦里看见海，走过雪原。黎明的海角上，一阵狂风夺走了明信片，它追不上。它哭着爬上最后一道坡——真正的海就在眼前。在海边，海浪把明信片送了回来，画已经被洗白了；它抬头看着真实的大海，笑了，让浪把卡片带走。

*A wordless five-minute 2D short (director's cut). On a rainy city night a postcard of the sea slaps into the face of Hui, a small grey-and-white cat, and the painted sea comes alive. Hui carries it over moonlit rooftops, through forest and stream, into a storm and a night at a hilltop bus shelter, across the snow — until on a cape at dawn the wind tears it away. Crying, Hui climbs the last slope, and there is the real sea. On the beach the waves bring the card back, washed blank; Hui looks up at the real sea, smiles, and lets it go.*

每一帧画面都由本仓库的 JavaScript 代码在 Canvas 2D 上逐帧绘制（程序动画，没有任何素材图片）；配乐由代码按画面作曲并合成；音效来自 Freesound 的 CC0 录音，按动画导出的事件逐帧对位。

## 观看 · Watch

成片在 [`video/`](video/)，1920×1080、24 fps、H.264 + AAC 立体声，4 分 57 秒。每一帧都先按 3840×2160
绘制再滤波缩小（2× 超采样）。

VIDEO_TABLE

GitHub 单个文件不能超过 100 MB，所以成片在关键帧处切成几段；每段都能单独播放，也可以无损拼回一个完整文件：

```sh
cd video && ffmpeg -f concat -safe 0 -i parts.txt -c copy toward-the-sea_1080p.mp4
```

第一版（v1，8 分 13 秒，几乎全是横向侧面镜头）保留在 [`video/v1/`](video/v1/) 以供对照。

## 五幕 · Five acts

| 幕 | 时间 | 内容 |
|---|---|---|
| 一 城市·雨夜 | 0:00–1:18 | 车底下亮起的眼睛；明信片拍在脸上；画里的海动起来；下定决心；在月亮前飞越屋顶；黎明的城市边缘，片名 |
| 二 旅程 | 1:18–2:38 | 森林里朝镜头跑来；蝴蝶停在卡片上（斗鸡眼）；过溪、滑倒、委屈；爪子踩过草地→落叶→泥地→碎石；顶风上山；第一滴雨；在暴雨里朝镜头冲来、炸雷；冲向亮灯的公交站小棚；长椅上的夜；梦见海；醒来；雪原 |
| 三 海角 | 2:38–3:20 | 黎明顶风爬坡；狂风夺走卡片；追、翻上岩石、慢镜头飞扑——差一点；卡片飞向海；巨大的天空下小小的身影；眼泪 |
| 四 海 | 3:20–3:54 | 耳朵动了一下——海浪声；爬上最后的坡；明信片的画化开成真实的海；日出里的脸 |
| 五 海边 | 3:54–4:57 | 冲下沙丘；迎着晨光跑向海；与浪的游戏；浪漫过爪子；洗白的卡片回来了；退浪把它带进阳光的碎金；沿着浪边朝灯塔跑去 |

完整的分镜与配乐设计：[`docs/treatment_v2.md`](docs/treatment_v2.md)。

## 重新生成 · Regenerate

需要 Node 18+、Python 3（numpy、scipy、soundfile）、带 libx264 的 ffmpeg。

```sh
npm install                      # playwright（无头 Chromium）、esbuild、ws
npx playwright install chromium  # 如果本机还没有 Chromium

# 1. 从动画导出镜头边界和全部事件（脚步、落地、溅水、雷声、浪、情绪符号……）
node tools/export_events.mjs                 # -> build/timeline.json

# 2. 下载 CC0 录音（按 audio/sources.json 里记录的原文件，不重新搜索）
python3 tools/fetch_sounds.py --exact        # -> audio/src/*.ogg

# 3. 作曲 + 混音：tools/score.py 以时间线为“节拍器”按画面作曲（剪辑点起、笑点落、
#    慢镜头里屏住呼吸），mix.py 铺环境声、对位音效和拟音，母带 -18 LUFS
python3 tools/mix.py --report                # -> build/mix.wav（--report 打印每个镜头各声部的响度）

# 4. 逐帧渲染并封装（多个无头页面并行，每帧原始 RGBA 通过 WebSocket 送进 ffmpeg）
#    --ss 2：每一帧先按 3840×2160 绘制再滤波缩小到 1080p
node tools/render.mjs --timeline film --w 1920 --h 1080 --ss 2 --jobs 4 --crf 17 --preset slow \
  --audio build/mix.wav --out build/film_1080p.mp4
#    只看某几帧：node tools/frame.mjs --shots E2,E4c --u 0.5 --ss 2   （PNG 输出到 build/frames）
#    镜头联系表：node tools/snap.mjs out.png "view=shotstrip&seq=act5&shots=E1,E2&us=0.2,0.8"

# 5. 由混音实际用到的录音生成 CREDITS.md
python3 tools/credits.py
```

渲染是确定性的：同样的代码得到同样的画面和声音，所以也可以只重渲某一段（`--from/--to`）再无损拼接。
在 4 核机器上，2× 超采样的 1080p 全片约 25 分钟。

## 它是怎么做的 · How it works

- **三维布景，二维角色**（`src/film/persp.js`）：每个镜头有一台透视摄影机——位置、朝向（yaw）、俯仰（pitch）、推轨（dolly）、升降——布景是真正的三维：城市小巷（一点透视，湿地倒影）、森林与溪流、风雨中的山丘、海角草坡（高度场，按剖面切片求轮廓线填充，从任何方向看都正确）、三维公交站小棚、沙滩（逐格光线求交着色：干沙、湿沙、倒映天空的薄浪、浪花、海与太阳的碎金；浪线与泡沫是三维折线；沙丘、岬角与灯塔、太阳、云和海鸥都在世界坐标里）。于是同一个地方可以正拍、反打、过肩、主观、俯拍、仰拍，而不是只有横向侧面。
- **角色**（`src/cat/`、`src/film/cast.js`）：侧面身体是带脊柱曲线的程序化骨架、两段 IK 的腿；头部是椭球的三维投影。正面、背面、坐姿正/背面和特写各有专门的画法，在三维布景里按世界坐标站位、走位，步态相位由走过的路程推进（不打滑），脚步事件驱动声音和沙滩上会被浪抹掉的脚印。侧面表演也可以放在转过角度的“舞台平面”上，与三维布景对齐。
- **表演**（`src/anim/`）：按组分轨的关键帧，逐段决定一拍一/一拍二；预备、挤压拉伸、跟随、停顿；18 种表情、情绪符号（！？音符、汗滴、ZZZ……）和一直在运行的眨眼、呼吸、耳朵抖动。
- **剪辑与时间**（`src/film/shot.js`）：镜头可以变速（慢镜头飞扑、屋顶飞越），事件按输出帧对齐；叠化、淡入淡出；v1 的少数镜头经重新计时后复用（`src/scenes/v1.js`）。
- **光与后期**（`src/film/post.js`）：泛光、以光源为中心的径向光束（沙滩上跟着太阳在画面里的位置走）、镜头光晕、按层景深/大气透视、闪电、暗角与颗粒。
- **声音**（`tools/score.py`、`tools/mix.py`）：配乐由程序合成（加法钢琴、弦乐、马林巴、钟琴、竖琴、长笛、轻打击），以导出的时间线作曲：明信片动机在捡到卡片时出现、在卡片被洗白回来时再现，主题在看见大海时完整奏响；音效按事件逐帧放置。

## 目录 · Layout

| 路径 | 内容 |
|---|---|
| `src/core/` | 数学、绘图工具、关键帧轨道 |
| `src/cat/` | 小灰的造型、骨架、头部三维模型、各个视角 |
| `src/anim/` | 表演轨道、步态、动作库、跟随、idle 细节 |
| `src/env/` | 天空、城市小巷、森林/山丘/草坡、天气、光效 |
| `src/film/` | 镜头、透视摄影机、角色站位、调色、后期、明信片、海景构图 |
| `src/scenes/act1.js … act5.js` | 五幕的全部镜头；`beach3.js` 三维沙滩，`storm3.js` 暴雨山顶与公交站；`v1.js` 复用的 v1 镜头 |
| `src/render/`, `src/player/` | 离线渲染页、网页播放器 |
| `src/dev/`, `web/dev.html` | 开发用视图：造型表、表情表、镜头联系表 |
| `tools/` | 渲染、单帧导出、事件导出、作曲、混音、下载音效、生成致谢 |
| `docs/treatment_v2.md` | 导演版剧本与分镜 |
| `audio/sources.json` | 每条录音的作者、标题、链接、许可（CC0） |

制作记录见 [PROGRESS.md](PROGRESS.md)，素材与字体来源见 [CREDITS.md](CREDITS.md)。
