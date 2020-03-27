
export interface URL {
    path: string;
    dirs?: Array<string>;
    file?: string;
    name?: string;
    ext?: string;
    query?: string;
    params?: {
        [key: string]: string | Array<string>;
    }
    aaaaa?: Array<string>;
}

export function parseUrl(urlPath: string): URL {
    if (!urlPath.startsWith("/")) {
        return undefined;
    }
    let pathPattern: RegExp = /(\/[^\?]*)\??(.*)/;
    if (!pathPattern.test(urlPath)) {
        return undefined;
    }
    else {
        let ea: RegExpExecArray = pathPattern.exec(urlPath);
        let result: URL = {
            path: ea[1]
        };
        result.dirs = result.path.split("/");
        result.dirs.shift();
        result.file = result.dirs.pop();
        let extPosition: number = result.file.lastIndexOf(".");
        if (extPosition != -1) {
            result.name = result.file.substring(0, extPosition);
            result.ext = result.file.substring(extPosition);
        }
        else {
            result.name = result.file;
            result.ext = undefined;
        }

        if (ea[2] != "") {
            result.query = ea[2];
            result.params = {};
            result.aaaaa = result.query.split("&");
            
            for(let i = 0; i < result.aaaaa.length; i++) {
                let kv: Array<string> = result.aaaaa[i].split("=", 2);
                if(kv.length != 2) {
                    kv.push("");
                }
                switch (typeof result.params[kv[0]]) {
                    case "undefined": {
                        result.params[kv[0]] = kv[1];
                        break;
                    }
                    case "string": {
                        result.params[kv[0]] = [result.params[kv[0]] as string, kv[1]];
                        break;
                    }
                    case "object": {
                        (result.params[kv[0]] as Array<string>).push(kv[1]);
                        break;
                    }
                }
            }
        }
        return result;
    }
}
