# Look Images

一个 VSCode 插件：在资源管理器中右键文件夹，即可在标签页中以缩略图网格浏览其中的全部图片，点击缩略图用 VSCode 内置图片预览打开大图。

## 功能

- 资源管理器右键文件夹 → **Look Images** → **查看文件夹图片**
- 缩略图网格，列数自适应窗口宽度，支持 小 / 中 / 大 三档缩略图尺寸
- 每张图片下方显示文件名与实际分辨率
- 点击缩略图 → 在 VSCode 内置图片预览标签页中打开大图
- 文件夹内容增删改后自动刷新（保留滚动位置）
- 同一文件夹复用已打开的面板，不会重复开标签页；文件夹被删除时自动关闭面板

支持格式：`png` / `jpg` / `jpeg` / `gif` / `bmp` / `webp` / `svg` / `ico` / `avif`（仅扫描文件夹第一层，不含子文件夹）。

## 使用方法

1. 在资源管理器中右键一个包含图片的文件夹
2. 点击菜单中的 **Look Images**
3. 点击 **查看文件夹图片**
4. 在缩略图网格中点击任意图片查看大图

也可以在命令面板中执行 `Look Images: 查看文件夹图片`（无右键参数时，会从工作区文件夹中选择）。

## 本地开发与调试

```bash
npm install
```

用 VSCode 打开本目录后按 `F5`（配置 "运行插件 (Look Images)"），会启动一个扩展开发主机（独立的 VSCode 窗口）。在其中右键 `test-images` 文件夹 → Look Images → 查看文件夹图片，即可验证功能。

重新生成测试图片（含中文文件名和验证自然排序的数字命名）：

```bash
node scripts/gen-test-images.js
```

实时编译：`npm run watch`；单次编译：`npm run compile`。

## 打包并安装到正式 VSCode

```bash
npm run package
```

得到 `look-images-0.0.1.vsix`，然后任选一种安装方式：

- 命令行：`code --install-extension look-images-0.0.1.vsix`
- 或在 VSCode 扩展面板 → `···` → **从 VSIX 安装**

> 若要发布到扩展市场，请先把 `package.json` 中的 `publisher` 改为你自己的发布者 ID。
