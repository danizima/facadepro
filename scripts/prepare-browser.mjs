// Unpack Chromium into our own CI directory without restoring archive ownership.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,chmodSync} from 'node:fs';
import {brotliDecompressSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const require=createRequire(import.meta.url),entry=require.resolve(process.env.CHROMIUM_MODULE||'@sparticuz/chromium'),bin=path.resolve(path.dirname(entry),'../bin'),out=process.env.BROWSER_BIN_DIR;
if(!out||!path.isAbsolute(out))throw Error('Set an absolute BROWSER_BIN_DIR');
mkdirSync(out,{recursive:true});
for(const file of ['chromium.br','fonts.tar.br','swiftshader.tar.br'])writeFileSync(path.join(out,file.slice(0,-3)),brotliDecompressSync(readFileSync(path.join(bin,file))));
chmodSync(path.join(out,'chromium'),0o700);
for(const file of ['fonts.tar','swiftshader.tar'])execFileSync('tar',['--no-same-owner','-xf',path.join(out,file),'-C',out]);
