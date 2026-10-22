import * as fs from 'fs';
import * as vscode from 'vscode';
import { ThumbnailPanel } from './thumbnailPanel';

export function activate(context: vscode.ExtensionContext): void {
    const openFolderCommand = vscode.commands.registerCommand(
        'lookImages.openFolder',
        async (arg?: vscode.Uri | vscode.Uri[]) => {
            const folder = await resolveFolderUri(arg);
            if (folder) {
                ThumbnailPanel.open(folder);
            }
        },
    );
    context.subscriptions.push(openFolderCommand);
}

export function deactivate(): void {
    // 命令 disposable 由 context.subscriptions 自动回收；面板与监听器在各自 dispose 中清理
}

/**
 * 解析命令目标文件夹：
 * 资源管理器右键时直接传入 Uri（多选取第一个）；命令面板触发时从工作区中选择。
 */
async function resolveFolderUri(arg?: vscode.Uri | vscode.Uri[]): Promise<vscode.Uri | undefined> {
    let uri: vscode.Uri | undefined = Array.isArray(arg) ? arg[0] : arg;

    if (!uri) {
        const folders = vscode.workspace.workspaceFolders ?? [];
        if (folders.length === 0) {
            void vscode.window.showWarningMessage(
                'Look Images: 请在资源管理器中右键一个文件夹使用，或先打开一个工作区。',
            );
            return undefined;
        }
        if (folders.length === 1) {
            uri = folders[0].uri;
        } else {
            interface FolderPick extends vscode.QuickPickItem {
                uri: vscode.Uri;
            }
            const picks: FolderPick[] = folders.map(folder => ({
                label: folder.name,
                description: folder.uri.fsPath,
                uri: folder.uri,
            }));
            const picked = await vscode.window.showQuickPick(picks, {
                placeHolder: '选择要浏览图片的工作区文件夹',
            });
            if (!picked) {
                return undefined;
            }
            uri = picked.uri;
        }
    }

    try {
        const stat = fs.statSync(uri.fsPath);
        if (!stat.isDirectory()) {
            void vscode.window.showWarningMessage(`Look Images: “${uri.fsPath}” 不是文件夹。`);
            return undefined;
        }
    } catch {
        void vscode.window.showErrorMessage(`Look Images: 无法访问 “${uri.fsPath}”。`);
        return undefined;
    }
    return uri;
}
