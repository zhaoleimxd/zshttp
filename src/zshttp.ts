import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';

import {URL, parseUrl} from './url';

interface MimeType {
    [extension: string]: string;
}

let defaultMimeType: MimeType = {
    ".txt": "text/plain",
    ".htm": "text/html",
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".png": "image/png",
    ".*": "application/octet-stream"
};

let defaultPage: Array<string> = [
    "index.htm",
    "index.html"
];

function formatTime(date?: Date, fmt?: string) {
    if (date == undefined) {
        date = new Date();
    }
    if (fmt == undefined) {
        fmt = "yyyy-MM-dd hh:mm:SS.sss";
    }

    let o: any = {
        "y+": date.getFullYear(),
        "M+": date.getMonth() + 1,
        "d+": date.getDate(),
        "h+": date.getHours(),
        "m+": date.getMinutes(),
        "S+": date.getSeconds(),
        "s+": date.getMilliseconds(),
    }

    for (var a in o) {
        let reg: RegExp = new RegExp(a);
        if (reg.test(fmt)) {
            let s: string = "000" + o[a];
            let s2: string = s.substr(s.length - (reg.exec(fmt) as RegExpExecArray)[0].length)
            fmt = fmt.replace(reg, s2);
        }
    }
    
    return fmt;
}

interface ZSHttpOptions {
    port: number;
    host?: string;
    rootPath?: string;
    listDirectory?: boolean;
    useDefaultPage?: boolean;
    defaultPage?: Array<string>;
    mimeType?: MimeType;
}

export class ZSHttp {
    options: ZSHttpOptions;
    server: http.Server;

    private checkOptions(options: ZSHttpOptions): ZSHttpOptions {
        if (options.host == undefined) {
            options.host = "0.0.0.0";
        }

        if (options.rootPath == undefined) {
            
        }

        if (options.listDirectory == undefined) {
            options.listDirectory = false;
        }
        if (options.useDefaultPage == undefined) {
            options.useDefaultPage = true;
        }
        
        if (options.listDirectory) {
            options.defaultPage = undefined;
        }
        else if (options.defaultPage == undefined) {
            if (options.useDefaultPage) {
                options.defaultPage = defaultPage;
            }
        }
        
        if (options.defaultPage != undefined) {
            for (let i = options.defaultPage.length - 1; i >= 0; i--) {
                if (options.defaultPage[i].trimEnd() == "") {
                    options.defaultPage.splice(i, 1);
                }
            }
        }

        if (options.mimeType == undefined) {
            options.mimeType = defaultMimeType;
        }
        else {
            let inputMimeType: MimeType = options.mimeType;
            options.mimeType = {};
            Object.assign(options.mimeType, defaultMimeType, inputMimeType);
        }

        return options;
    }

    constructor(options: ZSHttpOptions) {
        this.options = this.checkOptions(options);

        this.server = http.createServer((request: http.IncomingMessage, response: http.ServerResponse) => {
            this.log(`Client request - ${request.socket.remoteAddress}:${request.socket.remotePort} - ${request.url}`);
            this.onRequest(request, response);
        }).on("listening", () => {
            this.log(`ZSHttp start at ${this.options.host}:${this.options.port}.`);
        }).on("connection", (socket: net.Socket) => {
            socket.on("close", (hadError: boolean) => {
                //this.log(`Client closed: ${socket.remoteAddress}:${socket.remotePort}.`);
            });
            //this.log(`Client connected: ${socket.remoteAddress}:${socket.remotePort}.`);
        }).on("error", (error: Error) => {
            console.error(error);
            this.log(`Server error.`);
        }).on("close", () => {
            this.log(`Server closed.`);
        });
    }

    public start() {
        this.server.listen(this.options.port, this.options.host);
    }

    private onRequest(request: http.IncomingMessage, response: http.ServerResponse) {
        request.url = this.rewrite(request.url);
        let url: URL = parseUrl(request.url);
        if (url == undefined) {
            this.onRequestFailed(response, 400);
            return ;
        }

        let localPath: string = url.path;
        if (this.options.rootPath != undefined) {
            localPath = this.options.rootPath + url.path;
            localPath = path.resolve(localPath);
        }
        else {
            localPath = "undefined" + url.path;
        }

        if (this.onRequestExt(url, localPath, request, response)) {
            return ;
        }
        else {
            this.onLocalFile(url, localPath, request, response);
        }
    }

    private rewrite(path: string): string {
        return path;
    }

    private onRequestExt(url: URL, localPath: string, request: http.IncomingMessage, response: http.ServerResponse): boolean {
        return false;
    }

    private onLocalFile(url: URL, localPath: string, request: http.IncomingMessage, response: http.ServerResponse) {
        fs.exists(localPath, (exists: boolean) => {
            if (!exists) {
                this.onRequestFailed(response, 404);
                return ;
            }
            fs.stat(localPath, (error: NodeJS.ErrnoException, stats: fs.Stats) => {
                if (error != null) {
                    this.onRequestFailed(response, 500, error.message);
                    return ;
                }
                else {
                    if (stats.isDirectory()) {
                        this.onDirectory(url, localPath, request, response);
                        return ;
                    }
                    else {
                        switch (request.method) {
                            case "GET": {
                                let t: number = new Date(request.headers["if-modified-since"]).getTime();
                                if (t != Math.floor(stats.mtime.getTime() / 1000) * 1000) {
                                    response.writeHead(200, {
                                        "Last-Modified": stats.mtime.toString(),
                                        "Content-Type": this.getMimeType(url)
                                    });
                                    fs.createReadStream(localPath).pipe(response);
                                }
                                else {
                                    this.onRequestFailed(response, 304);
                                }
                                break;
                            }
                            default: {
                                this.onRequestFailed(response, 405, "Method Not Allowed.", {
                                    "Allow": "GET"
                                });
                                break;
                            }
                        }
                    }
                }
            });
        });
    }

    private onDirectory(url: URL, localPath: string, request: http.IncomingMessage, response: http.ServerResponse) {
        if (!url.path.endsWith("/")) {
            url.path += "/";
        }
        if (!localPath.endsWith(path.sep)) {
            localPath += path.sep;
        }
        if (this.options.listDirectory == true) {
            this.onListDirectory(url, localPath, request, response);
        }
        else if (this.options.defaultPage == undefined) {
            this.onRequestFailed(response, 403);
        }
        else {
            let i: number = 0;
            let cb: (exists: boolean) => void = (exists: boolean) => {
                if (!exists) {
                    i++;
                    if (i < this.options.defaultPage.length) {
                        let filePath: string = localPath + this.options.defaultPage[i];
                        fs.exists(filePath, cb);
                    }
                    else {
                        this.onRequestFailed(response, 404);
                    }
                }
                else {
                    this.onRequestFailed(response, 302, undefined, {
                        "Location": `${url.path}${this.options.defaultPage[i]}`
                    });
                }
            }
            let filePath: string = localPath + this.options.defaultPage[i];
            fs.exists(filePath, cb);
        }
    }

    private onListDirectory(url: URL, localPath: string, request: http.IncomingMessage, response: http.ServerResponse) {

    }

    private onRequestFailed(response: http.ServerResponse, statusCode: number, body?: any, headers?: http.OutgoingHttpHeaders) {
        response.writeHead(statusCode, headers);
        response.end(body);
    }

    private getMimeType(url: URL): string {
        if (this.options.mimeType[url.ext] != undefined) {
            return this.options.mimeType[url.ext];
        }
        else if (this.options.mimeType[".*"] != undefined) {
            return this.options.mimeType[".*"];
        }
        else {
            return "application/octet-stream";
            //return "text/plain";
        }
    }

    private log(logString: string) {
        console.log(`${formatTime()} - ${logString}`);
    }
}
