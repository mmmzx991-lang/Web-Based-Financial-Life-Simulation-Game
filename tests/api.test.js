import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { request } from 'node:http';
import { createApp } from '../server/app.js';

test('HTTP lifecycle, save across restart and independent players', async () => {
  const directory=mkdtempSync(join(process.cwd(),'.test-data-'));
  const servers=[];
  async function start() {
    const server=createApp({dataDir:directory});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    servers.push(server);
    return `http://127.0.0.1:${server.address().port}`;
  }
  try {
    let base=await start();
    const call=async(path,method='GET',body)=>{
      const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
      return {status:response.status,body:await response.json()};
    };
    assert.equal((await fetch(base)).status,200);
    const games=await Promise.all(Array.from({length:20},()=>call('/api/games','POST',{})));
    assert.equal(new Set(games.map(g=>g.body.id)).size,20);
    const id=games[0].body.id;
    assert.equal((await call(`/api/games/${id}/advance`,'POST',{months:3})).body.game.elapsedMonths,3);
    assert.equal((await call(`/api/games/${games[1].body.id}`)).body.game.elapsedMonths,0);
    // Hold one request body open while another mutation completes.
    const received=new Promise(resolve=>servers[0].once('request',resolve));
    let finishSlow;
    const slow=new Promise((resolve,reject)=>{
      const req=request(base+`/api/games/${id}/advance`,{method:'POST',headers:{'Content-Type':'application/json'}},response=>{
        let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>resolve(JSON.parse(text)));
      });
      req.on('error',reject);req.write('{"months":');finishSlow=()=>req.end('1}');
    });
    await received;
    await call(`/api/games/${id}/advance`,'POST',{months:1});
    finishSlow();
    assert.equal((await slow).game.elapsedMonths,5);
    assert.equal((await call(`/api/games/${id}/save`,'POST',{})).status,200);
    base=await start();
    assert.equal((await call(`/api/games/${id}`)).body.game.elapsedMonths,5);
    assert.equal((await call(`/api/games/${id}/report`)).body.monthsPlayed,5);
    assert.equal((await call(`/api/games/${id}/advance`,'POST',{months:2})).status,400);
    assert.equal((await call('/api/games','POST',{mode:'bad'})).status,400);
    assert.equal((await call('/api/games/not-a-valid-id')).status,404);
    const malformed=await fetch(base+'/api/games',{method:'POST',body:'{'});
    assert.equal(malformed.status,400);
    const oversized=await fetch(base+'/api/games',{method:'POST',body:'x'.repeat(20000)});
    assert.equal(oversized.status,413);
  } finally {
    await Promise.all(servers.map(s=>new Promise(resolve=>s.close(resolve))));
    rmSync(directory,{recursive:true,force:true});
  }
});
