'use strict';
const $ = id => document.getElementById(id);
const STORAGE = 'jingdu.v1';
const defaults = { book: 0, chapter: 1, selected: [], font: 20, bookmarks: {}, highlights: {}, notes: {}, savedPassages:{}, chat: [], autoSpeak:true };
let state = JSON.parse(JSON.stringify(defaults));
try { const saved = JSON.parse(localStorage.getItem(STORAGE)); if (saved && typeof saved === 'object') state = { ...state, ...saved }; } catch {}
delete state.dark;
for (const key of ['bookmarks','highlights','notes','savedPassages']) if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) state[key] = {};
state.selected = Array.isArray(state.selected) ? state.selected : Number.isInteger(state.selected) ? [state.selected] : [];
state.chat = Array.isArray(state.chat) ? state.chat.filter(t => t && ['user','assistant'].includes(t.role) && typeof t.text === 'string').slice(-100) : [];
state.chat.forEach(t => { if(t.pending){ t.pending=false; t.failed=true; } });
let bible, testament = 0, allVerses = [], toastTimer, resultMode = 'search', selectionAnchor = null, chatController = null;
let modelConfig = { configured:false, model:'qwen3.8-max', baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1' };
const book = () => bible.books[state.book];
const chapter = () => book().chapters.find(c => c.chapter === state.chapter);
const chapterKey = () => `${book().code}.${state.chapter}`;
const noteKey = () => `${chapterKey()}.${state.selected.length ? state.selected.join(',') : 'chapter'}`;
function verseRanges(values) { const groups=[]; for(const v of values){const last=groups.at(-1);if(last&&last[1]+1===v)last[1]=v;else groups.push([v,v]);}return groups.map(([a,b])=>a===b?String(a):`${a}-${b}`).join('、'); }
const reference = () => `${book().name} ${state.chapter}${state.selected.length ? ':' + verseRanges(state.selected) : ' 章'}`;
const selectedRows = () => chapter().verses.filter(v=>state.selected.includes(v.verse));
const assistantContext = () => ({bookCode:book().code,chapter:state.chapter,selectedVerses:[...state.selected]});
const make = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2600); }
function persist() { try { localStorage.setItem(STORAGE, JSON.stringify(state)); return true; } catch { toast('浏览器存储不可用，请导出笔记备份'); return false; } }
function appearance() { document.documentElement.style.setProperty('--verse-size', `${Math.min(28,Math.max(16,Number(state.font)||20))}px`); }
function renderBooks() {
  const query = $('book-filter').value.trim().toLowerCase();
  $('old-tab').classList.toggle('active', testament === 0); $('new-tab').classList.toggle('active', testament === 1);
  $('old-tab').setAttribute('aria-pressed', testament === 0); $('new-tab').setAttribute('aria-pressed', testament === 1);
  const nodes = bible.books.flatMap((b, index) => {
    if (query ? !`${b.name} ${b.code}`.toLowerCase().includes(query) : (index < 39 ? 0 : 1) !== testament) return [];
    const button = make('button', undefined, 'book-button' + (index === state.book ? ' active' : ''));
    button.append(make('strong', b.name), make('span', b.chapters.length));
    if (index === state.book) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => openChapters(index));
    return [button];
  });
  $('book-list').replaceChildren(...(nodes.length ? nodes : [make('p','没有找到这卷书','empty')]));
}
function updatePanel() {
  const selected = selectedRows();
  $('assistant-reference').textContent = reference();
  $('chat-context').hidden=!selected.length;
  $('selection-toolbar').hidden = !selected.length;
  $('selection-summary').textContent = `已选 ${selected.length} 节 · ${verseRanges(state.selected)}`;
  renderNotes();
}
function passageFromKey(key){
  const [code,number,selection]=key.split('.');const b=bible.books.find(row=>row.code===code),c=b?.chapters.find(row=>row.chapter===Number(number));
  if(!c)return null;
  const verses=selection==='chapter'?[]:selection?.split(',').map(Number);
  if(!verses||verses.some(v=>!c.verses.some(row=>row.verse===v)))return null;
  return {bookCode:code,chapter:Number(number),reference:`${b.name} ${number}${verses.length?':'+verseRanges(verses):' 章'}`,text:(verses.length?c.verses.filter(v=>verses.includes(v.verse)):c.verses).map(v=>`${v.verse} ${v.text}`).join('\n')};
}
function deleteSavedPassage(key){
  const passage=state.savedPassages[key];
  if(!passage||!confirm(`删除「${passage.reference||passageFromKey(key)?.reference}」这条读经笔记？\n保存的经文和补充笔记会一起删除，圣经正文不受影响。`))return;
  const annotation=state.notes[key];
  delete state.savedPassages[key];delete state.notes[key];
  if(!persist()){state.savedPassages[key]=passage;if(annotation!==undefined)state.notes[key]=annotation;return;}
  renderNotes();
  if($('search-dialog').open&&resultMode==='notes')saved();
  toast('已删除笔记');
}
function noteDeleteButton(key){
  const button=make('button','删除','subtle-button delete-note');button.type='button';
  button.setAttribute('aria-label',`删除 ${passageFromKey(key)?.reference} 的笔记`);
  button.onclick=()=>deleteSavedPassage(key);return button;
}
function renderNotes(){
  $('saved-count').textContent=Object.keys(state.savedPassages).filter(key=>passageFromKey(key)).length;
  const entries=Object.entries(state.savedPassages).filter(([key])=>key.startsWith(chapterKey()+'.'));
  const cards=entries.map(([key])=>{
    const saved=state.savedPassages[key];
    const passage=saved&&typeof saved.text==='string'&&typeof saved.reference==='string'?saved:passageFromKey(key);if(!passage)return null;
    const card=make('article',undefined,'saved-note');card.dataset.key=key;
    const heading=make('div',undefined,'saved-note-heading');heading.append(make('strong',passage.reference));
    const actions=make('div',undefined,'saved-note-actions');
    const copyButton=make('button','复制','subtle-button');copyButton.onclick=()=>copy(`${passage.reference}\n${passage.text}${state.notes[key]?'\n'+state.notes[key]:''}`);actions.append(copyButton,noteDeleteButton(key));heading.append(actions);
    card.append(heading,make('p',passage.text,'saved-scripture'));
    const details=make('details'),summary=make('summary',state.notes[key]?'编辑笔记':'补充笔记');
    const preview=make('p',typeof state.notes[key]==='string'?state.notes[key]:'','saved-note-text');preview.hidden=!preview.textContent;
    const input=make('textarea');input.value=typeof state.notes[key]==='string'?state.notes[key]:'';input.placeholder='写下你的笔记…';input.setAttribute('aria-label',`${passage.reference} 的笔记`);
    const status=make('span','','note-save-status');status.setAttribute('role','status');
    input.oninput=()=>{if(input.value)state.notes[key]=input.value;else delete state.notes[key];status.textContent=persist()?'已保存':'保存失败';preview.textContent=input.value;preview.hidden=!input.value;summary.textContent=input.value?'编辑笔记':'补充笔记';};
    details.append(summary,input,status);card.append(preview,details);return card;
  }).filter(Boolean);
  $('note-list').replaceChildren(...(cards.length?cards:[make('p','暂无笔记','notes-empty')]));
}
function saveSelectedPassage(){
  if(!bible||!state.selected.length)return;
  const key=noteKey();if(!state.savedPassages[key])state.savedPassages[key]={...passageFromKey(key),createdAt:new Date().toISOString()};
  if(!persist())return;renderNotes();if(mobileNavigation.matches)setAssistantOpen(false);
  const card=[...$('note-list').children].find(node=>node.dataset.key===key);card?.scrollIntoView({block:'center',behavior:'smooth'});toast('已保存经文');
}
function setSelection(values, anchor=null) {
  state.selected=[...new Set(values)].filter(v=>chapter().verses.some(row=>row.verse===v)).sort((a,b)=>a-b);
  selectionAnchor=anchor; $('attach-context').checked=state.selected.length>0;
  persist();renderVerses();updatePanel();
}
function renderVerses() {
  $('verses').replaceChildren(...chapter().verses.map(v => {
    const button = make('button', undefined, 'verse'); button.id = `verse-${v.verse}`;
    button.classList.toggle('selected', state.selected.includes(v.verse));
    button.classList.toggle('highlighted', !!state.highlights[`${chapterKey()}.${v.verse}`]);
    button.setAttribute('aria-pressed', state.selected.includes(v.verse));
    button.setAttribute('aria-label', `${book().name} ${state.chapter}:${v.verse} ${v.text}`);
    button.append(make('span', v.verse, 'verse-number'), make('span', v.text, 'verse-text'));
    button.addEventListener('click', event => {
      if(event.shiftKey && selectionAnchor!==null){ const lo=Math.min(selectionAnchor,v.verse), hi=Math.max(selectionAnchor,v.verse);setSelection(chapter().verses.filter(row=>row.verse>=lo&&row.verse<=hi).map(row=>row.verse),selectionAnchor); }
      else setSelection(state.selected.includes(v.verse)?state.selected.filter(n=>n!==v.verse):[...state.selected,v.verse],v.verse);
      $(`verse-${v.verse}`).focus({preventScroll:true});
    });
    return button;
  }));
}
function render() {
  document.title = `${book().name} ${state.chapter} · 静读`;
  $('crumb').textContent = book().name; $('book-code').textContent = `${book().code} / ${state.book < 39 ? 'OLD' : 'NEW'} TESTAMENT`;
  $('chapter-title').textContent = `${book().name} ${state.chapter === 0 ? '' : '第 ' + state.chapter + ' 章'}`;
  $('chapter-select').replaceChildren(...book().chapters.map(c => { const o = make('option', `第 ${c.chapter} 章`); o.value = c.chapter; return o; }));
  $('chapter-select').value = state.chapter;
  $('verse-count').textContent = `共 ${chapter().verses.length} 节`;
  $('chapter-progress').textContent = `${state.chapter} / ${book().chapters.length}`;
  $('prev-chapter').disabled = state.book === 0 && state.chapter === 1;
  $('next-chapter').disabled = state.book === 65 && state.chapter === book().chapters.length;
  renderBooks(); renderVerses(); updatePanel();
}
function navigate(index, number, verse = null) {
  if (!bible.books[index]?.chapters.some(c => c.chapter === Number(number))) return;
  state.book = index; state.chapter = Number(number); state.selected = verse ? [verse] : []; selectionAnchor=verse; $('attach-context').checked=!!verse;
  testament = index < 39 ? 0 : 1; persist(); render();
  window.scrollTo({ top:0, behavior:'instant' });
  if (verse) requestAnimationFrame(() => $(`verse-${verse}`)?.scrollIntoView({ block:'center', behavior:'instant' }));
}
function openChapters(index=state.book) {
  if(!bible)return;
  $('picker-book').replaceChildren(...bible.books.map((b,i)=>{const option=make('option',b.name);option.value=i;return option;}));
  $('picker-book').value=index;renderChapterGrid();$('chapter-dialog').showModal();
}
function renderChapterGrid(){
  const index=Number($('picker-book').value);
  $('chapter-grid').replaceChildren(...bible.books[index].chapters.map(c=>{
    const button=make('button',c.chapter,'chapter-cell');button.setAttribute('aria-label',`${bible.books[index].name} 第 ${c.chapter} 章`);
    if(index===state.book&&c.chapter===state.chapter){button.classList.add('active');button.setAttribute('aria-current','true');}
    button.onclick=()=>{$('chapter-dialog').close();setMenuOpen(false);navigate(index,c.chapter);};return button;
  }));
}
function step(direction) {
  let b = state.book, c = state.chapter + direction;
  if (c < 1 && b > 0) { b--; c = bible.books[b].chapters.length; }
  if (c > bible.books[b].chapters.length && b < 65) { b++; c = 1; }
  navigate(b,c);
}
async function copy(text) { try { await (window.JingduNative ? window.JingduNative.copy(text) : navigator.clipboard.writeText(text)); toast('已复制'); } catch { toast('无法访问剪贴板，请手动选择文字复制'); } }
function studyContext() { return { translation:bible.translation, book:book().name, bookCode:book().code, chapter:state.chapter, selectedVerses:[...state.selected], verses:chapter().verses.map(v => ({...v})), note:state.notes[noteKey()] || '' }; }
// Integration seam: a future assistant can consume this context without touching the reader.
window.bibleReader = Object.freeze({ getContext:studyContext });
function resultButton(row, subtitle) {
  const b = make('button', undefined, 'result');
  b.append(make('strong', `${bible.books[row.book].name} ${row.chapter}${row.verse ? ':' + row.verse : ' 章'}`),make('p', row.text));
  if (subtitle) b.append(make('small',subtitle));
  b.addEventListener('click', () => { $('search-dialog').close(); navigate(row.book,row.chapter,row.verse || null); });
  return b;
}
function openSearch() { if (!bible) return; resultMode = 'search'; $('dialog-title').textContent='搜索经文'; $('search-form').hidden=false; $('results').replaceChildren(); $('result-summary').textContent='输入简体关键词，或书卷地址，例如：约翰福音 3:16、JHN 3:16。'; $('search-input').value=''; $('search-dialog').showModal(); $('search-input').focus(); }
function search() {
  const query = $('search-input').value.trim(); if (!query) return;
  const address = query.match(/^(.+?)\s*(\d+)\s*(?:[:：]\s*(\d+))?$/);
  let rows;
  if (address) {
    const name=address[1].trim().toUpperCase();
    const aliases = {'创':'GEN','出':'EXO','诗':'PSA','詩':'PSA','太':'MAT','可':'MRK','路':'LUK','约':'JHN','約':'JHN','罗':'ROM','启':'REV','啟':'REV'};
    const index=bible.books.findIndex(b => b.name === name || b.code === name || b.code === aliases[name]);
    rows=allVerses.filter(v => v.book === index && v.chapter === Number(address[2]) && (!address[3] || v.verse === Number(address[3])));
  } else rows=allVerses.filter(v => v.text.toLowerCase().includes(query.toLowerCase()));
  $('result-summary').textContent=rows.length ? `找到 ${rows.length} 节经文${rows.length>100 ? '，先显示前 100 条，请增加关键词缩小范围' : ''}` : '没有找到经文。请尝试简体关键词或完整书卷名。';
  $('results').replaceChildren(...rows.slice(0,100).map(row => resultButton(row)));
}
function saved() {
  if (!bible) return; resultMode = 'notes'; $('dialog-title').textContent='读经笔记'; $('search-form').hidden=true;
  const entries=Object.entries(state.savedPassages).filter(([key])=>passageFromKey(key)).reverse();
  $('result-summary').textContent=entries.length ? `${entries.length} 条笔记` : '选中经文，点「记笔记」保存。';
  $('results').replaceChildren(...entries.map(([key,value])=>{
    const passage=typeof value?.text==='string'?value:passageFromKey(key);
    const button=make('button',undefined,'result saved-note-result');button.dataset.key=key;
    button.append(make('strong',passage.reference),make('p',passage.text));
    if(typeof state.notes[key]==='string'&&state.notes[key])button.append(make('small',state.notes[key]));
    button.onclick=()=>{
      $('search-dialog').close();setMenuOpen(false);if(mobileNavigation.matches)setAssistantOpen(false);
      const [code,number,selection]=key.split('.');navigate(bible.books.findIndex(b=>b.code===code),Number(number));
      setSelection(selection==='chapter'?[]:selection.split(',').map(Number));
      const card=[...$('note-list').children].find(node=>node.dataset.key===key);
      if(card){card.querySelector('details').open=true;card.scrollIntoView({block:'center',behavior:'smooth'});}
    };
    const entry=make('div',undefined,'saved-note-entry');entry.append(button,noteDeleteButton(key));return entry;
  }));
  if(!$('search-dialog').open)$('search-dialog').showModal();
}
function revealPanel(){setAssistantOpen(true);}
function syncAssistant(){
  const mobile=mobileNavigation.matches;
  const open=mobile?document.body.classList.contains('panel-open'):!document.body.classList.contains('panel-hidden');
  $('assistant-backdrop').hidden=!(mobile&&open);
  $('main').inert=mobile&&open;
  $('study-panel').inert=!open;
  $('panel-button').setAttribute('aria-expanded',String(open));
}
function setAssistantOpen(open){
  if(open&&document.body.classList.contains('menu-open'))setMenuOpen(false);
  document.body.classList.toggle('panel-open',open&&mobileNavigation.matches);
  document.body.classList.toggle('panel-hidden',!open);
  if(!open&&$('study-panel').contains(document.activeElement))$('panel-button').focus({preventScroll:true});
  syncAssistant();
}
appearance();
$('smaller').onclick=()=>{state.font=Math.max(16,state.font-1);appearance();persist();};
$('larger').onclick=()=>{state.font=Math.min(28,state.font+1);appearance();persist();};
const mobileNavigation=matchMedia('(max-width:960px)');
let menuScrollY=0, suppressDrawerClickUntil=0;
function setMenuOpen(open){
  open=!!open&&mobileNavigation.matches;
  const wasOpen=document.body.classList.contains('menu-open');
  if(open&&!wasOpen){menuScrollY=window.scrollY;document.body.style.top=`-${menuScrollY}px`;}
  document.body.classList.toggle('menu-open',open);
  $('menu-backdrop').hidden=!open;
  document.querySelector('.workspace').inert=open;
  $('sidebar').inert=mobileNavigation.matches&&!open;
  $('menu-button').setAttribute('aria-expanded',String(open));
  if(open&&!wasOpen)$('sidebar').focus({preventScroll:true});
  if(!open&&wasOpen){document.body.style.top='';window.scrollTo({top:menuScrollY,behavior:'instant'});$('menu-button').focus({preventScroll:true});}
}
$('menu-button').onclick=()=>setMenuOpen(!document.body.classList.contains('menu-open'));
$('menu-backdrop').onclick=event=>{event.preventDefault();event.stopPropagation();setMenuOpen(false);};
mobileNavigation.addEventListener('change',()=>{setMenuOpen(false);syncAssistant();});
setMenuOpen(false);
syncAssistant();
// Each drawer captures only its closing direction. Vertical scrolling remains native.
function bindDrawerSwipe(surface,direction,isOpen,close){
  let gesture=null;
  surface.addEventListener('pointerdown',event=>{
    if(!isOpen()||!event.isPrimary||event.button!==0||event.target.closest('textarea,input,select,[contenteditable="true"]'))return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,dragging:false};
  });
  surface.addEventListener('pointermove',event=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(!gesture.dragging&&Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){gesture=null;return;}
    if(!gesture.dragging&&dx*direction>12&&Math.abs(dx)>Math.abs(dy)*1.5){
      gesture.dragging=true;surface.setPointerCapture(event.pointerId);
    }
    if(gesture.dragging)event.preventDefault();
  });
  surface.addEventListener('pointerup',event=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    const completed=gesture;gesture=null;
    if(!completed.dragging)return;
    event.preventDefault();suppressDrawerClickUntil=performance.now()+450;
    if(surface.hasPointerCapture(event.pointerId))surface.releasePointerCapture(event.pointerId);
    if((event.clientX-completed.x)*direction>55&&Math.abs(event.clientX-completed.x)>Math.abs(event.clientY-completed.y)*1.5)close();
  });
  surface.addEventListener('pointercancel',()=>{gesture=null;});
}
for(const surface of [$('sidebar'),$('menu-backdrop')])bindDrawerSwipe(surface,-1,()=>document.body.classList.contains('menu-open'),()=>setMenuOpen(false));
for(const surface of [$('study-panel'),$('assistant-backdrop')])bindDrawerSwipe(surface,1,()=>mobileNavigation.matches&&document.body.classList.contains('panel-open'),()=>setAssistantOpen(false));
document.addEventListener('click',event=>{
  if(performance.now()<suppressDrawerClickUntil){event.preventDefault();event.stopImmediatePropagation();}
},true);
$('panel-button').onclick=()=>setAssistantOpen($('panel-button').getAttribute('aria-expanded')!=='true');
$('close-assistant').onclick=()=>setAssistantOpen(false);
$('assistant-backdrop').onclick=event=>{event.preventDefault();event.stopPropagation();setAssistantOpen(false);};
$('book-filter').oninput=()=>{if(bible)renderBooks();};
$('old-tab').onclick=()=>{testament=0;$('book-filter').value='';if(bible)renderBooks();};
$('new-tab').onclick=()=>{testament=1;$('book-filter').value='';if(bible)renderBooks();};
$('chapter-select').onchange=e=>navigate(state.book,Number(e.target.value));
$('prev-chapter').onclick=()=>{if(bible)step(-1);};$('next-chapter').onclick=()=>{if(bible)step(1);};
$('search-button').onclick=openSearch;$('saved-nav').onclick=saved;
$('read-nav').onclick=()=>{setMenuOpen(false);window.scrollTo({top:0,behavior:'smooth'});};
$('search-form').onsubmit=e=>{e.preventDefault();search();};
$('close-dialog').onclick=()=>$('search-dialog').close();
$('chapter-picker-button').onclick=()=>openChapters();$('picker-book').onchange=renderChapterGrid;$('close-chapters').onclick=()=>$('chapter-dialog').close();
$('clear-selection').onclick=()=>setSelection([]);
$('selection-notes').onclick=saveSelectedPassage;
$('selection-ask').onclick=()=>{if(!bible||!state.selected.length)return;revealPanel();$('attach-context').checked=true;updatePanel();$('chat-input').value=`请简要解释 ${reference()}${state.selected.length>1?'，并说明这些经节之间的联系':''}。`;$('chat-input').focus();};
$('attach-context').onchange=()=>{if(bible)updatePanel();};
$('about-button').onclick=()=>$('about-dialog').showModal();$('close-about').onclick=()=>$('about-dialog').close();
$('export-button').onclick=async()=>{
  const data={schemaVersion:1,exportedAt:new Date().toISOString(),translation:bible?.translation,...state};
  const name=`jingdu-backup-${new Date().toISOString().slice(0,10)}.json`;
  try {
    if(!window.JingduNative)throw new Error('原生分享不可用');
    await window.JingduNative.exportBackup(JSON.stringify(data,null,2),name);
  } catch { toast('未导出备份，请重试并选择存储到文件'); }
};
$('import-button').onclick=()=>$('import-file').click();
$('import-file').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file||!bible)return;
  try{
    if(file.size>10*1024*1024)throw new Error('备份文件过大');
    const data=JSON.parse(await file.text());
    if(!data||data.schemaVersion!==1||typeof data.notes!=='object'||!data.notes||typeof data.savedPassages!=='object'||!data.savedPassages)throw new Error('请选择静读导出的备份文件');
    const passages={...state.savedPassages},notes={...state.notes};let count=0;
    for(const key of new Set([...Object.keys(data.savedPassages),...Object.keys(data.notes)])){
      const canonical=passageFromKey(key);if(!canonical||passages[key])continue;
      passages[key]={...canonical,createdAt:new Date().toISOString()};
      if(typeof data.notes[key]==='string')notes[key]=data.notes[key].slice(0,100000);
      count++;
    }
    if(!count){toast('没有新的笔记需要导入');return;}
    const previous={savedPassages:state.savedPassages,notes:state.notes};
    state.savedPassages=passages;state.notes=notes;
    if(!persist()){Object.assign(state,previous);return;}
    renderNotes();toast(`已导入 ${count} 条笔记`);
  }catch(error){toast(error instanceof SyntaxError?'无法读取备份文件':error.message);}
};
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(!$('search-dialog').open)openSearch();}if(event.key==='Escape'){setMenuOpen(false);if(mobileNavigation.matches)setAssistantOpen(false);}});
async function api(path, options={}) {
  if(window.BibleDirect){
    if(path==='/api/config')return options.method==='POST'?window.BibleDirect.configure(JSON.parse(options.body)):window.BibleDirect.status();
    if(path==='/api/chat')return window.BibleDirect.chat(JSON.parse(options.body),options.signal);
    throw new Error('接口不存在');
  }
  const response=await fetch(path,options);
  let result;try{result=await response.json();}catch{throw new Error('模型接口不可用，请关闭旧的启动窗口，再运行 start.bat。');}
  if(!response.ok)throw new Error(result.error||'请求失败，请重试。');
  return result;
}
function renderModelStatus(){ $('model-settings').hidden=!!modelConfig.readOnly;$('model-status').textContent=!navigator.onLine?'离线阅读中，助手需联网':modelConfig.configured?'':'请在设置中配置模型';$('model-status').hidden=navigator.onLine&&modelConfig.configured; }
window.addEventListener('offline',renderModelStatus);
window.addEventListener('online',()=>loadModelStatus());
const answerSpeech = window.createAnswerSpeech((message, playing) => {
  $('speech-status').textContent=message;$('stop-speech').hidden=!playing;
});
$('auto-speak').checked=state.autoSpeak!==false;
$('auto-speak').disabled=!answerSpeech.supported;
if(!answerSpeech.supported)$('speech-status').textContent='当前浏览器不支持音频播放';
$('auto-speak').onchange=()=>{state.autoSpeak=$('auto-speak').checked;persist();if(!state.autoSpeak)answerSpeech.stop('已关闭自动朗读');};
$('stop-speech').onclick=()=>answerSpeech.stop('已停止朗读');
async function loadModelStatus(){try{modelConfig=await api('/api/config');renderModelStatus();}catch(error){$('model-status').textContent=error.message;}}
function renderChat(){
  const nodes=state.chat.map(turn=>{
    const bubble=make('div',undefined,`chat-message ${turn.role}${turn.failed?' failed':''}`);
    bubble.setAttribute('aria-label',turn.role==='user'?'你的问题':'助手回答');
    if(turn.role==='user'&&turn.contextLabel)bubble.append(make('small',turn.contextLabel,'chat-reference'));
    bubble.append(make('div',turn.text,'chat-text'));
    if(turn.role==='assistant'&&answerSpeech.supported){const play=make('button','朗读','subtle-button read-answer');play.type='button';play.setAttribute('aria-label','朗读这条回答');play.onclick=()=>answerSpeech.speak(turn.text);bubble.append(play);}
    if(turn.failed)bubble.append(make('small','本次未获得回答，可在下方重新发送。','chat-reference'));
    return bubble;
  });
  if(!nodes.length)nodes.push(make('div','有什么想了解的？','chat-empty'));
  if(chatController)nodes.push(make('p','助手正在思考…','chat-pending'));
  $('chat-log').replaceChildren(...nodes);$('chat-log').scrollTop=$('chat-log').scrollHeight;
  $('send-chat').disabled=!!chatController;$('cancel-chat').hidden=!chatController;$('new-chat').disabled=!!chatController;
}
async function sendQuestion(options={}){
  if(chatController||!bible)return;
  const text=(options.prompt||$('chat-input').value).trim();if(!text){$('chat-input').focus();return;}
  if(text.length>4000){toast('问题请控制在 4000 字以内');return;}
  $('chat-error').hidden=true;
  if(!navigator.onLine){$('chat-error').textContent='当前离线，联网后即可向助手提问。';$('chat-error').hidden=false;return;}
  if(!modelConfig.configured){if(options.prompt&&!$('chat-input').value)$('chat-input').value=text;$('chat-error').textContent='请先在「模型设置」中填写百炼 API Key。你的问题会保留在输入框中。';$('chat-error').hidden=false;return;}
  answerSpeech.stop();
  if(state.autoSpeak!==false)answerSpeech.prepare();
  const withContext=$('attach-context').checked&&state.selected.length>0;
  const turn={role:'user',text,context:withContext?assistantContext():null,contextLabel:withContext?reference():'',pending:true};
  state.chat.push(turn);state.chat=state.chat.slice(-100);persist();if(!options.prompt)$('chat-input').value='';
  chatController=new AbortController();renderChat();
  const messages=state.chat.filter(t=>!t.failed).slice(-20).map(t=>({role:t.role,text:t.text,context:t.context||null}));
  while(messages.length&&messages[0].role!=='user')messages.shift();
  try{
    const result=await api('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages}),signal:chatController.signal});
    turn.pending=false;state.chat.push({role:'assistant',text:result.text,model:result.model});
    if(state.autoSpeak!==false&&answerSpeech.supported)answerSpeech.speak(result.text);
  }catch(error){
    turn.pending=false;turn.failed=true;
    $('chat-error').textContent=error.name==='AbortError'?'已停止本次回答，问题已保留。':error.message;$('chat-error').hidden=false;
    if(!$('chat-input').value)$('chat-input').value=text;
  }finally{chatController=null;persist();renderChat();}
}
async function openSettings(){
  await loadModelStatus();$('model-url').value=modelConfig.baseUrl;$('model-name').value=modelConfig.model;$('model-key').value='';
  $('model-key').required=!modelConfig.configured;
  $('model-key').placeholder=modelConfig.configured?'已保存密钥；留空保留原密钥':'填写对应地域的百炼 API Key';
  $('model-region').value=[...$('model-region').options].some(o=>o.value===modelConfig.baseUrl)?modelConfig.baseUrl:'custom';
  if(window.BibleDirect)$('key-hint').textContent='密钥仅保存在当前设备浏览器中，直接发送给千问，不上传网站服务器，也不随笔记导出。清除网站数据后需重新填写。';
  $('settings-error').hidden=true;$('settings-dialog').showModal();
}
$('model-settings').onclick=openSettings;
if(window.BibleDirect){
  const clearKey=make('button','清除本机密钥','subtle-button');clearKey.type='button';clearKey.id='clear-api-key';
  clearKey.onclick=()=>{try{modelConfig=window.BibleDirect.clear();$('model-key').value='';$('model-key').required=true;$('model-key').placeholder='填写对应地域的百炼 API Key';renderModelStatus();toast('已清除本机密钥');}catch{toast('无法清除，请检查浏览器存储权限');}};
  $('settings-form').append(clearKey);
}
$('close-settings').onclick=()=>$('settings-dialog').close();
$('settings-dialog').addEventListener('close',()=>{$('model-key').value='';});
$('model-region').onchange=()=>{if($('model-region').value!=='custom')$('model-url').value=$('model-region').value;};
$('model-url').oninput=()=>{$('model-region').value='custom';};
$('settings-form').onsubmit=async event=>{
  event.preventDefault();$('save-model').disabled=true;$('settings-error').hidden=true;
  try{modelConfig=await api('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:$('model-url').value,model:$('model-name').value,apiKey:$('model-key').value})});renderModelStatus();$('settings-dialog').close();toast('模型配置已保存在本机');}
  catch(error){$('settings-error').textContent=error.message;$('settings-error').hidden=false;}
  finally{$('save-model').disabled=false;}
};
$('chat-form').onsubmit=event=>{event.preventDefault();sendQuestion();};
$('chat-input').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();sendQuestion();}};
$('cancel-chat').onclick=()=>chatController?.abort();
$('new-chat').onclick=()=>{if(chatController)return;answerSpeech.stop();state.chat=[];persist();$('chat-error').hidden=true;renderChat();$('chat-input').focus();};
let loadingBible=false;
async function readBible() {
  if(location.protocol==='file:')throw new Error('请使用 start.bat 启动，再访问 http://127.0.0.1:4173/，不要直接打开 HTML 文件。');
  for(let attempt=0;attempt<3;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch('data/cus.json',{cache:'no-store',signal:controller.signal});
      if(!response.ok){const error=new Error(response.status===404?'经文文件缺失，请确认 dist/data/cus.json 存在。':`本地服务返回错误（${response.status}），请稍后重试。`);error.noRetry=response.status<500;throw error;}
      let data;
      try{data=await response.json();}catch(error){if(error instanceof SyntaxError){const invalid=new Error('经文文件格式有误，请恢复 dist/data/cus.json 后重试。');invalid.noRetry=true;throw invalid;}throw error;}
      if(!Array.isArray(data?.books)||data.books.length!==66){const error=new Error('经文数据不完整，请恢复 dist/data/cus.json 后重试。');error.noRetry=true;throw error;}
      return data;
    }catch(error){
      if(error.noRetry)throw error;
      if(attempt===2)throw new Error('无法完成经文加载。请确认 start.bat 的服务窗口仍在运行，然后点击「重新加载」。');
    }finally{clearTimeout(timer);}
    $('loading').textContent=`经文加载中断，正在重试（${attempt+1}/2）…`;
    await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
  }
}
async function init() {
  if(loadingBible)return;
  loadingBible=true;$('loading').hidden=false;$('loading').textContent='正在读取本地经文…';
  try {
    bible=await readBible();
    for(const [key,value] of Object.entries(state.notes)){if(typeof value==='string'&&value&&passageFromKey(key)&&!state.savedPassages[key])state.savedPassages[key]={...passageFromKey(key),legacy:true};}
    for(const [key,value] of Object.entries(state.savedPassages)){if(!value?.text&&passageFromKey(key))state.savedPassages[key]={...value,...passageFromKey(key)};}
    persist();
    if(!Number.isInteger(state.book)||!bible.books[state.book])state.book=0;
    if(!book().chapters.some(c=>c.chapter===state.chapter))state.chapter=1;
    state.selected=[...new Set(state.selected)].filter(v=>chapter().verses.some(row=>row.verse===v)).sort((a,b)=>a-b);
    $('attach-context').checked=state.selected.length>0;
    testament=state.book<39?0:1;
    allVerses=bible.books.flatMap((b,index)=>b.chapters.flatMap(c=>c.verses.map(v=>({book:index,chapter:c.chapter,...v}))));
    $('loading').hidden=true;render();renderChat();loadModelStatus();
  } catch(error) {
    $('loading').hidden=false;
    $('loading').replaceChildren(make('p',error.message));
    const retry=make('button','重新加载','small-button');retry.type='button';retry.onclick=init;$('loading').append(retry);
  } finally { loadingBible=false; }
}
init();
