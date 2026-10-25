/* Student identity and a durable, acknowledged, offline-first progress outbox. */
(function (root) {
  'use strict';
  const KEY='kalvimurasu-student-v1', MAX_PENDING=1000;
  // District coverage: https://lokbhavan.tn.gov.in/districts-of-tamil-nadu/
  const districts=[["Ariyalur", "அரியலூர்"], ["Chengalpattu", "செங்கல்பட்டு"], ["Chennai", "சென்னை"], ["Coimbatore", "கோயம்புத்தூர்"], ["Cuddalore", "கடலூர்"], ["Dharmapuri", "தருமபுரி"], ["Dindigul", "திண்டுக்கல்"], ["Erode", "ஈரோடு"], ["Kallakurichi", "கள்ளக்குறிச்சி"], ["Kancheepuram", "காஞ்சிபுரம்"], ["Kanyakumari", "கன்னியாகுமரி"], ["Karur", "கரூர்"], ["Krishnagiri", "கிருஷ்ணகிரி"], ["Madurai", "மதுரை"], ["Mayiladuthurai", "மயிலாடுதுறை"], ["Nagapattinam", "நாகப்பட்டினம்"], ["Namakkal", "நாமக்கல்"], ["Perambalur", "பெரம்பலூர்"], ["Pudukkottai", "புதுக்கோட்டை"], ["Ramanathapuram", "இராமநாதபுரம்"], ["Ranipet", "இராணிப்பேட்டை"], ["Salem", "சேலம்"], ["Sivaganga", "சிவகங்கை"], ["Tenkasi", "தென்காசி"], ["Thanjavur", "தஞ்சாவூர்"], ["Theni", "தேனி"], ["The Nilgiris", "நீலகிரி"], ["Thiruvallur", "திருவள்ளூர்"], ["Thiruvarur", "திருவாரூர்"], ["Thoothukudi", "தூத்துக்குடி"], ["Tiruchirappalli", "திருச்சிராப்பள்ளி"], ["Tirunelveli", "திருநெல்வேலி"], ["Tirupathur", "திருப்பத்தூர்"], ["Tiruppur", "திருப்பூர்"], ["Tiruvannamalai", "திருவண்ணாமலை"], ["Vellore", "வேலூர்"], ["Viluppuram", "விழுப்புரம்"], ["Virudhunagar", "விருதுநகர்"]];

  let busy=false, error='';
  const empty=()=>({profile:null,queue:[],lastSync:null});
  function read() {
    const value=JSON.parse(root.localStorage.getItem(KEY) || 'null');
    if (!value) return empty();
    if (!Array.isArray(value.queue)) throw new Error('Student storage could not be read.');
    return value;
  }
  function commit(value) { root.localStorage.setItem(KEY,JSON.stringify(value)); notify(); }
  function notify() {
    // A failed UI refresh must not turn a successful durable save into a failure.
    try { if(typeof api.onChange==='function') api.onChange(); } catch { /* The next render can refresh status. */ }
  }
  function uuid() {
    if(root.crypto?.randomUUID) return root.crypto.randomUUID();
    if(!root.crypto?.getRandomValues) throw new Error('Secure student ID generation is unavailable.');
    return Array.from(root.crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
  }
  function clean(value,label,max,optional=false) {
    if(typeof value!=='string' || value.trim().length>max || (!optional && !value.trim())) throw new Error(label);
    return value.trim();
  }
  function validateProfile(fields) {
    fields=fields && typeof fields==='object' ? fields : {};
    const values={}, errors={};
    const limits={name:100,school:160,className:20,section:20,rollNumber:40,district:100,block:100};
    const messages={
      name:['Enter a name using letters, spaces, initials, apostrophes or hyphens (up to 100 characters).','பெயரை எழுத்துகள், இடைவெளி, முதலெழுத்துகள் அல்லது இணைப்புக்குறியுடன் உள்ளிடவும் (100 எழுத்துகள் வரை).'],
      school:['Enter a school name containing letters (up to 160 characters).','எழுத்துகள் உள்ள பள்ளிப் பெயரை உள்ளிடவும் (160 எழுத்துகள் வரை).'],
      className:['Choose a class from 6 to 12.','6 முதல் 12 வரை ஒரு வகுப்பைத் தேர்ந்தெடுக்கவும்.'],
      section:['Use letters, numbers, spaces, dots, slashes or hyphens (up to 20 characters).','பிரிவுக்கு எழுத்துகள், எண்கள், இடைவெளி அல்லது . / - பயன்படுத்தவும் (20 எழுத்துகள் வரை).'],
      district:['Choose a Tamil Nadu district.','தமிழ்நாடு மாவட்டத்தைத் தேர்ந்தெடுக்கவும்.'],
      block:['Enter a block name of up to 100 characters and choose its district.','100 எழுத்துகளுக்குள் வட்டாரப் பெயரை உள்ளிட்டு அதன் மாவட்டத்தைத் தேர்ந்தெடுக்கவும்.'],
      rollNumber:['Roll number must be text of up to 40 characters.','பதிவெண் 40 எழுத்துகளுக்குள் இருக்க வேண்டும்.']
    };
    for(const [key,max] of Object.entries(limits)) {
      const raw=fields[key] ?? '';
      values[key]=typeof raw==='string' ? raw.normalize('NFC').trim().replace(/ +/g,' ') : '';
      if(typeof raw!=='string' || values[key].length>max || /[\u0000-\u001f\u007f]/.test(values[key])) errors[key]=messages[key];
    }
    if(!/\p{L}/u.test(values.name) || !/^[\p{L}\p{M} .’'ʼ-]+$/u.test(values.name)) errors.name=messages.name;
    if(!/\p{L}/u.test(values.school)) errors.school=messages.school;
    if(!['6','7','8','9','10','11','12'].includes(values.className)) errors.className=messages.className;
    if(values.section && !/^[\p{L}\p{M}\p{N} ./-]+$/u.test(values.section)) errors.section=messages.section;
    if(values.district && !districts.some(d=>d[0]===values.district)) errors.district=messages.district;
    if(values.block && (!/\p{L}/u.test(values.block) || !values.district)) errors.block=messages.block;
    return {values,errors};
  }
  function profile() { try { return read().profile; } catch { return null; } }
  function destination() { return root.SheetBank.endpoint(root.NMMS_PROGRESS_ENDPOINT || root.NMMS_SHEET_ENDPOINT || ''); }
  function saveProfile(fields) {
    const checked=validateProfile(fields);
    if(Object.keys(checked.errors).length) { const error=new Error(Object.values(checked.errors)[0][0]);error.fields=checked.errors;throw error; }
    fields=checked.values;
    const state=read(), now=Date.now();
    const student={id:state.profile?.id || uuid(),name:clean(fields.name,'Enter the student name.',100),school:clean(fields.school,'Enter the school name.',160),className:clean(fields.className,'Choose the class.',20),section:clean(fields.section || '','Section is too long.',20,true),rollNumber:clean(fields.rollNumber || '','Roll number is too long.',40,true),district:fields.district,block:fields.block,createdAt:state.profile?.createdAt || now,updatedAt:now};
    if(!['6','7','8','9','10','11','12'].includes(student.className)) throw new Error('Choose a class from 6 to 12.');
    const queue=state.queue.filter(event=>event.type!=='profile' || event.student.id!==student.id);
    if(queue.length>=MAX_PENDING) throw new Error('Sync pending results before saving more details.');
    queue.push({id:uuid(),type:'profile',student,destination:destination(),createdAt:now});
    commit({...state,profile:student,queue});
    return student;
  }
  function enqueueAttempt(result,subject,setKey) {
    const state=read(),student=state.profile;
    if(!student || !result || result.studentId!==student.id) return false;
    const id=result.trackingId;
    if(typeof id!=='string' || !/^[A-Za-z0-9_-]{8,100}$/.test(id)) throw new Error('This practice has no valid tracking ID.');
    if(state.queue.some(event=>event.id===id)) return true;
    if(state.queue.length>=MAX_PENDING) throw new Error('The progress queue is full. Sync before completing more practices.');
    if(!Array.isArray(result.answers) || !Number.isInteger(result.total) || result.total<1 || result.total>25 || result.answers.length!==result.total || !result.answers.every(a=>a===null || Number.isInteger(a)&&a>=0&&a<4)) throw new Error('Invalid practice answers.');
    const answered=result.answers.filter(a=>a!==null).length;
    if(!Number.isInteger(result.score) || result.score<0 || result.score>answered || !Number.isFinite(result.started) || !Number.isFinite(result.date) || result.started<946684800000 || result.date>4102444800000 || result.date<result.started) throw new Error('Invalid practice score or time.');
    state.queue.push({id,type:'attempt',student,destination:destination(),createdAt:Date.now(),attempt:{subject:clean(subject,'Missing subject.',100),set:String(result.set),setKey:String(setKey),retry:!!result.indices,score:result.score,total:result.total,answered,startedAt:result.started,completedAt:result.date,durationSeconds:Math.max(0,Math.min(result.total*60,Math.round((result.date-result.started)/1000)))}});
    commit(state);return true;
  }
  function status() {
    try { const state=read();return {pending:state.queue.length,lastSync:state.lastSync,busy,error}; }
    catch { return {pending:0,lastSync:null,busy,error:'Student storage could not be read.'}; }
  }
  async function flush() {
    if(busy || root.navigator?.onLine===false) return false;
    busy=true; error='';notify();
    try {
      let remaining=read().queue;
      while(remaining.length) {
        const address=root.SheetBank.endpoint(remaining[0].destination);
        const batch=remaining.filter(item=>item.destination===address).slice(0,20);
        const controller=new AbortController();let timer;
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Progress upload timed out. It will retry.'));},30000)});
        let response;
        try {
          response=await Promise.race([timeout,(async()=>{
            const result=await root.fetch(address,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({schemaVersion:1,action:'syncProgress',events:batch.map(({destination,...event})=>event)}),redirect:'follow',credentials:'omit',signal:controller.signal});
            if(!result.ok) throw new Error('Progress upload failed. It will retry.');
            try { return JSON.parse(await result.text()); } catch { throw new Error('Update the Google Apps Script deployment to enable student tracking.'); }
          })()]);
        } finally { clearTimeout(timer); }
        if(response?.schemaVersion!==1 || response.ok!==true || !Array.isArray(response.acceptedIds)) throw new Error(response?.error || 'The server did not confirm progress storage.');
        const sent=new Set(batch.map(event=>event.id));
        const accepted=new Set(response.acceptedIds.filter(id=>sent.has(id)));
        if(!accepted.size) throw new Error('The server did not acknowledge these records.');
        // Re-read before acknowledging: new offline results may have arrived mid-upload.
        const state=read();
        commit({...state,queue:state.queue.filter(item=>!accepted.has(item.id)),lastSync:Date.now()});
        remaining=read().queue;
      }
      return true;
    } catch(cause) { error=cause.message || 'Progress could not be uploaded. It will retry.';return false; }
    finally { busy=false;notify(); }
  }
  const api={profile,districts,validateProfile,saveProfile,enqueueAttempt,status,flush,uuid,onChange:null};
  root.StudentTracking=api;
  if(typeof module!=='undefined') module.exports=api;
})(typeof window==='undefined'?globalThis:window);
