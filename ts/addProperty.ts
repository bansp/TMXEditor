/*****************************************************************************
Copyright (c) 2018-2020 - Maxprograms,  http://www.maxprograms.com/

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to compile,
modify and use the Software in its executable form without restrictions.

Redistribution of this Software or parts of it in any form (source code or
executable binaries) requires prior written permission from Maxprograms.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*****************************************************************************/

class AddProperty {

    electron = require('electron');

    currentId: string;
    currentType: string;

    constructor() {
        this.electron.ipcRenderer.send('get-theme');
        this.electron.ipcRenderer.on('set-theme', (event: Electron.IpcRendererEvent, arg: any) => {
            (document.getElementById('theme') as HTMLLinkElement).href = arg;
        });
        document.getElementById('saveProperty').addEventListener('click', () => {
            this.saveProperty();
        });
        this.electron.ipcRenderer.on('get-height', () => {
            let body: HTMLBodyElement = document.getElementById('body') as HTMLBodyElement;
            this.electron.ipcRenderer.send('addProperty-height', { width: body.clientWidth, height: body.clientHeight });
        });
    }

    saveProperty(): void {
        var type: string = (document.getElementById('type') as HTMLInputElement).value;
        if (type === '') {
            this.electron.ipcRenderer.send('show-message', { type: 'warning', message: 'Enter type' });
            return;
        }
        var value: string = (document.getElementById('value') as HTMLInputElement).value;
        if (value === '') {
            this.electron.ipcRenderer.send('show-message', { type: 'warning', message: 'Enter value' });
            return;
        }
        if (!this.validateType(type)) {
            this.electron.ipcRenderer.send('show-message', { type: 'warning', message: 'Invalid type' });
            return;
        }
        this.electron.ipcRenderer.send('add-new-property', { type: type, value: value });
    }

    validateType(type: string): boolean {
        var length: number = type.length;
        for (let i = 0; i < length; i++) {
            var c: string = type.charAt(i);
            if (c === ' ' || c === '<' || c === '&') {
                return false;
            }
        }
        return true;
    }
}

new AddProperty();