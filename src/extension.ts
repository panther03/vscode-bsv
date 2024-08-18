/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import * as child_process from 'child_process';
import * as vscode from 'vscode';


let subscriptions: vscode.Disposable[];
let diagnosticCollection: vscode.DiagnosticCollection;
let logger: vscode.LogOutputChannel = vscode.window.createOutputChannel("bluespec", { log: true });
let flags: string = "";
let wdir: string = "";

export function activate(context: vscode.ExtensionContext) {
    
    logger.info("Init");
    diagnosticCollection = vscode.languages.createDiagnosticCollection();
    flags = vscode.workspace.getConfiguration('bluespec').get<string>('bsc_flags');
    let wdir_override = vscode.workspace.getConfiguration('bluespec').get<string>('bsv_cwd');
    if (wdir_override) {
        wdir = wdir_override;
    } else {
        if(vscode.workspace.workspaceFolders !== undefined) {
            wdir = vscode.workspace.workspaceFolders[0].uri.path ;
        } else {
            vscode.window.showInformationMessage("Workspace folder not specified, please use config to set bsc current working directory");
        }
    }
    vscode.workspace.workspaceFolders[0].uri.fsPath
    logger.info(flags);
    vscode.workspace.onDidOpenTextDocument(lint, null, subscriptions);
    vscode.workspace.onDidSaveTextDocument(lint, null, subscriptions);
    vscode.workspace.onDidCloseTextDocument(removeFileDiagnostics, null, subscriptions);
    vscode.workspace.onDidChangeConfiguration(updateConfig, this, this.subscriptions);

    vscode.window.visibleTextEditors.forEach((editor) => {
        lint(editor.document);
    });
}

function lint(doc: vscode.TextDocument) {
    switch (doc.languageId) {
        case 'bluespec':
            bsvLint(doc);
            break;
        default:
            break;
    }
}

function updateConfig() {
    logger.debug("Update config");
    flags = vscode.workspace.getConfiguration('bluespec').get<string>('bsc_flags');
}

function bsvLint(doc: vscode.TextDocument) {
    let binPath: string = 'bsc'

    let args: string[] = [];
    args.push('-u');

    args.push('-bdir /tmp');
    args.push(flags);
    args.push(`"${doc.fileName}"`);
    let command: string = binPath + ' ' + args.join(' ');

    logger.info('[bsvlint] Execute');
    logger.info('[bsvlint]   command: ' + command);

    vscode.window.showInformationMessage("cwd = " + wdir);

    child_process.exec(command, 
        {
            cwd: wdir,
        },
        (_error: Error, _stdout: string, stderr: string) => {
        let diagnostics: vscode.Diagnostic[] = parseBscOutput(stderr);
        logger.info(diagnostics.length + ' errors/warnings returned');
        diagnosticCollection.set(doc.uri, diagnostics);
    });
}

function parseBscOutput(bscOut: string): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const re = /Error: .*, line (\d+), column (\d+)/;
    let currDiagnostic: vscode.Diagnostic | null = null;
    let message: string = '';

    const lines = bscOut.split(/\r?\n/);
    logger.info(lines.length.toString());
    for (const line of lines) {
        const match = line.match(re);
        if (match) {
            if (currDiagnostic) {
                currDiagnostic.message = message.trim();
                diagnostics.push(currDiagnostic);
            }

            const lineNumber = parseInt(match[1], 10) - 1;
            const columnNumber = parseInt(match[2], 10);
            const start = new vscode.Position(lineNumber, 0);
            const end = new vscode.Position(lineNumber, columnNumber);
            const range = new vscode.Range(start, end);
            
            currDiagnostic = {
                severity: vscode.DiagnosticSeverity.Error,
                message: '',
                range: range
            };
            message = '';
        } else {
            message += line + '\n';
        }
    }

    if (currDiagnostic) {
        currDiagnostic.message = message.trim();
        diagnostics.push(currDiagnostic);
    }

    return diagnostics;
}

function resolvePath(inputPath: string): string {
    if (path.isAbsolute(inputPath)) {
        return inputPath;
    }
    return path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, inputPath);
}


function removeFileDiagnostics(doc: vscode.TextDocument) {
    diagnosticCollection.delete(doc.uri);
}

export function deactivate(): void { }