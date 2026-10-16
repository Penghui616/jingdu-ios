'use strict';
window.createAnswerSpeech=function(onStatus){
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  const supported=!!AudioEngine&&typeof fetch==='function';
  let audioContext,controller,finishPlayback,generation=0,nextTime=0;
  const sources=new Set(),cache=new Map();
  function prepare(){
    if(!supported)return;
    try{audioContext||=new AudioEngine();audioContext.resume().catch(()=>{});}catch{}
  }
  function stop(message=''){
    generation++;controller?.abort();controller=null;
    for(const source of sources){source.onended=null;try{source.stop();}catch{}source.disconnect();}
    sources.clear();finishPlayback?.();finishPlayback=null;nextTime=0;onStatus(message,false);
  }
  function play(chunk,token){
    if(token!==generation)return;
    if(!audioContext||audioContext.state!=='running')throw new Error('请点击回答下方的「朗读」播放');
    if(typeof chunk.audio!=='string'||chunk.sampleRate!==24000)throw new Error('语音数据格式有误');
    const bytes=atob(chunk.audio);
    if(!bytes.length||bytes.length%2)throw new Error('语音数据格式有误');
    const buffer=audioContext.createBuffer(1,bytes.length/2,24000),samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++){let value=bytes.charCodeAt(2*i)|(bytes.charCodeAt(2*i+1)<<8);if(value>=32768)value-=65536;samples[i]=value/32768;}
    const source=audioContext.createBufferSource();source.buffer=buffer;source.connect(audioContext.destination);sources.add(source);
    source.onended=()=>{source.disconnect();sources.delete(source);if(!sources.size){finishPlayback?.();finishPlayback=null;}};
    nextTime=Math.max(nextTime,audioContext.currentTime+0.06);source.start(nextTime);nextTime+=buffer.duration;
    onStatus('正在朗读…',true);
  }
  async function speak(raw){
    if(!supported){onStatus('当前浏览器不支持音频播放',false);return;}
    stop();prepare();const token=generation;
    const text=String(raw).replace(/```[\s\S]*?```/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
      .replace(/^[\s]*[>#*-]+\s*/gm,'').replace(/[*_`#]/g,'')
      .replace(/(\d+):(\d+)(?:-(\d+))?/g,(_,c,v,end)=>`${c}章${v}${end?'至'+end:''}节`).trim();
    if(!text)return;
    controller=new AbortController();const request=controller;
    try{
      onStatus('正在连接语音…',true);
      const cached=cache.get(text);
      if(cached){for(const chunk of cached)play(chunk,token);}
      else{
        const saved=[];let bytes=0,count=0;
        // Most replies fit one call; long replies remain within the provider's 600-character limit.
        for(const segment of text.match(/[\s\S]{1,500}/gu)||[]){
          if(token!==generation)return;
          const response=window.BibleDirect?await window.BibleDirect.speechResponse(segment,request.signal):await fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:segment}),signal:request.signal});
          if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.error||'语音服务暂时不可用');}
          if(!response.body)throw new Error('当前浏览器无法接收语音');
          const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
          function consume(line){
            if(!line.trim())return;
            const chunk=JSON.parse(line);if(chunk.error)throw new Error(chunk.error);
            if(token!==generation)return;
            play(chunk,token);count++;bytes+=chunk.audio.length;
            if(bytes<=8000000)saved.push(chunk);else saved.length=0;
          }
          try{
            while(true){const {value,done}=await reader.read();if(token!==generation)return;pending+=decoder.decode(value||new Uint8Array(),{stream:!done});if(pending.length>6000000)throw new Error('语音数据过长');let end;while((end=pending.indexOf('\n'))!==-1){consume(pending.slice(0,end));pending=pending.slice(end+1);}if(done)break;}
            consume(pending);
          }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        }
        if(!count)throw new Error('语音服务未返回声音');
        if(saved.length&&bytes<=8000000){cache.set(text,saved);while(cache.size>3)cache.delete(cache.keys().next().value);}
      }
      if(token!==generation)return;
      if(sources.size)await new Promise(resolve=>{finishPlayback=resolve;});
      if(token===generation){controller=null;onStatus('',false);}
    }catch(error){if(token===generation)stop(error.name==='AbortError'?'已停止朗读':error.message||'语音播放失败，请重试');}
  }
  window.addEventListener('pagehide',()=>{stop();cache.clear();audioContext?.close();audioContext=null;});
  return {supported,prepare,speak,stop};
};
