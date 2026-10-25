const assert = require('node:assert/strict');
const {boot} = require('./check-mobile.cjs');

const app = boot();
app.click({editStudent:''});
app.listeners.input({target:{id:'student-name',value:'Edited Student'}});
app.listeners.input({target:{id:'student-school',value:'New School & Academy'}});
app.listeners.change({target:{id:'student-class',value:'9'}});
app.listeners.input({target:{id:'student-section',value:'B'}});
app.listeners.input({target:{id:'sheet-endpoint',value:'https://script.google.com/macros/s/UNSAVED/exec'}});
const beforeRefresh=app.elements.get('#app').innerHTML;
app.run('refreshDataViews()');
assert.equal(app.elements.get('#app').innerHTML,beforeRefresh,'Background data updates must not replace an active editor');
app.run('render()'); // Language/install redraws must preserve field values too.
let html = app.elements.get('#app').innerHTML;
assert(html.includes('value="Edited Student"'));
assert(html.includes('value="New School &amp; Academy"'));
assert(html.includes('value="9" selected'));
assert(html.includes('value="B"'));
assert(html.includes('value="https://script.google.com/macros/s/UNSAVED/exec"'));
app.listeners.change({target:{id:'header-language',value:'ta'}});
assert(app.elements.get('#app').innerHTML.includes('value="Edited Student"'), 'Language changes preserve unsaved details');
assert(app.context.document.title.startsWith('NMMS Spark'));
app.click({cancelStudent:''});
assert.equal(app.run('studentDraft'),null);
assert.equal(app.run('currentStudent().name'),'Test Student', 'Cancel does not save the draft');

const setItem=app.context.window.localStorage.setItem;
app.context.window.localStorage.setItem=()=>{throw new Error('Disk full')};
app.run('persist()');
assert.equal(app.run('storageFailed'),true);
assert.equal(app.elements.get('#storage-message').hidden,false);
app.context.window.localStorage.setItem=setItem;
app.run('persist()');
assert.equal(app.run('storageFailed'),false, 'Clear the warning after storage recovers');
assert.equal(app.elements.get('#storage-message').hidden,true);

app.run("start('ALL',1); finish(); start('ALL',2)");
const saved=JSON.parse(app.storage.get('kalvimurasu-v2'));
saved.history[0].score=25; // All answers are null; cached totals must not be trusted.
const storageWith=value=>new Map([...app.storage,['kalvimurasu-v2',JSON.stringify(value)]]);
const restored=boot(storageWith(saved));
assert.equal(restored.run('history[0].score'),0);
assert(restored.run('attempt') !== null, 'A valid saved practice still resumes');
for(const deadline of [saved.attempt.started-1,saved.attempt.started+86400000]) {
  const broken=structuredClone(saved);broken.attempt.deadline=deadline;
  assert.equal(boot(storageWith(broken)).run('attempt'),null, 'Reject impossible saved timers');
}
const badHistory=structuredClone(saved);badHistory.history[0].date=badHistory.history[0].started-1;
assert.equal(boot(storageWith(badHistory)).run('history.length'),0);
const otherStudent=structuredClone(saved);otherStudent.attempt.studentId='another-student';
assert.equal(boot(storageWith(otherStudent)).run('attempt'),null, 'Do not resume another student’s practice');
assert.equal(restored.run('questions.length-new Set(questions.map(q=>q.id)).size'),0);
assert.equal(restored.run("questions.filter(q=>!Array.isArray(q.text)||q.text.length!==2||q.text.some(x=>typeof x!=='string'||!x.trim())||!Array.isArray(q.options)||q.options.length!==4||!Number.isInteger(q.answer)||q.answer<0||q.answer>3).length"),0);
// Ignore stale controls left over from a feed refresh instead of dereferencing missing subjects.
const navigation=boot();
for(const action of [{subject:'removed-sheet'},{filter:'removed-sheet'},{route:'missing-screen'}]) navigation.click(action);
assert.equal(navigation.run('view'),'home');
navigation.listeners.change({target:{id:'practice-set',value:'not-a-number'}});
assert.equal(navigation.run('activeSet'),1);
navigation.run("start('ALL',1); answerQuestion(0); finish(); questions[0].option_explanations=[]; route('result')");
assert(navigation.elements.get('#app').innerHTML.includes('Correct answer'),'Missing optional explanations must not break review');

// Simulate a full durable outbox: older unqueued results must survive history trimming and reload.
const saturated=boot();
const studentState=JSON.parse(saturated.storage.get('kalvimurasu-student-v1'));
studentState.queue=Array.from({length:1000},(_,i)=>({id:'pending-profile-'+i,type:'profile',student:studentState.profile,destination:saturated.context.window.NMMS_PROGRESS_ENDPOINT,createdAt:Date.now()}));
saturated.storage.set('kalvimurasu-student-v1',JSON.stringify(studentState));
saturated.run("start('ALL',1);finish();history=Array.from({length:201},(_,i)=>({...result,trackingId:'pending-result-'+i,trackingQueued:false}));persist();syncStudentProgress()");
assert.equal(saturated.run('history.length'),201);
const stillFull=boot(saturated.storage);
assert.equal(stillFull.run('history.length'),201,'Unqueued history survives a reload while outbox is full');
studentState.queue=[];
saturated.storage.set('kalvimurasu-student-v1',JSON.stringify(studentState));
const recoveredQueue=boot(saturated.storage);
assert.equal(recoveredQueue.run('history.length'),200,'Prune old results only after durable enqueue succeeds');
assert.equal(JSON.parse(recoveredQueue.storage.get('kalvimurasu-student-v1')).queue.length,201,'All results reach the durable outbox');
console.log('PASS: unsaved form preservation, language changes, storage recovery, restored scores, timer bounds, student ownership, question structure, stale controls, optional explanations, full-outbox retention');

const locationApp=boot();
assert.equal(locationApp.run('window.StudentTracking.districts.length'),38);
assert.equal(locationApp.run('new Set(window.StudentTracking.districts.map(d=>d[0])).size'),38);
locationApp.click({editStudent:''});
locationApp.listeners.change({target:{id:'student-district',value:'Madurai'}});
locationApp.listeners.input({target:{id:'student-block',value:'Melur'}});
locationApp.run('render()');
assert(locationApp.elements.get('#app').innerHTML.includes('value="Madurai" selected'));
assert(locationApp.elements.get('#app').innerHTML.includes('value="Melur"'));
assert.equal(locationApp.run("saveStudent({name:'Student',school:'School',className:'8',district:'Madurai',block:'Melur'})"),true);
assert.equal(boot(locationApp.storage).run('currentStudent().district'),'Madurai');
assert.equal(boot(locationApp.storage).run('currentStudent().block'),'Melur');
assert.equal(locationApp.run("saveStudent({name:'Student',school:'School',className:'8',district:'Invalid district',block:'Melur'})"),false);
assert.equal(locationApp.run("saveStudent({name:'Student',school:'School',className:'8',block:'Melur'})"),false);
console.log('PASS: 38 district options, block/district validation, draft persistence and saved location');
