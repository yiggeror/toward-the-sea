# 去看海吧 · There is a bigger world

一部约 8 分钟、没有对白的 2D 动画短片。一只灰白色的小猫“小灰”在雨后的城市夜里捡到一张印着大海和灯塔的明信片，于是叼着它出发：穿过森林，顶着大风和暴雨，在废弃的公交站过夜，走过荒原和雪原，在海角被一阵风夺走了明信片。它追不上，只能看着它飞走。就在这时，它听见了海浪声。

*A wordless 8-minute 2D short. Hui, a small grey-and-white cat, finds a postcard of the sea on a rainy city night and carries it across forest, storm, night, wasteland and snow, until the wind takes it on a cape. Then Hui hears the sea.*

每一帧画面都由本仓库的 JavaScript 代码在 Canvas 2D 上逐帧绘制（程序动画，没有任何素材图片）；配乐由代码作曲并合成；音效来自 Freesound 的 CC0 录音，按动画导出的事件逐帧对位。

## 观看 · Watch

成片在 [`video/`](video/)，1920×1080、24 fps、H.264 + AAC 立体声，8 分 13 秒。每一帧都先按 3840×2160
绘制再滤波缩小（2× 超采样），所以线条和细节比直接画 1080p 更干净。

- `video/toward-the-sea_1080p_part1.mp4`
- `video/toward-the-sea_1080p_part2.mp4`

GitHub 单个文件不能超过 100 MB，所以成片在关键帧处切成两段；两段可以依次单独播放，也可以无损拼回一个完整文件：

```sh
cd video && ffmpeg -f concat -safe 0 -i parts.txt -c copy toward-the-sea_1080p.mp4
```

网页播放器（可选，实时绘制同一部片子）：`npm run serve`，然后打开 <http://localhost:8080/web/player/>。

## 重新生成 · Regenerate

需要 Node 18+、Python 3（numpy、scipy、soundfile）、带 libx264 的 ffmpeg。

```sh
npm install                      # playwright（无头 Chromium）、esbuild、ws
npx playwright install chromium  # 如果本机还没有 Chromium

# 1. 从动画导出镜头边界和全部事件（脚步、落地、溅水、雷声……）
node tools/export_events.mjs                 # -> build/timeline.json

# 2. 下载 CC0 录音（按 audio/sources.json 里记录的原文件，不重新搜索）
python3 tools/fetch_sounds.py --exact        # -> audio/src/*.ogg

# 3. 混音：环境声、对位音效、合成拟音、配乐，母带 -18 LUFS
python3 tools/mix.py --report                # -> build/mix.wav（--report 打印每个镜头各声部的响度）

# 4. 逐帧渲染并封装（3 个无头页面并行，每帧原始 RGBA 通过 WebSocket 送进 ffmpeg）
#    --ss 2：每一帧先按 3840×2160 绘制再滤波缩小到 1080p（超采样抗锯齿，
#    半分辨率/四分之一分辨率的模糊、泛光、倒影缓冲也随之翻倍）
node tools/render.mjs --timeline film --w 1920 --h 1080 --ss 2 --jobs 3 --crf 16 --preset slow \
  --audio build/mix.wav --out build/film_1080p.mp4
#    只看某几帧：node tools/frame.mjs --shots 8.3,9.4 --u 0.5 --ss 2  （PNG 输出到 build/frames）

# 5. 由混音实际用到的录音生成 CREDITS.md
python3 tools/credits.py
```

渲染是确定性的：同样的代码得到同样的画面和声音，所以也可以只重渲某一段（`--from/--to`）再无损拼接。
在 4 核机器上，2× 超采样的 1080p 全片约 60 分钟（不超采样约 25 分钟）。

## 它是怎么做的 · How it works

- **角色**（`src/cat/`）：侧面身体是一条带脊柱曲线的程序化骨架，趾行的四条腿用两段 IK 解算；头部是几个椭球的三维投影（凸包轮廓 + 投影上去的花纹），所以转头、低头时脸的透视是连续的。正面、背面、特写各有专门的画法。
- **表演**（`src/anim/`）：按组分轨的关键帧（身体、头颈、每条腿、尾巴、耳朵、眼睛、嘴），逐段决定一拍一/一拍二/一拍三；步态引擎把爪子钉在地面上，按走过的距离推进相位，所以不会打滑；预备、挤压拉伸、跟随、停顿、拖影都在动作库里。尾巴、耳朵、胡须的延迟跟随是无状态的阻尼弹簧卷积，可以任意跳帧。
- **情绪**：18 种表情（眼皮角度、眯眼、泪光、腮红、嘴形、胡须下垂……），加上漫画式的情绪符号（！、？、闪光、音符、汗滴、ZZZ、冷气），以及一直在运行的“活着”的细节：眨眼（偶尔连眨）、转头时眨眼、眼神跳动、耳朵抖动、呼吸、重心轻移。
- **环境与光**（`src/env/`、`src/scenes/`）：多层纵深视差；霓虹、路灯光锥、积水倒影、体积光、雾、雨帘、闪电、月光、雪粒、热浪；每个镜头有自己的调色和后期（泛光、以光源为中心的径向光束、镜头光晕、按层景深/大气透视）。
- **声音**（`tools/mix.py`、`tools/music.py`）：每个动画事件带着表面类型、力度和步态，混音脚本在对应的帧上放声音；环境声按场景铺底、交叉淡化，先按中位电平压住突发的大声，再按响度目标对齐；配乐是加法合成的钢琴、弦乐垫音和钟声，主题动机在“捡到明信片”时第一次出现，在“看见大海”时完整奏出。

## 目录 · Layout

| 路径 | 内容 |
|---|---|
| `src/core/` | 数学、绘图工具、关键帧轨道 |
| `src/cat/` | 小灰的造型、骨架、头部三维模型、各个视角 |
| `src/anim/` | 表演轨道、步态、动作库、跟随、idle 细节 |
| `src/env/`, `src/fx/` | 天空、城市、自然、天气、光效；情绪符号、边缘光 |
| `src/film/` | 镜头、摄影机、分层纵深、调色、后期、明信片、海景构图、字体 |
| `src/scenes/` | 九个段落的全部镜头（城市、森林、风雨、夜、荒原、雪原、海角、大海、沙滩） |
| `src/render/`, `src/player/` | 离线渲染页、网页播放器 |
| `src/dev/`, `web/dev.html` | 开发用视图：造型表、表情表、镜头联系表、分层调试（`node tools/snap.mjs out.png "view=seqsheet&seq=city"`） |
| `tools/` | 渲染、事件导出、混音、作曲、下载音效、生成致谢、性能测试 |
| `docs/storyboard.md` | 分镜表 |
| `reference/` | 造型设定图 |
| `audio/sources.json` | 每条录音的作者、标题、链接、许可（CC0） |

制作记录见 [PROGRESS.md](PROGRESS.md)，素材与字体来源见 [CREDITS.md](CREDITS.md)。
