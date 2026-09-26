#!/usr/bin/env python3
"""Write CREDITS.md from audio/sources.json (what was downloaded, with author,
title, link and license) and audio/used.json (what tools/mix.py actually used).

usage: python3 tools/credits.py
"""
import json
import os
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# what each recording does in the film
USE = {
    'city_night': '城市夜晚底噪 / city night bed (1.1–1.9)',
    'drips': '屋檐滴水、细雨 / drips and fine rain (city, shelter, night)',
    'drip_single': '水滴落在小灰头上、鼻子上、明信片上 / the single drops (1.2, 1.5, 3.3)',
    'birds_dawn': '城市边缘的清晨鸟鸣 / dawn chorus at the city edge (1.10)',
    'forest_birds': '森林鸟鸣 / forest birds (2.x)',
    'wind_light': '森林里的微风 / light forest air (2.x)',
    'stream': '小溪 / the stream the cat crosses (2.4–2.5)',
    'splash': '踩水、溅水 / splashes and water steps (2.4, 2.5, 9.3)',
    'grass_wind': '草丘与海角的大风 / wind through grass (3.x, 7.x)',
    'wind_strong': '呼啸的风 / howling wind layer (3.x, 7.x)',
    'wind_gust': '阵风（吹走明信片的那一阵）/ gusts, incl. the one that steals the postcard',
    'rain_storm': '暴雨（户外）/ the downpour on the hills (3.3–3.5)',
    'rain_heavy': '暴雨低频层 / heavy rain body (3.3–3.6)',
    'rain_tin': '雨打铁皮屋顶 / rain on the shelter\'s tin roof (3.6–3.7)',
    'thunder_far': '远雷 / distant thunder (3.4, 3.7)',
    'thunder_crack': '近雷 / the thunder clap (3.5)',
    'crickets_night': '夜里一只近处的蟋蟀 / a single close cricket (4.x)',
    'crickets_field': '夜晚田野的虫鸣 / night insects (4.x)',
    'truck_far': '远处驶过的卡车 / a truck passing far away in the night (4.2)',
    'owl': '猫头鹰 / the owl (4.2)',
    'wind_soft': '柔和的风 / soft breeze (1.10, 4.4, 8.x, 9.x)',
    'desert_wind': '荒原的风 / wasteland wind (5.x)',
    'dry_rustle': '干草沙沙、风滚草 / dry grass, the tumbleweed (5.x)',
    'snow_wind': '雪原夜风 / snowfield wind (6.x)',
    'snow_steps': '踩雪声（切成单步）/ snow footsteps, cut into single steps (6.x)',
    'steps_grass': '草地脚步（切成单步）/ grass footsteps, cut into single steps',
    'sand_steps': '沙地脚步（切成单步）/ sand footsteps, cut into single steps (9.x)',
    'sea_gentle': '平静的海浪 / gentle sea (8.x, 9.x)',
    'waves_far': '远海低鸣 / distant sea rumble (8.3–8.4)',
    'waves_beach': '海浪拍岸 / waves on the beach (9.x)',
    'wave_wash': '浪花漫过脚边 / waves washing up the sand (9.3–9.4)',
    'seagulls': '海鸥 / gulls (9.x)',
    'paper_flap': '明信片被风吹动 / the postcard flapping',
    'paper_rustle': '明信片的纸声 / paper handling (pick up, put down, pat)',
    'cloth_shake': '甩水（抖毛）/ body shakes after getting wet',
    'can_drop2': '铁罐落地 / the tin can (1.9)',
}


def main():
    meta = json.load(open(os.path.join(ROOT, 'audio', 'sources.json')))
    used_path = os.path.join(ROOT, 'audio', 'used.json')
    used = json.load(open(used_path)) if os.path.exists(used_path) else list(meta)
    order = list(USE)
    rows = [(name, meta[name]) for name in used if name in meta]
    rows.sort(key=lambda r: order.index(r[0]) if r[0] in order else len(order))
    out = ['# Credits · 致谢', '',
           '## 《去看海吧》 There is a bigger world', '',
           '- 故事、角色、画面、动画：全部由本仓库的代码逐帧绘制（Canvas 2D，程序动画，无素材图片）。',
           '  Story, character, images and animation: drawn frame by frame by the code in this repository.',
           '- 配乐：原创，在 `tools/score.py`（乐器见 `tools/music.py`）中按画面用代码作曲并合成（加法合成钢琴、弦乐、马林巴、钢片琴、钟琴、竖琴、长笛、轻打击，卷积混响），没有使用采样。',
           '  Music: original score composed to picture and synthesized in code (`tools/score.py`, `tools/music.py`), no samples.',
           '- 程序合成的拟音（`tools/mix.py`）：肉垫落地（湿路面、泥土、木板）、嗅闻、舔嘴、喷嚏、铁罐滚动、挥爪风声、甩下的水珠、',
           '  喘气、打滑、表情提示音（感叹号、问号、闪光、音符）。',
           '  Synthesized foley: paw pads, sniffs, licks, a sneeze, the rolling can, swishes, droplets, panting, skids, emotion cues.',
           '',
           '## 声音素材 · Sound recordings', '',
           '全部来自 [Freesound](https://freesound.org)，许可均为 **CC0 1.0（公共领域贡献）**。CC0 不要求署名，这里仍然逐条列出作者以示感谢。',
           'All recordings are from Freesound and licensed **CC0 1.0 (public domain dedication)**. Attribution is not required but is given with thanks.',
           'The mix uses Freesound\'s high-quality Ogg previews, looped, filtered, levelled and cut by `tools/mix.py`.',
           '',
           '| 用途 · Use | 标题 · Title | 作者 · Author | 许可 · License |',
           '|---|---|---|---|']
    for name, m in rows:
        author = unquote(m['author'])
        title = m['title'].replace('|', '/').replace(' by ' + author, '')
        out.append(f"| {USE.get(name, name)} | [{title}]({m['url']}) | {author} | CC0 1.0 |")
    out += ['',
            '## 字体 · Fonts', '',
            '- [ZCOOL XiaoWei 站酷小薇](https://fonts.google.com/specimen/ZCOOL+XiaoWei) — SIL Open Font License 1.1 (`web/fonts/OFL-ZCOOLXiaoWei.txt`). 片名与片尾字卡。',
            '- [Cormorant Garamond](https://fonts.google.com/specimen/Cormorant+Garamond) Italic — SIL Open Font License 1.1 (`web/fonts/OFL-CormorantGaramond.txt`). 英文副标题。',
            '',
            '两者都只保留了片中用到的字形（`pyftsubset` 子集化）。Both are subsets holding only the glyphs the film uses.',
            '',
            '## 工具 · Tools', '',
            '- Chromium (headless, via Playwright) draws every frame; FFmpeg + x264 encode the video, AAC the sound.',
            '- NumPy, SciPy and soundfile for the mix and the score; esbuild and ws for the dev pages and the renderer.',
            '']
    path = os.path.join(ROOT, 'CREDITS.md')
    with open(path, 'w') as f:
        f.write('\n'.join(out))
    print(f'wrote CREDITS.md ({len(rows)} recordings)')


if __name__ == '__main__':
    main()
