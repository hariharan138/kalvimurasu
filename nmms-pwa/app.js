'use strict';
const app = document.querySelector('#app');
const nav = document.querySelector('#bottom-nav');
const KEY = 'kalvimurasu-v2';
const bundledSetCount = Math.ceil(questions.length / 25);
let totalSets = bundledSetCount, syncedSets = [];
let sheetConnection = null, syncBusy = false, syncMessage = null, lastSyncAttempt = 0;
const icons = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  book:'<path d="M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Zm0 0v15"/>',
  chart:'<path d="M4 3v17h17M8 14l4-5 4 3 5-7"/>',
  user:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2z"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back:'<path d="M19 12H5m6-6-6 6 6 6"/>',
  play:'<path d="m9 5 11 7-11 7z"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  science:'<path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M8 14h8"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  math:'<path d="M4 7h6M7 4v6m7-3h6M4 15l6 6m0-6-6 6m10-5h6m-6 4h6"/>',
  mind:'<path d="M9 3a3 3 0 0 0-3 3 4 4 0 0 0-3 7 4 4 0 0 0 4 6 3 3 0 0 0 5 1V5a3 3 0 0 0-3-2Zm6 0a3 3 0 0 1 3 3 4 4 0 0 1 3 7 4 4 0 0 1-4 6 3 3 0 0 1-5 1M6 9l3 2m9-2-3 2M7 16l2-2m8 2-2-2"/>',
  menu:'<path d="M5 6h10M5 12h14M5 18h10"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.book}</svg>`;
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readStore() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
const stored = readStore();
let lang = stored.lang === 'ta' ? 1 : 0;
let studentError = '', editingStudent = false, trackingError = '';
let view = 'home', activeSet = 1, filter = 'all', reviewFilter = 'all';
let history = [];
let completedSets = new Set(Array.isArray(stored.completedSets) ? stored.completedSets.filter(n => Number.isInteger(n) && n >= 1 && n <= bundledSetCount || typeof n === 'string' && /^sheet:[A-Za-z0-9_-]+:\d+:\d+$/.test(n)) : []);
let soundEnabled = stored.soundEnabled !== false, audioContext = null;
let attempt = null, result = null, installPrompt = null, offlineReady = !!window.NMMS_NATIVE, storageFailed = false;
const t = (en, ta) => lang ? ta : en;
const option = (q, i) => q.options[i]?.[lang] ?? q.options[i]?.[0] ?? '';
const setQuestions = (n, type = 'ALL') => (n <= bundledSetCount ? questions.slice((n - 1) * 25, n * 25) : syncedSets[n - bundledSetCount - 1]?.questions || []).filter(q => type === 'ALL' || q.section === type);
const practiceQuestions = record => {
  const pool = record.snapshot || setQuestions(record.set, record.type);
  return record.indices ? record.indices.map(i => pool[i]) : pool;
};
const typeName = type => type === 'MAT' ? t('Mental ability','மனத்திறன்') : type === 'SAT' ? t('Scholastic aptitude','படிப்பறிவு') : t('Combined practice','ஒருங்கிணைந்த பயிற்சி');
let subjects = [
  {key:'Science',en:'Science',ta:'அறிவியல்',icon:'science',color:'mint',start:601,end:680,desc:['Explore how the world works','உலகம் இயங்கும் விதம் அறிக']},
  {key:'Social Science',en:'Social science',ta:'சமூக அறிவியல்',icon:'globe',color:'pink',start:681,end:760,desc:['People, places & the past','மக்கள், இடங்கள், வரலாறு']},
  {key:'Mathematics',en:'Mathematics',ta:'கணிதம்',icon:'math',color:'lilac',start:761,end:780,desc:['A little logic. A lot of discovery.','கணக்கிட்டு அறிந்திடுங்கள்']},
  {key:'MAT',en:'Mental ability',ta:'மனத்திறன்',icon:'mind',color:'blue',start:781,end:800,desc:['Patterns, puzzles & possibilities','தொடர்கள், புதிர்கள், தருக்கம்']}
];
const bundledSubjects = subjects.slice();
const setSubject = n => n > bundledSetCount ? syncedSets[n - bundledSetCount - 1]?.subject : bundledSubjects.find(s => s.key === setQuestions(n)[0]?.subject);
const setKey = record => record.setKey || record.set;
function currentStudent() { return window.StudentTracking.profile(); }
function studentForm(edit = false) {
  const student=currentStudent();
  return `<form id="student-form" class="student-form"><label for="student-name">${t('Student name','மாணவர் பெயர்')}</label><input id="student-name" name="name" autocomplete="name" required maxlength="100" value="${escapeHTML(student?.name || '')}"><label for="student-school">${t('School name','பள்ளியின் பெயர்')}</label><input id="student-school" name="school" required maxlength="160" value="${escapeHTML(student?.school || '')}"><div class="student-form-row"><div><label for="student-class">${t('Class','வகுப்பு')}</label><select id="student-class" name="className" required>${['6','7','8','9','10','11','12'].map(n=>`<option value="${n}" ${(student?.className || '8')===n?'selected':''}>${n}</option>`).join('')}</select></div><div><label for="student-section">${t('Section (optional)','பிரிவு (விருப்பம்)')}</label><input id="student-section" name="section" maxlength="20" value="${escapeHTML(student?.section || '')}"></div></div><label for="student-roll">${t('Roll number (optional)','வரிசை எண் (விருப்பம்)')}</label><input id="student-roll" name="rollNumber" maxlength="40" value="${escapeHTML(student?.rollNumber || '')}"><p class="student-data-note">${t('Your name, school, class, and practice results will be sent to your teacher’s Google Sheet when internet is available. You can start learning offline.','உங்கள் பெயர், பள்ளி, வகுப்பு மற்றும் பயிற்சி முடிவுகள் இணையம் கிடைக்கும்போது ஆசிரியரின் கூகுள் தாளில் சேமிக்கப்படும். இணையமின்றியும் கற்றலைத் தொடங்கலாம்.')}</p>${studentError?`<p role="alert" class="student-error">${escapeHTML(studentError)}</p>`:''}<div class="sync-actions"><button class="primary" type="submit">${edit?t('Save details','விவரங்களைச் சேமி'):t('Save & start learning','சேமித்துக் கற்கத் தொடங்கு')}${icon('arrow')}</button>${edit?`<button type="button" class="secondary" data-cancel-student>${t('Cancel','ரத்து')}</button>`:''}</div></form>`;
}
function androidDownloadCard() {
  if(window.NMMS_NATIVE) return '';
  return `<section class="android-download"><span class="subject-icon blue">${icon('download')}</span><div><h2>${t('Take Kalvimurasu with you','கல்விமுரசை உங்கள் கைப்பேசியில் பயன்படுத்துங்கள்')}</h2><p>${t('Android v1.2 · Test build · Android 7.0 or later · 25,000 offline questions','ஆண்ட்ராய்டு v1.2 · சோதனைப் பதிப்பு · ஆண்ட்ராய்டு 7.0 அல்லது அதற்கு மேல் · 25,000 இணையமில்லா வினாக்கள்')}</p><a class="primary" href="/downloads/Kalvimurasu-NMMS-v1.2.apk" download>${icon('download')}${t('Download Android APK','ஆண்ட்ராய்டு APK பதிவிறக்கு')}</a><p class="download-help">${t('Android: open the downloaded APK to install. If prompted, allow installation from your browser. On iPhone: open this website in Safari → Share → Add to Home Screen.','ஆண்ட்ராய்டு: பதிவிறக்கிய APK கோப்பைத் திறந்து நிறுவுங்கள். கேட்டால் உங்கள் உலாவியிலிருந்து நிறுவ அனுமதியுங்கள். iPhone: Safari-இல் இந்தத் தளத்தைத் திறந்து → Share → Add to Home Screen.')}</p></div></section>`;
}
function onboardingScreen() {
  return `<section class="onboarding-card"><span class="subject-icon mint">${icon('user')}</span><p class="eyebrow">${t('WELCOME TO KALVIMURASU','கல்விமுரசு உங்களை வரவேற்கிறது')}</p><h1>${t('Let’s get to know you.','உங்களை அறிமுகப்படுத்துங்கள்.')}</h1><p>${t('Enter your details once so your teacher can follow your learning progress.','உங்கள் கற்றல் முன்னேற்றத்தை ஆசிரியர் அறிய ஒருமுறை விவரங்களை உள்ளிடுங்கள்.')}</p>${studentForm()}</section>`;
}
function saveStudent(fields) {
  try {
    window.StudentTracking.saveProfile(fields);
    studentError='';editingStudent=false;
    route('home');syncStudentProgress();return true;
  } catch(error) {
    studentError=t('Could not save details: ','விவரங்களைச் சேமிக்க இயலவில்லை: ')+error.message;
    render();return false;
  }
}
function studentDetailsCard() {
  const student=currentStudent();
  if(!student) return '';
  return `<section class="setting-card"><span class="subject-icon mint">${icon('user')}</span><div><h2>${t('Student details','மாணவர் விவரங்கள்')}</h2>${editingStudent?studentForm(true):`<p><strong>${escapeHTML(student.name)}</strong><br>${escapeHTML(student.school)}<br>${t('Class','வகுப்பு')} ${escapeHTML(student.className)}${student.section?' · '+escapeHTML(student.section):''}${student.rollNumber?'<br>'+t('Roll number','வரிசை எண்')+': '+escapeHTML(student.rollNumber):''}</p><button class="secondary" data-edit-student>${t('Edit details','விவரங்களை மாற்று')}</button>`}</div></section>`;
}
function trackingStatusCard() {
  const status=window.StudentTracking.status();
  return `<section class="setting-card"><span class="subject-icon blue">${icon('chart')}</span><div><h2>${t('Share progress with your teacher','ஆசிரியருக்கான முன்னேற்றப் பதிவு')}</h2><p role="status" aria-live="polite">${status.busy?t('Uploading saved progress…','சேமித்த முன்னேற்றம் பதிவேற்றப்படுகிறது…'):status.pending?t(`${status.pending} records waiting for internet sync.`,`${status.pending} பதிவுகள் இணையப் பதிவேற்றத்திற்குக் காத்திருக்கின்றன.`):status.lastSync?t('All queued records uploaded.','காத்திருந்த பதிவுகள் அனைத்தும் பதிவேற்றப்பட்டன.'):t('Your completed practices will sync when internet is available.','இணையம் கிடைக்கும்போது முடித்த பயிற்சிகள் பதிவேற்றப்படும்.')}</p>${status.lastSync?`<p>${t('Last uploaded','கடைசி பதிவேற்றம்')}: ${new Date(status.lastSync).toLocaleString(lang?'ta-IN':'en-IN')}</p>`:''}${status.error || trackingError?`<p class="student-error">${escapeHTML(status.error || trackingError)}</p>`:''}<button class="secondary" data-sync-progress ${status.busy?'disabled':''}>${t('Sync progress now','முன்னேற்றத்தைப் பதிவேற்று')}</button></div></section>`;
}
function queueResultForTeacher(record) {
  if(!record.studentId || record.studentId!==currentStudent()?.id || record.trackingQueued) return;
  const qs=practiceQuestions(record);
  const subject=record.snapshot?record.snapshot[0].subject:record.type==='MAT'?'MAT':setSubject(record.set)?.en || typeName(record.type);
  try { record.trackingQueued=window.StudentTracking.enqueueAttempt(record,subject,setKey(record));trackingError=''; }
  catch(error) { trackingError=error.message; }
}
function syncStudentProgress() {
  if(!currentStudent()) return;
  for(const record of history) queueResultForTeacher(record);
  persist();
  window.StudentTracking.flush();
}
function choicesForFilter() {
  return Array.from({length:totalSets},(_,i)=>i+1).filter(n => filter === 'all' || (filter === 'mixed' ? n < 401 : setSubject(n)?.key === filter && n >= 401));
}
function applySheetBank(record) {
  const imported = [], sets = [], deployment = record.endpoint.split('/').at(-2);
  for (const sheet of record.data.subjects) {
    if (!sheet.questions.length) continue;
    const known = bundledSubjects.find(s=>s.en.toLowerCase() === sheet.name.toLowerCase() || s.key.toLowerCase() === sheet.name.toLowerCase());
    const subject = {key:`sheet-${sheet.id}`, en:sheet.name, ta:known?.ta || sheet.name, icon:known?.icon || 'book',color:known?.color || 'blue',start:bundledSetCount+sets.length+1,desc:['Synced from Google Sheets','கூகுள் தாளிலிருந்து பதிவிறக்கப்பட்டது']};
    imported.push(subject);
    for (let i=0;i<sheet.questions.length;i+=25) sets.push({subject,key:`sheet:${deployment}:${sheet.id}:${i/25}`,questions:sheet.questions.slice(i,i+25)});
  }
  syncedSets = sets; totalSets = bundledSetCount + sets.length;
  // Sheet subjects replace matching cards; bundled questions remain under All subjects.
  subjects = [...bundledSubjects.filter(b=>!imported.some(s=>s.en.toLowerCase()===b.en.toLowerCase() || s.en.toLowerCase()===b.key.toLowerCase())),...imported];
  sheetConnection = record;
  if (filter !== 'all' && filter !== 'mixed' && !subjects.some(s=>s.key===filter)) filter='all';
  const choices = choicesForFilter();
  if (!choices.includes(activeSet)) activeSet=choices[0] || 1;
}
function sheetSyncCard() {
  const count = sheetConnection?.data.subjects.reduce((sum,s)=>sum+s.questions.length,0) || 0;
  const status = syncBusy ? t('Downloading questions…','வினாக்கள் பதிவிறக்கப்படுகின்றன…') : syncMessage ? t(...syncMessage) : sheetConnection ? t(`${count} questions saved offline. Last synced: ${new Date(sheetConnection.syncedAt).toLocaleString('en-IN')}`,`${count} வினாக்கள் சாதனத்தில் சேமிக்கப்பட்டுள்ளன. கடைசி பதிவிறக்கம்: ${new Date(sheetConnection.syncedAt).toLocaleString('ta-IN')}`) : t('Connect your question sheet once. Updates download on launch, resume, or when internet returns.','ஒருமுறை உங்கள் வினாத் தாளை இணைக்கவும். செயலியைத் திறக்கும்போதும் இணையம் கிடைக்கும்போதும் புதுப்பிக்கப்படும்.');
  return `<section class="setting-card sheet-sync-card"><span class="subject-icon blue">${icon('download')}</span><div><h2>${t('Google Sheets questions','கூகுள் தாள் வினாக்கள்')}</h2><p>${t('Each sheet tab becomes a subject. Downloaded questions work offline.','ஒவ்வொரு தாளும் ஒரு பாடமாகும். பதிவிறக்கிய வினாக்களை இணையமின்றிப் பயிலலாம்.')}</p><label for="sheet-endpoint">${t('Question feed URL (Apps Script)','வினா இணைப்பு (Apps Script)')}</label><input id="sheet-endpoint" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" value="${escapeHTML(sheetConnection?.endpoint || window.NMMS_SHEET_ENDPOINT || '')}" ${syncBusy?'disabled':''}><div class="sync-actions"><button class="primary" data-connect-sheet ${syncBusy?'disabled':''}>${t('Connect & sync','இணைத்துப் பதிவிறக்கு')}</button>${sheetConnection?`<button class="secondary" data-sync-sheet ${syncBusy?'disabled':''}>${t('Sync now','இப்போது புதுப்பி')}</button>`:''}</div><p role="status" aria-live="polite" class="sync-status">${escapeHTML(status)}</p></div></section>`;
}
async function syncSheets(candidate, automatic = false) {
  if (syncBusy || !window.SheetBank || navigator.onLine === false) {
    if (!automatic && navigator.onLine === false) { syncMessage=['You are offline. Your saved questions are still available.','இணையம் இல்லை. சேமித்த வினாக்களைப் பயிலலாம்.']; if(view==='profile') render(); }
    return;
  }
  const address = candidate === undefined ? sheetConnection?.endpoint || window.NMMS_SHEET_ENDPOINT : candidate;
  if (candidate !== undefined && !candidate.trim()) { syncMessage=['Paste your Apps Script /exec URL first.','முதலில் Apps Script /exec இணைப்பை உள்ளிடவும்.']; if(view==='profile') render(); return; }
  if (!address || automatic && Date.now()-lastSyncAttempt < 60000) return;
  syncBusy=true; lastSyncAttempt=Date.now(); syncMessage=null;
  if (view==='profile') render();
  try {
    const record=await window.SheetBank.download(address);
    // Never expose a new bank before its offline transaction has committed.
    await window.SheetBank.write(record);
    applySheetBank(record);
    syncMessage=[`Synced ${record.data.subjects.length} subject tabs. Questions are saved offline.`,` ${record.data.subjects.length} பாடத் தாள்கள் புதுப்பிக்கப்பட்டன. வினாக்கள் சாதனத்தில் சேமிக்கப்பட்டுள்ளன.`];
  } catch(error) {
    syncMessage=[`Sync failed: ${error.message} Previous questions are unchanged.`,`புதுப்பிக்க இயலவில்லை: ${error.message} முன்பு சேமித்த வினாக்கள் பாதுகாப்பாக உள்ளன.`];
  } finally {
    syncBusy=false;
    // Do not disrupt an in-progress answer, review, or a focused form during background work.
    if (view==='profile' || view==='home' || view==='practice') render();
  }
}
async function loadSheetBank() {
  if (!window.SheetBank || !window.indexedDB) return;
  try {
    const record=await window.SheetBank.read();
    if (record) {
      record.endpoint=window.SheetBank.endpoint(record.endpoint);
      record.data=window.SheetBank.validate(record.data);
      applySheetBank(record);
      if (view==='profile' || view==='home' || view==='practice') render();
    }
    syncSheets(undefined,true);
  } catch { syncMessage=['Saved sheet questions could not be loaded. Reconnect your feed to try again.','சேமித்த தாள் வினாக்களைத் திறக்க இயலவில்லை. மீண்டும் இணைக்கவும்.']; }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({lang:lang ? 'ta':'en',soundEnabled,completedSets:[...completedSets],history,attempt})); }
  catch { storageFailed = true; }
}
function validRecord(a) {
  if (!a || !Number.isInteger(a.set) || a.set < 1 || !['ALL','MAT','SAT'].includes(a.type)) return false;
  if (a.snapshot !== undefined) {
    if (!Array.isArray(a.snapshot) || !a.snapshot.length || a.snapshot.length > 25 || !/^sheet:[A-Za-z0-9_-]+:\d+:\d+$/.test(a.setKey || '')) return false;
    try { a.snapshot.forEach(q=>window.SheetBank.question(q)); } catch { return false; }
  } else if (a.set > bundledSetCount) return false;
  const pool = a.snapshot || setQuestions(a.set,a.type);
  if (a.indices !== undefined && (!Array.isArray(a.indices) || !a.indices.length || new Set(a.indices).size !== a.indices.length || !a.indices.every(i => Number.isInteger(i) && i >= 0 && i < pool.length))) return false;
  const length = a.indices ? a.indices.length : pool.length;
  return length > 0 && Array.isArray(a.answers) && a.answers.length === length && a.answers.every(v => v === null || (Number.isInteger(v) && v >= 0 && v < 4));
}
function validAttempt(a) {
  return validRecord(a) && Number.isFinite(a.deadline) && Number.isFinite(a.started) && Number.isInteger(a.index) && a.index >= 0 && a.index < a.answers.length;
}
history = Array.isArray(stored.history) ? stored.history.filter(r => validRecord(r) && r.total === r.answers.length && Number.isInteger(r.score) && r.score >= 0 && r.score <= r.total && Number.isFinite(r.date)).slice(0,200) : [];
history.filter(r => !r.indices).forEach(r => completedSets.add(setKey(r)));
if (validAttempt(stored.attempt)) attempt = stored.attempt;
async function playFeedback(correct) {
  if (!soundEnabled) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audioContext ||= new Audio();
    if (audioContext.state === 'suspended') await audioContext.resume();
    const now = audioContext.currentTime;
    (correct ? [523.25, 783.99] : [220, 164.81]).forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      const start = now + i * 0.14;
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.13);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start + 0.14);
    });
  } catch { /* Visual feedback remains available if audio is unavailable. */ }
}
function answerQuestion(value) {
  if (!attempt || !Number.isInteger(value) || value < 0 || value > 3) return;
  if (!secondsLeft()) { finish(true); return; }
  // Preserve the first answer after showing the solution so scores remain meaningful.
  if (attempt.answers[attempt.index] !== null) return;
  const q = practiceQuestions(attempt)[attempt.index];
  attempt.answers[attempt.index] = value;
  playFeedback(value === q.answer);
  persist(); render();
  document.querySelector('#answer-feedback')?.focus({preventScroll:true});
}
function retryIncorrect() {
  if (attempt) { route('quiz'); return; }
  if (!result) return;
  const pool = practiceQuestions(result);
  const indices = pool.flatMap((q,i) => result.answers[i] !== null && result.answers[i] !== q.answer ? [result.indices ? result.indices[i] : i] : []);
  if (!indices.length) return;
  const now = Date.now();
  attempt = {studentId:currentStudent().id,trackingId:window.StudentTracking.uuid(),set:result.set,type:result.type,indices,index:0,answers:indices.map(() => null),started:now,deadline:now + indices.length * 60000,...(result.snapshot?{snapshot:result.snapshot,setKey:result.setKey}:{})};
  persist(); route('quiz');
}
function answerFeedback(q, answer) {
  if (answer === null) return '';
  const correct = answer === q.answer;
  return `<section id="answer-feedback" class="answer-feedback ${correct?'is-correct':'is-incorrect'}" tabindex="-1" role="status" aria-live="polite"><h3>${correct?t('Correct!','சரியான விடை!'):t('Keep learning!','தொடர்ந்து கற்றிடுங்கள்!')}</h3><p>${t('Correct answer','சரியான விடை')}: <strong>${escapeHTML(option(q,q.answer))}</strong></p><p>${escapeHTML(q.explanation[lang])}</p>${!correct && q.option_explanations?.[answer]?.[lang] ? `<p>${escapeHTML(q.option_explanations[answer][lang])}</p>` : ''}</section>`;
}
function route(next) { view = currentStudent() ? next : 'onboarding'; document.querySelector('#menu-dialog').close(); render(); window.scrollTo(0,0); app.focus({preventScroll:true}); }
function start(type, n = activeSet) {
  if (!currentStudent()) { route('onboarding'); return; }
  if (attempt) { route('quiz'); return; }
  const qs = setQuestions(n,type);
  if (!qs.length) return;
  activeSet = n;
  attempt = {studentId:currentStudent().id,trackingId:window.StudentTracking.uuid(),set:n,type,index:0,answers:qs.map(() => null),started:Date.now(),deadline:Date.now()+qs.length*60000};
  if (n > bundledSetCount) { attempt.snapshot=qs; attempt.setKey=syncedSets[n-bundledSetCount-1].key; }
  persist(); route('quiz');
}
function finish(expired = false) {
  if (!attempt) return;
  const qs = practiceQuestions(attempt);
  result = {...attempt,total:qs.length,score:qs.filter((q,i) => q.answer === attempt.answers[i]).length,date:Date.now(),expired};
  if (!attempt.indices) completedSets.add(setKey(attempt));
  queueResultForTeacher(result);
  history.unshift(result); history = history.slice(0,200); attempt = null; reviewFilter = 'all';
  persist(); document.querySelector('#submit-dialog').close(); route('result');syncStudentProgress();
}
function secondsLeft() { return attempt ? Math.max(0,Math.ceil((attempt.deadline-Date.now())/1000)) : 0; }
function tick() {
  if (!attempt) return;
  if (!secondsLeft()) { finish(true); return; }
  const clock = document.querySelector('#clock');
  if (clock) { const n = secondsLeft(); clock.textContent = `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; clock.parentElement.classList.toggle('low',n<60); }
}
const sectionHeading = (title,action='') => `<div class="section-heading"><h2>${title}</h2>${action}</div>`;
function subjectRows() { return subjects.map(s => `<button class="subject-row" data-subject="${s.key}"><span class="subject-icon ${s.color}">${icon(s.icon)}</span><span class="row-copy"><strong>${escapeHTML(t(s.en,s.ta))}</strong><small>${t(...s.desc)}</small></span><span class="round-arrow">${icon('arrow')}</span></button>`).join(''); }
function homeScreen() {
  const nextSet = syncedSets.length ? bundledSetCount+1 : history.length ? (history[0].set % totalSets) + 1 : 1;
  const completed = completedSets.size;
  const average = history.length ? Math.round(history.reduce((s,r) => s+r.score/r.total*100,0)/history.length) : 0;
  return `<div class="page-heading"><div><p class="eyebrow">${t('A LITTLE EVERY DAY','தினமும் சிறிது பயிற்சி')}</p><h1>${t('Make room for<br>your next big idea.','புதிய சிந்தனைக்கு<br>வழி வகுப்போம்.')}</h1></div><span class="heading-spark" aria-hidden="true">${icon('spark')}</span></div>
  <div class="home-layout"><div class="home-primary">${sectionHeading(t('Today’s practice','இன்றைய பயிற்சி'),`<span class="quiet-tag">NMMS · ${t('Class 8','வகுப்பு 8')}</span>`)}
  <section class="feature-card"><div class="feature-copy"><span class="live-label"><i></i>${attempt?t('Your journey continues','பயிற்சியைத் தொடருங்கள்'):t('A fresh start, every day','ஒவ்வொரு நாளும் புதிய தொடக்கம்')}</span><h2>${attempt?typeName(attempt.type):t('Small steps.<br>Brighter futures.','சிறு முயற்சி.<br>சிறந்த எதிர்காலம்.')}</h2><p>${t('Practice set','பயிற்சித் தொகுப்பு')} ${String(attempt?.set || nextSet).padStart(2,'0')}</p><div class="feature-meta">${icon('clock')} ${attempt ? `${attempt.answers.filter(a=>a!==null).length} / ${attempt.answers.length} ${t('answered','விடைகள்')}` : t(`${setQuestions(nextSet).length} questions · ${setQuestions(nextSet).length} minutes`,`${setQuestions(nextSet).length} வினாக்கள் · ${setQuestions(nextSet).length} நிமிடங்கள்`)}</div><button class="play-button" ${attempt?'data-route="quiz"':`data-start="ALL" data-set="${nextSet}"`}><span>${icon('play')}</span>${attempt?t('Continue practice','பயிற்சியைத் தொடர்க'):t('Let’s begin','தொடங்குவோம்')}</button></div><div class="feature-art" aria-hidden="true"><div class="art-circle"></div><img src="assets/study-hero.png" alt="" width="1312" height="1200"></div></section>
  ${sectionHeading(t('Your learning, in little steps','உங்கள் கற்றல் முன்னேற்றம்'))}<div class="metric-grid"><div><span class="metric-icon mint">${icon('check')}</span><strong>${completed}</strong><small>${t('Sets completed','முடித்த தொகுப்புகள்')}</small></div><div><span class="metric-icon pink">${icon('chart')}</span><strong>${average}<em>%</em></strong><small>${t('Average score','சராசரி மதிப்பெண்')}</small></div><div><span class="metric-icon lilac">${icon('book')}</span><strong>${totalSets}</strong><small>${t('Sets to explore','பயிற்சித் தொகுப்புகள்')}</small></div></div>
  <div class="learning-note">${icon('spark')}<p>${t('Progress starts with showing up. One question at a time.','ஒவ்வொரு வினாவும் உங்கள் முன்னேற்றத்தின் ஒரு படி.')}</p></div></div>
  <aside class="home-secondary">${sectionHeading(t('Find your focus','பாடத்தைத் தேர்ந்தெடு'),`<button class="text-button" data-route="practice">${t('View all','அனைத்தும்')} ${icon('arrow')}</button>`)}<div class="subject-list">${subjectRows()}</div><section class="mini-banner"><span class="mini-icon">${icon('book')}</span><h3>${t('Your language.<br>Your pace.','உங்கள் மொழி.<br>உங்கள் வேகம்.')}</h3><p>${t(`${questions.length + syncedSets.reduce((n,s)=>n+s.questions.length,0)} questions with explanations in Tamil and English.`, `தமிழ் மற்றும் ஆங்கில விளக்கங்களுடன் ${questions.length + syncedSets.reduce((n,s)=>n+s.questions.length,0)} வினாக்கள்.`)}</p><button class="text-button" data-route="practice">${t('Explore the question bank','வினா வங்கியைப் பாருங்கள்')} ${icon('arrow')}</button></section></aside></div>`;
}
function practiceScreen() {
  const qs = setQuestions(activeSet);
  const subject = setSubject(activeSet);
  const types = ['ALL','MAT','SAT'].filter(type => setQuestions(activeSet,type).length && (activeSet < 401 || type !== 'ALL'));
  const choices = choicesForFilter();
  return `<div class="page-heading"><div><p class="eyebrow">${t('CURIOUS MINDS START HERE','பயிற்சியைத் தொடங்குங்கள்')}</p><h1>${t('Find your next<br>little challenge.','அடுத்த சவாலைத்<br>தேர்ந்தெடுங்கள்.')}</h1></div><span class="heading-spark">${icon('book')}</span></div>
  ${attempt?`<button class="resume-strip" data-route="quiz">${icon('clock')}<span>${t('A practice is in progress. Continue where you left off.','பயிற்சி நடைபெறுகிறது. விட்ட இடத்திலிருந்து தொடருங்கள்.')}</span>${icon('arrow')}</button>`:''}
  <div class="filter-chips" role="group" aria-label="${t('Subjects','பாடங்கள்')}">${[['all',t('All subjects','அனைத்துப் பாடங்கள்')],['mixed',t('Mixed practice','கலப்புப் பயிற்சி')],...subjects.map(s=>[s.key,t(s.en,s.ta)])].map(([key,name])=>`<button data-filter="${key}" class="chip ${filter===key?'active':''}" aria-pressed="${filter===key}">${escapeHTML(name)}</button>`).join('')}</div>
  <div class="set-picker"><div><label for="practice-set">${t('Choose a practice set','பயிற்சித் தொகுப்பைத் தேர்ந்தெடு')}</label><p>${choices.length} ${t('sets to build your confidence','பயிற்சித் தொகுப்புகள்')}</p></div><select id="practice-set">${choices.map(n=>`<option value="${n}" ${n===activeSet?'selected':''}>${t('Set','தொகுப்பு')} ${String(n).padStart(2,'0')} · ${n>bundledSetCount?escapeHTML(setSubject(n)?.en || '')+' · '+setQuestions(n).length+' '+t('questions','வினாக்கள்'):t('Questions','வினாக்கள்')+' '+((n-1)*25+1)+'–'+Math.min(n*25,questions.length)}</option>`).join('')}</select></div>
  ${sectionHeading(t('Choose your practice','பயிற்சி முறையைத் தேர்ந்தெடு'),`<span class="quiet-tag">${t('Set','தொகுப்பு')} ${activeSet}</span>`)}<div class="practice-cards">${types.map((type,i)=>`<section class="practice-card ${['mint','pink','lilac'][i]}"><span class="card-icon">${icon(type==='MAT'?'mind':type==='SAT'?'book':'spark')}</span><span class="card-kicker">${type==='ALL'?'MAT + SAT':type}</span><h2>${subject&&activeSet>=401?escapeHTML(t(subject.en,subject.ta)):typeName(type)}</h2><p>${type==='ALL'?t('A little reasoning. A little discovery. A well-rounded practice.','மனத்திறன் மற்றும் படிப்பறிவு இணைந்த பயிற்சி.'):type==='MAT'?t('Explore patterns, puzzles and new ways of thinking.','தொடர்கள், புதிர்கள் மற்றும் புதிய சிந்தனைகள்.'):t('Discover more in mathematics, science and social science.','கணிதம், அறிவியல், சமூக அறிவியல் பயிற்சி.')}</p><div class="card-details"><span>${icon('book')}${setQuestions(activeSet,type).length} ${t('questions','வினாக்கள்')}</span><span>${icon('clock')}${setQuestions(activeSet,type).length} ${t('min','நிமி')}</span></div><button class="primary" data-start="${type}" data-set="${activeSet}">${attempt?t('Continue current practice','தற்போதைய பயிற்சியைத் தொடர்க'):t('Start practice','பயிற்சியைத் தொடங்கு')}${icon('arrow')}</button></section>`).join('')}</div><p class="fine-print">${t('One mark per correct answer. No negative marks. Answers lock after selection, with instant feedback and explanations. These short practice sets are not full-length mock exams.','சரியான விடைக்கு ஒரு மதிப்பெண். எதிர்மறை மதிப்பெண்கள் இல்லை. விடையைத் தேர்ந்தெடுத்ததும் உடனடி விளக்கம் கிடைக்கும்; விடையை மாற்ற இயலாது. இவை குறும் பயிற்சிகள்; முழுநீள மாதிரித் தேர்வுகள் அல்ல.')}</p>`;
}
function quizScreen() {
  if (!attempt) { view='practice'; return practiceScreen(); }
  const qs = practiceQuestions(attempt), q=qs[attempt.index], count=attempt.answers.filter(a=>a!==null).length, answer=attempt.answers[attempt.index];
  return `<div class="quiz-heading"><button class="circle-button" data-route="practice" aria-label="${t('Back to practice','பயிற்சிக்குத் திரும்பு')}">${icon('back')}</button><div><p class="eyebrow">${t('PRACTICE SET','பயிற்சித் தொகுப்பு')} ${String(attempt.set).padStart(2,'0')}</p><h1>${attempt.indices?t('Retry mistakes','தவறான விடைகளை மீண்டும் பயில்க'):attempt.snapshot?escapeHTML(attempt.snapshot[0].subject):typeName(attempt.type)}</h1></div><div class="timer" role="timer" aria-label="${t('Time remaining','மீதமுள்ள நேரம்')}">${icon('clock')}<span id="clock"></span></div></div>
  <div class="quiz-toolbar"><button class="secondary" data-sound aria-pressed="${soundEnabled}">${soundEnabled?t('Sound: On','ஒலி: இயக்கு'):t('Sound: Off','ஒலி: நிறுத்து')}</button></div><div class="quiz-layout"><section class="question-panel"><div class="question-meta"><span>${escapeHTML(q.topic[lang])}</span><span class="quiet-tag">${attempt.index+1} / ${qs.length}</span></div><div class="progress-track" role="progressbar" aria-label="${t('Answered questions','விடையளித்த வினாக்கள்')}" aria-valuenow="${count}" aria-valuemin="0" aria-valuemax="${qs.length}"><span style="width:${count/qs.length*100}%"></span></div><h2 id="question-title">${escapeHTML(q.text[lang])}</h2><div class="answer-options" role="group" aria-labelledby="question-title">${q.options.map((_,i)=>`<button class="answer-option ${answer===i?'selected ':''}${answer!==null && i===q.answer?'correct-answer ':''}${answer===i && i!==q.answer?'incorrect-answer':''}" data-answer="${i}" aria-pressed="${answer===i}" aria-disabled="${answer!==null}"><span class="answer-letter">${'ABCD'[i]}</span><span>${escapeHTML(option(q,i))}</span>${answer!==null && i===q.answer?icon('check'):answer===i?icon('close'):''}</button>`).join('')}</div>${answerFeedback(q,answer)}<div class="quiz-actions"><button class="secondary" data-question="${attempt.index-1}" ${attempt.index===0?'disabled':''}>${icon('back')}${t('Previous','முந்தையது')}</button><button class="primary" ${attempt.index===qs.length-1?'data-submit':`data-question="${attempt.index+1}"`}>${attempt.index===qs.length-1?t('Finish','முடி'):t('Next','அடுத்து')}${icon('arrow')}</button></div></section>
  <aside class="question-map"><h2>${t('Your questions','உங்கள் வினாக்கள்')}</h2><p>${count} / ${qs.length} ${t('answered','விடையளிக்கப்பட்டது')}</p><div class="question-grid">${qs.map((_,i)=>`<button data-question="${i}" class="${attempt.answers[i]!==null?'answered '+(attempt.answers[i]===qs[i].answer?'is-correct ':'is-incorrect '):''}${attempt.index===i?'current':''}" aria-label="${t('Question','வினா')} ${i+1}${attempt.answers[i]!==null?(attempt.answers[i]===qs[i].answer?t(', correct',', சரி'):t(', incorrect',', தவறு')):''}" ${attempt.index===i?'aria-current="step"':''}>${i+1}</button>`).join('')}</div><div class="map-key"><span><i class="key-correct"></i>${t('Correct','சரி')}</span><span><i class="key-incorrect"></i>${t('Incorrect','தவறு')}</span><span><i class="key-unanswered"></i>${t('Not yet','மீதமுள்ளது')}</span></div><button class="primary" data-submit>${t('Submit practice','பயிற்சியைச் சமர்ப்பி')}${icon('check')}</button><p class="fine-print">${t('Your answers are saved on this device. The timer keeps running when you leave this screen.','உங்கள் விடைகள் இச்சாதனத்தில் சேமிக்கப்படும். இந்தப் பக்கத்தை விட்டு வெளியேறினாலும் நேரம் தொடர்ந்து இயங்கும்.')}</p></aside></div>`;
}
function resultScreen() {
  if (!result) { view='progress'; return progressScreen(); }
  const qs=practiceQuestions(result), skipped=result.answers.filter(a=>a===null).length, wrong=qs.length-result.score-skipped;
  const percentage=Math.round(result.score/qs.length*100);
  return `<div class="quiz-heading"><button class="circle-button" data-route="progress" aria-label="${t('Back to progress','முன்னேற்றத்திற்குத் திரும்பு')}">${icon('back')}</button><div><p class="eyebrow">${t('PRACTICE SET','பயிற்சித் தொகுப்பு')} ${result.set}</p><h1>${t('Look how far you’ve come.','உங்கள் பயிற்சியின் முடிவு.')}</h1></div></div>
  <section class="result-banner"><div><span class="pill-label">${icon(result.expired?'clock':'check')}${result.expired?t('Time is up','நேரம் முடிந்தது'):t('Practice complete','பயிற்சி நிறைவடைந்தது')}</span><h2>${t('Every answer.<br>A step forward.','ஒவ்வொரு விடையும்<br>ஒரு முன்னேற்றம்.')}</h2><p>${t('Keep your curiosity. Keep growing.','ஆர்வத்துடன் கற்றலைத் தொடருங்கள்.')}</p><button class="primary" data-route="practice">${t('Try another practice','அடுத்த பயிற்சி')}${icon('arrow')}</button></div><div class="score-ring" style="--score:${percentage}%"><div><strong>${percentage}<small>%</small></strong><span>${result.score} / ${qs.length} ${t('correct','சரி')}</span></div></div></section>
  <div class="result-counts"><div><i class="mint">${icon('check')}</i><strong>${result.score}</strong><span>${t('Correct','சரி')}</span></div><div><i class="pink">${icon('close')}</i><strong>${wrong}</strong><span>${t('Incorrect','தவறு')}</span></div><div><i class="lilac">${icon('clock')}</i><strong>${skipped}</strong><span>${t('Unanswered','விடையளிக்காதவை')}</span></div></div>
  ${wrong>0?`<button class="primary retry-button" data-retry>${icon('play')}${t('Retry incorrect answers','தவறான விடைகளை மீண்டும் பயில்க')} (${wrong})</button>`:''}${sectionHeading(t('Review & rediscover','விடைகளும் விளக்கங்களும்'))}<div class="filter-chips">${[['all',t('All questions','அனைத்தும்')],['correct',t('Correct','சரி')],['incorrect',t('Incorrect','தவறு')],['unanswered',t('Unanswered','விடையளிக்காதவை')]].map(([key,label])=>`<button class="chip ${reviewFilter===key?'active':''}" data-review-filter="${key}" aria-pressed="${reviewFilter===key}">${label}</button>`).join('')}</div><div class="review-list">${qs.map((q,i)=>{const a=result.answers[i],status=a===null?'unanswered':a===q.answer?'correct':'incorrect';if(reviewFilter!=='all'&&reviewFilter!==status)return '';return `<details class="review-item ${status}"><summary><span class="review-number">${i+1}</span><span>${escapeHTML(q.text[lang])}</span><span class="review-status ${status}">${status==='correct'?icon('check'):status==='unanswered'?icon('clock'):icon('close')}</span></summary><div class="review-content"><p class="review-answer ${status}">${t('Your answer','உங்கள் விடை')}: <strong>${a===null?'—':escapeHTML(option(q,a))}</strong></p><p class="review-answer correct">${t('Correct answer','சரியான விடை')}: <strong>${escapeHTML(option(q,q.answer))}</strong></p><div class="explanation"><strong>${t('Let’s understand why','விளக்கம்')}</strong><p>${escapeHTML(q.explanation[lang])}</p>${q.option_explanations&&a!==null&&a!==q.answer?`<p>${escapeHTML(q.option_explanations[a][lang])}</p>`:''}</div>${q.source?`<p class="source-note">${escapeHTML(q.source[lang])}</p>`:''}</div></details>`;}).join('') || `<div class="empty-state">${icon('check')}<h2>${t('No questions in this group','இந்தப் பிரிவில் வினாக்கள் இல்லை')}</h2></div>`}</div>`;
}
function progressScreen() {
  const average=history.length?Math.round(history.reduce((n,r)=>n+r.score/r.total*100,0)/history.length):0;
  return `<div class="page-heading"><div><p class="eyebrow">${t('EVERY EFFORT COUNTS','ஒவ்வொரு முயற்சியும் முக்கியம்')}</p><h1>${t('Your journey,<br>one step at a time.','உங்கள் கற்றல்<br>பயணம்.')}</h1></div><span class="heading-spark">${icon('chart')}</span></div><div class="progress-summary"><div class="blue"><span>${t('Sets completed','முடித்த தொகுப்புகள்')}</span><strong>${completedSets.size}</strong></div><div class="mint"><span>${t('Practices completed','முடித்த பயிற்சிகள்')}</span><strong>${history.length}</strong></div><div class="pink"><span>${t('Average score','சராசரி மதிப்பெண்')}</span><strong>${average}%</strong></div><div class="lilac"><span>${t('Questions attempted','முயன்ற வினாக்கள்')}</span><strong>${history.reduce((n,r)=>n+r.answers.filter(a=>a!==null).length,0)}</strong></div></div>
  ${trackingStatusCard()}${sectionHeading(t('Your recent practices','சமீபத்திய பயிற்சிகள்'))}${history.length?`<div class="history-list">${history.map((r,i)=>`<button class="subject-row" data-history="${i}"><span class="subject-icon ${i%2?'pink':'mint'}">${icon('book')}</span><span class="row-copy"><strong>${t('Set','தொகுப்பு')} ${r.set} · ${r.indices?t('Retry mistakes','தவறுகளை மீண்டும் பயில்க'):r.snapshot?escapeHTML(r.snapshot[0].subject):typeName(r.type)}</strong><small>${new Date(r.date).toLocaleDateString(lang?'ta-IN':'en-IN',{day:'numeric',month:'short',year:'numeric'})} · ${r.score} / ${r.total}</small></span><span class="history-score">${Math.round(r.score/r.total*100)}%</span><span class="round-arrow">${icon('arrow')}</span></button>`).join('')}</div>`:`<section class="empty-state"><span class="empty-icon mint">${icon('chart')}</span><h2>${t('Your first chapter is waiting.','உங்கள் முதல் பயிற்சி காத்திருக்கிறது.')}</h2><p>${t('Complete a practice to see your scores and revisit your answers here.','ஒரு பயிற்சியை முடித்ததும் மதிப்பெண்களையும் விடைகளையும் இங்கே காணலாம்.')}</p><button class="primary" data-route="practice">${t('Start your first practice','முதல் பயிற்சியைத் தொடங்கு')}${icon('arrow')}</button></section>`}<p class="fine-print">${t('Your latest 200 attempts and all completed set numbers are stored on this device and browser.','கடைசி 200 முயற்சிகளும் முடித்த அனைத்துத் தொகுப்பு எண்களும் இந்தச் சாதனத்தின் உலாவியில் சேமிக்கப்படும்.')}</p>`;
}
function profileScreen() {
  const installed=!!window.NMMS_NATIVE || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const local=location.protocol==='file:';
  return `<div class="page-heading"><div><p class="eyebrow">${t('MADE FOR YOUR JOURNEY','உங்களுக்கான கற்றல்')}</p><h1>${t('A space<br>to make your own.','உங்களுக்கான<br>கற்றல் தளம்.')}</h1></div><span class="heading-spark">${icon('user')}</span></div><div class="profile-layout"><section class="profile-card"><div class="profile-avatar">K<span>${icon('spark')}</span></div><h2>${escapeHTML(t('Hello, ','வணக்கம், ')+(currentStudent()?.name || '')+'.')}</h2><p>${t('Your next possibility starts with a little practice.','உங்கள் அடுத்த சாதனை ஒரு சிறு பயிற்சியுடன் தொடங்குகிறது.')}</p><span class="pill-label">${t('NMMS · Class 8','NMMS · வகுப்பு 8')}</span></section><div class="settings-list">${androidDownloadCard()}${studentDetailsCard()}${trackingStatusCard()}${sheetSyncCard()}<section class="setting-card"><span class="subject-icon mint">${icon('spark')}</span><div><h2>${t('Answer sounds','விடை ஒலிகள்')}</h2><p>${t('Hear a short tone after each answer.','ஒவ்வொரு விடைக்குப் பின்னரும் சிறிய ஒலியைக் கேளுங்கள்.')}</p><button class="secondary" data-sound aria-pressed="${soundEnabled}">${soundEnabled?t('Sound: On','ஒலி: இயக்கு'):t('Sound: Off','ஒலி: நிறுத்து')}</button></div></section><section class="setting-card"><span class="subject-icon lilac">${icon('globe')}</span><div><h2>${t('Learn in your language','உங்கள் மொழியில் கற்றிடுங்கள்')}</h2><label for="profile-language">${t('App & question language','பயன்பாடு மற்றும் வினாக்களின் மொழி')}</label><select id="profile-language"><option value="en" ${!lang?'selected':''}>English</option><option value="ta" ${lang?'selected':''}>தமிழ்</option></select></div></section><section class="setting-card"><span class="subject-icon mint">${icon('download')}</span><div><h2>${installed?t('Your learning app is installed','செயலி நிறுவப்பட்டுள்ளது'):t('Take learning with you','கற்றலை உங்களுடன் எடுத்துச் செல்லுங்கள்')}</h2><p>${local?t('For installation and offline access, open the app through the included Start NMMS launcher or an HTTPS website.','நிறுவவும் இணையமின்றிப் பயன்படுத்தவும் Start NMMS துவக்கி அல்லது HTTPS இணையதளம் வழியாகத் திறக்கவும்.'):installed?t('Open Kalvimurasu from your home screen anytime.','முகப்புத் திரையிலிருந்து எப்போது வேண்டுமானாலும் திறக்கலாம்.'):t('Install Kalvimurasu for a focused, full-screen experience.','முழுத்திரையில் பயன்படுத்த கலவிமுரசு செயலியை நிறுவுங்கள்.')}</p>${installPrompt?`<button class="primary" data-install>${icon('download')}${t('Install app','செயலியை நிறுவு')}</button>`:!installed&&!local?`<p class="fine-print">${t('Use your browser’s Install app option. On iPhone: Share → Add to Home Screen.','உலாவியின் Install app விருப்பத்தைப் பயன்படுத்துங்கள். iPhone: Share → Add to Home Screen.')}</p>`:''}<p class="offline-label">${offlineReady?icon('check'):icon('clock')}${offlineReady?t('Ready for offline practice','இணையமின்றிப் பயிற்சி செய்யத் தயார்'):local?t('Browser preview mode','உலாவி முன்னோட்டம்'):t('Offline access becomes ready after the first complete download.','முதல் பதிவிறக்கம் முடிந்ததும் இணையமின்றிப் பயன்படுத்தலாம்.')}</p></div></section><section class="setting-card"><span class="subject-icon pink">${icon('book')}</span><div><h2>${t('A little about Kalvimurasu','கல்விமுரசு பற்றி')}</h2><p>${t('25,000 bundled practice questions, plus your synced Google Sheets subjects. Tamil and English explanations for everyday progress.','25,000 உள்ளமைந்த பயிற்சி வினாக்களுடன் உங்கள் கூகுள் தாள் பாடங்களும். தமிழ் மற்றும் ஆங்கில விளக்கங்களுடன் தினசரி பயிற்சி.')}</p><p class="fine-print">${t('Original practice material · Not an official question paper.','அசல் பயிற்சி வினாக்கள் · அதிகாரப்பூர்வ வினாத்தாள் அல்ல.')}</p></div></section></div></div>`;
}
function render() {
  if(!currentStudent()) view='onboarding';
  nav.hidden=view==='onboarding';
  document.documentElement.lang=lang?'ta':'en';
  app.dataset.screen=view;
  const screens={onboarding:onboardingScreen,home:homeScreen,practice:practiceScreen,quiz:quizScreen,result:resultScreen,progress:progressScreen,profile:profileScreen};
  app.innerHTML=screens[view]();
  const current=view==='quiz'?'practice':view==='result'?'progress':view;
  nav.innerHTML=[['home','home',t('Home','முகப்பு')],['practice','book',t('Practice','பயிற்சி')],['progress','chart',t('Progress','முன்னேற்றம்')],['profile','user',t('Profile','சுயவிவரம்')]].map(([id,glyph,label])=>`<button data-route="${id}" class="nav-item ${current===id?'active':''}" ${current===id?'aria-current="page"':''}>${icon(glyph)}<span>${label}</span></button>`).join('');
  document.querySelector('#header-language').value=lang?'ta':'en';
  document.querySelector('#menu-button').innerHTML=icon('menu');
  document.querySelector('#profile-button').innerHTML=icon('user');
  document.querySelector('#menu-content').innerHTML=`<h2>${t('Your learning space','உங்கள் கற்றல் தளம்')}</h2>${[['home',t('Home','முகப்பு')],['practice',t('Practice','பயிற்சி')],['progress',t('Progress','முன்னேற்றம்')],['profile',t('Profile & install','சுயவிவரம் & நிறுவல்')]].map(([id,label])=>`<button class="menu-link" data-route="${id}">${label}${icon('arrow')}</button>`).join('')}`;
  document.querySelector('#storage-message').hidden=!storageFailed;
  document.querySelector('#storage-message').textContent=t('Your browser could not save progress. Keep this tab open to retain this attempt.','உலாவியில் முன்னேற்றத்தைச் சேமிக்க இயலவில்லை. இந்தப் பக்கத்தைத் திறந்து வைத்திருங்கள்.');
  document.title=`${t('Kalvimurasu','கல்விமுரசு')} · NMMS`;
  if(view==='quiz') tick();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b||b.disabled)return;
  if(b.hasAttribute('data-edit-student')){editingStudent=true;studentError='';route('profile');return;}
  if(b.hasAttribute('data-cancel-student')){editingStudent=false;studentError='';render();return;}
  if(b.hasAttribute('data-sync-progress')){syncStudentProgress();return;}
  if(b.dataset.route){route(b.dataset.route);return;}
  if(b.hasAttribute('data-start')){start(b.dataset.start,Number(b.dataset.set));return;}
  if(b.dataset.subject){filter=b.dataset.subject;activeSet=subjects.find(s=>s.key===filter).start;route('practice');return;}
  if(b.dataset.filter){filter=b.dataset.filter;activeSet=filter==='all'||filter==='mixed'?1:subjects.find(s=>s.key===filter).start;render();return;}
  if(b.hasAttribute('data-answer')){answerQuestion(Number(b.dataset.answer));return;}
  if(b.hasAttribute('data-connect-sheet')){const address=document.querySelector('#sheet-endpoint').value;syncSheets(address);return;}
  if(b.hasAttribute('data-sync-sheet')){syncSheets();return;}
  if(b.hasAttribute('data-sound')){soundEnabled=!soundEnabled;persist();render();return;}
  if(b.hasAttribute('data-retry')){retryIncorrect();return;}
  if(b.hasAttribute('data-question')&&attempt){const i=Number(b.dataset.question);if(i>=0&&i<attempt.answers.length){attempt.index=i;persist();render();document.querySelector('#question-title')?.scrollIntoView({block:'nearest'});}return;}

  if(b.hasAttribute('data-submit')&&attempt){const missing=attempt.answers.filter(a=>a===null).length;document.querySelector('#submit-title').textContent=t('Ready to finish?','சமர்ப்பிக்கத் தயாரா?');document.querySelector('#submit-copy').textContent=missing?t(`${missing} unanswered questions. Submit now and explore your answers?`,`${missing} வினாக்களுக்கு விடையளிக்கவில்லை. சமர்ப்பித்து விடைகளைக் காணலாமா?`):t('Submit your practice and discover what you’ve learned.','பயிற்சியைச் சமர்ப்பித்து உங்கள் முடிவுகளைக் காணுங்கள்.');document.querySelector('#confirm-submit').textContent=t('Submit practice','சமர்ப்பி');document.querySelector('#cancel-submit').textContent=t('Keep practising','தொடர்ந்து பயிற்சி செய்');document.querySelector('#submit-dialog').showModal();return;}
  if(b.dataset.reviewFilter){reviewFilter=b.dataset.reviewFilter;render();return;}
  if(b.hasAttribute('data-history')){result=history[Number(b.dataset.history)];reviewFilter='all';route('result');return;}
  if(b.hasAttribute('data-install')) installApp();
});
document.addEventListener('submit',e=>{
  if(e.target.id!=='student-form')return;
  e.preventDefault();
  saveStudent({name:document.querySelector('#student-name').value,school:document.querySelector('#student-school').value,className:document.querySelector('#student-class').value,section:document.querySelector('#student-section').value,rollNumber:document.querySelector('#student-roll').value});
});
document.addEventListener('change',e=>{
  if(e.target.id==='practice-set'){activeSet=Number(e.target.value);render();}
  if(['header-language','profile-language'].includes(e.target.id)){lang=e.target.value==='ta'?1:0;persist();render();}
});
document.querySelector('#menu-button').onclick=()=>document.querySelector('#menu-dialog').showModal();
document.querySelector('#close-menu').onclick=()=>document.querySelector('#menu-dialog').close();
document.querySelector('#confirm-submit').onclick=()=>finish(secondsLeft()===0);
document.querySelector('#cancel-submit').onclick=()=>document.querySelector('#submit-dialog').close();
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;if(view==='profile')render();});
window.addEventListener('appinstalled',()=>{installPrompt=null;if(view==='profile')render();});
async function installApp(){if(!installPrompt)return;try{await installPrompt.prompt();await installPrompt.userChoice;}finally{installPrompt=null;if(view==='profile')render();}}
window.addEventListener('pagehide',persist);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();syncSheets(undefined,true);syncStudentProgress();}});
window.addEventListener('online',()=>{lastSyncAttempt=0;syncSheets(undefined,true);syncStudentProgress();});
setInterval(()=>{if(!document.hidden){syncSheets(undefined,true);syncStudentProgress();}},300000);
setInterval(tick,1000);
render();tick();
if(!window.NMMS_NATIVE && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  let updateRequested = false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(updateRequested) location.reload();
  });
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(registration=>{
    function showUpdate(){
      if(!registration.waiting || !navigator.serviceWorker.controller || document.querySelector('#pwa-update')) return;
      const banner=document.createElement('aside');
      banner.id='pwa-update';banner.className='pwa-update';banner.setAttribute('role','status');
      const message=document.createElement('span');
      message.textContent=t('A new version is ready. Your practice is saved.','புதிய பதிப்பு தயார். உங்கள் பயிற்சி சேமிக்கப்பட்டுள்ளது.');
      const button=document.createElement('button');button.className='primary';
      button.textContent=t('Update now','இப்போது புதுப்பி');
      button.onclick=()=>{
        persist();updateRequested=true;button.disabled=true;
        registration.waiting?.postMessage({type:'ACTIVATE_UPDATE'});
      };
      banner.append(message,button);document.body.append(banner);
    }
    showUpdate();
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      worker?.addEventListener('statechange',()=>{if(worker.state==='installed')showUpdate();});
    });
    const checkUpdate=()=>{if(navigator.onLine!==false)registration.update().catch(()=>{});};
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdate();});
    window.addEventListener('online',checkUpdate);
    setInterval(()=>{if(!document.hidden)checkUpdate();},300000);
    return navigator.serviceWorker.ready;
  }).then(()=>{offlineReady=true;if(view==='profile')render();}).catch(()=>{offlineReady=false;});
}

// Android delegates its system Back action here so leaving a quiz preserves it.
window.nmmsBack = function () {
  const dialog = document.querySelector('dialog[open]');
  if (dialog) { dialog.close(); return true; }
  if (view === 'home' || view === 'onboarding') return false;
  route(view === 'quiz' ? 'practice' : view === 'result' ? 'progress' : 'home');
  return true;
};

loadSheetBank();

window.StudentTracking.onChange=()=>{if((view==='profile' && !editingStudent) || view==='progress')render();};
syncStudentProgress();
