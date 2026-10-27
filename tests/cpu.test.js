import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState, movePiece, isInCheck} from '../public/engine.js';
import {chooseCpuMove, applyCpuMove} from '../public/cpu.js';
const p=(id,type,x,y,side='sente')=>({id,type,x,y,side,promoted:false});
const position=pieces=>({pieces,turn:'sente',nextId:100,hands:{sente:{},gote:{}},moveNumber:1,log:[],winner:null,lastMove:null});
test('CPU plays validated moves for both sides without mutating the position',()=>{
 let state=initialState();
 for(let i=0;i<12;i++){
  const before=structuredClone(state), action=chooseCpuMove(state), result=applyCpuMove(state,action);
  assert.deepEqual(state,before);assert.ok(result.ok,JSON.stringify(action));
  assert.equal(isInCheck(result.state,state.turn),false);
  assert.equal(result.state.moveNumber,state.moveNumber+1);state=result.state;
 }
});
test('CPU captures undefended material and chooses promotion',()=>{
 const state=position([p(1,'K',10,11),p(2,'K',10,1,'gote'),p(3,'P',3,4.5),p(4,'R',3,3,'gote')]);
 const action=chooseCpuMove(state), result=applyCpuMove(state,action);
 assert.ok(result.ok);assert.equal(result.state.hands.sente.R,1);assert.equal(result.state.pieces.find(p=>p.id===3).promoted,true);
});
test('CPU responds legally to check when it also has pieces in hand',()=>{
 const state=position([p(1,'K',6,11),p(2,'K',10,1,'gote'),p(3,'R',6,2,'gote')]);
 state.hands.sente.G=1;
 const action=chooseCpuMove(state), result=applyCpuMove(state,action);
 assert.ok(result.ok);assert.equal(isInCheck(result.state,'sente'),false);
});
test('no result or malformed action does not declare a winner',()=>{
 const state=initialState();assert.deepEqual(applyCpuMove(state,null),{ok:false});
 assert.equal(chooseCpuMove({...state,winner:'sente'}),null);assert.equal(state.winner,null);
});

test('CPU can select and commit a piece from its hand',()=>{
 const state=position([p(1,'K',10,11),p(2,'K',10,1,'gote')]);
 state.hands.sente.G=1;
 const action=chooseCpuMove(state),result=applyCpuMove(state,action);
 assert.equal(action.kind,'drop');assert.ok(result.ok);assert.equal(result.state.hands.sente.G,0);
 assert.equal(result.state.pieces.at(-1).type,'G');
});
