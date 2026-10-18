/* Student identity and a durable, acknowledged, offline-first progress outbox. */
(function (root) {
  'use strict';
  const KEY='kalvimurasu-student-v1', MAX_PENDING=1000;
  let busy=false, error='';
  const empty=()=>({profile:null,queue:[],lastSync:null});
  function read() {
    const value=JSON.parse(root.localStorage.getItem(KEY) || 'null');
    if (!value) return empty();
    if (!Array.isArray(value.queue)) throw new Error('Student storage could not be read.');
    return value;
  }
  function commit(value) { root.localStorage.setItem(KEY,JSON.stringify(value)); notify(); }
  function notify() { if(typeof api.onChange==='function') api.onChange(); }
  function uuid() {
    if(root.crypto?.randomUUID) return root.crypto.randomUUID();
    if(!root.crypto?.getRandomValues) throw new Error('Secure student ID generation is unavailable.');
    return Array.from(root.crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
  }
  function clean(value,label,max,optional=false) {
    if(typeof value!=='string' || value.trim().length>max || (!optional && !value.trim())) throw new Error(label);
    return value.trim();
  }
  function profile() { try { return read().profile; } catch { return null; } }
  function destination() { return root.SheetBank.endpoint(root.NMMS_PROGRESS_ENDPOINT || root.NMMS_SHEET_ENDPOINT || ''); }
  function saveProfile(fields) {
    const state=read(), now=Date.now();
    const student={id:state.profile?.id || uuid(),name:clean(fields.name,'Enter the student name.',100),school:clean(fields.school,'Enter the school name.',160),className:clean(fields.className,'Choose the class.',20),section:clean(fields.section || '','Section is too long.',20,true),rollNumber:clean(fields.rollNumber || '','Roll number is too long.',40,true),createdAt:state.profile?.createdAt || now,updatedAt:now};
    if(!['6','7','8','9','10','11','12'].includes(student.className)) throw new Error('Choose a class from 6 to 12.');
    const queue=state.queue.filter(event=>event.type!=='profile' || event.student.id!==student.id);
    if(queue.length>=MAX_PENDING) throw new Error('Sync pending results before saving more details.');
    queue.push({id:uuid(),type:'profile',student,destination:destination(),createdAt:now});
    commit({...state,profile:student,queue});
    return student;
  }
  function enqueueAttempt(result,subject,setKey) {
    const state=read(),student=state.profile;
    if(!student || result.studentId!==student.id) return false;
    const id=result.trackingId;
    if(!id) throw new Error('This practice has no tracking ID.');
    if(state.queue.some(event=>event.id===id)) return true;
    if(state.queue.length>=MAX_PENDING) throw new Error('The progress queue is full. Sync before completing more practices.');
    const answered=result.answers.filter(a=>a!==null).length;
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
  const api={profile,saveProfile,enqueueAttempt,status,flush,uuid,onChange:null};
  root.StudentTracking=api;
  if(typeof module!=='undefined') module.exports=api;
})(typeof window==='undefined'?globalThis:window);
