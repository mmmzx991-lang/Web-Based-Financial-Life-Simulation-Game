import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGame, advance, trade, report } from './core/simulation.js';
import { MODES, DIFFICULTIES, RULESETS, ASSETS } from './core/config.js';
import { systems } from './systems/index.js';
import { createStore } from './store.js';

const publicDir=new URL('../public/',import.meta.url);
const staticFiles={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css']};
async function body(req) {
  let text='';
  for await(const chunk of req) {
    text+=chunk;
    if(Buffer.byteLength(text)>16384) throw Object.assign(new Error('Request too large'),{status:413});
  }
  const value=JSON.parse(text||'{}');
  if(!value||Array.isArray(value)||typeof value!=='object') throw new Error('Expected JSON object');
  return value;
}
export function createApp({dataDir=fileURLToPath(new URL('../data/',import.meta.url))}={}) {
  const store=createStore(dataDir);
  return createServer(async(req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET'&&Object.hasOwn(staticFiles,path)) {
        const [file,type]=staticFiles[path];
        res.writeHead(200,{'Content-Type':type+'; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'"});
        return res.end(readFileSync(new URL(file,publicDir)));
      }
      if(path==='/api/health'&&req.method==='GET') return send(200,{status:'ok'});
      if(path==='/api/config'&&req.method==='GET') return send(200,{modes:MODES,difficulties:Object.keys(DIFFICULTIES),rulesets:RULESETS,assets:ASSETS,systems});
      if(path==='/api/games'&&req.method==='POST') {
        const game=createGame(await body(req));
        const id=randomUUID(); store.set(id,game);
        return send(201,{id,game,summary:report(game)});
      }
      const match=path.match(/^\/api\/games\/([a-f0-9-]{36})(?:\/(advance|trade|save|report))?$/);
      if(!match) return send(404,{error:'Not found'});
      const [,id,action]=match;
      const game=store.get(id);
      if(!game) return send(404,{error:'Game not found. Only explicitly saved games survive restart.'});
      if(req.method==='GET'&&!action) return send(200,{id,game,summary:report(game)});
      if(req.method==='GET'&&action==='report') return send(200,report(game));
      if(req.method!=='POST'||!['advance','trade','save'].includes(action)) return send(405,{error:'Method not allowed'});
      const input=await body(req);
      // Another request may have settled this game while this body arrived.
      const current=store.get(id);
      if(action==='save') {store.save(id);return send(200,{saved:true,id});}
      const next=action==='advance'?advance(current,input.months):trade(current,input);
      store.set(id,next);
      return send(200,{id,game:next,summary:report(next)});
    } catch(error) {
      const internal=error.code&&error.code!=='ERR_INVALID_ARG_TYPE';
      if(internal) console.error('Server error:',error.code);
      return send(error.status|| (internal?500:400),{error:internal?'Server operation failed':error.message});
    }
  });
}
