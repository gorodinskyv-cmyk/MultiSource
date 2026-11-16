/* MultiSource UAFix Series Add-on 1.3.15d.13.8 — compatible with installed d.13.7.
 * Load AFTER the existing MultiSource plugin. It patches only UAFix catalog TV handling.
 * No iframe playback, credentials, DRM workarounds, media relays, or signed URL logs.
 */
(function(root){
 'use strict';
 if(root.MultiSourceUafixSeriesD138)return;
 var VERSION='1.3.15d.13.8-series-addon';
 var ORIGIN='https://uafix.net';
 var state={version:VERSION,installed:false,stage:'waiting-core',catalogRequests:0,catalogResponses:0,
  seasonRequests:0,seasonsFound:0,episodesFound:0,renderedEpisodes:0,selectedSeason:0,selectedEpisode:0,
  episodeRequests:0,episodeResponses:0,playerFrames:0,playerRequests:0,playerResponses:0,
  streamsFound:0,renderedStreams:0,launches:0,lastProvider:'',lastFormat:'',lastError:'',
  lastNotice:'',ui:'idle',baseVersion:'',playerInvoked:false};
 var series=null,session=0,installTimer=null,observer=null,drawTimer=null,lastLaunch=0;
 var registry=null;
 function clean(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
 function errorText(e){return clean(e&&e.message||e).replace(/https?:\/\/[^\s"'<>]+/gi,'[URL]')
  .replace(/\b(?:token|key|sig|auth)\s*[=:]\s*\S+/gi,'[REDACTED]').slice(0,140);}
 function safeUrl(raw,base,allow){try{var u=new URL(clean(raw).replace(/&amp;/g,'&'),base||ORIGIN+'/');
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.href.length>4000)return '';
  if(/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)||u.hostname==='localhost')return '';
  if(allow&&!allow(u.hostname.toLowerCase()))return '';u.hash='';return u.href;
 }catch(_){return '';}}
 function firstParty(host){return host==='uafix.net'||host==='www.uafix.net';}
 function playerHost(host){return firstParty(host)||host==='ashdi.vip'||/\.ashdi\.vip$/.test(host)||
  /(?:^|\.)zetvideo\.(?:com|net|org|tv|me|io|cc)$/.test(host);}
 function noAds(url){return !/(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com|doubleclick\.net|googlesyndication\.com|adnxs\.com|facebook\.com)$/i.test(new URL(url).hostname)&&
  !/(?:pre.?roll|advert|trailer|promo|\/ads?\/)/i.test(url);}
 function media(raw,base){var u=safeUrl(String(raw||'').replace(/\\\//g,'/').replace(/\\u002[fF]/g,'/'),base);
  return u&&/\.(?:m3u8|mp4|mpd|webm)(?:\?|$)/i.test(u)&&noAds(u)?u:'';}
 function format(url){return /\.m3u8(?:\?|$)/i.test(url)?'HLS':/\.mp4(?:\?|$)/i.test(url)?'MP4':
  /\.mpd(?:\?|$)/i.test(url)?'DASH':/\.webm(?:\?|$)/i.test(url)?'WEBM':'Відео';}
 function decode(raw){var s=clean(String(raw||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"'));
  return s.replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(Number(n));}).slice(0,120);}
 function matchesCatalog(url){try{var u=new URL(url);return firstParty(u.hostname)&&/^\/serials?\/[a-z0-9_-]+\/$/i.test(u.pathname);}catch(_){return false;}}
 function listingPaths(base){try{var p=new URL(base).pathname;return p.replace(/\/$/,'')+'/';}catch(_){return '';}}
 function parseListing(html,base){
  var prefix=listingPaths(base),eps=[],seasons=[],epSeen={},seSeen={},m;
  if(!prefix||!matchesCatalog(base))return {episodes:[],seasons:[]};
  var pattern=/<a\b([^>]{0,2800})>([\s\S]{0,1800}?)<\/a\s*>/gi;
  while((m=pattern.exec(String(html||'')))&&eps.length<320){
   var attr=m[1],h=/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(attr);
   if(!h)continue;var u=safeUrl(h[1]||h[2]||h[3],base,firstParty);if(!u)continue;
   var p=new URL(u).pathname;if(p.slice(0,prefix.length)!==prefix)continue;
   var tail=p.slice(prefix.length),label=decode(m[2]);
   var ep=/^season-(\d{1,2})-episode-(\d{1,3})\/$/i.exec(tail);
   if(ep){var sn=Number(ep[1]),en=Number(ep[2]);if(!sn||!en||sn>99||en>999||epSeen[sn+'-'+en])continue;
    epSeen[sn+'-'+en]=true;
    var upcoming=/\b(?:найближчим\s+часом|скоро|coming\s+soon)\b/i.test(label);
    var date=/(\d{1,2})\.(\d{1,2})\.(20\d{2})/.exec(label);
    if(date&&/прем['’]?єра/i.test(label)){
     var d=new Date(+date[3],+date[2]-1,+date[1]);var today=new Date();today.setHours(0,0,0,0);
     if(d.getTime()>today.getTime())upcoming=true;
    }
    eps.push({season:sn,episode:en,url:u,title:label.replace(/^(?:прем['’]?єра\.?\s*(?:\d{1,2}\.\d{1,2}\.20\d{2})?\s*)?сезон\s*\d+\s*серія\s*\d+\s*/i,'').trim()||'Серія '+en,upcoming:upcoming});continue;
   }
   var se=/^sezon-(\d{1,2})\/$/i.exec(tail);
   if(se&&!seSeen[+se[1]]){seSeen[+se[1]]=true;seasons.push({season:+se[1],url:u});}
  }
  eps.sort(function(a,b){return a.season-b.season||a.episode-b.episode;});
  seasons.sort(function(a,b){return a.season-b.season;});
  return {episodes:eps,seasons:seasons};
 }
 function nativeHtml(url,referer){
  var good=safeUrl(url,undefined,referer?playerHost:firstParty);
  if(!good)return Promise.reject(Error('host-not-allowed'));
  return new Promise(function(resolve,reject){var l=root.Lampa,r=null,finished=false,timer=0;
   if(!l||typeof l.Reguest!=='function')return reject(Error('Lampa.Reguest недоступний'));
   function done(err,value){if(finished)return;finished=true;
    if(timer&&root.clearTimeout)root.clearTimeout(timer);err?reject(err):resolve(value);}
   try{r=new l.Reguest();if(typeof r.native!=='function')return done(Error('native transport unavailable'));
    if(typeof r.timeout==='function')r.timeout(13000);
    if(root.setTimeout)timer=root.setTimeout(function(){done(Error('native request timeout'));},14000);
    var opt={dataType:'text'};if(referer)opt.headers={'Referer':referer};
    r.native(good,function(payload){var t=typeof payload==='string'?payload:payload&&(
      payload.responseText||payload.body||payload.html||payload.data)||'';
     if(typeof t!=='string'||t.length<80||!/<(?:html|body|div|main|a|script)\b/i.test(t)||
      /<title[^>]*>\s*(?:Just a moment|Access denied)/i.test(t))return done(Error('HTML unavailable'));
     done(null,t);
    },function(e){done(Error(errorText(e)));},false,opt);
   }catch(e){done(e);}
  });
 }
 function uniqueEpisodes(sets){var seen={},out=[];
  sets.forEach(function(a){(a||[]).forEach(function(ep){var key=ep.season+'-'+ep.episode;
   if(!seen[key]){seen[key]=true;out.push(ep);}else if(ep.title&&!/^Серія \d+$/.test(ep.title)){
    for(var i=0;i<out.length;i++)if(out[i].season===ep.season&&out[i].episode===ep.episode){out[i]=ep;break;}
   }});});return out.sort(function(a,b){return a.season-b.season||a.episode-b.episode;});}
 function loadCatalog(base){state.catalogRequests++;return nativeHtml(base).then(function(html){state.catalogResponses++;
  var first=parseListing(html,base),jobs=[],known={};first.episodes.forEach(function(e){known[e.season]=true;});
  first.seasons.forEach(function(s){if(!known[s.season]&&jobs.length<8)jobs.push(s);});
  // Only request season pages that are actually linked from the verified series page.
  var gathered=[first.episodes];function next(i){if(i>=jobs.length)return Promise.resolve();
   state.seasonRequests++;return nativeHtml(jobs[i].url).then(function(t){gathered.push(parseListing(t,base).episodes);},
    function(){}).then(function(){return next(i+1);});}
  return next(0).then(function(){var episodes=uniqueEpisodes(gathered),seasonSet={};
   episodes.forEach(function(e){seasonSet[e.season]=true;});
   state.episodesFound=episodes.length;state.seasonsFound=Object.keys(seasonSet).length;
   return episodes;});});}
 function detectPlayerHtml(html,page){var t=root.MultiSourceD13&&root.MultiSourceD13._test;
  if(t&&typeof t.collectUafixPlayers==='function'){
   try{var found=t.collectUafixPlayers(html,page);if(found&&Array.isArray(found.players))return found;}catch(_){}
  }
  var frames=[],trailer=0,seen={},rx=/<iframe\b([^>]{0,3000})>/gi,m;
  while((m=rx.exec(String(html||'')))&&frames.length<6){
   var u=/\b(?:src|data-src|data-url)\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(m[1]);
   if(!u)continue;var link=safeUrl(u[1]||u[2],page,playerHost);if(!link)continue;
   if(!noAds(link)){trailer++;continue;}if(seen[link])continue;seen[link]=1;
   frames.push({url:link,type:/ashdi/.test(link)?'ashdi':/zetvideo/.test(link)?'playerjs-vod':'first-party',label:'Українська'});
  }
  return {players:frames,trailerIframes:trailer,authHint:/(?:пройдіть\s+авторизацію|після\s+авторизації|requires\s+login)/i.test(html)};
 }
 function parseDirect(html,base,voice){var t=root.MultiSourceD13&&root.MultiSourceD13._test,arr=[];
  if(t&&typeof t.parseUafixPlayer==='function'){
   try{arr=t.parseUafixPlayer(html,base,voice)||[];}catch(_){arr=[];}
  }
  if(!arr.length){var m,rx=/(?:\bfile\s*:\s*|\b(?:src|data-file)\s*=\s*)["'](https?:\\?\/\\?\/[^\s"'<>]+?\.(?:m3u8|mp4|mpd|webm)(?:\?[^\s"'<>]*)?)["']/gi;
   while((m=rx.exec(String(html||'')))&&arr.length<12)arr.push({url:m[1],title:voice,voice:voice});
  }
  return arr;}
 function resolveEpisode(ep){
  state.selectedEpisode=ep.episode;state.selectedSeason=ep.season;state.episodeRequests++;
  return nativeHtml(ep.url).then(function(html){state.episodeResponses++;
   var detected=detectPlayerHtml(html,ep.url),list=[],seen={};
   function add(arr,provider){(arr||[]).forEach(function(it){var url=media(it&&it.url,ep.url);
    if(!url||seen[url]||list.length>=16)return;seen[url]=true;list.push({url:url,title:clean(it.title)||provider,
     voice:clean(it.voice)||'Українська',provider:provider,headers:it.headers,subtitles:it.subtitles});});}
   add(parseDirect(html,ep.url,'Українська'),'UAFix');
   var frames=(detected.players||[]).slice(0,6);state.playerFrames=frames.length;
   function one(i){if(i>=frames.length)return Promise.resolve();var fr=frames[i];state.playerRequests++;
    return nativeHtml(fr.url,ep.url).then(function(playerHtml){state.playerResponses++;
     add(parseDirect(playerHtml,fr.url,clean(fr.label)||'Українська'),fr.type==='ashdi'?'Ashdi':
      fr.type==='playerjs-vod'?'Zetvideo':'UAFix');},function(){}).then(function(){return one(i+1);});}
   return one(0).then(function(){state.streamsFound=list.length;
    state.lastNotice=list.length?'Знайдено прямі потоки.':detected.authHint?
     'На сторінці є повідомлення про авторизацію; обхід доступу не виконується.':
     detected.trailerIframes?'Доступний лише трейлер; відкритий відеопотік не знайдено.':
     'На сторінці епізоду не знайдено відкритого прямого відеопотоку.';
    return list;});
  });
 }
 function selectedUafix(){try{return root.Lampa&&root.Lampa.Storage&&root.Lampa.Storage.get&&
  root.Lampa.Storage.get('ms_v1_source','')==='uafix';}catch(_){return false;}}
 function movie(){try{var a=root.Lampa&&root.Lampa.Activity&&root.Lampa.Activity.active&&root.Lampa.Activity.active();
  return a&&(a.movie||a.card||a.object&&(a.object.movie||a.object.card))||{};}catch(_){return {};}}
 function element(tag,cls,text){var e=root.document.createElement(tag);if(cls)e.className=cls;
  if(text!=null)e.textContent=String(text);return e;}
 function actionRow(label,sub,cls,fn,disabled){var el=element('div','ms-row '+(disabled?'':'selector ')+(cls||''));
  el.appendChild(element('div','ms-s138-title',label));if(sub)el.appendChild(element('div','ms-s138-info',sub));
  if(!disabled){el.setAttribute('role','button');el.setAttribute('tabindex','0');
   el.addEventListener('click',function(e){if(e){e.preventDefault();e.stopPropagation();}fn();});
   el.addEventListener('keydown',function(e){if(e&&(e.key==='Enter'||e.key===' ')){e.preventDefault();fn();}});
   if(typeof root.$==='function'){try{root.$(el).on('hover:enter',fn);}catch(_){}}
  }else{el.setAttribute('aria-disabled','true');el.className+=' ms-s138-disabled';}return el;
 }
 function panelContent(){if(!series)return null;var box=element('section','ms-s138-panel'),top=element('div','ms-s138-head');
  top.appendChild(element('div','ms-s138-kicker','UAFix · Серіали'));
  top.appendChild(element('div','ms-s138-heading',series.title||'Вибір епізоду'));
  box.appendChild(top);
  if(series.phase==='episodes'){
   box.appendChild(element('div','ms-s138-subtitle','Оберіть сезон і серію'));
   var seasons={},active=series.season;
   series.episodes.forEach(function(e){seasons[e.season]=true;});
   var seasonRows=element('div','ms-s138-seasons');Object.keys(seasons).sort(function(a,b){return +a-+b;}).forEach(function(v){var sn=+v;
    var row=actionRow('Сезон '+sn,'','ms-s138-season'+(active===sn?' ms-s138-active':''),function(){
     if(series){series.season=sn;state.selectedSeason=sn;schedule();}},false);seasonRows.appendChild(row);});
   box.appendChild(seasonRows);
   var grid=element('div','ms-s138-episode-grid');var count=0;
   series.episodes.forEach(function(ep){if(ep.season!==active)return;count++;
    var row=actionRow('Серія '+ep.episode,ep.title+(ep.upcoming?' · Очікується':'') ,'ms-s138-episode',
     function(){openEpisode(ep);},ep.upcoming);grid.appendChild(row);});
   box.appendChild(grid);state.renderedEpisodes=count;
  }else{
   box.appendChild(actionRow('← До списку серій','','ms-s138-back',function(){series.phase='episodes';
    series.streams=[];state.ui='episodes';state.renderedStreams=0;schedule();},false));
   var ep=series.episode;box.appendChild(element('div','ms-s138-subtitle',ep?
    'Сезон '+ep.season+' · Серія '+ep.episode+' — '+ep.title:''));
   if(series.phase==='loading')box.appendChild(element('div','ms-s138-notice','Пошук потоків епізоду…'));
   if(series.phase==='error')box.appendChild(element('div','ms-s138-notice',state.lastNotice));
   if(series.phase==='streams'){
    var streams=element('div','ms-s138-stream-grid');series.streams.forEach(function(s,i){
     streams.appendChild(actionRow(s.provider+' · '+format(s.url),s.voice,'ms-s138-stream',function(){launchStream(i);},false));});
    box.appendChild(streams);state.renderedStreams=series.streams.length;
   }
  }
  return box;
 }
 function draw(){if(!root.document)return false;
  if(!series||!selectedUafix()){var gone=root.document.querySelector('.ms-s138-panel');
   if(gone&&gone.parentNode)gone.parentNode.removeChild(gone);return false;}
  var active=root.Lampa&&root.Lampa.Activity&&root.Lampa.Activity.active&&root.Lampa.Activity.active();
  var component=active&&(active.component||active.object&&active.object.component);
  if(component&&component!=='multi_source_online_v1')return false;
  var view=root.document.querySelector('.ms-scroll-viewport'),list=view&&view.querySelector('.ms-list');if(!list)return false;
  var old=list.querySelector('.ms-s138-panel');var fingerprint=series.token+':'+series.phase+':'+series.season+':'+
   (series.episode&&series.episode.episode||0)+':'+series.streams.length+':'+state.lastNotice;
  if(old&&old.getAttribute('data-ms-render')===fingerprint)return true;
  if(old&&old.parentNode)old.parentNode.removeChild(old);
  var content=panelContent();if(!content)return false;
  content.setAttribute('data-ms-render',fingerprint);
  list.insertBefore(content,list.firstChild);
  return true;
 }
 function schedule(){if(drawTimer||!root.setTimeout)return;drawTimer=root.setTimeout(function(){drawTimer=null;draw();},80);}
 function openEpisode(ep){if(!series||ep.upcoming)return;var key=series.token,request=series.requestId=(series.requestId||0)+1;
  series.episode=ep;series.streams=[];series.phase='loading';state.ui='loading';state.lastError='';
  state.playerFrames=0;state.playerRequests=0;state.playerResponses=0;state.streamsFound=0;schedule();
  resolveEpisode(ep).then(function(streams){if(!series||series.token!==key||series.requestId!==request)return;
   series.streams=streams;series.phase=streams.length?'streams':'error';state.ui=series.phase;schedule();
  },function(e){if(!series||series.token!==key||series.requestId!==request)return;state.lastError=errorText(e);
   state.lastNotice='Не вдалося отримати сторінку епізоду.';series.phase='error';state.ui='error';schedule();});}
 function launchStream(index){if(!series||series.phase!=='streams'||!selectedUafix())return false;
  var s=series.streams[index],l=root.Lampa;if(!s||!l||!l.Player||typeof l.Player.play!=='function')return false;
  if(Date.now()-lastLaunch<450)return false;lastLaunch=Date.now();
  var ep=series.episode,card=movie(),title=clean(card.title||card.name||series.title||'Серіал')+
   ' · S'+String(ep.season).padStart(2,'0')+'E'+String(ep.episode).padStart(2,'0')+' · '+s.provider;
  // Separate season and episode fields preserve series identity. Do not reuse movie timeline hashes.
  var play={url:s.url,title:title,season:ep.season,episode:ep.episode,voice_name:s.voice,
   isonline:true,card:card};if(s.headers)play.headers=s.headers;if(s.subtitles)play.subtitles=s.subtitles;
  var entry={};Object.keys(play).forEach(function(k){entry[k]=play[k];});play.playlist=[entry];
  try{l.Player.play(play);if(typeof l.Player.playlist==='function')l.Player.playlist([entry]);
   state.launches++;state.playerInvoked=true;state.lastProvider=s.provider;state.lastFormat=format(s.url);
   state.ui='player-invoked';if(card&&card.id&&l.Favorite&&typeof l.Favorite.add==='function')l.Favorite.add('history',card,100);
   return true;
  }catch(e){state.lastError=errorText(e);state.ui='player-error';return false;}
 }
 function reset(){session++;series=null;state.ui='idle';state.renderedEpisodes=0;state.renderedStreams=0;
  try{var p=root.document&&root.document.querySelector('.ms-s138-panel');if(p&&p.parentNode)p.parentNode.removeChild(p);}catch(_){} }
 function onCatalog(item,original,owner,ctx){var url=safeUrl(item&&item.url,undefined,firstParty);
  if(!url||!matchesCatalog(url))return original.call(owner,item,ctx);
  reset();var token=++session;state.stage='catalog-loading';state.lastError='';
  return loadCatalog(url).then(function(episodes){if(token!==session)return {streams:[],embeds:[],notice:'Вибір серій скасовано.'};
   if(!episodes.length){state.stage='no-episode-links';return original.call(owner,item,ctx);}
   series={token:token,title:clean(item&&item.title)||'Серіал',base:url,episodes:episodes,
    season:episodes[0].season,episode:null,phase:'episodes',streams:[]};
   state.selectedSeason=series.season;state.selectedEpisode=0;state.stage='episodes-ready';state.ui='episodes';
   // Leave the upstream view responsible for its own toolbar/back navigation.
   schedule();return {streams:[],embeds:[],pageUrl:url,notice:'Виберіть сезон і серію в картках UAFix.'};
  },function(e){state.lastError=errorText(e);state.stage='catalog-error';return original.call(owner,item,ctx);});}
 function installStyle(){var d=root.document;if(!d||!d.head||d.getElementById('ms-s138-style'))return;
  var s=element('style');s.id='ms-s138-style';s.textContent=
  '.ms-s138-panel{padding:1rem;border:1px solid rgba(255,255,255,.22);border-radius:.7rem;margin:.5rem 0 1rem;background:rgba(21,29,40,.9);color:#fff;}'+
  '.ms-s138-kicker{font-size:.8rem;opacity:.7}.ms-s138-heading{font-size:1.3rem;font-weight:700;margin:.35rem 0}'+
  '.ms-s138-subtitle{font-size:1rem;margin:.8rem 0}.ms-s138-seasons,.ms-s138-stream-grid,.ms-s138-episode-grid{display:grid;gap:.6rem}'+
  '.ms-s138-seasons{grid-template-columns:repeat(auto-fill,minmax(8rem,1fr));margin:.6rem 0 1rem}'+
  '.ms-s138-episode-grid,.ms-s138-stream-grid{grid-template-columns:repeat(2,minmax(0,1fr))}'+
  '.ms-s138-panel .ms-row{display:flex;flex-direction:column;justify-content:center;min-width:0;padding:.9rem!important;'+
   'border-radius:.5rem;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);cursor:pointer;margin:0!important}'+
  '.ms-s138-panel .ms-row.focus,.ms-s138-panel .ms-row:focus{background:#fff;color:#101922;outline:2px solid #fff;outline-offset:2px}'+
  '.ms-s138-title{font-weight:700;font-size:1.03rem}.ms-s138-info{font-size:.83rem;margin-top:.25rem;opacity:.78;line-height:1.3}'+
  '.ms-s138-panel .ms-s138-active{border-color:rgba(77,175,255,.9);background:rgba(45,128,205,.35)}'+
  '.ms-s138-panel .ms-s138-disabled{opacity:.45;cursor:default}.ms-s138-panel .ms-s138-back{margin:.55rem 0!important}'+
  '.ms-s138-notice{padding:1rem;opacity:.85}'+
  '@media(max-width:750px){.ms-s138-episode-grid,.ms-s138-stream-grid{grid-template-columns:1fr}}';
  d.head.appendChild(s);
 }
 function diagnostic(){return {version:state.version,installed:state.installed,stage:state.stage,
  catalogRequests:state.catalogRequests,catalogResponses:state.catalogResponses,seasonRequests:state.seasonRequests,
  seasonsFound:state.seasonsFound,episodesFound:state.episodesFound,renderedEpisodes:state.renderedEpisodes,
  selectedSeason:state.selectedSeason,selectedEpisode:state.selectedEpisode,episodeRequests:state.episodeRequests,
  episodeResponses:state.episodeResponses,playerFrames:state.playerFrames,playerRequests:state.playerRequests,
  playerResponses:state.playerResponses,streamsFound:state.streamsFound,renderedStreams:state.renderedStreams,
  launches:state.launches,lastProvider:state.lastProvider,lastFormat:state.lastFormat,lastError:state.lastError,
  lastNotice:state.lastNotice,ui:state.ui,playerInvoked:state.playerInvoked,baseVersion:state.baseVersion};}
 function attachDiagnostic(){var s=root.MultiSourceSources1315b;if(!s||!s.diagnostic||s.diagnostic._msSeriesD138)return;
  var before=s.diagnostic;s.diagnostic=function(){var d=before.apply(this,arguments);if(d){if(!d.lastDetailEvidence)d.lastDetailEvidence={};
   var e=d.lastDetailEvidence;if(!e.sourceExpansionD13)e.sourceExpansionD13={};e.sourceExpansionD13.series=diagnostic();}
   return d;};s.diagnostic._msSeriesD138=true;}
 function install(){var api=root.LampaMultiSource,base=root.MultiSourceD13;
  if(!api||!api._coreLoaded||typeof api.listSources!=='function'||typeof api.registerSource!=='function'||
   !base||!base.installed)return false;
  var list=api.listSources()||[],src=null;
  for(var i=0;i<list.length;i++)if(list[i]&&list[i].id==='uafix'){src=list[i];break;}
  if(!src||typeof src.getStreams!=='function'||typeof src.search!=='function')return false;
  if(src.getStreams._msSeriesD138){state.installed=true;state.stage='already-patched';return true;}
  var original=src.getStreams,copy={};Object.keys(src).forEach(function(k){copy[k]=src[k];});
  copy.getStreams=function(item,ctx){return onCatalog(item,original,src,ctx);};copy.getStreams._msSeriesD138=true;
  var oldSearch=src.search;copy.search=function(movie,ctx){reset();return oldSearch.call(src,movie,ctx);};
  api.registerSource(copy);registry=copy;state.installed=true;state.stage='ready';state.baseVersion=clean(base.version);
  installStyle();attachDiagnostic();
  if(root.MutationObserver&&root.document&&root.document.body){observer=new root.MutationObserver(function(){schedule();});
   observer.observe(root.document.body,{childList:true,subtree:true});}
  return true;
 }
 root.MultiSourceUafixSeriesD138={version:VERSION,install:install,diagnostic:diagnostic,
  _test:{parseListing:parseListing,matchesCatalog:matchesCatalog,media:media,detectPlayerHtml:detectPlayerHtml,
   uniqueEpisodes:uniqueEpisodes,resolveEpisode:resolveEpisode,loadCatalog:loadCatalog,onCatalog:onCatalog,
   openEpisode:openEpisode,launchStream:launchStream,render:draw,reset:reset}};
 if(!install()&&root.setInterval){var attempts=0;installTimer=root.setInterval(function(){
  if(install()||++attempts>100){root.clearInterval(installTimer);if(!state.installed)state.stage='core-timeout';}
 },350);}
})(window);
