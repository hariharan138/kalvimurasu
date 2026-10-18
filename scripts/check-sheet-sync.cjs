const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {boot} = require('./check-mobile.cjs');
const bank = require('../nmms-pwa/sheet-sync.js');
const endpoint='https://script.google.com/macros/s/TEST_DEPLOYMENT/exec';
const sample=(id,subject='Science')=>({id,subject,section:'SAT',topic:['Test','சோதனை'],text:['Original question '+id,'அசல் வினா '+id],options:[['One','ஒன்று'],['Two','இரண்டு'],['Three','மூன்று'],['Four','நான்கு']],answer:1,explanation:['Two is correct.','இரண்டு சரியானது.']});
const payload={schemaVersion:1,subjects:[{id:'42',name:'Science',questions:Array.from({length:26},(_,i)=>sample(String(i)))},{id:'43',name:'New subject',questions:[sample('x','New subject')]}]};
// An in-memory IndexedDB surface exercises the production persistence transaction lifecycle.
function memoryDB(initial=null) {
  let current=initial, fail=false;
  const api={set fail(value){fail=value},get current(){return current},open(){
    const request={};
    setTimeout(()=>{
      request.result={close(){},transaction(){
        const tx={objectStore(){return {
          get(){const read={};setTimeout(()=>{read.result=structuredClone(current);read.onsuccess()},0);return read},
          put(record){setTimeout(()=>{if(fail){tx.error=new Error('Disk full');tx.onabort()}else{current=structuredClone(record);tx.oncomplete()}},0)}
        }}};
        return tx;
      }};
      request.onsuccess();
    },0);
    return request;
  }};
  return api;
}
async function main() {
  assert.equal(bank.validate(payload).subjects[0].questions.length,26);
  assert.throws(()=>bank.endpoint('https://docs.google.com/spreadsheets/d/test/edit'));
  assert.throws(()=>bank.endpoint('https://script.google.com/macros/s/test/dev'));
  assert.throws(()=>bank.endpoint(endpoint+'?bad=1'));
  for(const broken of [null,{schemaVersion:2,subjects:[]},{schemaVersion:1,error:'Science row 3: missing answer'}]) assert.throws(()=>bank.validate(broken));
  const duplicate=structuredClone(payload);duplicate.subjects[0].questions.push(duplicate.subjects[0].questions[0]);assert.throws(()=>bank.validate(duplicate));
  const missing=structuredClone(payload);missing.subjects[0].questions[0].text[1]='';assert.throws(()=>bank.validate(missing));
  const wrong=structuredClone(payload);wrong.subjects[0].questions[0].answer=4;assert.throws(()=>bank.validate(wrong));
  const invalidResponse=async()=>({ok:true,text:async()=>'<html>Google sign-in</html>'});
  await assert.rejects(()=>bank.download(endpoint,invalidResponse),/sign-in/);
  const validResponse=async()=>({ok:true,text:async()=>JSON.stringify(payload)});
  const record=await bank.download(endpoint,validResponse);
  assert.equal(record.data.subjects.length,2);
  assert.equal(record.endpoint,endpoint);
  const db=memoryDB();
  const app=boot(new Map(),{indexedDB:db,fetch:validResponse});
  await new Promise(resolve=>setTimeout(resolve,10));
  app.context.navigator.onLine=true;
  await app.run(`syncSheets('${endpoint}')`);
  assert.equal(app.run('syncedSets.length'),3,'26 questions split into 25+1; new subject has its own set');
  assert.equal(app.run('totalSets'),803);
  assert.equal(db.current.data.subjects.length,2);
  assert.equal(app.run("subjects.filter(s=>s.en==='Science').length"),1,'No duplicate Science subject card');
  app.click({subject:'sheet-42'});
  assert.equal(app.run('activeSet'),801);
  assert.equal(app.run('choicesForFilter().join()'),'801,802');
  assert(app.elements.get('#app').innerHTML.includes('Science'));
  app.click({start:'SAT',set:'802'});
  assert.equal(app.run('attempt.snapshot.length'),1);
  app.click({answer:'0'});
  const update=structuredClone(payload);update.subjects[0].questions[25].text=['Edited question','திருத்திய வினா'];update.subjects[0].questions[25].answer=0;
  app.context.window.fetch=async()=>({ok:true,text:async()=>JSON.stringify(update)});
  await app.run('syncSheets()');
  assert.equal(app.run('setQuestions(802)[0].text[0]'),'Edited question');
  assert.equal(app.run('practiceQuestions(attempt)[0].text[0]'),'Original question 25','Active quiz is pinned to original data');
  app.run('finish()');
  assert.equal(app.run('result.score'),0,'Original answer key is preserved after a sheet edit');
  const appStorage=app.storage;
  const offline=boot(appStorage,{indexedDB:db});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(offline.run('syncedSets.length'),3,'Cached subject bank loads offline');
  assert.equal(offline.run('history[0].snapshot[0].text[0]'),'Original question 25');
  offline.click({history:'0'});offline.click({retry:''});
  assert.equal(offline.run('practiceQuestions(attempt)[0].text[0]'),'Original question 25');
  offline.click({answer:'1'});offline.run('finish()');
  assert.equal(offline.run('result.score'),1);
  assert.equal(offline.run('completedSets.size'),1);
  const saved=db.current;
  app.context.window.fetch=invalidResponse;
  await app.run('syncSheets()');
  assert.equal(app.run('setQuestions(802)[0].text[0]'),'Edited question');
  assert.deepEqual(db.current,saved,'Invalid payload never overwrites offline data');
  app.context.window.fetch=validResponse;db.fail=true;
  await app.run('syncSheets()');
  assert.equal(app.run('setQuestions(802)[0].text[0]'),'Edited question','Disk failure does not apply unsaved changes');
  assert.deepEqual(db.current,saved);
  db.fail=false;
  app.context.window.fetch=async()=>({ok:true,text:async()=>JSON.stringify({schemaVersion:1,subjects:[]})});
  await app.run('syncSheets()');
  assert.equal(app.run('syncedSets.length'),0,'Removed or disabled rows disappear on next sync');
  assert.equal(app.run('history[0].snapshot[0].text[0]'),'Original question 25');
  app.run('lastSyncAttempt=Date.now()');
  app.context.window.fetch=validResponse;
  app.windowListeners.online();
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(app.run('syncedSets.length'),3,'Reconnect triggers a fresh sync even after a recent failure');
  app.context.navigator.onLine=false;
  await app.run('syncSheets()');
  assert.equal(app.run('syncedSets.length'),3);
  assert(app.run('syncMessage[0]').includes('offline'));
  // A fresh installation uses the configured production endpoint automatically.
  const freshDB=memoryDB();
  let startupAddress=null;
  const fresh=boot(new Map(),{indexedDB:freshDB,online:true,fetch:async address=>{
    startupAddress=address;
    return {ok:true,text:async()=>JSON.stringify(payload)};
  }});
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(startupAddress,fresh.context.window.NMMS_SHEET_ENDPOINT);
  assert(startupAddress.endsWith('/exec'));
  assert.equal(fresh.run('syncedSets.length'),3,'First-launch sync uses the built-in feed URL');
  assert.equal(freshDB.current.endpoint,startupAddress);
  // Exercise the real Apps Script exporter against mock spreadsheet data.
  const script=fs.readFileSync('google-sheets/Code.gs','utf8');
  const getHeaders=vm.runInNewContext(script+'; HEADERS',{});
  const row=['stable-id','Question','வினா','A','அ','B','ஆ','C','இ','D','ஈ','B','Reason','காரணம்','Topic','தலைப்பு','SAT','TRUE'];
  let rows=[getHeaders,row];
  const tab={getName:()=> 'Science',isSheetHidden:()=>false,getLastRow:()=>rows.length,getLastColumn:()=>18,getSheetId:()=>42,getDataRange:()=>({getDisplayValues:()=>structuredClone(rows)})};
  const google=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'book-id'})},SpreadsheetApp:{openById:()=>({getSheets:()=>[tab]})},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:body=>({setMimeType:()=>JSON.parse(body)})}});
  vm.runInContext(script,google);
  let feed=vm.runInContext('doGet()',google);
  assert.equal(bank.validate(feed).subjects[0].questions[0].answer,1);
  rows=[getHeaders,[...row.slice(0,17),'FALSE']];
  assert.equal(vm.runInContext('doGet()',google).subjects[0].questions.length,0);
  rows=[getHeaders,row,row];
  assert(vm.runInContext('doGet()',google).error.includes('duplicate ID'));
  rows=[getHeaders,[...row.slice(0,11),'Z',...row.slice(12)]];
  assert(vm.runInContext('doGet()',google).error.includes('answer must'));
  console.log('PASS: Sheets schema, tab subjects, pagination, native feed validation, atomic offline cache, malformed/disk/offline failures, reconnect sync, quiz/history snapshots, retry after sheet edits, Apps Script exporter');
}
main().catch(error=>{console.error(error);process.exitCode=1});
