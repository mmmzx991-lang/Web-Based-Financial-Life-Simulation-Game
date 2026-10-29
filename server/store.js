import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
export function createStore(dataDir) {
  const games=new Map();
  mkdirSync(dataDir,{recursive:true});
  const path=id=>join(dataDir,`${id}.json`);
  return {
    get(id) {
      if(!games.has(id)&&existsSync(path(id))) games.set(id,JSON.parse(readFileSync(path(id),'utf8')));
      return games.get(id);
    },
    set(id,game) { games.set(id,game); },
    save(id) {
      const temporary=path(id)+'.tmp';
      writeFileSync(temporary,JSON.stringify(games.get(id)),{mode:0o600});
      renameSync(temporary,path(id));
    }
  };
}
