/*******************************************************************************
 * Copyright (c) 2023 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { ChildProcessWithoutNullStreams, execFileSync, spawn } from "child_process";
import { app, BrowserWindow, ClientRequest, dialog, ipcMain, IpcMainEvent, Menu, MenuItem, MessageBoxReturnValue, nativeTheme, net, OpenDialogReturnValue, Rectangle, SaveDialogReturnValue, session, shell } from "electron";
import { IncomingMessage } from "electron/main";
import { existsSync, mkdirSync, readFile, readFileSync, writeFile, writeFileSync, appendFileSync, unlinkSync } from "fs";
import { Locations, Point } from "./locations";
import { TMReader } from "sdltm";
import { I18n } from "./i18n";
import path from "path";

const SUCCESS: string = 'Success';
const LOADING: string = 'Loading';
const COMPLETED: string = 'Completed';
const ERROR: string = 'Error';
const EXPIRED: string = 'Expired';
const SAVING: string = 'Saving';
const PROCESSING: string = 'Processing';

class App {

    static mainWindow: BrowserWindow;
    static newFileWindow: BrowserWindow;
    static messagesWindow: BrowserWindow;
    static aboutWindow: BrowserWindow;
    static licensesWindow: BrowserWindow;
    static settingsWindow: BrowserWindow;
    static fileInfoWindow: BrowserWindow;
    static attributesWindow: BrowserWindow;
    static propertiesWindow: BrowserWindow;
    static addPropertyWindow: BrowserWindow;
    static notesWindow: BrowserWindow;
    static addNotesWindow: BrowserWindow;
    static convertCsvWindow: BrowserWindow;
    static convertSDLTMWindow: BrowserWindow;
    static csvLanguagesWindow: BrowserWindow;
    static splitFileWindow: BrowserWindow;
    static mergeFilesWindow: BrowserWindow;
    static replaceTextWindow: BrowserWindow;
    static sortUnitsWindow: BrowserWindow;
    static filtersWindow: BrowserWindow;
    static addLanguageWindow: BrowserWindow;
    static changeLanguageWindow: BrowserWindow;
    static removeLanguageWindow: BrowserWindow;
    static srcLanguageWindow: BrowserWindow;
    static removeUntranslatedWindow: BrowserWindow;
    static removeSameAsSourceWindow: BrowserWindow;
    static consolidateWindow: BrowserWindow;
    static updatesWindow: BrowserWindow;
    static maintenanceWindow: BrowserWindow;
    static convertExcelWindow: BrowserWindow;
    static excelLanguagesWindow: BrowserWindow;
    static systemInfoWindow: BrowserWindow;

    static requestEvaluationWindow: BrowserWindow;
    static registerSubscriptionWindow: BrowserWindow;
    static registerExpiredWindow: BrowserWindow;
    static newSubscriptionWindow: BrowserWindow;

    ls: ChildProcessWithoutNullStreams;
    stopping: boolean = false;
    static shouldQuit: boolean = false;

    static javapath: string = path.join(app.getAppPath(), 'bin', 'java');
    static iconPath: string;

    static saved: boolean = true;
    static shouldClose: boolean = false;
    static currentFile: string = '';
    static currentDefaults: any;
    static currentPreferences: any;
    static currentCss: string;
    static currentStatus: any = {};
    static fileLanguages: Language[];
    static argFile: string = '';
    static isReady: boolean = false;

    static csvEvent: IpcMainEvent;
    static excelEvent: IpcMainEvent;
    static propertyEvent: IpcMainEvent;
    static notesEvent: IpcMainEvent;

    static filterOptions: any = {};
    static loadOptions: any = {
        start: 0,
        count: 200
    };
    static sortOptions: any = {};
    static csvLangArgs: any;
    static excelLangArgs: any;
    static attributesArg: any;
    static propertiesArg: any;
    static notesArg: any;
    static messageParam: any;

    static needsName: boolean = false;

    static verticalPadding: number = 46;

    static latestVersion: string;
    static downloadLink: string;

    static locations: Locations;

    static i18n: I18n;
    static lang = 'en';

    constructor(args: string[]) {

        if (!existsSync(path.join(app.getPath('appData'), app.name))) {
            mkdirSync(path.join(app.getPath('appData'), app.name), { recursive: true });
        }

        if (process.platform === 'win32' && args.length > 1 && args[1] !== '.') {
            App.argFile = ''
            for (let i = 1; i < args.length; i++) {
                if (args[i] !== '.') {
                    if (App.argFile !== '') {
                        App.argFile = App.argFile + ' ';
                    }
                    App.argFile = App.argFile + args[i];
                }
            }
        }

        if (!app.requestSingleInstanceLock()) {
            app.quit();
        } else {
            if (App.mainWindow) {
                // Someone tried to run a second instance, we should focus our window.
                if (App.mainWindow.isMinimized()) {
                    App.mainWindow.restore();
                }
                App.mainWindow.focus();
            }
        }

        if (process.platform == 'win32') {
            App.javapath = path.join(app.getAppPath(), 'bin', 'java.exe');
        }

        if (!existsSync(path.join(app.getPath('appData'), app.name))) {
            mkdirSync(path.join(app.getPath('appData'), app.name), { recursive: true });
        }

        App.loadPreferences();

        this.ls = spawn(App.javapath, ['--module-path', 'lib', '-m', 'tmxserver/com.maxprograms.tmxserver.TMXServer', '-port', '8060', '-lang', App.lang], { cwd: app.getAppPath(), windowsHide: true });
        execFileSync(App.javapath, ['--module-path', 'lib', '-m', 'tmxserver/com.maxprograms.tmxserver.CheckURL', 'http://localhost:8060/TMXServer'], { cwd: app.getAppPath(), windowsHide: true });

        App.locations = new Locations(path.join(app.getPath('appData'), app.name, 'locations.json'));

        this.ls.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        this.ls.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });

        app.on('open-file', (event, filePath) => {
            event.preventDefault();
            if (App.isReady) {
                App.openFile(filePath);
            } else {
                App.argFile = filePath;
            }
        });

        app.on('before-quit', (event: Event) => {
            if (!this.ls.killed) {
                event.preventDefault();
                this.stopServer();
            }
        });

        app.on('quit', () => {
            app.quit();
        });

        app.on('window-all-closed', () => {
            app.quit();
        });

        app.on('ready', () => {
            App.isReady = true;
            App.mainLoaded();
        });

        App.loadDefaults();
        App.i18n = new I18n(path.join(app.getAppPath(), 'i18n', 'tmxeditor_' + App.lang + '.json'));

        app.on('ready', () => {
            App.createWindow();
            App.mainWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'index.html'));
            App.mainWindow.on('resize', () => {
                App.saveDefaults();
            });
            App.mainWindow.on('move', () => {
                App.saveDefaults();
            });
            App.mainWindow.show();
            App.mainWindow.on('close', (ev: Event) => {
                ev.cancelBubble = true;
                ev.preventDefault();
                App.close();
            });
            App.checkUpdates(true);
            if (process.platform === 'darwin' && app.runningUnderARM64Translation) {
                App.showMessage({
                    type: 'warning',
                    message: 'You are running a version for Macs with Intel processors on a Mac with Apple M1 chipset.'
                });
            }
        });

        nativeTheme.on('updated', () => {
            if (App.currentPreferences.theme === 'system') {
                if (nativeTheme.shouldUseDarkColors) {
                    App.currentCss = 'file://' + path.join(app.getAppPath(), 'css', 'dark.css');
                } else {
                    App.currentCss = 'file://' + path.join(app.getAppPath(), 'css', 'light.css');
                }
                App.mainWindow.webContents.send('set-theme', App.currentCss);
            }
        });

        ipcMain.on('get-tooltips', (event: IpcMainEvent) => {
            App.sendTooltips(event);
        });
        ipcMain.on('licenses-clicked', () => {
            App.showLicenses({ from: 'about' });
        });
        ipcMain.on('open-license', (event: IpcMainEvent, arg: any) => {
            App.openLicense(arg);
        });
        ipcMain.on('show-help', () => {
            App.showHelp();
        });
        ipcMain.on('open-file', () => {
            App.openFileDialog();
        });
        ipcMain.on('get-segments', (event: IpcMainEvent, arg: any) => {
            App.loadOptions = arg;
            App.loadSegments();
        });
        ipcMain.on('get-cell-properties', (event: IpcMainEvent, arg: any) => {
            App.getCellProperties(arg.id, arg.lang);
        });
        ipcMain.on('get-row-properties', (event: IpcMainEvent, arg: any) => {
            App.getRowProperties(arg.id);
        });
        ipcMain.on('edit-attributes', (event: IpcMainEvent, arg: any) => {
            this.editAttributes(arg);
        });
        ipcMain.on('get-unit-attributes', (event: IpcMainEvent) => {
            event.sender.send('set-unit-attributes', App.attributesArg);
        });
        ipcMain.on('save-attributes', (event: IpcMainEvent, arg: any) => {
            this.saveAttributes(arg);
        });
        ipcMain.on('edit-properties', (event: IpcMainEvent, arg: any) => {
            this.editProperties(arg);
        });
        ipcMain.on('get-unit-properties', (event: IpcMainEvent) => {
            event.sender.send('set-unit-properties', App.propertiesArg);
        });
        ipcMain.on('show-add-property', (event: IpcMainEvent) => {
            App.showAddProperty(event);
        });
        ipcMain.on('add-new-property', (event: IpcMainEvent, arg: any) => {
            this.addNewProperty(arg);
        });
        ipcMain.on('save-properties', (event: IpcMainEvent, arg: any) => {
            this.saveProperties(arg);
        });
        ipcMain.on('edit-notes', (event: IpcMainEvent, arg: any) => {
            App.editNotes(arg);
        });
        ipcMain.on('get-unit-notes', (event: IpcMainEvent, arg: any) => {
            event.sender.send('set-unit-notes', App.notesArg);
        });
        ipcMain.on('show-add-note', (event: IpcMainEvent, arg: any) => {
            this.showAddNote(event);
        });
        ipcMain.on('add-new-note', (event: IpcMainEvent, arg: any) => {
            this.addNewNote(arg);
        });
        ipcMain.on('save-notes', (event: IpcMainEvent, arg: any) => {
            this.saveNotes(arg);
        });
        ipcMain.on('get-preferences', (event: IpcMainEvent) => {
            event.sender.send('set-preferences', App.currentPreferences);
        });
        ipcMain.on('get-appLanguage', (event: IpcMainEvent) => {
            event.sender.send('set-appLanguage', App.lang);
        });
        ipcMain.on('save-preferences', (event: IpcMainEvent, arg: any) => {
            App.savePreferences(arg);
            App.destroyWindow(App.settingsWindow);
            App.loadPreferences();
            App.setTheme();
        });
        ipcMain.on('get-theme', (event: IpcMainEvent) => {
            event.sender.send('set-theme', App.currentCss);
        });
        ipcMain.on('create-file', (event: IpcMainEvent, arg: any) => {
            this.createFile(arg);
        });
        ipcMain.on('new-file', () => {
            App.createNewFile();
        });
        ipcMain.on('save-file', () => {
            App.saveFile();
        })
        ipcMain.on('convert-excel', () => {
            App.convertExcel();
        });
        ipcMain.on('convert-sdltm-tmx', (event: IpcMainEvent, arg: any) => {
            this.convertSdltmTmx(arg);
        });
        ipcMain.on('convert-csv', () => {
            App.convertCSV();
        });
        ipcMain.on('convert-sdltm', () => {
            App.convertSDLTM();
        });
        ipcMain.on('convert-csv-tmx', (event: IpcMainEvent, arg: any) => {
            this.convertCsvTmx(arg);
        });
        ipcMain.on('convert-excel-tmx', (event: IpcMainEvent, arg: any) => {
            this.convertExcelTmx(arg);
        });
        ipcMain.on('get-charsets', (event: IpcMainEvent) => {
            this.getCharsets(event);
        });
        ipcMain.on('get-csvfile', (event: IpcMainEvent) => {
            this.getCsvFile(event);
        });
        ipcMain.on('get-sdltmfile', (event: IpcMainEvent) => {
            this.getSdltmFile(event);
        });
        ipcMain.on('get-excelfile', (event: IpcMainEvent) => {
            this.getExcelFile(event);
        });
        ipcMain.on('get-converted-tmx', (event: IpcMainEvent, arg: any) => {
            this.getConvertedTMX(event, arg);
        });
        ipcMain.on('get-csv-preview', (event: IpcMainEvent, arg: any) => {
            this.getCsvPreview(event, arg);
        });
        ipcMain.on('get-excel-preview', (event: IpcMainEvent, arg: any) => {
            this.getExcelPreview(event, arg);
        });
        ipcMain.on('get-csv-languages', (event: IpcMainEvent, arg: any) => {
            this.getCsvLanguages(event, arg);
        });
        ipcMain.on('get-excel-languages', (event: IpcMainEvent, arg: any) => {
            this.getExcelLanguages(event, arg);
        });
        ipcMain.on('get-csv-lang-args', (event: IpcMainEvent) => {
            event.sender.send('set-csv-lang-args', App.csvLangArgs);
        });
        ipcMain.on('set-csv-languages', (event: IpcMainEvent, arg: any) => {
            this.setCsvLanguages(arg);
        });
        ipcMain.on('set-excel-languages', (event: IpcMainEvent, arg: any) => {
            this.setExcelLanguages(arg);
        });
        ipcMain.on('get-excel-lang-args', (event: IpcMainEvent) => {
            event.sender.send('set-excel-lang-args', App.excelLangArgs);
        });
        ipcMain.on('show-file-info', () => {
            App.showFileInfo();
        });
        ipcMain.on('file-properties', (event: IpcMainEvent) => {
            this.fileProperties(event);
        });
        ipcMain.on('select-tmx', (event: IpcMainEvent) => {
            this.selectTmx(event);
        });
        ipcMain.on('split-tmx', (event: IpcMainEvent, arg: any) => {
            this.splitTmx(arg);
        });
        ipcMain.on('select-merged-tmx', (event: IpcMainEvent) => {
            this.selectMergedTmx(event);
        });
        ipcMain.on('add-tmx-files', (event: IpcMainEvent) => {
            this.addTmxFiles(event);
        });
        ipcMain.on('merge-tmx-files', (event: IpcMainEvent, arg: any) => {
            this.mergeTmxFiles(arg);
        });
        ipcMain.on('save-data', (event: IpcMainEvent, arg: any) => {
            this.saveData(event, arg);
        });
        ipcMain.on('replace-text', () => {
            App.replaceText();
        });
        ipcMain.on('replace-request', (event: IpcMainEvent, arg: any) => {
            this.replaceRequest(arg);
        });
        ipcMain.on('sort-units', () => {
            App.sortUnits();
        });
        ipcMain.on('set-sort', (event: IpcMainEvent, arg: any) => {
            this.setSort(arg);
        });
        ipcMain.on('clear-sort', () => {
            this.clearSort();
        });
        ipcMain.on('get-sort', (event: IpcMainEvent) => {
            event.sender.send('sort-options', App.sortOptions);
        });
        ipcMain.on('filter-units', () => {
            App.showFilters();
        });
        ipcMain.on('filter-options', (event: IpcMainEvent, arg: any) => {
            this.setFilterOptions(arg);
        });
        ipcMain.on('get-filter-options', (event: IpcMainEvent) => {
            event.sender.send('set-filter-options', App.filterOptions);
        });
        ipcMain.on('clear-filter-options', () => {
            this.clearFilterOptions();
        });
        ipcMain.on('get-file-languages', (event: IpcMainEvent) => {
            event.sender.send('file-languages', App.fileLanguages);
        });
        ipcMain.on('get-admin-languages', (event: IpcMainEvent) => {
            event.sender.send('admin-languages', App.adminLanguages());
        });
        ipcMain.on('insert-unit', () => {
            App.insertUnit();
        });
        ipcMain.on('delete-units', (event: IpcMainEvent, arg: any) => {
            this.deleteUnits(arg);
        });
        ipcMain.on('change-language', (event: IpcMainEvent, arg: any) => {
            this.changeLanguage(arg);
        });
        ipcMain.on('all-languages', (event: IpcMainEvent) => {
            this.allLanguages(event);
        });
        ipcMain.on('remove-language', (event: IpcMainEvent, arg: any) => {
            this.removeLanguage(arg);
        });
        ipcMain.on('add-language', (event: IpcMainEvent, arg: any) => {
            this.addLanguage(arg);
        });
        ipcMain.on('get-source-language', (event: IpcMainEvent) => {
            this.getSourceLanguage(event);
        });
        ipcMain.on('change-source-language', (event: IpcMainEvent, arg: any) => {
            this.changeSourceLanguage(arg);
        });
        ipcMain.on('remove-untranslated', (event: IpcMainEvent, arg: any) => {
            this.removeUntranslated(arg);
        });
        ipcMain.on('remove-sameAsSource', (event: IpcMainEvent, arg: any) => {
            this.removeSameAsSource(arg);
        });
        ipcMain.on('consolidate-units', (event: IpcMainEvent, arg: any) => {
            this.consolidateUnits(arg);
        });
        ipcMain.on('get-version', (event: IpcMainEvent) => {
            event.sender.send('set-version', app.name + ' ' + app.getVersion());
        });
        ipcMain.on('show-message', (event: IpcMainEvent, arg: any) => {
            App.showMessage(arg);
        });
        ipcMain.on('get-message-param', (event: IpcMainEvent) => {
            event.sender.send('set-message', App.messageParam);
        });
        ipcMain.on('newFile-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.newFileWindow, arg);
        });
        ipcMain.on('close-newFile', () => {
            App.destroyWindow(App.newFileWindow);
        });
        ipcMain.on('about-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.aboutWindow, arg);
        });
        ipcMain.on('close-about', () => {
            App.destroyWindow(App.aboutWindow);
        });
        ipcMain.on('system-info-clicked', () => {
            App.showSystemInfo();
        });
        ipcMain.on('close-systemInfo', () => {
            App.destroyWindow(App.systemInfoWindow);
        });
        ipcMain.on('systemInfo-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.systemInfoWindow, arg);
        });
        ipcMain.on('get-system-info', (event: IpcMainEvent) => {
            App.getSystemInformation(event);
        });
        ipcMain.on('messages-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.messagesWindow, arg);
        });
        ipcMain.on('close-messages', () => {
            App.destroyWindow(App.messagesWindow);
        });
        ipcMain.on('fileInfo-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.fileInfoWindow, arg);
        });
        ipcMain.on('close-fileInfo', () => {
            App.destroyWindow(App.fileInfoWindow);
        });
        ipcMain.on('licenses-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.licensesWindow, arg);
        });
        ipcMain.on('close-licenses', () => {
            App.destroyWindow(App.licensesWindow);
        });
        ipcMain.on('preferences-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.settingsWindow, arg);
        });
        ipcMain.on('close-preferences', () => {
            App.destroyWindow(App.settingsWindow);
        });
        ipcMain.on('attributes-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.attributesWindow, arg);
        });
        ipcMain.on('close-attributes', () => {
            App.destroyWindow(App.attributesWindow);
        });
        ipcMain.on('properties-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.propertiesWindow, arg);
        });
        ipcMain.on('close-properties', () => {
            App.destroyWindow(App.propertiesWindow);
        });
        ipcMain.on('addProperty-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.addPropertyWindow, arg);
        });
        ipcMain.on('close-addProperty', () => {
            App.destroyWindow(App.addPropertyWindow);
        });
        ipcMain.on('notes-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.notesWindow, arg);
        });
        ipcMain.on('close-notes', () => {
            App.destroyWindow(App.notesWindow);
        });
        ipcMain.on('addNote-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.addNotesWindow, arg);
        });
        ipcMain.on('close-addNote', () => {
            App.destroyWindow(App.addNotesWindow);
        });
        ipcMain.on('convertSdltm-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.convertSDLTMWindow, arg);
        });
        ipcMain.on('convertCsv-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.convertCsvWindow, arg);
        });
        ipcMain.on('convertExcel-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.convertExcelWindow, arg);
        });
        ipcMain.on('close-convertSdltm', () => {
            App.destroyWindow(App.convertSDLTMWindow);
        });
        ipcMain.on('close-convertCsv', () => {
            App.destroyWindow(App.convertCsvWindow);
        });
        ipcMain.on('close-convertExcel', () => {
            App.destroyWindow(App.convertExcelWindow);
        });
        ipcMain.on('csvLanguages-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.csvLanguagesWindow, arg);
        });
        ipcMain.on('excelLanguages-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.excelLanguagesWindow, arg);
        });
        ipcMain.on('close-csvLanguages', () => {
            App.destroyWindow(App.csvLanguagesWindow);
        });
        ipcMain.on('close-excelLanguages', () => {
            App.destroyWindow(App.excelLanguagesWindow);
        });
        ipcMain.on('splitFile-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.splitFileWindow, arg);
        });
        ipcMain.on('close-splitFile', () => {
            App.destroyWindow(App.splitFileWindow);
        });
        ipcMain.on('mergeFiles-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.mergeFilesWindow, arg);
        });
        ipcMain.on('close-mergeFiles', () => {
            App.destroyWindow(App.mergeFilesWindow);
        });
        ipcMain.on('replaceText-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.replaceTextWindow, arg);
        });
        ipcMain.on('close-replaceText', () => {
            App.destroyWindow(App.replaceTextWindow);
        });
        ipcMain.on('sortUnits-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.sortUnitsWindow, arg);
        });
        ipcMain.on('filters-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.filtersWindow, arg);
        });
        ipcMain.on('addLanguage-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.addLanguageWindow, arg);
        });
        ipcMain.on('close-addLanguage', () => {
            App.destroyWindow(App.addLanguageWindow);
        });
        ipcMain.on('changeLanguage-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.changeLanguageWindow, arg);
        });
        ipcMain.on('close-changeLanguage', () => {
            App.destroyWindow(App.changeLanguageWindow);
        });
        ipcMain.on('removeLanguage-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.removeLanguageWindow, arg);
        });
        ipcMain.on('close-removeLanguage', () => {
            App.destroyWindow(App.removeLanguageWindow);
        });
        ipcMain.on('srcLanguage-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.srcLanguageWindow, arg);
        });
        ipcMain.on('close-srcLanguage', () => {
            App.destroyWindow(App.srcLanguageWindow);
        });
        ipcMain.on('removeUntranslated-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.removeUntranslatedWindow, arg);
        });
        ipcMain.on('removeSameAsSource-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.removeSameAsSourceWindow, arg);
        });
        ipcMain.on('close-removeSameAsSource', () => {
            App.destroyWindow(App.removeSameAsSourceWindow);
        });
        ipcMain.on('close-removeUntranslated', () => {
            App.destroyWindow(App.removeUntranslatedWindow);
        });
        ipcMain.on('consolidate-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.consolidateWindow, arg);
        });
        ipcMain.on('close-consolidate', () => {
            App.destroyWindow(App.consolidateWindow);
        });
        ipcMain.on('maintenance-dashboard', () => {
            App.showMaintenanceDashboard();
        });
        ipcMain.on('maintenance-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.maintenanceWindow, arg);
        });
        ipcMain.on('close-maintenance', () => {
            App.destroyWindow(App.maintenanceWindow);
        });
        ipcMain.on('maintanance-tasks', (event: IpcMainEvent, arg: any) => {
            App.maintenanceTasks(arg);
        });
        ipcMain.on('updates-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.updatesWindow, arg)
        });
        ipcMain.on('close-updates', () => {
            App.destroyWindow(App.updatesWindow);
        });
        ipcMain.on('get-versions', (event: IpcMainEvent) => {
            event.sender.send('set-versions', { current: app.getVersion(), latest: App.latestVersion });
        });
        ipcMain.on('download-latest', () => {
            App.downloadLatest();
        });
        ipcMain.on('release-history', () => {
            App.showReleaseHistory();
        });

        // Licenses

        ipcMain.on('registerSubscription-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.registerSubscriptionWindow, arg);
        });
        ipcMain.on('registerExpired-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.registerExpiredWindow, arg);
        });
        ipcMain.on('requestEvaluation-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.requestEvaluationWindow, arg);
        });
        ipcMain.on('newSubscription-height', (event: IpcMainEvent, arg: any) => {
            App.setHeight(App.newSubscriptionWindow, arg);
        });
        ipcMain.on('close-newSubscription', () => {
            App.destroyWindow(App.newSubscriptionWindow);
        })
    } // end constructor

    stopServer(): void {
        let instance: App = this;
        App.sendRequest({ command: 'stop' },
            (data: any) => {
                if (data.status === SUCCESS) {
                    instance.ls.kill();
                    app.quit();
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static mainLoaded(): void {
        if (App.argFile !== '') {
            setTimeout(() => {
                App.openFile(App.argFile);
                App.argFile = '';
            }, 2000);
        }
    }

    static setHeight(window: BrowserWindow, arg: any) {
        let rect: Rectangle = window.getBounds();
        rect.height = arg.height + App.verticalPadding;
        window.setBounds(rect);
    }

    static destroyWindow(window: BrowserWindow): void {
        if (window) {
            try {
                let parent: BrowserWindow = window.getParentWindow();
                window.hide();
                window.destroy();
                window = undefined;
                if (parent) {
                    parent.focus();
                } else {
                    App.mainWindow.focus();
                }
            } catch (e) {
                console.error(e);
            }
        }
    }

    static sendTooltips(event: IpcMainEvent): void {
        let tooltips: any = {
            'open': App.i18n.getString('menu', 'Open'),
            'new': App.i18n.getString('menu', 'New'),
            'save': App.i18n.getString('menu', 'Save'),
            'fileProperties': App.i18n.getString('menu', 'FileProperties'),
            'confirmEdit': App.i18n.getString('menu', 'ConfirmEdit'),
            'cancelEdit': App.i18n.getString('menu', 'CancelEdit'),
            'replaceText': App.i18n.getString('menu', 'ReplaceText'),
            'insertUnit': App.i18n.getString('menu', 'InsertUnit'),
            'deleteSelected': App.i18n.getString('menu', 'DeleteSelected'),
            'sortUnits': App.i18n.getString('menu', 'SortUnits'),
            'filterUnits': App.i18n.getString('menu', 'FilterUnits'),
            'maintenance': App.i18n.getString('menu', 'MaintenanceDashboard'),
            'convertCSV': App.i18n.getString('menu', 'ConvertCSV'),
            'convertExcel': App.i18n.getString('menu', 'ConvertExcel'),
            'convertSDLTM': App.i18n.getString('menu', 'ConvertSDLTM'),
            'userGuide': App.i18n.getString('menu', 'UserGuide'),
            'firstPage': App.i18n.getString('menu', 'FirstPage'),
            'previousPage': App.i18n.getString('menu', 'PreviousPage'),
            'pageTooltip': App.i18n.getString('App', 'pageTooltip'),
            'nextPage': App.i18n.getString('menu', 'NextPage'),
            'lastPage': App.i18n.getString('menu', 'LastPage'),
            'unitsPage': App.i18n.getString('App', 'UnitsPage'),
            'unitsTooltip': App.i18n.getString('App', 'UnitsTooltip'),
        };
        event.sender.send('set-tooltips', tooltips);
    }

    static showMessage(arg: any): void {
        let parent: BrowserWindow = App.mainWindow;
        if (arg.parent) {
            switch (arg.parent) {
                case 'preferences': parent = App.settingsWindow;
                    break;
                case 'replaceText': parent = App.replaceTextWindow;
                    break;
                case 'requestEvaluation': parent = App.requestEvaluationWindow;
                    break;
                case 'registerSubscription': parent = App.registerSubscriptionWindow;
                    break;
                case 'registerExpired': parent = App.registerExpiredWindow;
                    break;
                case 'registerNewSubscription': parent = App.newSubscriptionWindow;
                    break;
                case 'addNote': parent = App.addNotesWindow;
                    break;
                case 'addProperty': parent = App.addPropertyWindow;
                    break;
                case 'convertSDLTM': parent = App.convertSDLTMWindow;
                    break;
                case 'convertCSV': parent = App.convertCsvWindow;
                    break;
                case 'convertExcel': parent = App.convertExcelWindow;
                    break;
                case 'csvLanguages': parent = App.csvLanguagesWindow;
                    break;
                case 'excelLanguages': parent = App.excelLanguagesWindow;
                    break;
                case 'filters': parent = App.filtersWindow;
                    break;
                case 'mergeFiles': parent = App.mergeFilesWindow;
                    break;
                case 'newFile': parent = App.newFileWindow;
                    break;
                case 'searchReplace': parent = App.replaceTextWindow;
                    break;
                case 'splitFile': parent = App.splitFileWindow;
                    break;
                case 'changeLanguage': parent = App.changeLanguageWindow;
                    break;
                case 'addLanguage': parent = App.addLanguageWindow;
                    break;
                default: parent = App.mainWindow;
            }
        }
        App.messagesWindow = new BrowserWindow({
            parent: parent,
            width: 600,
            minimizable: false,
            maximizable: false,
            resizable: false,
            modal: true,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        if (arg.key) {
            arg.message = App.i18n.getString(arg.group, arg.key);
            if (arg.titleKey) {
                arg.title = App.i18n.getString(arg.group, arg.titleKey);
            }
        }
        App.messageParam = arg;
        App.messagesWindow.setMenu(null);
        App.messagesWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'messages.html'));
        App.messagesWindow.once('ready-to-show', () => {
            App.messagesWindow.show();
        });
        App.messagesWindow.on('close', () => {
            parent.focus();
        });
        App.setLocation(App.messagesWindow, 'messages.html');
    }

    static createWindow(): void {
        App.iconPath = path.join(app.getAppPath(), 'icons', 'tmxeditor.png');
        App.mainWindow = new BrowserWindow({
            title: 'TMXEditor',
            width: App.currentDefaults.width,
            height: App.currentDefaults.height,
            x: App.currentDefaults.x,
            y: App.currentDefaults.y,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            show: false,
            icon: App.iconPath
        });
        let fileMenu: Menu = Menu.buildFromTemplate([
            { label: App.i18n.getString('menu', 'New'), accelerator: 'CmdOrCtrl+N', click: () => { App.createNewFile(); } },
            { label: App.i18n.getString('menu', 'Open'), accelerator: 'CmdOrCtrl+O', click: () => { App.openFileDialog(); } },
            { label: App.i18n.getString('menu', 'Close'), accelerator: 'CmdOrCtrl+W', click: () => { App.closeFile(); } },
            { label: App.i18n.getString('menu', 'Save'), accelerator: 'CmdOrCtrl+s', click: () => { App.saveFile(); } },
            { label: App.i18n.getString('menu', 'SaveAs'), click: () => { App.saveAs() } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'ConvertExcel'), click: () => { App.convertExcel(); } },
            { label: App.i18n.getString('menu', 'ExportExcel'), click: () => { App.exportExcel(); } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'ConvertCSV'), click: () => { App.convertCSV(); } },
            { label: App.i18n.getString('menu', 'ExportCSV'), click: () => { App.exportDelimited(); } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'ConvertSDLTM'), click: () => { App.convertSDLTM(); } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'FileProperties'), click: () => { App.showFileInfo(); } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'ValidateTMX'), click: () => { App.validateFile(); } },
            { label: App.i18n.getString('menu', 'CleanInvalidChars'), click: () => { App.cleanCharacters(); } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'SplitTMX'), click: () => { App.splitFile(); } },
            { label: App.i18n.getString('menu', 'MergeTMX'), click: () => { App.mergeFiles(); } }
        ]);
        let editMenu: Menu = Menu.buildFromTemplate([
            { label: App.i18n.getString('menu', 'Undo'), accelerator: 'CmdOrCtrl+Z', click: () => { App.mainWindow.webContents.undo(); } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'Cut'), accelerator: 'CmdOrCtrl+X', click: () => { App.mainWindow.webContents.cut(); } },
            { label: App.i18n.getString('menu', 'Copy'), accelerator: 'CmdOrCtrl+C', click: () => { App.mainWindow.webContents.copy(); } },
            { label: App.i18n.getString('menu', 'Paste'), accelerator: 'CmdOrCtrl+V', click: () => { App.mainWindow.webContents.paste(); } },
            { label: App.i18n.getString('menu', 'SelectAll'), accelerator: 'CmdOrCtrl+A', click: () => { App.mainWindow.webContents.selectAll(); } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'ConfirmEdit'), accelerator: 'Alt+Enter', click: () => { App.saveEdits(); } },
            { label: App.i18n.getString('menu', 'CancelEdit'), accelerator: 'Esc', click: () => { App.cancelEdit(); } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'ReplaceText'), accelerator: 'CmdOrCtrl+F', click: () => { App.replaceText(); } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'InsertUnit'), click: () => { App.insertUnit(); } },
            { label: App.i18n.getString('menu', 'DeleteSelected'), click: () => { App.requestDeleteUnits(); } }
        ]);
        let viewMenu: Menu = Menu.buildFromTemplate([
            { label: App.i18n.getString('menu', 'SortUnits'), accelerator: 'F5', click: () => { App.sortUnits(); } },
            { label: App.i18n.getString('menu', 'FilterUnits'), accelerator: 'F3', click: () => { App.showFilters() } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'FirstPage'), accelerator: 'CmdOrCtrl+Shift+PageUp', click: () => { App.firstPage(); } },
            { label: App.i18n.getString('menu', 'PreviousPage'), accelerator: 'CmdOrCtrl+PageUp', click: () => { App.previousPage(); } },
            { label: App.i18n.getString('menu', 'NextPage'), accelerator: 'CmdOrCtrl+PageDown', click: () => { App.nextPage(); } },
            { label: App.i18n.getString('menu', 'LastPage'), accelerator: 'CmdOrCtrl+Shift+PageDown', click: () => { App.lastPage(); } },
            new MenuItem({ type: 'separator' }),
            new MenuItem({ label: App.i18n.getString('menu', 'ToggleFullScreen'), role: 'togglefullscreen' })
        ]);
        if (!app.isPackaged) {
            viewMenu.append(new MenuItem({ label: App.i18n.getString('menu', 'ToggleDeveloperTools'), accelerator: 'F12', role: 'toggleDevTools' }));
        }
        let tasksMenu: Menu = Menu.buildFromTemplate([
            { label: App.i18n.getString('menu', 'ChangeLanguage'), click: () => { App.changeLanguageCode(); } },
            { label: App.i18n.getString('menu', 'AddLanguage'), click: () => { App.showAddLanguage(); } },
            { label: App.i18n.getString('menu', 'RemoveLanguage'), click: () => { App.showRemoveLanguage() } },
            { label: App.i18n.getString('menu', 'ChangeSourceLanguage'), click: () => { App.showChangeSourceLanguage(); } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'MaintenanceDashboard'), click: () => { App.showMaintenanceDashboard(); } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'RemoveTags'), click: () => { App.removeTags(); } },
            { label: App.i18n.getString('menu', 'RemoveDuplicates'), click: () => { App.removeDuplicates(); } },
            { label: App.i18n.getString('menu', 'RemoveUntranslated'), click: () => { App.showRemoveUntranslated(); } },
            { label: App.i18n.getString('menu', 'RemoveSameAsSource'), click: () => { App.showRemoveSameAsSource(); } },
            { label: App.i18n.getString('menu', 'RemoveSpaces'), click: () => { App.removeSpaces(); } },
            { label: App.i18n.getString('menu', 'ConsolidateUnits'), click: () => { App.showConsolidateUnits(); } }
        ]);
        let helpMenu: Menu = Menu.buildFromTemplate([
            { label: App.i18n.getString('menu', 'UserGuide'), accelerator: 'F1', click: () => { App.showHelp(); } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'CheckForUpdates'), click: () => { App.checkUpdates(false); } },
            { label: App.i18n.getString('menu', 'ViewLicenses'), click: () => { App.showLicenses({ from: 'menu' }); } },
            new MenuItem({ type: 'separator' }),
            { label: App.i18n.getString('menu', 'ReleaseHistory'), click: () => { App.showReleaseHistory(); } },
            { label: App.i18n.getString('menu', 'SupportGroup'), click: () => { App.showSupportGroup(); } }
        ]);
        let template: MenuItem[] = [
            new MenuItem({ label: App.i18n.getString('menu', 'FileMenu'), role: 'fileMenu', submenu: fileMenu }),
            new MenuItem({ label: App.i18n.getString('menu', 'EditMenu'), role: 'editMenu', submenu: editMenu }),
            new MenuItem({ label: App.i18n.getString('menu', 'ViewMenu'), role: 'viewMenu', submenu: viewMenu }),
            new MenuItem({ label: App.i18n.getString('menu', 'TasksMenu'), submenu: tasksMenu }),
            new MenuItem({ label: App.i18n.getString('menu', 'HelpMenu'), role: 'help', submenu: helpMenu })
        ];
        if (process.platform === 'darwin') {
            let appleMenu: Menu = Menu.buildFromTemplate([
                new MenuItem({ label: App.i18n.getString('menu', 'About'), click: () => { App.showAbout(); } }),
                new MenuItem({
                    label: App.i18n.getString('menu', 'Preferences'), submenu: [
                        { label: App.i18n.getString('menu', 'Settings'), accelerator: 'Cmd+,', click: () => { App.showSettings(); } }
                    ]
                }),
                new MenuItem({ type: 'separator' }),
                new MenuItem({
                    label: App.i18n.getString('menu', 'Services'), role: 'services', submenu: [
                        { label: App.i18n.getString('menu', 'NoServicesApply'), enabled: false }
                    ]
                }),
                new MenuItem({ type: 'separator' }),
                new MenuItem({ label: App.i18n.getString('menu', 'AppleQuit'), accelerator: 'Cmd+Q', role: 'quit', click: () => { App.close(); } })
            ]);
            template.unshift(new MenuItem({ label: app.getName(), role: 'appMenu', submenu: appleMenu }));
        } else {
            let help: MenuItem | undefined = template.pop();
            template.push(new MenuItem({
                label: App.i18n.getString('menu', 'SettingsMenu'), submenu: [
                    { label: App.i18n.getString('menu', 'Preferences'), click: () => { App.showSettings(); } }
                ]
            }));
            if (help) {
                template.push(help);
            }
        }
        if (!existsSync(path.join(app.getPath('appData'), app.name, 'recent.json'))) {
            writeFile(path.join(app.getPath('appData'), app.name, 'recent.json'), '{"files" : []}', (err) => {
                if (err instanceof Error) {
                    App.showMessage({ type: 'error', message: err.message });
                    return;
                }
            });
        }
        readFile(path.join(app.getPath('appData'), app.name, 'recent.json'), (err, buf: Buffer) => {
            if (err instanceof Error) {
                Menu.setApplicationMenu(Menu.buildFromTemplate(template));
                return;
            }
            let jsonData = JSON.parse(buf.toString());
            let files = jsonData.files;
            if (files !== undefined && files.length > 0) {
                if (process.platform === 'darwin') {
                    let item: MenuItem = template[1];
                    if (item.submenu) {
                        item.submenu.append(new MenuItem({ type: 'separator' }));
                    }
                } else {
                    let item: MenuItem = template[0];
                    if (item.submenu) {
                        item.submenu.append(new MenuItem({ type: 'separator' }));
                    }
                }
                for (let file of files) {
                    if (existsSync(file)) {
                        if (process.platform === 'darwin') {
                            if (template[1].submenu) {
                                template[1].submenu.append(new MenuItem({ label: file, click: () => { App.openFile(file); } }));
                            }
                        } else {
                            if (template[0].submenu) {
                                template[0].submenu.append(new MenuItem({ label: file, click: () => { App.openFile(file); } }));
                            }
                        }
                    }
                }
            }
            if (process.platform === 'win32') {
                if (template[0].submenu) {
                    template[0].submenu.append(new MenuItem({ type: 'separator' }));
                    template[0].submenu.append(new MenuItem({ label: App.i18n.getString('menu', 'WindowsQuit'), accelerator: 'Alt+F4', role: 'quit', click: () => { App.close(); } }));
                }
                if (template[5].submenu) {
                    template[5].submenu.append(new MenuItem({ type: 'separator' }));
                    template[5].submenu.append(new MenuItem({ label: App.i18n.getString('menu', 'About'), click: () => { App.showAbout(); } }));
                }
            }
            if (process.platform === 'linux') {
                if (template[0].submenu) {
                    template[0].submenu.append(new MenuItem({ type: 'separator' }));
                    template[0].submenu.append(new MenuItem({ label: App.i18n.getString('menu', 'LinuxQuit'), accelerator: 'Ctrl+Q', role: 'quit', click: () => { App.close(); } }));
                }
                if (template[5].submenu) {
                    template[5].submenu.append(new MenuItem({ type: 'separator' }));
                    template[5].submenu.append(new MenuItem({ label: App.i18n.getString('menu', 'About'), click: () => { App.showAbout(); } }));
                }
            }
            Menu.setApplicationMenu(Menu.buildFromTemplate(template));
        });
    }

    static close(): void {
        if (App.currentFile !== '' && !App.saved) {
            let clicked: number = dialog.showMessageBoxSync(App.mainWindow, {
                type: 'question',
                title: App.i18n.getString('App', 'SaveChanges'),
                message: App.i18n.getString('App', 'UnsavedWarning'),
                buttons: [
                    App.i18n.getString('App', 'DontSave'),
                    App.i18n.getString('App', 'Cancel'),
                    App.i18n.getString('App', 'Save')
                ],
                defaultId: 2
            });
            if (clicked === 0) {
                App.saved = true;
            }
            if (clicked === 1) {
                return;
            }
            if (clicked === 2) {
                App.shouldQuit = true;
                App.saveFile();
                return;
            }
        }
        App.mainWindow.removeAllListeners();
        App.mainWindow.close();
    }

    static adminLanguages(): Language[] {
        let result: Language[] = App.fileLanguages.slice(0);
        result.unshift({ code: '*all*', name: App.i18n.getString('App', 'anyLanguage') });
        return result;
    }

    static showAbout(): void {
        App.aboutWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 620,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.aboutWindow.setMenu(null);
        App.aboutWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'about.html'));
        App.aboutWindow.once('ready-to-show', () => {
            App.aboutWindow.show();
        });
        App.aboutWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.aboutWindow, 'about.html');
    }

    static sendRequest(params: any, success: Function, error: Function): void {
        let options: any = {
            url: 'http://127.0.0.1:8060/TMXServer',
            method: 'POST'
        }
        let request: ClientRequest = net.request(options);
        let responseData: string = '';
        request.setHeader('Content-Type', 'application/json');
        request.setHeader('Accept', 'application/json');
        request.on('response', (response: IncomingMessage) => {
            response.on('error', (e: Error) => {
                error(e.message);
            });
            response.on('aborted', () => {
                error('Request aborted');
            });
            response.on('end', () => {
                try {
                    let json = JSON.parse(responseData);
                    success(json);
                } catch (reason: any) {
                    error(JSON.stringify(reason));
                }
            });
            response.on('data', (chunk: Buffer) => {
                responseData += chunk.toString();
            });
        });
        request.write(JSON.stringify(params));
        request.end();
    }

    static showSystemInfo() {
        this.systemInfoWindow = new BrowserWindow({
            parent: App.aboutWindow,
            width: 430,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: this.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        this.systemInfoWindow.setMenu(null);
        this.systemInfoWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'systemInfo.html'));
        this.systemInfoWindow.once('ready-to-show', () => {
            this.systemInfoWindow.show();
        });
        this.systemInfoWindow.on('close', () => {
            App.aboutWindow.focus();
        });
        App.setLocation(App.systemInfoWindow, 'systemInfo.html');
    }

    static getSystemInformation(event: IpcMainEvent) {
        this.sendRequest({ command: 'systemInfo' },
            (data: any) => {
                data.electron = process.versions.electron;
                event.sender.send('set-system-info', data);
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static showLicenses(arg: any): void {
        let parent: BrowserWindow = App.mainWindow;
        if (arg.from === 'about' && App.aboutWindow) {
            parent = App.aboutWindow;
        }
        App.licensesWindow = new BrowserWindow({
            parent: parent,
            width: 450,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.licensesWindow.setMenu(null);
        App.licensesWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'licenses.html'));
        App.licensesWindow.once('ready-to-show', () => {
            App.licensesWindow.show();
        });
        App.licensesWindow.on('close', () => {
            parent.focus();
        });
        App.setLocation(App.licensesWindow, 'licenses.html');
    }

    static openLicense(arg: any): void {
        let licenseFile = '';
        let title = '';
        switch (arg.type) {
            case 'TMXEditor':
                licenseFile = 'file://' + path.join(app.getAppPath(), 'html', 'licenses', 'EclipsePublicLicense1.0.html');
                title = 'Eclipse Public License 1.0';
                break;
            case "electron":
                licenseFile = 'file://' + path.join(app.getAppPath(), 'html', 'licenses', 'electron.txt');
                title = 'MIT License';
                break;
            case "MapDB":
                licenseFile = 'file://' + path.join(app.getAppPath(), 'html', 'licenses', 'Apache2.0.html');
                title = 'Apache 2.0';
                break;
            case "Java":
                licenseFile = 'file://' + path.join(app.getAppPath(), 'html', 'licenses', 'java.html');
                title = 'GPL2 with Classpath Exception';
                break;
            case "OpenXLIFF":
            case "XMLJava":
            case "sdltm":
            case "TMXValidator":
                licenseFile = 'file://' + path.join(app.getAppPath(), 'html', 'licenses', 'EclipsePublicLicense1.0.html');
                title = 'Eclipse Public License 1.0';
                break;
            case "JSON":
                licenseFile = 'file://' + path.join(app.getAppPath(), 'html', 'licenses', 'json.txt');
                title = 'JSON.org License';
                break;
            case "jsoup":
                licenseFile = 'file://' + path.join(app.getAppPath(), 'html', 'licenses', 'jsoup.txt');
                title = 'MIT License';
                break;
            case "DTDParser":
                licenseFile = 'file://' + path.join(app.getAppPath(), 'html', 'licenses', 'LGPL2.1.txt');
                title = 'LGPL 2.1';
                break;
            default:
                App.showMessage({ type: 'error', message: App.i18n.getString('app', 'unknownLicense') });
                return;
        }
        let licenseWindow = new BrowserWindow({
            parent: App.licensesWindow,
            width: 680,
            height: 400,
            show: false,
            title: title,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        licenseWindow.setMenu(null);
        licenseWindow.loadURL(licenseFile);
        licenseWindow.once('ready-to-show', () => {
            licenseWindow.show();
        });
        licenseWindow.webContents.on('did-finish-load', () => {
            readFile(App.currentCss.substring('file://'.length), (error, data: Buffer) => {
                if (!error) {
                    licenseWindow.webContents.insertCSS(data.toString());
                }
            });
        });
        licenseWindow.on('close', () => {
            App.licensesWindow.focus();
        });
        App.setLocation(licenseWindow, 'license.html');
    }

    static showHelp(): void {
        shell.openExternal('file://' + path.join(app.getAppPath(), 'tmxeditor_' + App.lang + '.pdf'),
            { activate: true, workingDirectory: app.getAppPath() }
        ).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
        });
    }

    static openFileDialog(): void {
        dialog.showOpenDialog({
            title: 'Open TMX File',
            properties: ['openFile'],
            filters: [
                { name: 'TMX File', extensions: ['tmx'] },
                { name: 'Any File', extensions: ['*'] }
            ]
        }).then((value: OpenDialogReturnValue) => {
            if (!value.canceled) {
                App.openFile(value.filePaths[0]);
                App.saveRecent(value.filePaths[0]);
            }
        }).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
            console.error(error);
        });
    }

    static openFile(file: string): void {
        App.mainWindow.webContents.send('start-waiting');
        App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'OpeningFile'));
        App.sendRequest({ command: 'openFile', file: file },
            (data: any) => {
                App.currentStatus = data;
                let intervalObject = setInterval(() => {
                    let lastCount: number = 0;
                    if (App.currentStatus.status === COMPLETED) {
                        clearInterval(intervalObject);
                        App.getFileLanguages();
                        App.filterOptions = {};
                        App.sortOptions = {};
                        App.mainWindow.webContents.send('file-loaded', App.currentStatus);
                        App.currentFile = file;
                        App.mainWindow.setTitle(App.currentFile);
                        App.saved = true;
                        App.mainWindow.setDocumentEdited(false);
                        App.mainWindow.webContents.send('end-waiting');
                        return;
                    } else if (App.currentStatus.status === LOADING) {
                        // it's OK, keep waiting
                        App.mainWindow.webContents.send('status-changed', App.currentStatus);
                        if (App.currentStatus.Loaded !== lastCount) {
                            App.mainWindow.webContents.send('set-status', App.i18n.format(App.i18n.getString('App', 'LoadedUnits'), ['' + App.currentStatus.Loaded]));
                            lastCount = App.currentStatus.Loaded;
                        }
                    } else if (App.currentStatus.status === ERROR) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'error', message: App.currentStatus.reason });
                        return;
                    } else if (App.currentStatus.status === SUCCESS) {
                        // ignore status from 'openFile'
                    } else {
                        App.mainWindow.webContents.send('end-waiting');
                        clearInterval(intervalObject);
                        dialog.showErrorBox(App.i18n.getString('App', 'Error'), App.i18n.getString('App', 'ErrorLoading'));
                        return;
                    }
                    App.getLoadingProgress();
                }, 500);
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static getLoadingProgress(): void {
        App.sendRequest({ command: 'loadingProgress' },
            (data: any) => {
                App.currentStatus = data;
            },
            (reason: string) => {
                console.error(reason);
            }
        );
    }

    static closeFile(): void {
        if (App.currentFile === '') {
            return;
        }
        if (!App.saved) {
            let clicked: number = dialog.showMessageBoxSync(App.mainWindow, {
                type: 'question',
                title: App.i18n.getString('App', 'SaveChanges'),
                message: App.i18n.getString('App', 'UnsavedWarning'),
                buttons: [
                    App.i18n.getString('App', 'DontSave'),
                    App.i18n.getString('App', 'Cancel'),
                    App.i18n.getString('App', 'Save')
                ],
                defaultId: 2
            });
            if (clicked === 0) {
                App.saved = true;
                App.mainWindow.setDocumentEdited(false);
            }
            if (clicked === 1) {
                return;
            }
            if (clicked === 2) {
                App.shouldClose = true;
                App.saveFile();
                return;
            }
        }
        App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'ClosingFile'));
        App.mainWindow.webContents.send('start-waiting');
        App.sendRequest({ command: 'closeFile' },
            (data: any) => {
                App.mainWindow.webContents.send('end-waiting');
                if (data.status === SUCCESS) {
                    App.mainWindow.webContents.send('file-closed');
                    App.mainWindow.webContents.send('set-status', '');
                    App.currentFile = '';
                    App.mainWindow.setTitle(app.getName());
                    App.saved = true;
                    App.mainWindow.setDocumentEdited(false);
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static getFileLanguages(): void {
        App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'GettingLanguages'));
        App.sendRequest({ command: 'getLanguages' },
            (data: any) => {
                App.mainWindow.webContents.send('set-status', '');
                if (data.status === SUCCESS) {
                    App.fileLanguages = data.languages;
                    App.mainWindow.webContents.send('update-languages', App.fileLanguages);
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.mainWindow.webContents.send('set-status', '');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static saveDefaults(): void {
        let defaults = App.mainWindow.getBounds();
        writeFileSync(path.join(app.getPath('appData'), app.name, 'defaults.json'), JSON.stringify(defaults, undefined, 4));
    }

    static loadSegments(): void {
        if (App.currentFile === '') {
            return;
        }
        let json: any = {
            command: 'getSegments'
        }
        Object.assign(json, App.loadOptions);
        Object.assign(json, App.filterOptions);
        Object.assign(json, App.sortOptions);
        App.mainWindow.webContents.send('start-waiting');
        App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'LoadingSegments'));
        App.sendRequest(json,
            (data: any) => {
                App.mainWindow.webContents.send('set-status', '');
                App.mainWindow.webContents.send('end-waiting');
                if (data.status === SUCCESS) {
                    App.mainWindow.webContents.send('update-segments', data);
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static loadDefaults(): void {
        App.currentDefaults = { width: 950, height: 700, x: 0, y: 0 };
        if (existsSync(path.join(app.getPath('appData'), app.name, 'defaults.json'))) {
            try {
                let data: Buffer = readFileSync(path.join(app.getPath('appData'), app.name, 'defaults.json'));
                App.currentDefaults = JSON.parse(data.toString());
            } catch (err) {
                console.error(err);
            }
        }
    }

    static savePreferences(preferences: any): void {
        writeFileSync(path.join(app.getPath('appData'), app.name, 'preferences.json'), JSON.stringify(preferences, undefined, 4));
        if (app.isReady() && preferences.appLang !== App.lang) {
            dialog.showMessageBox({
                type: 'question',
                message: App.i18n.getString('App', 'languageChanged'),
                buttons: [App.i18n.getString('App', 'restart'), App.i18n.getString('App', 'dismiss')],
                cancelId: 1
            }).then((value: MessageBoxReturnValue) => {
                if (value.response == 0) {
                    app.relaunch();
                    app.quit();
                }
            });
        }
        App.currentPreferences = preferences;
    }

    static loadPreferences() {
        let dark: string = 'file://' + path.join(app.getAppPath(), 'css', 'dark.css');
        let light: string = 'file://' + path.join(app.getAppPath(), 'css', 'light.css');
        let preferencesFile = path.join(app.getPath('appData'), app.name, 'preferences.json');
        if (!existsSync(preferencesFile)) {
            let locales: string[] = app.getPreferredSystemLanguages();
            let appLang: string = 'en';
            if (locales.length > 0) {
                if (locales[0].startsWith('es')) {
                    appLang = 'es';
                }
            }
            this.savePreferences({ theme: 'system', indentation: 2, threshold: 500, appLang: appLang });
        }
        try {
            let data: Buffer = readFileSync(preferencesFile);
            App.currentPreferences = JSON.parse(data.toString());
            if (!App.currentPreferences.appLang) {
                App.currentPreferences.appLang = 'en';
            }
            App.lang = App.currentPreferences.appLang;
        } catch (err) {
            console.error(err);
        }
        if (App.currentPreferences.theme === 'system') {
            if (nativeTheme.shouldUseDarkColors) {
                App.currentCss = dark;
            } else {
                App.currentCss = light;
            }
        }
        if (App.currentPreferences.theme === 'dark') {
            App.currentCss = dark;
        }
        if (App.currentPreferences.theme === 'light') {
            App.currentCss = light;
        }
    }

    static saveRecent(file: string): void {
        readFile(path.join(app.getPath('appData'), app.name, 'recent.json'), (err, data: Buffer) => {
            if (err instanceof Error) {
                return;
            }
            let jsonData = JSON.parse(data.toString());
            jsonData.files = jsonData.files.filter((f: string) => {
                return f !== file;
            });
            jsonData.files.unshift(file);
            if (jsonData.files.length > 8) {
                jsonData.files = jsonData.files.slice(0, 8);
            }
            writeFile(path.join(app.getPath('appData'), app.name, 'recent.json'), JSON.stringify(jsonData, undefined, 4), (error) => {
                if (error instanceof Error) {
                    App.showMessage({ type: 'error', message: error.message });
                    return;
                }
            });
        });
        app.addRecentDocument(file);
    }

    static getCellProperties(id: string, lang: string): void {
        App.mainWindow.webContents.send('start-waiting');
        App.sendRequest({ command: 'getTuvData', id: id, lang: lang },
            (data: any) => {
                App.mainWindow.webContents.send('end-waiting');
                data.type = lang;
                App.mainWindow.webContents.send('update-properties', data);
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static getRowProperties(id: string): void {
        App.mainWindow.webContents.send('start-waiting');
        App.sendRequest({ command: 'getTuData', id: id },
            (data: any) => {
                App.mainWindow.webContents.send('end-waiting');
                data.type = 'TU';
                App.mainWindow.webContents.send('update-properties', data);
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    editAttributes(arg: any): void {
        App.attributesWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 670,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.attributesArg = arg;
        App.attributesWindow.setMenu(null);
        App.attributesWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'attributes.html'));
        App.attributesWindow.once('ready-to-show', () => {
            App.attributesWindow.show();
        });
        App.attributesWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.attributesWindow, 'attributes.html');
    }

    saveAttributes(arg: any): void {
        App.mainWindow.webContents.send('start-waiting');
        App.destroyWindow(App.attributesWindow);
        arg.command = 'setAttributes';
        App.sendRequest(arg,
            (data: any) => {
                App.mainWindow.webContents.send('end-waiting');
                if (data.status === SUCCESS) {
                    if (arg.lang === '') {
                        App.getRowProperties(arg.id);
                    } else {
                        App.getCellProperties(arg.id, arg.lang);
                    }
                    App.saved = false;
                    App.mainWindow.setDocumentEdited(true);
                } else {
                    App.mainWindow.webContents.send('end-waiting');
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    editProperties(arg: any): void {
        App.propertiesWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 500,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.propertiesArg = arg;
        App.propertiesWindow.setMenu(null);
        App.propertiesWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'properties.html'));
        App.propertiesWindow.once('ready-to-show', () => {
            App.propertiesWindow.show();
        });
        App.propertiesWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.propertiesWindow, 'properties.html');
    }

    static showAddProperty(event: IpcMainEvent): void {
        App.propertyEvent = event;
        App.addPropertyWindow = new BrowserWindow({
            parent: App.propertiesWindow,
            width: 350,
            minimizable: false,
            maximizable: false,
            resizable: false,
            modal: true,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.addPropertyWindow.setMenu(null);
        App.addPropertyWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'addProperty.html'));
        App.addPropertyWindow.once('ready-to-show', () => {
            App.addPropertyWindow.show();
        });
        App.addPropertyWindow.on('close', () => {
            App.propertiesWindow.focus();
        });
        App.setLocation(App.addPropertyWindow, 'addProperty.html');
    }

    addNewProperty(arg: any): void {
        App.destroyWindow(App.addPropertyWindow);
        App.propertyEvent.sender.send('set-new-property', arg);
    }

    saveProperties(arg: any): void {
        App.mainWindow.webContents.send('start-waiting');
        App.destroyWindow(App.propertiesWindow);
        arg.command = 'setProperties';
        App.sendRequest(arg,
            (data: any) => {
                App.mainWindow.webContents.send('end-waiting');
                if (data.status === SUCCESS) {
                    if (arg.lang === '') {
                        App.getRowProperties(arg.id);
                    } else {
                        App.getCellProperties(arg.id, arg.lang);
                    }
                    App.saved = false;
                    App.mainWindow.setDocumentEdited(true);
                } else {
                    App.mainWindow.webContents.send('end-waiting');
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static editNotes(arg: any): void {
        App.notesWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 500,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.notesArg = arg;
        App.notesWindow.setMenu(null);
        App.notesWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'notes.html'));
        App.notesWindow.once('ready-to-show', () => {
            App.notesWindow.show();
        });
        App.notesWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.notesWindow, 'notes.html');
    }

    showAddNote(event: IpcMainEvent): void {
        App.notesEvent = event;
        App.addNotesWindow = new BrowserWindow({
            parent: App.notesWindow,
            width: 350,
            minimizable: false,
            maximizable: false,
            resizable: false,
            modal: true,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.addNotesWindow.setMenu(null);
        App.addNotesWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'addNote.html'));
        App.addNotesWindow.once('ready-to-show', () => {
            App.addNotesWindow.show();
        });
        App.addNotesWindow.on('close', () => {
            App.notesWindow.focus();
        });
        App.setLocation(App.addNotesWindow, 'addNote.html');
    }

    addNewNote(arg: any): void {
        App.destroyWindow(App.addNotesWindow);
        App.notesEvent.sender.send('set-new-note', arg);
    }

    saveNotes(arg: any): void {
        App.mainWindow.webContents.send('start-waiting');
        App.destroyWindow(App.notesWindow);
        arg.command = 'setNotes';
        App.sendRequest(arg,
            (data: any) => {
                App.mainWindow.webContents.send('end-waiting');
                if (data.status === SUCCESS) {
                    if (arg.lang === '') {
                        App.getRowProperties(arg.id);
                    } else {
                        App.getCellProperties(arg.id, arg.lang);
                    }
                    App.saved = false;
                    App.mainWindow.setDocumentEdited(true);
                } else {
                    App.mainWindow.webContents.send('end-waiting');
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static showSettings(): void {
        App.settingsWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 500,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.settingsWindow.setMenu(null);
        App.settingsWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'preferences.html'));
        App.settingsWindow.once('ready-to-show', () => {
            App.settingsWindow.show();
        });
        App.settingsWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.settingsWindow, 'preferences.html');
    }

    static setTheme(): void {
        App.mainWindow.webContents.send('request-theme');
    }

    static createNewFile(): void {
        App.newFileWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 480,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.newFileWindow.setMenu(null);
        App.newFileWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'newFile.html'));
        App.newFileWindow.once('ready-to-show', () => {
            App.newFileWindow.show();
        });
        App.newFileWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.newFileWindow, 'newFile.html');
    }

    createFile(arg: any): void {
        App.destroyWindow(App.newFileWindow);
        if (App.currentFile !== '' && !App.saved) {
            let response = dialog.showMessageBoxSync(App.mainWindow, {
                type: 'question',
                message: App.i18n.getString('App', 'SaveChanges'),
                buttons: [App.i18n.getString('App', 'Yes'), App.i18n.getString('App', 'No')]
            });
            if (response === 0) {
                App.saveFile();
            }
        }
        arg.command = 'createFile';
        App.sendRequest(arg,
            (data: any) => {
                if (data.status === SUCCESS) {
                    App.openFile(data.path);
                    App.needsName = true;
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static saveFile(): void {
        if (App.currentFile === '') {
            return;
        }
        if (App.needsName) {
            App.saveAs();
            return;
        }
        App.sendRequest({ command: 'saveFile', file: App.currentFile },
            (data: any) => {
                App.currentStatus = data;
                App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'Saving'));
                let intervalObject = setInterval(() => {
                    if (App.currentStatus.status === COMPLETED) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.saved = true;
                        App.mainWindow.setDocumentEdited(false);
                        if (App.shouldClose) {
                            App.shouldClose = false;
                            App.closeFile();
                        }
                        if (App.shouldQuit) {
                            App.close();
                        }
                        return;
                    } else if (App.currentStatus.status === SAVING) {
                        // it's OK, keep waiting
                    } else if (App.currentStatus.status === ERROR) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'error', message: App.currentStatus.reason });
                        return;
                    } else if (App.currentStatus.status === SUCCESS) {
                        // ignore status from 'saveFile'
                    } else {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        dialog.showErrorBox(App.i18n.getString('App', 'Error'),
                            App.i18n.getString('App', 'ErrorSaving'));
                        return;
                    }
                    App.getSavingProgress();
                }, 500);
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static getSavingProgress(): void {
        App.sendRequest({ command: 'savingProgress' },
            (data: any) => {
                App.currentStatus = data;
            },
            (reason: string) => {
                console.error(reason);
            }
        );
    }

    static saveAs(): void {
        dialog.showSaveDialog({
            title: App.i18n.getString('App', 'SaveTMX'),
            properties: ['showOverwriteConfirmation', 'createDirectory'],
            filters: [
                { name: App.i18n.getString('App', 'TMXFile'), extensions: ['tmx'] },
                { name: App.i18n.getString('App', 'AnyFile'), extensions: ['*'] }
            ]
        }).then((value: SaveDialogReturnValue) => {
            if (!value.canceled && value.filePath) {
                App.currentFile = value.filePath;
                App.needsName = false;
                App.saveFile();
                App.mainWindow.setTitle(App.currentFile);
                App.saveRecent(App.currentFile);
                App.saved = true;
                App.mainWindow.setDocumentEdited(false);
            }
        }).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
        });
    }

    static convertCSV(): void {
        App.convertCsvWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 700,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.convertCsvWindow.setMenu(null);
        App.convertCsvWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'convertCSV.html'));
        App.convertCsvWindow.once('ready-to-show', () => {
            App.convertCsvWindow.show();
        });
        App.convertCsvWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.convertCsvWindow, 'convertCSV.html');
    }

    static convertSDLTM(): void {
        App.convertSDLTMWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 700,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.convertSDLTMWindow.setMenu(null);
        App.convertSDLTMWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'convertSDLTM.html'));
        App.convertSDLTMWindow.once('ready-to-show', () => {
            App.convertSDLTMWindow.show();
        });
        App.convertSDLTMWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.convertSDLTMWindow, 'convertSDLTM.html');
    }

    static convertExcel(): void {
        App.convertExcelWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 700,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.convertExcelWindow.setMenu(null);
        App.convertExcelWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'convertExcel.html'));
        App.convertExcelWindow.once('ready-to-show', () => {
            App.convertExcelWindow.show();
        });
        App.convertExcelWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.convertExcelWindow, 'convertExcel.html');
    }

    convertCsvTmx(arg: any): void {
        App.destroyWindow(App.convertCsvWindow);
        arg.command = 'convertCsv';
        App.sendRequest(arg,
            (data: any) => {
                if (data.status === SUCCESS) {
                    if (arg.openTMX) {
                        if (App.currentFile !== '') {
                            App.closeFile();
                        }
                        App.openFile(arg.tmxFile);
                    } else {
                        App.showMessage({ type: 'info', message: App.i18n.getString('App', 'fileConverted') });
                    }
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    convertSdltmTmx(arg: any): void {
        App.destroyWindow(App.convertSDLTMWindow);
        App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'Converting'));
        try {
            new TMReader(arg.sdltmFile, arg.tmxFile, { productName: app.name, version: app.getVersion() }, (data: any) => {
                App.mainWindow.webContents.send('set-status', '');
                if (data.status === SUCCESS) {
                    if (arg.openTMX) {
                        if (App.currentFile !== '') {
                            App.closeFile();
                        }
                        App.openFile(arg.tmxFile);
                    } else {
                        App.showMessage({
                            type: 'info',
                            message: App.i18n.format(App.i18n.getString('App', 'convertedEntries'), [data.count])
                        });
                    }
                }
                if (data.status === ERROR) {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            });
        } catch (err) {
            console.error(err);
            if (err instanceof Error) {
                App.showMessage({ type: 'error', message: err.message });
            }
        }
    }

    convertExcelTmx(arg: any): void {
        App.destroyWindow(App.convertExcelWindow);
        arg.command = 'convertExcel';
        App.sendRequest(arg,
            (data: any) => {
                if (data.status === SUCCESS) {
                    if (arg.openTMX) {
                        if (App.currentFile !== '') {
                            App.closeFile();
                        }
                        App.openFile(arg.tmxFile);
                    } else {
                        App.showMessage({
                            type: 'info',
                            message: App.i18n.getString('App', 'fileConverted')
                        });
                    }
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    getCharsets(event: IpcMainEvent): void {
        App.sendRequest({ command: 'getCharsets' },
            (data: any) => {
                if (data.status === SUCCESS) {
                    event.sender.send('set-charsets', data.charsets);
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    getCsvPreview(event: IpcMainEvent, arg: any): void {
        arg.command = 'previewCsv';
        App.sendRequest(arg,
            (data: any) => {
                if (data.status === SUCCESS) {
                    event.sender.send('set-preview', data);
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    getExcelPreview(event: IpcMainEvent, arg: any): void {
        arg.command = 'previewExcel';
        App.sendRequest(arg,
            (data: any) => {
                if (data.status === SUCCESS) {
                    event.sender.send('set-preview', data.sheets);
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    getCsvFile(event: IpcMainEvent): void {
        dialog.showOpenDialog({
            title: App.i18n.getString('App', 'OpenCSV'),
            properties: ['openFile'],
            filters: [
                { name: App.i18n.getString('App', 'CSVFile'), extensions: ['csv', 'txt'] },
                { name: App.i18n.getString('App', 'AnyFile'), extensions: ['*'] }
            ]
        }).then((value: OpenDialogReturnValue) => {
            if (!value.canceled) {
                event.sender.send('set-csvfile', value.filePaths[0]);
            }
        }).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
        });
    }

    getSdltmFile(event: IpcMainEvent): void {
        dialog.showOpenDialog({
            title: App.i18n.getString('App', 'OpenSDLTM'),
            properties: ['openFile'],
            filters: [
                { name: App.i18n.getString('App', 'SDLTMFile'), extensions: ['sdltm'] },
                { name: App.i18n.getString('App', 'AnyFile'), extensions: ['*'] }
            ]
        }).then((value: OpenDialogReturnValue) => {
            if (!value.canceled) {
                event.sender.send('set-sdltmfile', value.filePaths[0]);
            }
        }).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
        });
    }

    getExcelFile(event: IpcMainEvent): void {
        dialog.showOpenDialog({
            title: App.i18n.getString('App', 'OpenExcel'),
            properties: ['openFile'],
            filters: [
                { name: App.i18n.getString('App', 'ExcelFile'), extensions: ['xlsx'] },
                { name: App.i18n.getString('App', 'AnyFile'), extensions: ['*'] }
            ]
        }).then((value: OpenDialogReturnValue) => {
            if (!value.canceled) {
                event.sender.send('set-excelfile', value.filePaths[0]);
            }
        }).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
        });
    }

    getConvertedTMX(event: IpcMainEvent, arg: any): void {
        dialog.showSaveDialog({
            title: App.i18n.getString('App', 'ConvertedTMX'),
            defaultPath: arg.default,
            properties: ['showOverwriteConfirmation', 'createDirectory'],
            filters: [
                { name: App.i18n.getString('App', 'TMXFile'), extensions: ['tmx'] },
                { name: App.i18n.getString('App', 'AnyFile'), extensions: ['*'] }
            ]
        }).then((value: SaveDialogReturnValue) => {
            if (!value.canceled) {
                event.sender.send('converted-tmx-file', value.filePath);
            }
        }).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
        });
    }

    getCsvLanguages(event: IpcMainEvent, arg: any): void {
        App.csvEvent = event;
        App.csvLangArgs = arg;
        let labels: string[] = [];
        for (let i = 0; i < arg.columns; i++) {
            let label: string = App.i18n.getString('App', 'columnLabel');
            labels.push(App.i18n.format(label, ['' + (i + 1)]));
        }
        App.csvLangArgs.labels = labels;
        App.csvLanguagesWindow = new BrowserWindow({
            parent: App.convertCsvWindow,
            modal: false,
            width: 520,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.csvLanguagesWindow.setMenu(null);
        App.csvLanguagesWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'csvLanguages.html'));
        App.csvLanguagesWindow.once('ready-to-show', () => {
            App.csvLanguagesWindow.show();
        });
        App.csvLanguagesWindow.on('close', () => {
            App.convertCsvWindow.focus();
        });
        App.setLocation(App.csvLanguagesWindow, 'csvLanguages.html');
    }

    setCsvLanguages(arg: any): void {
        App.destroyWindow(App.csvLanguagesWindow);
        App.csvEvent.sender.send('csv-languages', arg);
    }

    getExcelLanguages(event: IpcMainEvent, arg: any): void {
        App.excelEvent = event;
        let labels: string[] = [];
        for (let i = 0; i < arg.columns.length; i++) {
            labels.push(App.i18n.format(App.i18n.getString('App', 'columnLabel'), arg.columns[i]));
        }
        App.excelLangArgs = arg;
        App.excelLangArgs.labels = labels;
        App.excelLanguagesWindow = new BrowserWindow({
            parent: App.convertExcelWindow,
            modal: false,
            width: 520,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.excelLanguagesWindow.setMenu(null);
        App.excelLanguagesWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'excelLanguages.html'));
        App.excelLanguagesWindow.once('ready-to-show', () => {
            App.excelLanguagesWindow.show();
        });
        App.excelLanguagesWindow.on('close', () => {
            App.convertExcelWindow.focus();
        });
        App.setLocation(App.excelLanguagesWindow, 'excelLanguages.html');
    }

    setExcelLanguages(arg: any): void {
        App.destroyWindow(App.excelLanguagesWindow);
        App.excelEvent.sender.send('excel-languages', arg);
    }

    static exportDelimited(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        dialog.showSaveDialog({
            title: App.i18n.getString('App', 'ExportTabDelimited'),
            defaultPath: this.currentFile.substring(0, this.currentFile.lastIndexOf('.')) + '.csv',
            properties: ['showOverwriteConfirmation', 'createDirectory'],
            filters: [
                { name: App.i18n.getString('App', 'CSVFile'), extensions: ['csv'] },
                { name: App.i18n.getString('App', 'TextFile'), extensions: ['txt'] },
                { name: App.i18n.getString('App', 'AnyFile'), extensions: ['*'] }
            ]
        }).then((value: SaveDialogReturnValue) => {
            if (!value.canceled) {
                App.mainWindow.webContents.send('start-waiting');
                App.sendRequest({ command: 'exportDelimited', file: value.filePath },
                    (data: any) => {
                        App.currentStatus = data;
                        App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'Exporting'));
                        let intervalObject = setInterval(() => {
                            if (App.currentStatus.status === COMPLETED) {
                                App.mainWindow.webContents.send('end-waiting');
                                App.mainWindow.webContents.send('set-status', '');
                                clearInterval(intervalObject);
                                App.showMessage({ type: 'info', message: App.i18n.getString('App', 'fileExported') });
                                return;
                            } else if (App.currentStatus.status === ERROR) {
                                App.mainWindow.webContents.send('end-waiting');
                                App.mainWindow.webContents.send('set-status', '');
                                clearInterval(intervalObject);
                                App.showMessage({ type: 'error', message: App.currentStatus.reason });
                                return;
                            } else if (App.currentStatus.status === SUCCESS) {
                                // keep waiting
                            } else {
                                App.mainWindow.webContents.send('end-waiting');
                                App.mainWindow.webContents.send('set-status', '');
                                clearInterval(intervalObject);
                                dialog.showErrorBox(App.i18n.getString('App', 'Error'),
                                    App.i18n.getString('App', 'ErrorExporting'));
                                return;
                            }
                            App.getExportProgress();
                        }, 500);
                    },
                    (reason: string) => {
                        App.mainWindow.webContents.send('end-waiting');
                        App.showMessage({ type: 'error', message: reason });
                    }
                );
            }
        }).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
        });
    }

    static exportExcel(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        dialog.showSaveDialog({
            title: App.i18n.getString('App', 'ExportExcel'),
            defaultPath: this.currentFile.substring(0, this.currentFile.lastIndexOf('.')) + '.xlsx',
            properties: ['showOverwriteConfirmation', 'createDirectory'],
            filters: [
                { name: App.i18n.getString('App', 'ExcelFile'), extensions: ['xlsx'] },
                { name: App.i18n.getString('App', 'AnyFile'), extensions: ['*'] }
            ]
        }).then((value: SaveDialogReturnValue) => {
            if (!value.canceled) {
                App.mainWindow.webContents.send('start-waiting');
                App.sendRequest({ command: 'exportExcel', file: value.filePath },
                    (data: any) => {
                        App.currentStatus = data;
                        App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'Exporting'));
                        let intervalObject = setInterval(() => {
                            if (App.currentStatus.status === COMPLETED) {
                                App.mainWindow.webContents.send('end-waiting');
                                App.mainWindow.webContents.send('set-status', '');
                                clearInterval(intervalObject);
                                App.showMessage({ type: 'info', message: App.i18n.getString('App', 'fileExported') });
                                return;
                            } else if (App.currentStatus.status === ERROR) {
                                App.mainWindow.webContents.send('end-waiting');
                                App.mainWindow.webContents.send('set-status', '');
                                clearInterval(intervalObject);
                                App.showMessage({ type: 'error', message: App.currentStatus.reason });
                                return;
                            } else if (App.currentStatus.status === SUCCESS) {
                                // keep waiting
                            } else {
                                App.mainWindow.webContents.send('end-waiting');
                                App.mainWindow.webContents.send('set-status', '');
                                clearInterval(intervalObject);
                                dialog.showErrorBox(App.i18n.getString('App', 'Error')
                                    , App.i18n.getString('App', 'ErrorExporting'));
                                return;
                            }
                            App.getExportProgress();
                        }, 500);
                    },
                    (reason: string) => {
                        App.mainWindow.webContents.send('end-waiting');
                        App.showMessage({ type: 'error', message: reason });
                    }
                );
            }
        }).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
        });
    }

    static getExportProgress(): void {
        App.sendRequest({ command: 'exportProgress' },
            (data: any) => {
                App.currentStatus = data;
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static showFileInfo(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.fileInfoWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 550,
            minimizable: false,
            maximizable: false,
            resizable: true,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.fileInfoWindow.setMenu(null);
        App.fileInfoWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'fileInfo.html'));
        App.fileInfoWindow.once('ready-to-show', () => {
            App.fileInfoWindow.show();
        });
        App.fileInfoWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.fileInfoWindow, 'fileInfo.html');
    }

    fileProperties(event: IpcMainEvent): void {
        App.sendRequest({ command: 'getFileProperties' },
            (data: any) => {
                if (data.status === SUCCESS) {
                    event.sender.send('set-file-properties', data);
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static validateFile(): void {
        dialog.showOpenDialog({
            title: App.i18n.getString('App', 'ValidateTMX'),
            properties: ['openFile'],
            filters: [
                { name: App.i18n.getString('App', 'TMXFile'), extensions: ['tmx'] }
            ]
        }).then((value: OpenDialogReturnValue) => {
            if (!value.canceled) {
                App.mainWindow.webContents.send('start-waiting');
                App.sendRequest({ command: 'validateFile', file: value.filePaths[0] },
                    (data: any) => {
                        App.currentStatus = data;
                        App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'Validating'));
                        let intervalObject = setInterval(() => {
                            if (App.currentStatus.status === COMPLETED) {
                                App.mainWindow.webContents.send('end-waiting');
                                App.mainWindow.webContents.send('set-status', '');
                                clearInterval(intervalObject);
                                App.showMessage({
                                    type: 'info',
                                    message: App.i18n.getString('App', 'fileIsVaild')
                                });
                                return;
                            } else if (App.currentStatus.status === ERROR) {
                                App.mainWindow.webContents.send('end-waiting');
                                App.mainWindow.webContents.send('set-status', '');
                                clearInterval(intervalObject);
                                App.showMessage({ type: 'error', message: App.currentStatus.reason });
                                return;
                            } else if (App.currentStatus.status === SUCCESS) {
                                // keep waiting
                            } else {
                                App.mainWindow.webContents.send('end-waiting');
                                App.mainWindow.webContents.send('set-status', '');
                                clearInterval(intervalObject);
                                dialog.showErrorBox(App.i18n.getString('App', 'Error'),
                                    App.i18n.getString('App', 'ErrorValidating'));
                                return;
                            }
                            App.getValidatingProgress();
                        }, 500);
                    },
                    (reason: string) => {
                        App.mainWindow.webContents.send('end-waiting');
                        App.showMessage({ type: 'error', message: reason });
                    }
                );
            }
        }).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
        });
    }

    static getValidatingProgress(): void {
        App.sendRequest({ command: 'validatingProgress' },
            (data: any) => {
                App.currentStatus = data;
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static cleanCharacters(): void {
        dialog.showOpenDialog({
            title: App.i18n.getString('App', 'CleanCharacters'),
            properties: ['openFile'],
            filters: [
                { name: App.i18n.getString('App', 'TMXFile'), extensions: ['tmx'] }
            ]
        }).then((value: OpenDialogReturnValue) => {
            if (!value.canceled) {
                App.mainWindow.webContents.send('start-waiting');
                App.sendRequest({ command: 'cleanCharacters', file: value.filePaths[0] },
                    (data: any) => {
                        App.currentStatus = data;
                        App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'Cleaning'));
                        let intervalObject = setInterval(() => {
                            if (App.currentStatus.status === COMPLETED) {
                                App.mainWindow.webContents.send('end-waiting');
                                App.mainWindow.webContents.send('set-status', '');
                                clearInterval(intervalObject);
                                App.showMessage({
                                    type: 'info',
                                    message: App.i18n.getString('App', 'fileCleaned')
                                });
                                return;
                            } else if (App.currentStatus.status === ERROR) {
                                App.mainWindow.webContents.send('end-waiting');
                                App.mainWindow.webContents.send('set-status', '');
                                clearInterval(intervalObject);
                                App.showMessage({ type: 'error', message: App.currentStatus.reason });
                                return;
                            } else if (App.currentStatus.status === SUCCESS) {
                                // keep waiting
                            } else {
                                App.mainWindow.webContents.send('end-waiting');
                                App.mainWindow.webContents.send('set-status', '');
                                clearInterval(intervalObject);
                                dialog.showErrorBox(App.i18n.getString('App', 'Error'),
                                    App.i18n.getString('App', 'ErrorCleaning'));
                                return;
                            }
                            App.getCleaningProgress();
                        }, 500);
                    },
                    (reason: string) => {
                        App.mainWindow.webContents.send('end-waiting');
                        App.showMessage({ type: 'error', message: reason });
                    }
                );
            }
        }).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
        });
    }

    static getCleaningProgress(): void {
        App.sendRequest({ command: 'cleaningProgress' },
            (data: any) => {
                App.currentStatus = data;
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static splitFile(): void {
        App.splitFileWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 504,
            minimizable: false,
            maximizable: false,
            resizable: true,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.splitFileWindow.setMenu(null);
        App.splitFileWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'splitFile.html'));
        App.splitFileWindow.once('ready-to-show', () => {
            App.splitFileWindow.show();
        });
        App.splitFileWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.splitFileWindow, 'splitFile.html');
    }

    splitTmx(arg: any): void {
        App.destroyWindow(App.splitFileWindow);
        arg.command = 'splitFile';
        App.sendRequest(arg,
            (data: any) => {
                App.currentStatus = data;
                App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'Splitting'));
                let intervalObject = setInterval(() => {
                    if (App.currentStatus.status === COMPLETED) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'info', message: App.i18n.getString('App', 'fileSplit') });
                        return;
                    } else if (App.currentStatus.status === PROCESSING) {
                        // it's OK, keep waiting
                    } else if (App.currentStatus.status === ERROR) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'error', message: App.currentStatus.reason });
                        return;
                    } else if (App.currentStatus.status === SUCCESS) {
                        // ignore status from 'replaceText'
                    } else {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        dialog.showErrorBox(App.i18n.getString('App', 'Error'),
                            App.i18n.getString('App', 'ErrorSplitting'));
                        return;
                    }
                    App.getSplitProgress();
                }, 500);
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static getSplitProgress(): void {
        App.sendRequest({ command: 'getSplitProgress' },
            (data: any) => {
                App.currentStatus = data;
            },
            (reason: string) => {
                console.error(reason);
            }
        );
    }

    selectTmx(event: IpcMainEvent): void {
        dialog.showOpenDialog({
            title: 'TMX File',
            properties: ['openFile'],
            filters: [
                { name: 'TMX File', extensions: ['tmx'] },
                { name: 'Any File', extensions: ['*'] }
            ]
        }).then((value: OpenDialogReturnValue) => {
            if (!value.canceled) {
                event.sender.send('tmx-file', value.filePaths[0]);
            }
        }).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
        });
    }

    static mergeFiles(): void {
        App.mergeFilesWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 600,
            minimizable: false,
            maximizable: false,
            resizable: true,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.mergeFilesWindow.setMenu(null);
        App.mergeFilesWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'mergeFiles.html'));
        App.mergeFilesWindow.once('ready-to-show', () => {
            App.mergeFilesWindow.show();
        });
        App.mergeFilesWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.mergeFilesWindow, 'mergeFiles.html');
    }

    mergeTmxFiles(arg: any): void {
        App.destroyWindow(App.mergeFilesWindow);
        App.mainWindow.webContents.send('start-waiting');
        arg.command = 'mergeFiles';
        App.sendRequest(arg,
            (data: any) => {
                App.currentStatus = data;
                App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'Merging'));
                let intervalObject = setInterval(() => {
                    if (App.currentStatus.status === COMPLETED) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({
                            type: 'info',
                            message: App.i18n.getString('App', 'filesMerged')
                        });
                        return;
                    } else if (App.currentStatus.status === PROCESSING) {
                        // it's OK, keep waiting
                    } else if (App.currentStatus.status === ERROR) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'error', message: App.currentStatus.reason });
                        return;
                    } else if (App.currentStatus.status === SUCCESS) {
                        // ignore status from 'mergeFiles'
                    } else {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({
                            type: 'error',
                            message: App.i18n.getString('App', 'unknownErrorMerging')
                        });
                        return;
                    }
                    App.getMergeProgress();
                }, 500);
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static getMergeProgress(): void {
        App.sendRequest({ command: 'getMergeProgress' },
            (data: any) => {
                App.currentStatus = data;
            },
            (reason: string) => {
                console.error(reason);
            }
        );
    }

    static saveEdits(): void {
        if (App.currentFile === '') {
            return;
        }
        App.mainWindow.webContents.send('save-edit');
    }

    static cancelEdit(): void {
        if (App.currentFile === '') {
            return;
        }
        App.mainWindow.webContents.send('cancel-edit');
    }

    addTmxFiles(event: IpcMainEvent): void {
        dialog.showOpenDialog({
            title: App.i18n.getString('App', 'TMXFiles'),
            properties: ['openFile', 'multiSelections'],
            filters: [
                { name: App.i18n.getString('App', 'TMXFile'), extensions: ['tmx'] },
                { name: App.i18n.getString('App', 'AnyFile'), extensions: ['*'] }
            ]
        }).then((value: OpenDialogReturnValue) => {
            if (!value.canceled) {
                event.sender.send('tmx-files', value.filePaths);
            }
        }).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
        });
    }

    selectMergedTmx(event: IpcMainEvent): void {
        dialog.showSaveDialog({
            title: App.i18n.getString('App', 'MergedFile'),
            properties: ['showOverwriteConfirmation', 'createDirectory'],
            filters: [
                { name: App.i18n.getString('App', 'TMXFile'), extensions: ['tmx'] },
                { name: App.i18n.getString('App', 'AnyFile'), extensions: ['*'] }
            ]
        }).then((value: SaveDialogReturnValue) => {
            if (!value.canceled) {
                event.sender.send('merged-tmx-file', value.filePath);
            }
        }).catch((error: Error) => {
            App.showMessage({ type: 'error', message: error.message });
        });
    }

    saveData(event: IpcMainEvent, arg: any): void {
        arg.command = 'saveTuvData';
        App.sendRequest(arg,
            (data: any) => {
                if (data.status === SUCCESS) {
                    App.mainWindow.setDocumentEdited(true);
                    App.saved = false;
                    event.sender.send('data-saved', data);
                    return;
                }
                App.showMessage({ type: 'error', message: data.reason });
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static replaceText(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.replaceTextWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 450,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.replaceTextWindow.setMenu(null);
        App.replaceTextWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'searchReplace.html'));
        App.replaceTextWindow.once('ready-to-show', () => {
            App.replaceTextWindow.show();
        });
        App.replaceTextWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.replaceTextWindow, 'searchReplace.html');
    }

    replaceRequest(arg: any): void {
        App.destroyWindow(App.replaceTextWindow);
        App.mainWindow.webContents.send('start-waiting');
        arg.command = 'replaceText';
        App.sendRequest(arg,
            (data: any) => {
                App.currentStatus = data;
                App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'Replacing'));
                let intervalObject = setInterval(() => {
                    if (App.currentStatus.status === COMPLETED) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.loadSegments();
                        App.getCount();
                        App.saved = false;
                        App.mainWindow.setDocumentEdited(true);
                        return;
                    } else if (App.currentStatus.status === PROCESSING) {
                        // it's OK, keep waiting
                    } else if (App.currentStatus.status === ERROR) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'error', message: App.currentStatus.reason });
                        return;
                    } else if (App.currentStatus.status === SUCCESS) {
                        // ignore status from 'replaceText'
                    } else {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({
                            type: 'error',
                            message: App.i18n.getString('App', 'unknownErrorReplacing')
                        });
                        return;
                    }
                    App.getProcessingProgress();
                }, 500);
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static getProcessingProgress(): void {
        App.sendRequest({ command: 'processingProgress' },
            (data: any) => {
                App.currentStatus = data;
            },
            (reason: string) => {
                console.error(reason);
            }
        );
    }

    static sortUnits() {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.sortUnitsWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 520,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.sortUnitsWindow.setMenu(null);
        App.sortUnitsWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'sortUnits.html'));
        App.sortUnitsWindow.once('ready-to-show', () => {
            App.sortUnitsWindow.show();
        });
        App.sortUnitsWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.sortUnitsWindow, 'sortUnits.html');
    }

    setSort(arg: any): void {
        App.sortOptions = arg;
        App.destroyWindow(App.sortUnitsWindow);
        App.loadSegments();
        App.mainWindow.webContents.send('sort-on');
    }

    clearSort(): void {
        App.sortOptions = {};
        App.destroyWindow(App.sortUnitsWindow);
        App.loadSegments();
        App.mainWindow.webContents.send('sort-off');
    }

    static showFilters(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.filtersWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 520,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.filtersWindow.setMenu(null);
        App.filtersWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'filters.html'));
        App.filtersWindow.once('ready-to-show', () => {
            App.filtersWindow.show();
        });
        App.filtersWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.filtersWindow, 'filters.html');
    }

    setFilterOptions(arg: any): void {
        App.filterOptions = arg;
        App.destroyWindow(App.filtersWindow);
        this.setFirstPage();
        App.loadSegments();
        App.mainWindow.webContents.send('filters-on');
    }

    setFirstPage(): void {
        App.loadOptions.start = 0;
        App.mainWindow.webContents.send('set-first-page');
    }

    clearFilterOptions(): void {
        App.filterOptions = {};
        App.destroyWindow(App.filtersWindow);
        this.setFirstPage();
        App.loadSegments();
        App.mainWindow.webContents.send('filters-off');
    }

    static insertUnit(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.sendRequest({ command: 'insertUnit' },
            (data: any) => {
                if (data.status === SUCCESS) {
                    App.mainWindow.webContents.send('unit-inserted', data.id);
                    App.saved = false;
                    App.mainWindow.setDocumentEdited(true);
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static requestDeleteUnits(): void {
        App.mainWindow.webContents.send('request-delete');
    }

    deleteUnits(arg: any): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        let selected: string[] = arg;
        if (selected.length === 0) {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'selectUnits') });
            return;
        }
        App.sendRequest({ command: 'deleteUnits', selected },
            (data: any) => {
                if (data.status === SUCCESS) {
                    App.getFileLanguages();
                    App.getCount();
                    App.loadSegments();
                    App.saved = false;
                    App.mainWindow.setDocumentEdited(true);
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static firstPage(): void {
        App.mainWindow.webContents.send('first-page');
    }

    static previousPage(): void {
        App.mainWindow.webContents.send('previous-page');
    }

    static nextPage(): void {
        App.mainWindow.webContents.send('next-page');
    }

    static lastPage(): void {
        App.mainWindow.webContents.send('last-page');
    }

    static changeLanguageCode(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.changeLanguageWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 490,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.changeLanguageWindow.setMenu(null);
        App.changeLanguageWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'changeLanguage.html'));
        App.changeLanguageWindow.once('ready-to-show', () => {
            App.changeLanguageWindow.show();
        });
        App.changeLanguageWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.changeLanguageWindow, 'changeLanguage.html');
    }

    changeLanguage(arg: any): void {
        App.destroyWindow(App.changeLanguageWindow);
        arg.command = 'changeLanguage';
        App.sendRequest(arg,
            (data: any) => {
                App.currentStatus = data;
                App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'Changing'));
                let intervalObject = setInterval(() => {
                    if (App.currentStatus.status === COMPLETED) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.getFileLanguages();
                        App.loadSegments();
                        App.saved = false;
                        App.mainWindow.setDocumentEdited(true);
                        return;
                    } else if (App.currentStatus.status === PROCESSING) {
                        // it's OK, keep waiting
                    } else if (App.currentStatus.status === ERROR) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'error', message: App.currentStatus.reason });
                        return;
                    } else if (App.currentStatus.status === SUCCESS) {
                        // ignore status from 'replaceText'
                    } else {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({
                            type: 'error',
                            message: App.i18n.getString('App', 'errorChangingLanguage')
                        });
                        return;
                    }
                    App.getProcessingProgress();
                }, 500);
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    allLanguages(event: IpcMainEvent): void {
        App.sendRequest({ command: 'getAllLanguages' },
            (data: any) => {
                if (data.status === SUCCESS) {
                    let result: Language[] = data.languages.slice(0);
                    result.unshift({ code: 'none', name: App.i18n.getString('App', 'selectLanguage') });
                    event.sender.send('languages-list', result);
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static showRemoveLanguage(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.removeLanguageWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 420,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.removeLanguageWindow.setMenu(null);
        App.removeLanguageWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'removeLanguage.html'));
        App.removeLanguageWindow.once('ready-to-show', () => {
            App.removeLanguageWindow.show();
        });
        App.removeLanguageWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.removeLanguageWindow, 'removeLanguage.html');
    }

    removeLanguage(arg: any): void {
        App.destroyWindow(App.removeLanguageWindow);
        App.sendRequest({ command: 'removeLanguage', lang: arg },
            (data: any) => {
                if (data.status === SUCCESS) {
                    App.getFileLanguages();
                    App.loadSegments();
                    App.saved = false;
                    App.mainWindow.setDocumentEdited(true);
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static showAddLanguage(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.addLanguageWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 420,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.addLanguageWindow.setMenu(null);
        App.addLanguageWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'addLanguage.html'));
        App.addLanguageWindow.once('ready-to-show', () => {
            App.addLanguageWindow.show();
        });
        App.addLanguageWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.addLanguageWindow, 'addLanguage.html');
    }

    addLanguage(arg: any): void {
        App.destroyWindow(App.addLanguageWindow);
        App.sendRequest({ command: 'addLanguage', lang: arg },
            (data: any) => {
                if (data.status === SUCCESS) {
                    App.getFileLanguages();
                    App.loadSegments();
                    App.saved = false;
                    App.mainWindow.setDocumentEdited(true);
                } else {
                    App.showMessage({ type: 'error', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static showChangeSourceLanguage(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.srcLanguageWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 420,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.srcLanguageWindow.setMenu(null);
        App.srcLanguageWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'srcLanguage.html'));
        App.srcLanguageWindow.once('ready-to-show', () => {
            App.srcLanguageWindow.show();
        });
        App.srcLanguageWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.srcLanguageWindow, 'srcLanguage.html');
    }

    getSourceLanguage(event: IpcMainEvent): void {
        App.sendRequest({ command: 'getSrcLanguage' },
            (data: any) => {
                if (data.status === SUCCESS) {
                    event.sender.send('set-source-language', data);
                } else {
                    App.showMessage({ type: 'warning', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static removeTags(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.mainWindow.webContents.send('start-waiting');
        App.sendRequest({ command: 'removeTags' },
            (data: any) => {
                App.currentStatus = data;
                App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'RemovingTags'));
                let intervalObject = setInterval(() => {
                    if (App.currentStatus.status === COMPLETED) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.loadSegments();
                        App.saved = false;
                        App.mainWindow.setDocumentEdited(true);
                        return;
                    } else if (App.currentStatus.status === PROCESSING) {
                        // it's OK, keep waiting
                    } else if (App.currentStatus.status === ERROR) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'error', message: App.currentStatus.reason });
                        return;
                    } else if (App.currentStatus.status === SUCCESS) {
                        // ignore status from 'removeDuplicates'
                    } else {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        dialog.showErrorBox(App.i18n.getString('App', 'Error'),
                            App.i18n.getString('App', 'ErrorRemovingTags'));
                        return;
                    }
                    App.getProcessingProgress();
                }, 500);
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    changeSourceLanguage(arg: any): void {
        App.destroyWindow(App.srcLanguageWindow);
        App.sendRequest({ command: 'setSrcLanguage', lang: arg },
            (data: any) => {
                App.saved = false;
                App.mainWindow.setDocumentEdited(true);
                if (data.status !== SUCCESS) {
                    App.showMessage({ type: 'warning', message: data.reason });
                }
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static removeDuplicates(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.mainWindow.webContents.send('start-waiting');
        App.sendRequest({ command: 'removeDuplicates' },
            (data: any) => {
                App.currentStatus = data;
                App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'RemovingDuplicates'));
                let intervalObject = setInterval(() => {
                    if (App.currentStatus.status === COMPLETED) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.loadSegments();
                        App.getCount();
                        App.saved = false;
                        App.mainWindow.setDocumentEdited(true);
                        return;
                    } else if (App.currentStatus.status === PROCESSING) {
                        // it's OK, keep waiting
                    } else if (App.currentStatus.status === ERROR) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'error', message: App.currentStatus.reason });
                        return;
                    } else if (App.currentStatus.status === SUCCESS) {
                        // ignore status from 'removeDuplicates'
                    } else {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        dialog.showErrorBox(App.i18n.getString('App', 'Error'),
                            App.i18n.getString('App', 'ErrorRemovingDuplicates'));
                        return;
                    }
                    App.getProcessingProgress();
                }, 500);
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static getCount(): void {
        App.sendRequest({ command: 'getCount' },
            (data: any) => {
                App.mainWindow.webContents.send('status-changed', data);
            },
            (reason: string) => {
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static showRemoveUntranslated(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.removeUntranslatedWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 470,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.removeUntranslatedWindow.setMenu(null);
        App.removeUntranslatedWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'removeUntranslated.html'));
        App.removeUntranslatedWindow.once('ready-to-show', () => {
            App.removeUntranslatedWindow.show();
        });
        App.removeUntranslatedWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.removeUntranslatedWindow, 'removeUntranslated.html');
    }

    static showRemoveSameAsSource(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.removeSameAsSourceWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 470,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.removeSameAsSourceWindow.setMenu(null);
        App.removeSameAsSourceWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'removeSameAsSource.html'));
        App.removeSameAsSourceWindow.once('ready-to-show', () => {
            App.removeSameAsSourceWindow.show();
        });
        App.removeSameAsSourceWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.removeSameAsSourceWindow, 'removeSameAsSource.html');
    }

    removeUntranslated(arg: any): void {
        App.destroyWindow(App.removeUntranslatedWindow);
        App.mainWindow.webContents.send('start-waiting');
        arg.command = 'removeUntranslated';
        App.sendRequest(arg,
            (data: any) => {
                App.currentStatus = data;
                App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'RemovingUnits'));
                let intervalObject = setInterval(() => {
                    if (App.currentStatus.status === COMPLETED) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.loadSegments();
                        App.getCount();
                        App.saved = false;
                        App.mainWindow.setDocumentEdited(true);
                        return;
                    } else if (App.currentStatus.status === PROCESSING) {
                        // it's OK, keep waiting
                    } else if (App.currentStatus.status === ERROR) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'error', message: App.currentStatus.reason });
                        return;
                    } else if (App.currentStatus.status === SUCCESS) {
                        // ignore status from 'removeUntranslated'
                    } else {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        dialog.showErrorBox(App.i18n.getString('App', 'Error'),
                            App.i18n.getString('App', 'ErrorRemovingUnits'));
                        return;
                    }
                    App.getProcessingProgress();
                }, 500);
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    removeSameAsSource(arg: any): void {
        App.destroyWindow(App.removeSameAsSourceWindow);
        App.mainWindow.webContents.send('start-waiting');
        arg.command = 'removeSameAsSource';
        App.sendRequest(arg,
            (data: any) => {
                App.currentStatus = data;
                App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'RemovingEntries'));
                let intervalObject = setInterval(() => {
                    if (App.currentStatus.status === COMPLETED) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.loadSegments();
                        App.getCount();
                        App.saved = false;
                        App.mainWindow.setDocumentEdited(true);
                        return;
                    } else if (App.currentStatus.status === PROCESSING) {
                        // it's OK, keep waiting
                    } else if (App.currentStatus.status === ERROR) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'error', message: App.currentStatus.reason });
                        return;
                    } else if (App.currentStatus.status === SUCCESS) {
                        // ignore status from 'removeSameAsSource'
                    } else {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        dialog.showErrorBox(App.i18n.getString('App', 'Error'),
                            App.i18n.getString('App', 'ErrorRemovingEntries'));
                        return;
                    }
                    App.getProcessingProgress();
                }, 500);
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static removeSpaces(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.mainWindow.webContents.send('start-waiting');
        App.sendRequest({ command: 'removeSpaces' },
            (data: any) => {
                App.currentStatus = data;
                App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'RemovingSpaces'));
                let intervalObject = setInterval(() => {
                    if (App.currentStatus.status === COMPLETED) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.loadSegments();
                        App.saved = false;
                        App.mainWindow.setDocumentEdited(true);
                        return;
                    } else if (App.currentStatus.status === PROCESSING) {
                        // it's OK, keep waiting
                    } else if (App.currentStatus.status === ERROR) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'error', message: App.currentStatus.reason });
                        return;
                    } else if (App.currentStatus.status === SUCCESS) {
                        // ignore status from 'removeSpaces'
                    } else {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        dialog.showErrorBox(App.i18n.getString('App', 'Error'),
                            App.i18n.getString('App', 'ErrorRemovingSpaces'));
                        return;
                    }
                    App.getProcessingProgress();
                }, 500);
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static showConsolidateUnits(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        if (App.fileLanguages.length < 3) {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'fileNeeds3Languages') });
            return;
        }
        App.consolidateWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 470,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.consolidateWindow.setMenu(null);
        App.consolidateWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'consolidate.html'));
        App.consolidateWindow.once('ready-to-show', () => {
            App.consolidateWindow.show();
        });
        App.consolidateWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.consolidateWindow, 'consolidate.html');
    }

    consolidateUnits(arg: any): void {
        App.destroyWindow(App.consolidateWindow);
        App.mainWindow.webContents.send('start-waiting');
        arg.command = 'consolidateUnits';
        App.sendRequest(arg,
            (data: any) => {
                App.currentStatus = data;
                App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'Consolidating'));
                let intervalObject = setInterval(() => {
                    if (App.currentStatus.status === COMPLETED) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.loadSegments();
                        App.getCount();
                        App.saved = false;
                        App.mainWindow.setDocumentEdited(true);
                        return;
                    } else if (App.currentStatus.status === PROCESSING) {
                        // it's OK, keep waiting
                    } else if (App.currentStatus.status === ERROR) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'error', message: App.currentStatus.reason });
                        return;
                    } else if (App.currentStatus.status === SUCCESS) {
                        // ignore status from 'consolidateUnits'
                    } else {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        dialog.showErrorBox(App.i18n.getString('App', 'Error'),
                            App.i18n.getString('App', 'ErrorConsolidating'));
                        return;
                    }
                    App.getProcessingProgress();
                }, 500);
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static showMaintenanceDashboard(): void {
        if (App.currentFile === '') {
            App.showMessage({ type: 'warning', message: App.i18n.getString('App', 'openTmxFile') });
            return;
        }
        App.maintenanceWindow = new BrowserWindow({
            parent: App.mainWindow,
            width: 470,
            minimizable: false,
            maximizable: false,
            resizable: false,
            show: false,
            icon: App.iconPath,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        App.maintenanceWindow.setMenu(null);
        App.maintenanceWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'maintenance.html'));
        App.maintenanceWindow.once('ready-to-show', () => {
            App.maintenanceWindow.show();
        });
        App.maintenanceWindow.on('close', () => {
            App.mainWindow.focus();
        });
        App.setLocation(App.maintenanceWindow, 'maintenance.html');
    }

    static maintenanceTasks(arg: any): void {
        App.destroyWindow(App.maintenanceWindow);
        App.mainWindow.webContents.send('start-waiting');
        arg.command = 'processTasks';
        App.sendRequest(arg,
            (data: any) => {
                App.currentStatus = data;
                App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'Processing'));
                let intervalObject = setInterval(() => {
                    if (App.currentStatus.status === COMPLETED) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.loadSegments();
                        App.getCount();
                        App.saved = false;
                        App.mainWindow.setDocumentEdited(true);
                        return;
                    } else if (App.currentStatus.status === PROCESSING) {
                        // it's OK, keep waiting
                    } else if (App.currentStatus.status === ERROR) {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        App.showMessage({ type: 'error', message: App.currentStatus.reason });
                        return;
                    } else if (App.currentStatus.status === SUCCESS) {
                        // ignore status from 'consolidateUnits'
                    } else {
                        App.mainWindow.webContents.send('end-waiting');
                        App.mainWindow.webContents.send('set-status', '');
                        clearInterval(intervalObject);
                        dialog.showErrorBox(App.i18n.getString('App', 'Error'),
                            App.i18n.getString('App', 'MaintenanceError'));
                        return;
                    }
                    App.getProcessingProgress();
                }, 500);
            },
            (reason: string) => {
                App.mainWindow.webContents.send('end-waiting');
                App.showMessage({ type: 'error', message: reason });
            }
        );
    }

    static showReleaseHistory(): void {
        shell.openExternal('https://www.maxprograms.com/products/tmxlog.html');
    }

    static showSupportGroup(): void {
        shell.openExternal('https://groups.io/g/maxprograms/');
    }

    static downloadLatest(): void {
        let downloadsFolder = app.getPath('downloads');
        let url: URL = new URL(App.downloadLink);
        let path: string = url.pathname;
        path = path.substring(path.lastIndexOf('/') + 1);
        let file: string = downloadsFolder + (process.platform === 'win32' ? '\\' : '/') + path;
        if (existsSync(file)) {
            unlinkSync(file);
        }
        let request: Electron.ClientRequest = net.request({
            url: App.downloadLink,
            session: session.defaultSession
        });
        App.mainWindow.webContents.send('set-status', App.i18n.getString('App', 'Downloading'));
        App.updatesWindow.destroy();
        request.on('response', (response: IncomingMessage) => {
            let fileSize = Number.parseInt(response.headers['content-length'] as string);
            let received: number = 0;
            response.on('data', (chunk: Buffer) => {
                received += chunk.length;
                if (process.platform === 'win32' || process.platform === 'darwin') {
                    App.mainWindow.setProgressBar(received / fileSize);
                }
                App.mainWindow.webContents.send('set-status',
                    App.i18n.format(App.i18n.getString('App', 'Downoaded'), ['' + Math.trunc(received * 100 / fileSize)]));
                appendFileSync(file, chunk);
            });
            response.on('end', () => {
                App.mainWindow.webContents.send('set-status', '');
                dialog.showMessageBox({
                    type: 'info',
                    message: App.i18n.getString('App', 'UpdateDownloaded')
                });
                if (process.platform === 'win32' || process.platform === 'darwin') {
                    App.mainWindow.setProgressBar(0);
                    shell.openPath(file).then(() => {
                        app.quit();
                    }).catch((reason: string) => {
                        dialog.showErrorBox(App.i18n.getString('App', 'Error'), reason);
                    });
                }
                if (process.platform === 'linux') {
                    shell.showItemInFolder(file);
                }
            });
            response.on('error', (reason: string) => {
                App.mainWindow.webContents.send('set-status', '');
                dialog.showErrorBox(App.i18n.getString('App', 'Error'), reason);
                if (process.platform === 'win32' || process.platform === 'darwin') {
                    App.mainWindow.setProgressBar(0);
                }
            });
        });
        request.end();
    }

    static setLocation(window: BrowserWindow, key: string): void {
        if (App.locations.hasLocation(key)) {
            let position: Point = App.locations.getLocation(key);
            window.setPosition(position.x, position.y, true);
        }
        window.addListener('moved', () => {
            let bounds: Rectangle = window.getBounds();
            App.locations.setLocation(key, bounds.x, bounds.y);
        });
    }

    static checkUpdates(silent: boolean): void {
        session.defaultSession.clearCache().then(() => {
            let request: Electron.ClientRequest = net.request({
                url: 'https://maxprograms.com/tmxeditor.json',
                session: session.defaultSession
            });
            request.on('response', (response: IncomingMessage) => {
                let responseData: string = '';
                response.on('data', (chunk: Buffer) => {
                    responseData += chunk;
                });
                response.on('end', () => {
                    try {
                        let parsedData = JSON.parse(responseData);
                        if (app.getVersion() !== parsedData.version) {
                            App.latestVersion = parsedData.version;
                            switch (process.platform) {
                                case 'darwin':
                                    App.downloadLink = process.arch === 'arm64' ? parsedData.arm64 : parsedData.darwin;
                                    break;
                                case 'win32':
                                    App.downloadLink = parsedData.win32;
                                    break;
                                case 'linux':
                                    App.downloadLink = parsedData.linux;
                                    break;
                            }
                            App.updatesWindow = new BrowserWindow({
                                parent: App.mainWindow,
                                width: 600,
                                minimizable: false,
                                maximizable: false,
                                resizable: false,
                                show: false,
                                icon: this.iconPath,
                                webPreferences: {
                                    nodeIntegration: true,
                                    contextIsolation: false
                                }
                            });
                            App.updatesWindow.setMenu(null);
                            App.updatesWindow.loadURL('file://' + path.join(app.getAppPath(), 'html', App.lang, 'updates.html'));
                            App.updatesWindow.once('ready-to-show', () => {
                                App.updatesWindow.show();
                            });
                            App.updatesWindow.on('close', () => {
                                App.mainWindow.focus();
                            });
                        } else {
                            if (!silent) {
                                App.showMessage({
                                    type: 'info',
                                    message: App.i18n.getString('App', 'noUpdates')
                                });
                            }
                        }
                    } catch (reason: any) {
                        if (!silent) {
                            App.showMessage({ type: 'error', message: reason.message });
                        }
                    }
                });
            });
            request.end();
        });
    }

}

try {
    new App(process.argv);
} catch (e) {
    console.error("Unable to instantiate App();");
}