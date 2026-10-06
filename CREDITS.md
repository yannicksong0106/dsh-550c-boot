# 致谢 / Credits

## 550C 片头动画与 HTML 源码 —— Voidpocket

这个插件的动画不是重写的，是**移植**的：`assets/550C-source.html` 是 **Voidpocket**（GitHub:
[@Voidpocket](https://github.com/Voidpocket)）提供的 550C 片头页面原稿，本仓库的 `scripts/extract.mjs`
只对它做定点改写（`:host` 作用域、可取消定时器、去掉页面级监听等），样式表、DOM 结构与动画脚本逐字保真。
配色（琥珀 CRT 阶梯）、面板布局、时间线节奏都出自这份原稿。

- 原稿：`assets/550C-source.html`（归档，构建的输入）
- 改写清单与理由：见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 的表格

> 若版权方希望采用不同的署名方式或许可条款，开个 issue 说明即可，这里按你的意思改。

## 本插件

插件工程（宿主半边首帧注入、遮罩层挂载策略、内容增强层、设置行、验证脚手架）由
**Ziyang Song**（[@yannicksong0106](https://github.com/yannicksong0106)）编写，MIT 许可。

## 依本文档之外的第三方

- 移植后的动画代码不引入任何运行时依赖；`react` 只是客户端插件可选的 external（设置行用）。
- 预览截图里的 550C 界面全部来自上面那份原稿，没有第三方素材。
