/* Read-only Google Sheets feed, validated before an atomic offline-cache update. */
(function (root) {
  'use strict';
  const DB = 'kalvimurasu-sheet-bank', STORE = 'bank';
  const MAX_QUESTIONS = 50000, MAX_TEXT = 12000;
  function text(value, label, required = true) {
    if (typeof value !== 'string' || value.length > MAX_TEXT || (required && !value.trim())) throw new Error(label);
    return value.trim();
  }
  function pair(value, label) {
    if (!Array.isArray(value) || value.length !== 2) throw new Error(label);
    return [text(value[0], label), text(value[1], label)];
  }
  function question(value) {
    if (!value || !['MAT','SAT'].includes(value.section) || !Number.isInteger(value.answer) || value.answer < 0 || value.answer > 3 || !Array.isArray(value.options) || value.options.length !== 4) throw new Error('Invalid question or answer.');
    return {
      id:text(value.id, 'Every sheet question needs a stable ID.'),
      subject:text(value.subject, 'Missing subject.'), section:value.section,
      topic:pair(value.topic,'Missing topic translations.'), text:pair(value.text,'Missing question translations.'),
      options:value.options.map(o=>pair(o,'Missing option translations.')),
      answer:value.answer, explanation:pair(value.explanation,'Missing explanation translations.')
    };
  }
  function validate(payload) {
    if (!payload || payload.error || payload.schemaVersion !== 1 || !Array.isArray(payload.subjects) || payload.subjects.length > 100) throw new Error(payload?.error || 'The link did not return a supported question feed.');
    const ids = new Set(); let count = 0;
    const subjects = payload.subjects.map(subject => {
      const id = text(subject.id, 'Missing sheet ID.'), name = text(subject.name, 'Missing sheet name.');
      if (!/^\d+$/.test(id) || ids.has(id) || name.length > 100 || !Array.isArray(subject.questions)) throw new Error('Invalid or duplicate sheet.');
      ids.add(id);
      const seen = new Set();
      const questions = subject.questions.map(raw => {
        const q = question(raw);
        if (q.subject !== name || seen.has(q.id)) throw new Error(`Duplicate question ID or wrong subject in ${name}.`);
        seen.add(q.id);
        if (++count > MAX_QUESTIONS) throw new Error('The feed exceeds 50,000 synced questions.');
        return q;
      });
      return {id, name, questions};
    });
    return {schemaVersion:1, subjects};
  }
  function endpoint(value) {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'script.google.com' || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) || url.username || url.password || url.search || url.hash || url.port) throw new Error('Paste the Apps Script web app /exec URL.');
    return url.href;
  }
  function open() {
    return new Promise((resolve,reject)=>{
      const request = root.indexedDB.open(DB,1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Offline storage unavailable.'));
      request.onblocked = () => reject(new Error('Close other app tabs to enable offline storage.'));
    });
  }
  async function read() {
    const db = await open();
    try {
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readonly'), request=tx.objectStore(STORE).get('current');
        request.onsuccess=()=>resolve(request.result || null);
        request.onerror=()=>reject(request.error);
      });
    } finally { db.close(); }
  }
  async function write(record) {
    const db = await open();
    try {
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).put(record,'current');
        tx.oncomplete=resolve;
        tx.onerror=()=>reject(tx.error || new Error('Could not save downloaded questions.'));
        tx.onabort=()=>reject(tx.error || new Error('Offline download was not saved.'));
      });
    } finally { db.close(); }
  }
  async function download(url, fetcher = root.fetch.bind(root)) {
    const address = endpoint(url), controller = new AbortController();
    let timer;
    const timeout = new Promise((_,reject)=>{
      timer=setTimeout(()=>{controller.abort();reject(new Error('Download timed out. Try Sync now when the connection improves.'));},30000);
    });
    try {
      return await Promise.race([timeout,(async()=>{
        const response = await fetcher(address,{signal:controller.signal,redirect:'follow',credentials:'omit',cache:'no-store'});
        if (!response.ok) throw new Error('Download failed. Check the deployment and internet connection.');
        const body = await response.text();
        if (body.length > 64000000) throw new Error('Question feed is too large.');
        let json;
        try { json=JSON.parse(body); } catch { throw new Error('The link returned a sign-in page or invalid JSON. Deploy the web app with access for Anyone.'); }
        return {endpoint:address, data:validate(json), syncedAt:Date.now()};
      })()]);
    } finally { clearTimeout(timer); }
  }

  root.SheetBank = {validate, question, endpoint, read, write, download};
  if (typeof module !== 'undefined') module.exports = root.SheetBank;
})(typeof window === 'undefined' ? globalThis : window);
