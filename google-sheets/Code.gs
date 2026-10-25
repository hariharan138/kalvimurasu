/** Question feed plus write-only student progress collection. Student tabs are private. */
// Preconfigured for the question bank created in your Google Drive.
const DEFAULT_SPREADSHEET_ID = '1KnndwSFjBE9wND0EkfdeMMMIV5RZaoVX-EplY1fd6kI';
const HEADERS = ['id','question_en','question_ta','option_a_en','option_a_ta','option_b_en','option_b_ta','option_c_en','option_c_ta','option_d_en','option_d_ta','answer','explanation_en','explanation_ta','topic_en','topic_ta','section','enabled'];

// Run once from Extensions > Apps Script. Existing nonempty tabs are never changed.
function setupQuestionSheets() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Open Apps Script from your Google Sheet.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', book.getId());
  const samples = {
    'Science':['science-001','Which gas do plants absorb during photosynthesis?','ஒளிச்சேர்க்கையின்போது தாவரங்கள் எந்த வாயுவை உறிஞ்சுகின்றன?','Oxygen','ஆக்சிஜன்','Carbon dioxide','கார்பன் டை ஆக்சைடு','Nitrogen','நைட்ரஜன்','Hydrogen','ஹைட்ரஜன்','B','Plants use carbon dioxide to make food during photosynthesis.','ஒளிச்சேர்க்கையின்போது உணவு தயாரிக்கத் தாவரங்கள் கார்பன் டை ஆக்சைடைப் பயன்படுத்துகின்றன.','Photosynthesis','ஒளிச்சேர்க்கை','SAT','TRUE'],
    'Mathematics':['math-001','What is 12 × 8?','12 × 8 எவ்வளவு?','84','84','88','88','96','96','108','108','C','12 × 8 = 96.','12 × 8 = 96.','Multiplication','பெருக்கல்','SAT','TRUE'],
    'Social Science':['social-001','What is the capital of Tamil Nadu?','தமிழ்நாட்டின் தலைநகரம் எது?','Madurai','மதுரை','Chennai','சென்னை','Salem','சேலம்','Coimbatore','கோயம்புத்தூர்','B','Chennai is the capital of Tamil Nadu.','சென்னை தமிழ்நாட்டின் தலைநகரம் ஆகும்.','Tamil Nadu','தமிழ்நாடு','SAT','TRUE'],
    'MAT':['mat-001','Continue the series: 2, 4, 8, 16, ?','தொடரை நிறைவு செய்க: 2, 4, 8, 16, ?','18','18','24','24','30','30','32','32','D','Each number is doubled: 16 × 2 = 32.','ஒவ்வொரு எண்ணும் இரட்டிப்பாகிறது: 16 × 2 = 32.','Number series','எண் தொடர்','MAT','TRUE']
  };
  Object.keys(samples).forEach(name=>{
    const sheet=book.getSheetByName(name) || book.insertSheet(name);
    if (sheet.getLastRow() > 0) return;
    sheet.getRange(1,1,2,HEADERS.length).setValues([HEADERS,samples[name]]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,HEADERS.length).setBackground('#20211f').setFontColor('#ffffff').setFontWeight('bold');
    sheet.getRange('L2:L1000').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['A','B','C','D'],true).setAllowInvalid(false).build());
    sheet.getRange('R2:R1000').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['TRUE','FALSE'],true).setAllowInvalid(false).build());
    sheet.autoResizeColumns(1,HEADERS.length);
    sheet.setColumnWidths(2,10,180);
    sheet.setColumnWidths(13,2,280);
    sheet.getRange(1,1,2,HEADERS.length).setWrap(true);
  });
  console.log('Ready: '+book.getUrl());
}

function doGet() {
  let result;
  try {
    const id=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID;
    if (!id) throw new Error('Run setupQuestionSheets once before deploying.');
    const book=SpreadsheetApp.openById(id);
    let total=0;
    const subjects=book.getSheets().filter(s=>!s.isSheetHidden() && !s.getName().startsWith('_')).flatMap(sheet=>{
      if (sheet.getLastRow() === 0) return [];
      if (sheet.getLastRow() > 50001 || sheet.getLastColumn() > 100) throw new Error(sheet.getName()+': sheet exceeds supported size.');
      const rows=sheet.getDataRange().getDisplayValues();
      const headers=rows.shift().map(v=>v.trim().toLowerCase());
      if (!headers.includes('question_en')) return []; // Notes and unrelated tabs are not exported.
      const required=HEADERS.filter(h=>!['section','enabled'].includes(h));
      const missing=required.filter(h=>!headers.includes(h));
      if(missing.length) throw new Error(sheet.getName()+': missing headers '+missing.join(', '));
      if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error(sheet.getName()+': duplicate headers.');
      const seen=new Set();
      const questions=rows.flatMap((row,index)=>{
        if(row.every(v=>!v.trim())) return [];
        const get=h=>(row[headers.indexOf(h)] || '').trim();
        if (['FALSE','NO','0'].includes(get('enabled').toUpperCase())) return [];
        required.forEach(h=>{if(!get(h)) throw new Error(sheet.getName()+' row '+(index+2)+': missing '+h);});
        const key=get('id');
        if(seen.has(key)) throw new Error(sheet.getName()+' row '+(index+2)+': duplicate ID '+key);
        seen.add(key);
        const answer=get('answer').toUpperCase();
        if(!['A','B','C','D'].includes(answer)) throw new Error(sheet.getName()+' row '+(index+2)+': answer must be A, B, C, or D.');
        const section=get('section').toUpperCase() || (sheet.getName().toUpperCase()==='MAT'?'MAT':'SAT');
        if(!['MAT','SAT'].includes(section)) throw new Error(sheet.getName()+' row '+(index+2)+': section must be MAT or SAT.');
        if(++total>50000) throw new Error('The feed supports up to 50,000 questions.');
        return [{id:key,subject:sheet.getName(),section,topic:[get('topic_en'),get('topic_ta')],text:[get('question_en'),get('question_ta')],options:['a','b','c','d'].map(letter=>[get('option_'+letter+'_en'),get('option_'+letter+'_ta')]),answer:'ABCD'.indexOf(answer),explanation:[get('explanation_en'),get('explanation_ta')]}];
      });
      return [{id:String(sheet.getSheetId()),name:sheet.getName(),questions}];
    });
    result={schemaVersion:1,subjects};
  } catch(error) { result={schemaVersion:1,error:String(error.message || error)}; }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// Tracking tabs are deliberately excluded from doGet and are never returned to app visitors.
const STUDENT_HEADERS=['student_id','name','school','class','section','roll_number','registered_at','last_active_at','practices_completed','sets_completed','questions_answered','correct_answers','total_questions','average_score_percent','study_minutes','last_sync_at','profile_updated_at','district','block'];
const PROGRESS_HEADERS=['event_id','student_id','student_name','school','class','subject','practice_set','set_key','is_retry','score','total','answered','wrong','skipped','percentage','duration_seconds','started_at','completed_at','received_at'];
function trackingBook_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || DEFAULT_SPREADSHEET_ID);
}
function trackingSheet_(book,name,headers) {
  const sheet=book.getSheetByName(name) || book.insertSheet(name);
  if(sheet.getMaxColumns && sheet.getMaxColumns()<headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
  if(!sheet.getLastRow()) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,headers.length).setBackground('#f1f3f4').setFontWeight('bold').setWrap(true);
    sheet.setColumnWidths(1,headers.length,150);
  } else {
    const actual=sheet.getRange(1,1,1,headers.length).getDisplayValues()[0];
    if(name==='_Students' && actual.slice(0,17).join('|')===headers.slice(0,17).join('|') && actual.slice(17).every(v=>!v)) {
      sheet.getRange(1,18,1,2).setValues([headers.slice(17)]);
    } else if(actual.join('|')!==headers.join('|')) throw new Error('Tracking tab headers do not match. Restore the supplied headers.');
  }
  return sheet;
}
function setupStudentTracking() {
  const book=trackingBook_();
  trackingSheet_(book,'_Students',STUDENT_HEADERS);
  trackingSheet_(book,'_Progress',PROGRESS_HEADERS);
}
function trackingWriteRows_(sheet,row,values) {
  const required=row+values.length-1;
  if(required>sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),required-sheet.getMaxRows());
  sheet.getRange(row,1,values.length,values[0].length).setValues(values);
}
function trackText_(value,max,optional) {
  if(typeof value!=='string' || value.trim().length>max || (!optional && !value.trim())) throw new Error('Invalid student or practice field.');
  return value.trim();
}
function trackId_(value) {
  const id=trackText_(value,100,false);
  if(!/^[A-Za-z0-9_-]{8,100}$/.test(id)) throw new Error('Invalid record ID.');
  return id;
}
function trackTime_(value) {
  if(!Number.isFinite(value) || value<946684800000 || value>4102444800000) throw new Error('Invalid record timestamp.');
  return value;
}
function trackEvent_(event) {
  if(!event || !['profile','attempt'].includes(event.type)) throw new Error('Unsupported tracking event.');
  const raw=event.student;
  if(!raw) throw new Error('Student details are missing.');
  const student={id:trackId_(raw.id),name:trackText_(raw.name,100),school:trackText_(raw.school,160),className:trackText_(raw.className,20),section:trackText_(raw.section || '',20,true),rollNumber:trackText_(raw.rollNumber || '',40,true),district:raw.district===undefined?undefined:trackText_(raw.district,100,true),block:raw.block===undefined?undefined:trackText_(raw.block,100,true),createdAt:trackTime_(raw.createdAt),updatedAt:trackTime_(raw.updatedAt)};
  if(!['6','7','8','9','10','11','12'].includes(student.className)) throw new Error('Invalid class.');
  const clean={id:trackId_(event.id),type:event.type,student};
  if(event.type==='attempt') {
    const a=event.attempt;
    if(!a || !Number.isInteger(a.total) || a.total<1 || a.total>25 || !Number.isInteger(a.score) || !Number.isInteger(a.answered) || a.score<0 || a.score>a.answered || a.answered>a.total || !Number.isInteger(a.durationSeconds) || a.durationSeconds<0 || a.durationSeconds>a.total*60 || typeof a.retry!=='boolean') throw new Error('Invalid practice totals.');
    const startedAt=trackTime_(a.startedAt), completedAt=trackTime_(a.completedAt);
    if(completedAt<startedAt) throw new Error('Practice completion predates its start.');
    clean.attempt={subject:trackText_(a.subject,100),set:trackText_(a.set,20),setKey:trackText_(a.setKey,300),retry:a.retry,score:a.score,total:a.total,answered:a.answered,durationSeconds:a.durationSeconds,startedAt,completedAt};
  }
  return clean;
}
// Ensure submitted names and other text can never become executable sheet formulas.
function trackingCell_(value) { return typeof value==='string' && /^[=+@-]/.test(value.trimStart()) ? "'"+value : value; }
function doPost(e) {
  const lock=LockService.getScriptLock();let locked=false,result;
  try {
    const body=e && e.postData && e.postData.contents;
    if(typeof body!=='string' || body.length>200000) throw new Error('Invalid tracking request.');
    const payload=JSON.parse(body);
    if(payload.schemaVersion!==1 || payload.action!=='syncProgress' || !Array.isArray(payload.events) || !payload.events.length || payload.events.length>20) throw new Error('Unsupported tracking request.');
    const events=payload.events.map(trackEvent_);
    locked=lock.tryLock(10000);
    if(!locked) throw new Error('Tracking is busy. Please retry.');
    const book=trackingBook_(), students=trackingSheet_(book,'_Students',STUDENT_HEADERS), progress=trackingSheet_(book,'_Progress',PROGRESS_HEADERS);
    const logs=progress.getLastRow()>1?progress.getRange(2,1,progress.getLastRow()-1,PROGRESS_HEADERS.length).getValues():[];
    const existing=new Map(logs.map(row=>[String(row[0]),String(row[1])]));
    const additions=[], now=new Date().toISOString();
    for(const event of events) {
      if(event.type!=='attempt') continue;
      if(existing.has(event.id)) {
        if(existing.get(event.id)!==event.student.id) throw new Error('Record ID belongs to another student.');
        continue;
      }
      const a=event.attempt,p=event.student;
      const row=[event.id,p.id,p.name,p.school,p.className,a.subject,a.set,a.setKey,a.retry,a.score,a.total,a.answered,a.answered-a.score,a.total-a.answered,Math.round(a.score/a.total*1000)/10,a.durationSeconds,new Date(a.startedAt).toISOString(),new Date(a.completedAt).toISOString(),now];
      additions.push(row);logs.push(row);existing.set(event.id,p.id);
    }
    if(additions.length) trackingWriteRows_(progress,progress.getLastRow()+1,additions.map(row=>row.map(trackingCell_)));
    const records=students.getLastRow()>1?students.getRange(2,1,students.getLastRow()-1,STUDENT_HEADERS.length).getValues():[];
    const studentRows=new Map(records.map((row,index)=>[String(row[0]),index+2]));
    const profiles=new Map();
    for(const event of events) {
      const previous=profiles.get(event.student.id);
      if(!previous || event.student.updatedAt>=previous.updatedAt) profiles.set(event.student.id,event.student);
    }
    for(const [id,profile] of profiles) {
      const rowNumber=studentRows.get(id), previous=rowNumber?records[rowNumber-2]:null;
      const latest=!previous || profile.updatedAt>=Date.parse(String(previous[16]))?profile:{...profile,name:String(previous[1]),school:String(previous[2]),className:String(previous[3]),section:String(previous[4]),rollNumber:String(previous[5]),createdAt:Date.parse(String(previous[6])),updatedAt:Date.parse(String(previous[16])),district:String(previous[17] || ''),block:String(previous[18] || '')};
      const attempts=logs.filter(row=>String(row[1])===id);
      const sum=index=>attempts.reduce((n,row)=>n+Number(row[index]),0);
      const completed=new Set(attempts.filter(row=>row[8]!==true && row[8]!=='TRUE').map(row=>String(row[7]))).size;
      const average=attempts.length?Math.round(attempts.reduce((n,row)=>n+Number(row[9])/Number(row[10])*100,0)/attempts.length*10)/10:0;
      const lastActive=attempts.reduce((time,row)=>Math.max(time,Date.parse(String(row[17]))),latest.updatedAt);
      const row=[id,latest.name,latest.school,latest.className,latest.section,latest.rollNumber,previous?previous[6]:new Date(latest.createdAt).toISOString(),new Date(lastActive).toISOString(),attempts.length,completed,sum(11),sum(9),sum(10),average,Math.round(sum(15)/60*10)/10,now,new Date(latest.updatedAt).toISOString(),latest.district ?? previous?.[17] ?? '',latest.block ?? previous?.[18] ?? ''];
      trackingWriteRows_(students,rowNumber || students.getLastRow()+1,[row.map(trackingCell_)]);
    }
    SpreadsheetApp.flush();
    result={schemaVersion:1,ok:true,acceptedIds:events.map(event=>event.id)};
  } catch(error) { result={schemaVersion:1,ok:false,error:String(error.message || error)}; }
  finally { if(locked) lock.releaseLock(); }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
