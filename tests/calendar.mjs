import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('apps/vacation-service/src/calendar.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {countDays}=await import('data:text/javascript,'+encodeURIComponent(js));
assert.equal(countDays('2026-11-02','2026-11-08','CALENDAR',[]),7);
assert.equal(countDays('2026-11-02','2026-11-08','BUSINESS',[]),5);
assert.equal(countDays('2026-11-02','2026-11-08','BUSINESS',[],[0,6]),2);
assert.equal(countDays('2026-11-02','2026-11-08','BUSINESS',['2026-11-02']),4);
assert.equal(countDays('2026-11-02','2026-11-08','BUSINESS',['2026-11-07'],[0,6]),1);
console.log('Configured vacation calendar PASS');
