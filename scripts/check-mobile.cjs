const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('www/index.html', 'utf8');
assert(html.includes('window.NMMS_NATIVE = true'));
assert(!html.includes('serviceWorker.register'));
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(([,file]) => {
  assert(fs.existsSync('www/'+file), `Missing ${file}`);
  return [file,fs.readFileSync('www/'+file,'utf8')];
});
function boot(storage = new Map(), options = {}) {
  const elements = new Map(), listeners = {}, windowListeners = {}, tones = [];
  if(!options.newStudent && !storage.has('kalvimurasu-student-v1')) storage.set('kalvimurasu-student-v1',JSON.stringify({profile:{id:'test-student-0001',name:'Test Student',school:'Test School',className:'8',section:'A',rollNumber:'1',createdAt:Date.now(),updatedAt:Date.now()},queue:[],lastSync:null}));
  const deviceNavigator={onLine:options.online ?? false};
  const browserStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  const element = () => ({close(){}, focus(){}, scrollIntoView(){}, dataset:{}, classList:{toggle(){}}, parentElement:{classList:{toggle(){}}}});
  class AudioContext {
    state = 'running'; currentTime = 0; destination = {};
    createOscillator(){const oscillator={frequency:{value:0},connect(){},disconnect(){},start(){tones.push(oscillator.frequency.value)},stop(){}};return oscillator;}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  const context = vm.createContext({
    window:{ NMMS_NATIVE:true, localStorage:browserStorage,navigator:deviceNavigator,crypto:require('node:crypto').webcrypto, AudioContext, indexedDB:options.indexedDB, fetch:options.fetch, addEventListener(type,listener){windowListeners[type]=listener}, scrollTo(){}, matchMedia(){return {matches:false}} },
    document:{documentElement:{}, addEventListener(type,listener){listeners[type]=listener}, querySelector(selector){
      if(selector === 'dialog[open]') return null;
      if(!elements.has(selector)) elements.set(selector,element());
      return elements.get(selector);
    }}, navigator:deviceNavigator, location:{protocol:'https:'}, setInterval(){}, URL, AbortController, setTimeout, clearTimeout,
    localStorage:browserStorage
  });
  for(const [filename,code] of scripts) vm.runInContext(code,context,{filename});
  return {
    run:code=>vm.runInContext(code,context), elements, storage, tones, context, windowListeners, listeners,
    click(dataset){const button={dataset,disabled:false,hasAttribute(name){return Object.hasOwn(dataset,name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()))}};listeners.click({target:{closest(){return button}}});}
  };
}
function check() {
const app = boot(), {run,elements,storage,tones}=app;
assert.equal(run('questions.length'),25000);
assert.equal(run('offlineReady'),true);
assert(elements.get('#app').innerHTML.includes('Today’s practice'));
for(const subject of ['Science','Social Science','Mathematics','MAT']) {
  app.click({subject});
  assert.equal(run('view'),'practice');
  assert.equal(run('setQuestions(activeSet)[0].subject'),subject);
  const section=subject==='MAT'?'MAT':'SAT';
  app.click({start:section,set:String(run('activeSet'))});
  assert.equal(run('practiceQuestions(attempt).length'),25);
  assert.equal(run('practiceQuestions(attempt).every(q=>q.subject===filter)'),true);
  run('finish()');
}
run("start('ALL',1)");
app.click({answer:'0'}); // First question's correct answer is C.
assert.equal(run('attempt.answers[0]'),0);
assert(elements.get('#app').innerHTML.includes('incorrect-answer'));
assert(elements.get('#app').innerHTML.includes('correct-answer'));
assert(elements.get('#app').innerHTML.includes('Multiply each number by 2'));
assert.deepEqual(tones,[220,164.81]);
app.click({answer:'2'});
assert.equal(run('attempt.answers[0]'),0,'Revealed answer cannot replace the first answer');
assert.equal(tones.length,2);
app.click({question:'1'});
const correct=run('practiceQuestions(attempt)[1].answer');
app.click({answer:String(correct)});
assert.deepEqual(tones.slice(2),[523.25,783.99]);
assert(elements.get('#app').innerHTML.includes('Correct!'));
assert.equal(JSON.parse(storage.get('kalvimurasu-v2')).attempt.answers[1],correct);
assert.equal(run('window.nmmsBack()'),true);
assert.equal(run('view'),'practice');
run('finish()');
assert.equal(run('result.score'),1);
assert.equal(run('result.total'),25);
assert(elements.get('#app').innerHTML.includes('data-retry'));
app.click({retry:''});
assert.equal(run('practiceQuestions(attempt).length'),1,'Retry excludes correct and unanswered questions');
assert.equal(run('practiceQuestions(attempt)[0].id'),0);
assert.equal(run('attempt.answers[0]'),null);
app.click({sound:''});
assert.equal(run('soundEnabled'),false);
const restored=boot(storage);
assert.equal(restored.run('attempt.indices[0]'),0);
assert.equal(restored.run('soundEnabled'),false);
assert.equal(restored.run('completedSets.size'),5);
restored.run("route('quiz')");
restored.click({answer:'0'});
assert.equal(restored.tones.length,0,'Mute persists after reload');
restored.run('finish(); retryIncorrect()');
assert.equal(restored.run('practiceQuestions(attempt)[0].id'),0,'Repeated retry retains original question mapping');
restored.click({answer:'2'});
restored.run('finish()');
assert.equal(restored.run('result.score'),1);
assert.equal(restored.run('result.total'),1);
assert(!restored.elements.get('#app').innerHTML.includes('data-retry'));
assert.equal(restored.run('completedSets.size'),5,'Retry does not count as a new completed set');
restored.run("start('ALL',2); attempt.deadline=Date.now()-1; tick()");
assert.equal(restored.run('result.expired'),true);
restored.run("lang=1; route('profile')");
assert.equal(restored.context.document.documentElement.lang,'ta');
assert(restored.elements.get('#app').innerHTML.includes('இணையமின்றிப் பயிற்சி செய்யத் தயார்'));
assert(restored.elements.get('#app').innerHTML.includes('விடை ஒலிகள்'));
const invalid = JSON.parse(storage.get('kalvimurasu-v2'));
invalid.attempt={set:1,type:'ALL',indices:[999],answers:[null],index:0,started:1,deadline:Date.now()+60000};
invalid.history=[{set:1,type:'ALL',total:25,score:1,date:Date.now(),answers:[]}];
invalid.completedSets=[1,0,1001,'bad'];
const safe=boot(new Map([['kalvimurasu-v2',JSON.stringify(invalid)]]));
assert.equal(safe.run('attempt'),null);
assert.equal(safe.run('history.length'),0);
assert.equal(safe.run('completedSets.size'),1);
console.log('PASS: offline bundle, four subjects, correct/incorrect tones, instant explanations, answer locking, persistence, Android Back, retries and retry recovery, mute, completed sets, expiry, Tamil, invalid storage');

}
if (require.main === module) check();
module.exports = {boot};
