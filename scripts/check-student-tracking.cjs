const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {boot}=require('./check-mobile.cjs');
const readQueue=app=>JSON.parse(app.storage.get('kalvimurasu-student-v1')).queue;
const pause=()=>new Promise(resolve=>setTimeout(resolve,15));
async function main() {
  const app=boot(new Map(),{newStudent:true});
  assert.equal(app.run('view'),'onboarding');
  assert.equal(app.run('window.nmmsBack()'),false);
  assert(app.elements.get('#app').innerHTML.includes('Student name'));
  app.run("start('ALL',1)");
  assert.equal(app.run('attempt'),null,'Student details are required before practice');
  assert.equal(app.run("saveStudent({name:'',school:'School',className:'8'})"),false);
  assert.equal(app.run('view'),'onboarding');
  const invalidProfiles=[
    {name:'   ',school:'School',className:'8'},
    {name:'1234',school:'School',className:'8'},
    {name:'Student',school:'12345',className:'8'},
    {name:'Student',school:'School',className:'13'},
    {name:'Student',school:'School',className:'8',section:'<A>'},
    {name:'Student',school:'School',className:'8',section:12},
    {name:'A'.repeat(101),school:'School',className:'8'},
    {name:'Student',school:'School\nInjected',className:'8'}
  ];
  for(const fields of invalidProfiles) {
    const before=app.storage.get('kalvimurasu-student-v1');
    assert.equal(app.run(`saveStudent(${JSON.stringify(fields)})`),false);
    assert.equal(app.storage.get('kalvimurasu-student-v1'),before,'Invalid details must not create identity or queued records');
    assert(app.elements.get('#app').innerHTML.includes('aria-invalid="true"'));
    assert.equal(app.run('studentDraft.name'),fields.name,'Retain entered values for correction');
  }
  for(const name of ['தமிழ் மாணவி',"O’Connor",'A. Kumar','Jean-Luc','李明']) {
    assert.equal(app.run(`Object.keys(window.StudentTracking.validateProfile({name:${JSON.stringify(name)},school:'Govt. School 12',className:'8'}).errors).length`),0);
  }
  app.run('lang=1');
  app.run("saveStudent({name:'123',school:'School',className:'8'})");
  assert(app.elements.get('#app').innerHTML.includes('குறிக்கப்பட்ட விவரங்களைச் சரிபார்க்கவும்.'));
  app.run('lang=0');
  assert.equal(app.run("saveStudent({name:'A Student',school:'Example School',className:'8',section:'A',rollNumber:'10'})"),true);
  const id=app.run('currentStudent().id');
  assert.equal(app.run('view'),'home');
  assert.equal(readQueue(app).length,1,'Offline registration is queued');
  for(const [type,set] of [['ALL',0],['ALL',1.5],['ALL',999999],['INVALID',1]]) {
    app.run(`start(${JSON.stringify(type)},${set})`);
    assert.equal(app.run('attempt'),null,'Reject invalid practice selections');
  }
  app.run("start('ALL',1)");app.click({answer:'2'});app.run('finish()');
  assert.equal(readQueue(app).length,2);
  const attemptEvent=readQueue(app)[1];
  assert.equal(attemptEvent.attempt.score,1);
  assert.equal(attemptEvent.attempt.answered,1);
  assert.equal(attemptEvent.student.id,id);
  assert.equal(app.run('result.trackingQueued'),true);
  app.run('syncStudentProgress()');assert.equal(readQueue(app).length,2,'Repeated sync scheduling cannot duplicate events');
  const restored=boot(app.storage,{newStudent:true});
  assert.equal(restored.run('currentStudent().id'),id);
  assert.equal(restored.run('view'),'home','Student details requested once');
  assert.equal(readQueue(restored).length,2);
  restored.run("saveStudent({name:'Updated Student',school:'Example School',className:'8',section:'A',rollNumber:'10'})");
  assert.equal(restored.run('currentStudent().id'),id,'Editing details retains identity');
  assert.equal(readQueue(restored).filter(e=>e.type==='profile').length,1);
  let uploaded=[];
  restored.context.window.fetch=async(url,options)=>{
    const payload=JSON.parse(options.body);uploaded.push(...payload.events);
    assert.equal(url,restored.context.window.NMMS_PROGRESS_ENDPOINT,'Question feed changes cannot redirect student details');
    return {ok:true,text:async()=>JSON.stringify({schemaVersion:1,ok:true,acceptedIds:payload.events.map(e=>e.id)})};
  };
  restored.run("sheetConnection={endpoint:'https://script.google.com/macros/s/DIFFERENT_TEACHER/exec'}");
  restored.context.navigator.onLine=true;
  assert.equal(await restored.run('window.StudentTracking.flush()'),true);
  assert.equal(readQueue(restored).length,0);
  assert.equal(uploaded.length,2);
  restored.run("start('ALL',2); finish()");await pause();
  assert.equal(readQueue(restored).length,0,'Completed online practices upload automatically');
  assert.equal(uploaded.length,3);
  restored.context.navigator.onLine=false;
  restored.run("start('ALL',3); finish()");
  const pending=readQueue(restored)[0];
  restored.context.navigator.onLine=true;
  restored.context.window.fetch=async()=>{throw new Error('Connection lost')};
  assert.equal(await restored.run('window.StudentTracking.flush()'),false);
  assert.equal(readQueue(restored)[0].id,pending.id,'Failed uploads retain the original event for retry');
  restored.context.window.fetch=async()=>({ok:true,text:async()=>JSON.stringify({schemaVersion:1,ok:true,acceptedIds:['unrelated-id']})});
  assert.equal(await restored.run('window.StudentTracking.flush()'),false);
  assert.equal(readQueue(restored).length,1,'Unrelated acknowledgements cannot delete pending data');
  const noSpace=boot(new Map(),{newStudent:true});
  noSpace.context.window.localStorage.setItem=()=>{throw new Error('Storage full')};
  assert.equal(noSpace.run("saveStudent({name:'Student',school:'School',className:'8'})"),false);
  assert.equal(noSpace.run('view'),'onboarding','Do not enter app if student registration was not saved');

  // Exercise the actual Apps Script write endpoint against in-memory worksheets.
  function sheet(name) {
    const rows=[];let maxRows=1;
    return {rows,getName:()=>name,isSheetHidden:()=>false,getLastRow:()=>rows.length,getLastColumn:()=>rows[0]?.length || 0,getMaxRows:()=>maxRows,insertRowsAfter(_row,count){maxRows+=count},setFrozenRows(){},setColumnWidths(){},getRange(row,col,height,width){return {
      setValues(values){for(let i=0;i<height;i++){rows[row-1+i] ||= [];for(let j=0;j<width;j++)rows[row-1+i][col-1+j]=values[i][j]}return this},
      getValues(){return Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>rows[row-1+i]?.[col-1+j] ?? ''))},
      getDisplayValues(){return this.getValues().map(r=>r.map(String))},setBackground(){return this},setFontWeight(){return this},setWrap(){return this}
    }}};
  }
  const tabs=new Map(),book={getSheetByName:name=>tabs.get(name),insertSheet(name){const tab=sheet(name);tabs.set(name,tab);return tab},getSheets:()=>[...tabs.values()]};
  let locked=false;
  const google=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},SpreadsheetApp:{openById:()=>book,flush(){}},LockService:{getScriptLock:()=>({tryLock(){locked=true;return true},releaseLock(){locked=false}})},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:body=>({setMimeType:()=>JSON.parse(body)})}});
  vm.runInContext(fs.readFileSync('google-sheets/Code.gs','utf8'),google);
  const post=events=>{google.input={postData:{contents:JSON.stringify({schemaVersion:1,action:'syncProgress',events})}};return vm.runInContext('doPost(input)',google)};
  const original=attemptEvent;
  let response=post([original]);
  assert.equal(response.ok,true);assert.equal(locked,false);
  assert.equal(tabs.get('_Progress').rows.length,2);
  let student=tabs.get('_Students').rows[1];
  assert.equal(student[8],1);assert.equal(student[9],1);assert.equal(student[10],1);assert.equal(student[11],1);assert.equal(student[13],4);
  response=post([original]);
  assert.equal(response.ok,true);assert.equal(tabs.get('_Progress').rows.length,2,'Replay after lost acknowledgement does not append duplicate results');
  assert.equal(tabs.get('_Students').rows[1][8],1,'Replay does not increment summary totals');
  const retry=structuredClone(original);retry.id='retry-event-0001';retry.attempt.retry=true;retry.attempt.total=1;retry.attempt.answered=1;retry.attempt.score=1;retry.attempt.durationSeconds=0;
  assert.equal(post([retry]).ok,true);
  student=tabs.get('_Students').rows[1];
  assert.equal(student[8],2);assert.equal(student[9],1,'Retry is tracked separately without inflating unique sets');
  assert.equal(student[11],2);assert.equal(student[13],52);
  const profile={...original,id:'profile-update-0001',type:'profile',student:{...original.student,name:'New Student Name',updatedAt:Date.now()+1000}};
  assert.equal(post([profile]).ok,true);
  assert.equal(tabs.get('_Students').rows[1][1],'New Student Name');
  post([original]);
  assert.equal(tabs.get('_Students').rows[1][1],'New Student Name','Replayed old profile cannot undo a newer edit');
  const malicious={...profile,id:'profile-formula-0001',student:{...profile.student,name:'=HYPERLINK("https://example.com")',updatedAt:Date.now()+2000}};
  assert.equal(post([malicious]).ok,true);
  assert(tabs.get('_Students').rows[1][1].startsWith("'="),'Student text cannot execute a spreadsheet formula');
  const invalid=structuredClone(original);invalid.id='invalid-total-0001';invalid.attempt.score=99;
  assert.equal(post([invalid]).ok,false);
  assert.equal(tabs.get('_Progress').rows.length,3);
  const publicFeed=vm.runInContext('doGet()',google);
  assert.equal(publicFeed.subjects.length,0,'Neither student tab is included in the public feed');
  assert(!JSON.stringify(publicFeed).includes('Student'));
  console.log('PASS: first-open student gate, profile validation, offline registration/results, persistent identity, pinned upload destination, acknowledgement-only deletion, retry after network loss, server deduplication, accurate summaries, stale profile protection, formula safety, private tracking tabs');
}
main().catch(error=>{console.error(error);process.exitCode=1});
