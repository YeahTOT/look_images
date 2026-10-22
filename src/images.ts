import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

/** 支持浏览的图片扩展名（小写） */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.avif',
]);

export interface ImageEntry {
    /** 文件名（含扩展名，不含路径） */
    name: string;
    uri: vscode.Uri;
}

/** 列出文件夹第一层中的全部图片，按文件名自然排序（img2 排在 img10 之前） */
export async function listImages(folder: vscode.Uri): Promise<ImageEntry[]> {
    const dirents = await fs.readdir(folder.fsPath, { withFileTypes: true });
    const names = dirents
        .filter(dirent => dirent.isFile() && IMAGE_EXTENSIONS.has(path.extname(dirent.name).toLowerCase()))
        .map(dirent => dirent.name)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    return names.map(name => ({ name, uri: vscode.Uri.joinPath(folder, name) }));
}

/** 错误对象是否为“路径不存在”（文件夹被删除/移动时用于自动关闭面板） */
export function isNoSuchFileError(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && (error as { code?: unknown }).code === 'ENOENT';
}

/** HTML/属性共用的转义，防止文件名中的特殊字符破坏页面结构 */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
