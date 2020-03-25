import * as zshttp from './zshttp';

(async function main() {
    let a = new zshttp.ZSHttp({
        port: 80,
        host: "0.0.0.0",
        rootPath: "E:\\Internet\\root\\"
    });
    a.start();
})()
