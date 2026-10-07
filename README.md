# Ambient light for Bilibili

为 Bilibili 桌面播放页添加随视频变化的氛围光。当前源码 **0.5.3.10**，Firefox 桌面版已提交 AMO 审核；现有 GitHub 正式版为 **0.5.3.9**。Manifest V3，原生 JavaScript，无第三方构建或运行时依赖。

![扩展图标](extension/icons/128.png)

## Firefox 商店进展（2026-10-07）

**0.5.3.10 已提交 Mozilla Add-ons，当前等待审核，尚未公开提供安装。** 发布者为 Deperenn，采用 MIT 许可证，面向 Firefox 桌面端 140 及以上版本。审核完成后可通过 [Firefox Add-ons 商店页面](https://addons.mozilla.org/zh-CN/firefox/addon/ambient-light-for-bilibili/) 安装；等待期间该页面可能无法公开访问。Chrome / Edge 用户可继续使用现有商店版本或 GitHub 0.5.3.9 正式版。

## 0.5.3.10：Firefox 桌面版

同一套功能源码分别生成 Chromium（Chrome/Edge）与 Firefox 发行包。Firefox 包使用 MV3 后台脚本、固定扩展 ID `ambient-light-for-bilibili@tosya301`，最低版本设为桌面 Firefox 140；不声明 Android 支持。权限仍为 `storage`，内容脚本站点仍限 `www.bilibili.com` 与 `live.bilibili.com`。Firefox 声明无数据传输，并附带可离线查看的内置隐私政策。

Firefox 157.0.1 已通过 9 组本地合成场景、136 项检查，76 项 Node 测试通过；临时扩展已在真实 B 站视频页和直播间轮播验证。原生容器全屏、快捷键、工具栏入口与内置隐私政策已检查。2026-10-07 已提交 AMO（等待审核），签名安装与升级仍待验证，详情见 [QA.txt](QA.txt)。

使用下方打包命令生成两个发行包；原始 `extension/manifest.json` 保持 Chromium 入口，不能直接作为 Firefox 包使用。Firefox 发行 ZIP 需经 Mozilla 签名后用于普通用户安装，本地开发可在 `about:debugging#/runtime/this-firefox` 临时加载生成目录中的 `firefox/manifest.json`，重启浏览器后临时扩展会移除。

## 0.5.3.9 正式版：播放器圆角与阴影

「画面」页新增「播放器外观」：YouTube 同款圆角开关，以及 0–100% 的边框阴影滑块。两项默认关闭，保留已有外观；0% 完全关闭阴影，设置保存于本机，切换光效预设不会重置。

2026-10-05 实测 YouTube 桌面直播页 `#ytd-player`：普通模式 `border-radius: 12px; overflow: hidden`，影院模式恢复 0px。B 站普通视频、稍后再看和直播使用相同的 12px 圆角；宽屏恢复直角，网页／原生全屏撤去圆角与阴影，退出后恢复。阴影只围绕画面区，不包含发送栏、主播顶栏或聊天框；不缩放、拉伸或淡化视频。

启动本地服务器后，可打开 [直播预览](http://127.0.0.1:8768/demo/live.html) 或 [视频预览](http://127.0.0.1:8768/demo/index.html)，开启氛围光，在「画面」调整这两项。支持运行「圆角与阴影自检」。正式安装包见 [GitHub 0.5.3.9](https://github.com/tosya301/ambient-light-for-bilibili/releases/tag/v0.5.3.9)，验证记录见 [QA.txt](QA.txt)。

2026-10-05：0.5.3.9 已发布 GitHub；Chrome 与 Edge 商店均已提交审核，提交时的公开版本为 0.5.3.8。

## 0.5.3.8 正式版（历史）

[GitHub 0.5.3.8](https://github.com/tosya301/ambient-light-for-bilibili/releases/tag/v0.5.3.8) 修复普通视频、番剧与稍后再看网页全屏时，顶部头像与导航、标题和推荐等网页 UI 透入视频留白的问题。竖屏两侧仍有动态氛围光，画面保持完整比例；弹幕和播放器控件保留。

退出全屏恢复普通页面透光；零光强、关闭深色页面背景或暂停时仍保持全屏遮挡。保留 0.5.3.7 的直播修复和所有已有设置，权限不变。

本地浏览器验证使用同一套生产代码与 540×960 合成视频，并复现真实站点的固定顶部导航层级。真实 B 站已核对全屏与导航结构；新版已安装扩展、Windows F11 和第三方扩展组合尚未实机复测。68 项 Node 测试与 77 项本地浏览器检查通过，详细结果见 [QA.txt](QA.txt)。

更新后重新加载扩展并刷新视频页。启动本地预览服务器后，可打开 [竖屏验证页](http://127.0.0.1:8768/demo/index.html?portrait=1) 或 [稍后再看竖屏验证页](http://127.0.0.1:8768/demo/watchlater.html?portrait=1)，开启氛围光并运行「竖屏全屏专项自检」。

## 0.5.3.7 正式版（历史）

[GitHub 0.5.3.7](https://github.com/tosya301/ambient-light-for-bilibili/releases/tag/v0.5.3.7) 修复直播网页模式上下留白透出主播顶栏、活动横幅和下方内容的问题。支持保留聊天栏的网页模式及全宽网页全屏；背景先遮挡底层页面，再叠加氛围光，视频仍按原比例完整显示。

退出网页模式、关闭氛围光或停播时移除新增背景，普通直播页面继续透光。保留 `/blanc/房间号` 原版直播间、稍后再看、可拖动圆形入口和「更多」→「页面图标」→「隐藏悬浮图标」设置；权限仍仅为 `storage`。

64 项 Node 测试、15 项网页模式专项和 19 项既有直播浏览器检查通过。成图覆盖 1728×1117 与 917×968 视口，另验证铺满画面时的背景和退出还原。旧版问题已在真实直播间复现；修复后的成图与检查使用同一套生产代码、本地合成视频及实际观察到的页面层级。Windows F11 按键和更新后的已安装扩展尚未实机复测，不能以本地验证替代。详见 [QA.txt](QA.txt)。

更新时替换原加载目录的文件，重新加载扩展并刷新直播页，已有设置会保留。可在 [合成直播验证页](http://127.0.0.1:8768/demo/live.html) 运行「直播自检」及「网页模式回归」。

## 0.5.3.6 隐藏悬浮图标

「更多」中，在「深色页面背景」下新增「页面图标」区域，可打开「隐藏悬浮图标」。默认关闭，选择保存于当前浏览器本机；隐藏只影响页面入口，不关闭氛围光。需要恢复时，从浏览器工具栏的扩展图标进入设置，关闭此选项即可。

## 0.5.3.4 可拖动圆形入口（随 0.5.3.5 发布）

上一版本 `0.5.3.4`，基于已发布的 `v0.5.3.3`。右下角入口改为 48px 圆形小电视，可用鼠标或主触控指针拖动避开页面按钮；点击仍打开设置。拖动不会触发点击，窗口缩小后入口仍保留在可见范围内，面板随位置避让。

每次开启或关闭氛围光时回到右下角默认位置；关闭设置面板、调整预设及其他参数时保留当前位置。刷新页面后也回到默认位置，拖动位置不会写入存储。加载本目录 `extension` 后重新加载扩展并刷新播放页即可使用。该功能已随 0.5.3.5 正式版发布，验证范围见 [QA.txt](QA.txt)。

## 0.5.3.3 稍后再看修复（历史预发布）

已发布版本为 `0.5.3.3`，基于 GitHub `v0.5.3.2`（`391ef5f`）。新增 `/list/watchlater/` 详情播放页支持，复用普通点播的光效设置、深色背景、透明组件、宽屏／全屏及可选自动去边。稍后再看队列、分 P 与选中项透光，封面和当前项高亮保留；连续换片、播放器替换、离开和返回时自动处理。

重新加载本目录的 `extension` 后刷新详情播放页即可沿用已有设置。首页按钮打开的迷你浮窗与最终详情播放页是不同页面，本次适配后者。权限和注入域名不变，安装包见 [GitHub Release](https://github.com/tosya301/ambient-light-for-bilibili/releases/tag/v0.5.3.3)。

使用下方本地预览服务器可打开 [稍后再看验证页](http://127.0.0.1:8768/demo/watchlater.html)，开启氛围光后运行点播功能和稍后再看专项自检。该页面使用合成视频及真实组件结构，不是 B 站内容副本。

本次验证：43 项 Node 测试和 47 项本地浏览器检查通过；真实页面已检查路由与组件结构，更新后的扩展注入仍需重新加载后验收。详情见 [QA.txt](QA.txt)。

## 0.5.3.2 直播预览版（基于 0.5.3）

直播适配基线提交 `753b8b2`，已发布扩展版本 `0.5.3.2`，界面标记 `0.5.3 · LIVE 2`。通过 [GitHub Release](https://github.com/tosya301/ambient-light-for-bilibili/releases/tag/v0.5.3.2) 提供源码与安装包，保留预发布标记。

直播复用原有 256px 低分辨率采样、帧率上限和过渡平滑，将光投射到导航、标题、聊天区和礼物栏背后。只调整底板，不改变视频、头像、勋章、礼物图或聊天内容。直播保留完整画面，自动去边仍仅用于点播宽屏。

- 支持 `https://live.bilibili.com/数字房间号`；首页、分区和活动页不启用。
- 只取 `#live-player` 中可见的视频，排除礼物和预览播放器；换清晰度或重建播放器后自动重新绑定。
- 暂停保留光色并停绘，隐藏页面停绘；视频结束/移除时恢复底板，重连后继续。
- 网页全屏检测实际固定布局；原生容器全屏沿用原逻辑。画面铺满窗口时没有外侧投光空间，会待机。
- 保留 0.5.3 设置与同意门禁。权限仍仅 `storage`，内容脚本新增直播域名。
- SC 轮播底板、下方动态与直播卡片、公告／荣誉／简介区域透明；保留金额标签、图片和操作菜单，修正深色公告文字。

本地预览：`python3 -m http.server 8768 --bind 127.0.0.1`，打开 [合成直播演示](http://127.0.0.1:8768/demo/live.html)。首次点击右下角“氛围光”并开启；选择“绚彩”，扩散设为 400%，可观察接近参考图的整页效果。演示使用真实生产脚本与持续变化的合成视频，不代表真实 CDN/浏览器扩展注入验收。

本地安装：加载本目录的 `extension` 文件夹。若另有旧版扩展启用，测试时先禁用旧版，避免两份脚本同时运行。刷新直播页后开启氛围光。回退时禁用此实验版，恢复旧版并刷新。

已安装本地实验版：替换原加载目录内的文件，重新加载扩展，再刷新直播页。SC 与下方卡片的静态样式验证页为 [live-surfaces.html](http://127.0.0.1:8768/demo/live-surfaces.html)。

验证证据与尚未验证项见 [QA.txt](QA.txt)。

## 功能

- 随视频画面变化的柔和光效，提供柔和、影院、绚彩三个预设。
- 调整强度、30–400% 扩散、柔化、饱和度、平滑和 8–30 fps 采样上限。
- 设置面板中的山峦预览随参数变化；支持可切换的深色页面背景。
- 宽屏模式可选上下黑边、左右黑边、纯色边框识别及等比例填充，四项默认关闭。
- 所有视频处理在本机完成，设置保存于浏览器本地。

## 安装与使用

下载 [GitHub 0.5.3.9 正式版](https://github.com/tosya301/ambient-light-for-bilibili/releases/tag/v0.5.3.9) 的 `Ambient-light-for-Bilibili-0.5.3.9.zip`，解压后可本地加载。包含点播、稍后再看、普通与 `/blanc/` 直播间、全屏背景修复、可隐藏的拖动入口，以及圆角与阴影选项。商店版本受审核进度影响，可通过 [Chrome Web Store](https://chromewebstore.google.com/detail/ambient-light-for-bilibil/inmkpmcmgnhbljonlgacogfbffdcckjj) 或 [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/fhdfccdfkecapkgldeifoplbjoccnjak) 查看当前可用版本。

Chromium 本地安装：下载本仓库，在浏览器扩展管理页打开开发者模式，选择“加载已解压的扩展”，加载 **extension** 文件夹，然后刷新 Bilibili 播放页面。Firefox 使用上方单独说明的生成包和临时加载方式。

点击页面右下角的小电视按钮或工具栏扩展图标打开设置，阅读本地处理说明并明确同意后才会开启。可在“更多”撤回同意并停止处理。默认快捷键为 **Alt+Shift+A**；可在浏览器的扩展快捷键设置中调整。更新时替换同一目录内的文件，再重新加载扩展并刷新页面，以保留扩展 ID 和设置。

## 支持范围与限制

面向桌面端 `www.bilibili.com/video/`、`www.bilibili.com/bangumi/play/`；0.5.3.3 增加 `www.bilibili.com/list/watchlater/` 详情播放页。直播支持 `live.bilibili.com/数字房间号` 与 `live.bilibili.com/blanc/数字房间号`；不支持移动端或第三方嵌入播放器。Bilibili 页面更新或其他主题扩展可能影响显示。

去边仅在 Bilibili 宽屏模式启用，不在网页全屏或原生全屏启用。含字幕、复杂边框或无法读取像素时可能保留原画；不修改视频地址，不绕过受保护媒体或访问限制。

历史验证（0.5.3.2）：39 项 Node 测试通过；直播适配阶段完成 28 项本地点播与 19 项本地合成直播浏览器检查，0.5.3.2 另验证 SC、下方卡片透光、深浅色和关闭还原。真实直播页已检查组件结构，用户确认本地版本可用；这些记录不代表已完成全部浏览器宿主场景验收。Edge 宿主、原生全屏、清晰度切换、其他房间皮肤及实际设备性能仍待专项验证。详见 [QA.txt](QA.txt)。

## 隐私与支持

扩展在本机临时处理当前视频画面；主动开启去边时分析低分辨率像素。设置仅保存在 `chrome.storage.local`。没有视频上传、广告、统计或遥测服务，不读取 Cookie 或账号密码。

| 发行渠道 | 发布者 | 支持邮箱 | 隐私政策 |
| --- | --- | --- | --- |
| Chrome Web Store | Deperenn | txim301@gmail.com | [Chrome 版政策](https://tosya301.github.io/ambient-light-for-bilibili/privacy-chrome.html) |
| Microsoft Edge Add-ons | TXIM301 | txim301@outlook.com | [Edge 版政策](https://tosya301.github.io/ambient-light-for-bilibili/privacy-edge.html) |
| [Firefox Add-ons（等待审核）](https://addons.mozilla.org/zh-CN/firefox/addon/ambient-light-for-bilibili/) | Deperenn | txim301@gmail.com | [Firefox 版政策源码](docs/privacy-firefox.html)，发行包内可离线查看 |

[项目与政策页面](https://tosya301.github.io/ambient-light-for-bilibili/)

## 开发与测试

```sh
npm test
npm run demo
```

运行后访问 `http://127.0.0.1:8765/demo/` 查看合成视频演示，访问 `/demo/settings.html` 查看设置界面。演示使用与扩展相同的代码，设置仅暂存内存，不代表浏览器宿主注入或商店安装验收。

发行打包需要 Node.js 18 或更高版本，不需要 `npm install`：

```sh
npm run package
# 或只生成 Firefox 包：
npm run package:firefox -- --out-dir dist-firefox
```

默认在 `dist/chromium/` 和 `dist/firefox/` 写出加载目录，并生成带版本与浏览器名称的 ZIP，以及可重现的 `-source.zip`。打包只白名单复制运行文件、MIT 许可证和 Firefox 内置隐私政策，排除演示、测试、调查截图及未使用的图标；不会改写源码 manifest。脚本拒绝覆盖已有发行目录或 ZIP，重复打包应通过 `--out-dir` 选择新的输出目录。

源码 ZIP 内的 `BUILDING.txt` 提供离线重现步骤。JavaScript、HTML 和 CSS 原样复制，仅生成 Firefox manifest；ZIP 使用固定时间、文件权限和顺序，因此相同源码得到相同归档内容。源码 ZIP 中保留隐私页来源和打包脚本，可作为 AMO 对应版本的审核材料。固定 Gecko ID 用于同一 AMO 条目的后续升级，版本号必须递增；不同浏览器的本地设置不会自动迁移。

```text
extension/    可加载的扩展源码与图标
scripts/      无依赖的多浏览器发行打包脚本
demo/         本地合成视频演示、界面预览及浏览器检查
tests/        Node 测试
docs/         GitHub Pages 项目与隐私政策页面
branding/     图标原图
```

[历史开发记录](CHANGELOG.md)

## 项目说明

灵感来自 [Ambient light for YouTube](https://chromewebstore.google.com/detail/ambient-light-for-youtube/paponcgjfojgemddooebbgniglhkajkj)。本项目独立实现，与 Bilibili 或原扩展作者无隶属或合作关系。

本项目采用 [MIT 许可证](LICENSE)，Copyright (c) 2026 Deperenn。发行包包含许可与版权声明。图标原图保留 AI 生成来源凭证。
