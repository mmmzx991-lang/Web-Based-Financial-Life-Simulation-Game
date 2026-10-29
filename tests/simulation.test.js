import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advance, trade, report } from '../server/core/simulation.js';
import { MODES, ASSETS, livingCost } from '../server/core/config.js';

test('all life windows and fifteen assets are available', () => {
  assert.equal(ASSETS.length, 15);
  for (const [mode, [start, end]] of Object.entries(MODES)) {
    const game = createGame({ mode });
    assert.equal(game.ageMonths, start * 12);
    assert.equal(game.endAgeMonths, end * 12);
  }
});
test('expense bands change exactly at ages 45 and 60', () => {
  assert.deepEqual([44,45,59,60].map(livingCost), [200000,300000,300000,250000]);
});
test('salary grows by 2.5% after twelve months', () => {
  let game = createGame({});
  const salary = game.monthlySalary;
  for (let i=0;i<4;i++) game = advance(game, 3);
  assert.equal(game.monthlySalary, Math.round(salary * 1.025));
});
test('retirement starts at 60 and no salary is paid afterwards', () => {
  let game = createGame({ mode: 'wealth-building' });
  game.ageMonths = 60*12-1;
  const end = advance(game, 3);
  assert.equal(end.ageMonths, 60*12);
  assert.equal(end.history.at(-1).salary, game.monthlySalary);
  const retired = createGame({mode:'retirement'});
  assert.equal(advance(retired,1).history.at(-1).salary, 0);
});
test('three month advance settles each month identically to single advances', () => {
  const game = createGame({});
  assert.deepEqual(advance(game,3), advance(advance(advance(game,1),1),1));
  assert.equal(game.history.length,0);
});
test('buy and sell preserve accounting and reject invalid orders', () => {
  const game = createGame({});
  const bought = trade(game, {assetId:ASSETS[0].id, side:'buy', quantity:2});
  assert.equal(report(bought).netWorth, report(game).netWorth);
  assert.equal(trade(bought,{assetId:ASSETS[0].id,side:'sell',quantity:2}).cash,game.cash);
  for (const quantity of [-1,0,1.5,Infinity]) assert.throws(()=>trade(game,{assetId:ASSETS[0].id,side:'buy',quantity}));
  assert.throws(()=>trade(game,{assetId:ASSETS[0].id,side:'sell',quantity:1}));
});
test('invalid setup and advances are rejected; completed game cannot trade', () => {
  assert.throws(()=>createGame({mode:'unknown'}));
  assert.throws(()=>createGame({difficulty:'unknown'}));
  assert.throws(()=>createGame({ruleset:'unknown'}));
  const game = createGame({});
  assert.throws(()=>advance(game,2));
  game.ageMonths=game.endAgeMonths;
  assert.throws(()=>advance(game,1));
  assert.throws(()=>trade(game,{assetId:ASSETS[0].id,side:'buy',quantity:1}));
});
test('all four modes stop at their endpoint and produce final reports', () => {
  for(const mode of Object.keys(MODES)) {
    let game=createGame({mode});
    while(!report(game).completed) game=advance(game,3);
    assert.equal(game.ageMonths,MODES[mode][1]*12);
    assert.equal(report(game).monthsPlayed,(MODES[mode][1]-MODES[mode][0])*12);
    assert.equal(report(game).netWorth,game.cash);
  }
});
test('crossing retirement in a three month step pays only the pre-retirement month', () => {
  const game=createGame({});game.ageMonths=719;
  const next=advance(game,3);
  assert.deepEqual(next.history.map(m=>m.salary),[500000,0,0]);
  assert.deepEqual(next.history.map(m=>m.expenses),[300000,250000,250000]);
});
