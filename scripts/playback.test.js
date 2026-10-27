const {test}=require('node:test');
const assert=require('node:assert/strict');

test('aligned lyrics keep untimed continuation in place and remove split directions',async()=>{
 const {parseLyrics}=await import('../public/lyrics.mjs');
 const raw='[00:15.80] [Intro:\n[00:15.84] Rain\n[00:15.94] drums]\n[00:15.98] [Verse 1]\n霓虹在电线杆上打嗝\n[00:17.39] 积水把招牌泡成泡沫\n[\n[00:55.62] Chorus:\n[00:55.66] Anthemic]\n[00:55.71] [Hook: Catchy]\n雨越下越要跳！\n[00:57.77] 把破铜烂铁敲成心跳';
 assert.deepEqual(parseLyrics(raw).map(({text,time})=>({text,time})),[
  {text:'霓虹在电线杆上打嗝',time:15.98},{text:'积水把招牌泡成泡沫',time:17.39},
  {text:'雨越下越要跳！',time:55.71},{text:'把破铜烂铁敲成心跳',time:57.77}]);
 assert.deepEqual(parseLyrics('第一行\n第二行').map(l=>l.text),['第一行','第二行']);
 assert.deepEqual(parseLyrics('[00:01.20][00:02.3]咚').map(l=>l.time),[1.2,2.3]);
});
async function fixture(options={}) {
 const {AudioCache}=await import('../public/audio-cache.mjs');
 const data=new Map();let requests=0,serial=0;const revoked=[];
 const disk={match:async k=>data.get(typeof k==='string'?k:k.url)?.clone(),put:async(k,v)=>data.set(k,v.clone()),delete:async k=>data.delete(typeof k==='string'?k:k.url),keys:async()=>[...data.keys()].map(k=>new Request(k))};
 const config={origin:'https://music.test',storage:{open:async()=>disk},urls:{createObjectURL:()=>`blob:test-${++serial}`,revokeObjectURL:u=>revoked.push(u)},fetcher:async()=>{requests++;return new Response(new Uint8Array(8),{headers:{'content-type':'audio/mpeg','cache-control':'public, max-age=31536000','content-length':'8'}})},...options};
 return {cache:new AudioCache(config),data,revoked,requests:()=>requests,make:()=>new AudioCache(config)};
}
test('public warm cache survives a new player instance without another download',async()=>{
 const f=await fixture();const url='/music/a.mp3';assert.equal(f.cache.source(url),url);
 assert.equal(await f.cache.preload(url,true),true);assert.match(f.cache.source(url),/^blob:/);
 const next=f.make();await next.preload(url,true);assert.match(next.source(url),/^blob:/);assert.equal(f.requests(),1);
});
test('private candidates never reach disk and logout invalidates memory',async()=>{
 const f=await fixture();await f.cache.preload('/music/draft.mp3');assert.equal(f.data.size,0);
 f.cache.clearPrivate();assert.equal(f.cache.source('/music/draft.mp3'),'/music/draft.mp3');assert.equal(f.revoked.length,1);
});
test('cache bounds evict oldest files and protect current playback object URL',async()=>{
 const f=await fixture({maxBytes:16,maxTracks:2});await f.cache.preload('/music/a.mp3',true);f.cache.pin('radio','/music/a.mp3');
 await f.cache.preload('/music/b.mp3',true);await f.cache.preload('/music/c.mp3',true);
 assert.equal(f.data.size,2);assert.equal(f.cache.memory.size,2);assert.match(f.cache.source('/music/a.mp3'),/^blob:/);assert.equal(f.cache.source('/music/b.mp3'),'/music/b.mp3');
});
test('partial or non-audio responses and oversized streams are not cached',async()=>{
 for(const response of [new Response('bad',{status:206,headers:{'content-type':'audio/mpeg'}}),new Response('login',{headers:{'content-type':'text/html'}}),new Response(new Uint8Array(9),{headers:{'content-type':'audio/mpeg'}})]){
 const f=await fixture({maxFile:8,fetcher:async()=>response});assert.equal(await f.cache.preload('/music/a.mp3',true),false);assert.equal(f.data.size,0);assert.equal(f.cache.memory.size,0);
 }
});
test('cold playback can stream immediately and cancelled private fetch cannot reappear after logout',async()=>{
 let release;const response=new Promise(r=>{release=r;});
 const f=await fixture({fetcher:()=>response});const loading=f.cache.preload('/music/draft.mp3');
 assert.equal(f.cache.source('/music/draft.mp3'),'/music/draft.mp3');
 f.cache.clearPrivate();release(new Response(new Uint8Array(8),{headers:{'content-type':'audio/mpeg'}}));
 assert.equal(await loading,false);assert.equal(f.cache.memory.size,0);assert.equal(f.data.size,0);
});
