import * as path from 'path';
import * as vscode from 'vscode';
import { ImageEntry, escapeHtml, isNoSuchFileError, listImages } from './images';

interface WebviewImage {
    name: string;
    src: string;
}

interface WebviewToHostMessage {
    type: 'ready' | 'open';
    name?: string;
}

/**
 * 以缩略图网格展示一个文件夹中的全部图片。
 * 同一文件夹全局只开一个面板；面板关闭时回收文件监听器。
 */
export class ThumbnailPanel {
    private static readonly panels = new Map<string, ThumbnailPanel>();

    private readonly panel: vscode.WebviewPanel;
    private readonly watcher: vscode.FileSystemWatcher;
    private readonly folder: vscode.Uri;
    private readonly folderName: string;
    private images: ImageEntry[] = [];
    private refreshTimer: NodeJS.Timeout | undefined;
    private disposed = false;

    static open(folder: vscode.Uri): ThumbnailPanel {
        const key = ThumbnailPanel.panelKey(folder);
        const existing = ThumbnailPanel.panels.get(key);
        if (existing) {
            existing.panel.reveal();
            void existing.refresh();
            return existing;
        }
        const created = new ThumbnailPanel(folder);
        ThumbnailPanel.panels.set(key, created);
        return created;
    }

    // Windows 路径大小写不敏感，统一小写避免同一文件夹开出多个面板
    private static panelKey(folder: vscode.Uri): string {
        return process.platform === 'win32' ? folder.fsPath.toLowerCase() : folder.fsPath;
    }

    private constructor(folder: vscode.Uri) {
        this.folder = folder;
        this.folderName = path.basename(folder.fsPath) || folder.fsPath;

        this.panel = vscode.window.createWebviewPanel(
            'lookImages.thumbnails',
            `🖼 ${this.folderName}`,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            },
        );
        this.panel.iconPath = new vscode.ThemeIcon('preview');
        this.panel.webview.html = this.buildHtml(this.panel.webview);

        this.panel.webview.onDidReceiveMessage(message => this.onMessage(message));
        this.panel.onDidDispose(() => this.dispose());

        this.watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(folder, '*'),
        );
        this.watcher.onDidCreate(() => this.scheduleRefresh());
        this.watcher.onDidChange(() => this.scheduleRefresh());
        this.watcher.onDidDelete(() => this.scheduleRefresh());

        // 此时 webview 大概率尚未加载完成，消息会丢失；webview 加载后会发 ready 再推一次
        void this.refresh();
    }

    private onMessage(message: WebviewToHostMessage): void {
        if (!message) {
            return;
        }
        if (message.type === 'ready') {
            void this.refresh();
        } else if (message.type === 'open' && typeof message.name === 'string') {
            const entry = this.images.find(image => image.name === message.name);
            if (entry) {
                void vscode.commands.executeCommand('vscode.open', entry.uri);
            }
        }
    }

    private scheduleRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            void this.refresh();
        }, 300);
    }

    private async refresh(): Promise<void> {
        if (this.disposed) {
            return;
        }
        try {
            this.images = await listImages(this.folder);
        } catch (error: unknown) {
            if (isNoSuchFileError(error)) {
                void vscode.window.showWarningMessage(
                    `Look Images: 文件夹 “${this.folderName}” 已不存在，已关闭浏览面板。`,
                );
                this.dispose();
                return;
            }
            this.images = [];
        }
        this.pushImages();
    }

    private pushImages(): void {
        if (this.disposed) {
            return;
        }
        const images: WebviewImage[] = this.images.map(image => ({
            name: image.name,
            src: this.panel.webview.asWebviewUri(image.uri).toString(),
        }));
        void this.panel.webview.postMessage({ type: 'images', images });
    }

    private dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.watcher.dispose();
        ThumbnailPanel.panels.delete(ThumbnailPanel.panelKey(this.folder));
        this.panel.dispose();
    }

    private buildHtml(webview: vscode.Webview): string {
        const nonce = ThumbnailPanel.nonce();
        const csp = [
            'default-src \'none\'',
            `img-src ${webview.cspSource} data:`,
            'style-src \'unsafe-inline\'',
            `script-src 'nonce-${nonce}'`,
        ].join('; ');
        const folderName = escapeHtml(this.folderName);

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
    * { box-sizing: border-box; }
    body {
        margin: 0;
        padding: 0 16px 28px;
        font-family: var(--vscode-font-family, sans-serif);
        font-size: var(--vscode-font-size, 13px);
        color: var(--vscode-foreground, #cccccc);
        background-color: var(--vscode-editor-background, #1e1e1e);
    }
    body[data-size='s'] { --thumb: 110px; }
    body[data-size='m'] { --thumb: 165px; }
    body[data-size='l'] { --thumb: 240px; }
    header {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 0 10px;
        background-color: var(--vscode-editor-background, #1e1e1e);
        border-bottom: 1px solid var(--vscode-panel-border, #2b2b2b);
    }
    .title {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 45%;
    }
    .count { opacity: 0.7; font-size: 12px; flex-shrink: 0; }
    .spacer { flex: 1 1 auto; }
    .sizes { display: flex; gap: 4px; flex-shrink: 0; }
    button {
        font-family: inherit;
        font-size: 12px;
        padding: 3px 12px;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        color: var(--vscode-button-secondaryForeground, #ffffff);
        background-color: var(--vscode-button-secondaryBackground, #3a3d41);
    }
    button:hover { background-color: var(--vscode-button-secondaryHoverBackground, #45494e); }
    button.active {
        color: var(--vscode-button-foreground, #ffffff);
        background-color: var(--vscode-button-background, #0e639c);
    }
    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(var(--thumb), 1fr));
        gap: 14px;
        margin-top: 14px;
    }
    .card {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        cursor: pointer;
        border: 1px solid var(--vscode-panel-border, #2b2b2b);
        border-radius: 6px;
        background-color: var(--vscode-editor-widget-background, #252526);
        transition: border-color 0.12s ease, transform 0.12s ease, box-shadow 0.12s ease;
    }
    .card:hover {
        border-color: var(--vscode-focusBorder, #007fd4);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        transform: translateY(-2px);
    }
    .thumb {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        aspect-ratio: 1 / 1;
        overflow: hidden;
        border-bottom: 1px solid var(--vscode-panel-border, #2b2b2b);
        background-color: var(--vscode-editor-background, #1e1e1e);
    }
    .thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .meta { display: flex; flex-direction: column; gap: 2px; padding: 6px 9px 7px; }
    .name {
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .dims { font-size: 11px; opacity: 0.6; min-height: 14px; }
    .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 90px 20px;
        opacity: 0.85;
    }
    .empty .big { font-size: 44px; }
</style>
</head>
<body data-size="m">
    <header>
        <span class="title" title="${folderName}">📁 ${folderName}</span>
        <span class="count" id="count"></span>
        <span class="spacer"></span>
        <div class="sizes">
            <button type="button" data-size="s" title="小缩略图">小</button>
            <button type="button" data-size="m" class="active" title="中缩略图">中</button>
            <button type="button" data-size="l" title="大缩略图">大</button>
        </div>
    </header>
    <main>
        <div id="grid" class="grid"></div>
        <div id="empty" class="empty" style="display:none">
            <span class="big">🖼</span>
            <span>该文件夹中没有图片文件</span>
        </div>
    </main>
    <script nonce="${nonce}">
        (function () {
            'use strict';
            var vscode = acquireVsCodeApi();
            var images = [];

            function escapeHtml(text) {
                return String(text)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }

            function cardHtml(image) {
                var name = escapeHtml(image.name);
                return '<div class="card" data-name="' + name + '" title="' + name + '">'
                    + '<div class="thumb"><img loading="lazy" decoding="async" src="' + image.src + '" alt="' + name + '"></div>'
                    + '<div class="meta"><span class="name">' + name + '</span><span class="dims"></span></div>'
                    + '</div>';
            }

            function render() {
                var grid = document.getElementById('grid');
                var empty = document.getElementById('empty');
                document.getElementById('count').textContent = images.length === 0
                    ? '没有图片'
                    : images.length + ' 张图片';
                var scrollTop = window.scrollY;
                if (images.length === 0) {
                    grid.innerHTML = '';
                    empty.style.display = 'flex';
                } else {
                    empty.style.display = 'none';
                    var html = '';
                    for (var i = 0; i < images.length; i++) {
                        html += cardHtml(images[i]);
                    }
                    grid.innerHTML = html;
                }
                window.scrollTo(0, scrollTop);
            }

            function applySize(size) {
                document.body.dataset.size = size;
                var buttons = document.querySelectorAll('button[data-size]');
                for (var i = 0; i < buttons.length; i++) {
                    buttons[i].classList.toggle('active', buttons[i].getAttribute('data-size') === size);
                }
            }

            document.addEventListener('click', function (event) {
                var target = event.target;
                if (!(target instanceof Element)) { return; }
                var button = target.closest('button[data-size]');
                if (button) {
                    var size = button.getAttribute('data-size');
                    applySize(size);
                    vscode.setState({ size: size });
                    return;
                }
                var card = target.closest('.card');
                if (card) {
                    vscode.postMessage({ type: 'open', name: card.getAttribute('data-name') });
                }
            });

            // load 事件不冒泡，用捕获阶段委托；加载完成后在卡片上标注实际分辨率
            document.addEventListener('load', function (event) {
                var target = event.target;
                if (!(target instanceof HTMLImageElement)) { return; }
                var card = target.closest('.card');
                if (!card) { return; }
                var dims = card.querySelector('.dims');
                if (dims && target.naturalWidth > 0 && target.naturalHeight > 0) {
                    dims.textContent = target.naturalWidth + ' × ' + target.naturalHeight;
                }
            }, true);

            window.addEventListener('message', function (event) {
                var message = event.data;
                if (message && message.type === 'images' && message.images) {
                    images = message.images;
                    render();
                }
            });

            var state = vscode.getState();
            if (state && state.size) {
                applySize(state.size);
            }

            render();
            vscode.postMessage({ type: 'ready' });
        })();
    </script>
</body>
</html>`;
    }

    private static nonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let text = '';
        for (let i = 0; i < 32; i++) {
            text += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return text;
    }
}
