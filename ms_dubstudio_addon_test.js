/* MultiSource DubStudio.party discovery adapter — experimental, 2026-11-23.
 * Requires main MultiSource 1.3.15d.13.9 and its LampaMultiSource API.
 * Public catalog and same-origin HTML only; no private API guesses, iframe playback,
 * credentials, DRM bypass, media relay, or recording of signed media addresses.
 */
(function(root){
 'use strict';
 if(root.MultiSourceDubStudio1315 && root.MultiSourceDubStudio1315.installed)return;
 var VERSION='1.3.15d.13.9-dubstudio-test.1',ID='dubstudio',ORIGIN='https://dubstudio.party';
 var st={version:VERSION,installed:false,stage:'waiting-core',transport:'',requests:0,successes:0,failures:0,
  lastStatus:0,lastError:'',searchPages:0,searchCards:0,matchedCandidates:0,verified:0,
  imdbIdUsed:false,detailRequests:0,detailHtmlBytes:0,playerTags:0,publicMediaCandidates:0,
  streams:0,reason:'',policy:'public-first-party-html-only; direct-public-media-only; no iframe playback, auth bypass or media relay'};
 var timer=0,attempts=0;
 function clean(x){return String(x==null?'':x).replace(/\s+/g,' ').trim();}
 function errText(e){return clean(e&&e.message||e).replace(/https?:\/\/[^\s"'<>]+/gi,'[URL]').slice(0,135);}
 function decoded(x){return clean(String(x||'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&nbsp;/gi,' ').replace(/&#(\d+);/g,function(_,n){var i=Number(n);return i>31&&i<128?String.fromCharCode(i):'';}));}
 function strip(x){return decoded(String(x||'').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' '));}
 function norm(x){return clean(x).toLowerCase().replace(/&(?:amp|nbsp);/g,' ').replace(/[«»“”'’]/g,'').replace(/[^a-z0-9а-яіїєґё]+/gi,' ').replace(/\s+/g,' ').trim();}
 function year(x){var m=/(?:19|20)\d{2}/.exec(String(x||''));return m?m[0]:'';}
 function idFromMovie(movie){var a=[movie&&movie.imdb_id,movie&&movie.imdbId,movie&&movie.imdb, movie&&movie.external_ids&&movie.external_ids.imdb_id,
   movie&&movie.externalIds&&movie.externalIds.imdb_id,movie&&movie.external_ids&&movie.external_ids.imdbId];
  for(var i=0;i<a.length;i++){var x=clean(a[i]);if(/^tt\d{7,10}$/.test(x))return x;}return '';
 }
 function titleNames(movie){var a=[movie&&movie.title,movie&&movie.name,movie&&movie.original_title,movie&&movie.original_name],out=[];
  a.forEach(function(s){var n=norm(s);if(n&&out.indexOf(n)<0)out.push(n);});return out;}
 function isTv(movie){return !!(movie&&(movie.media_type==='tv'||movie.type==='tv'||movie.first_air_date||movie.number_of_seasons));}
 function pageUrl(value){try{var u=new URL(String(value||''),ORIGIN+'/');if(u.protocol!=='https:'||u.hostname!=='dubstudio.party'||u.username||u.password||u.port||!/^\/movie\/tt\d{7,10}\/?$/.test(u.pathname))return '';
  return ORIGIN+u.pathname.replace(/\/$/,'');}catch(_){return '';}}
 function sameOrigin(value){try{var u=new URL(String(value||''),ORIGIN+'/');if(u.protocol!=='https:'||u.hostname!=='dubstudio.party'||u.username||u.password||u.port)return '';
  if(!/^\/(?:$|catalog\/(?:movies|series|anime)\/?$|movie\/tt\d{7,10}\/?$)/.test(u.pathname))return '';
  u.hash='';u.search='';return u.href;}catch(_){return '';}}
 function asText(p){if(typeof p==='string')return p;return p&&typeof p.responseText==='string'?p.responseText:
  p&&typeof p.data==='string'?p.data:p&&typeof p.body==='string'?p.body:'';}
 function htmlOkay(h){return typeof h==='string'&&h.length>100&&/<(?:html|body|main|div|a|script|title)\b/i.test(h)&&
  !/<title[^>]*>\s*(?:Just a moment|Access denied|Attention required)/i.test(h);}
 function getText(url,ctx){var safe=sameOrigin(url);if(!safe)return Promise.reject(Error('unapproved-source-url'));
  st.requests++;
  var l=root.Lampa,reg=l&&l.Reguest, android=false;try{android=!!(root.AndroidJS||(l&&l.Platform&&typeof l.Platform.is==='function'&&(l.Platform.is('android')||l.Platform.is('android_tv'))));}catch(_){}
  // A true Lampa Android bridge may also be present when Platform.is differs.
  try{android=android||!!(root.Lampa&&root.Lampa.Android&&root.Lampa.Android.enabled);}catch(_){}
  function via(mode){return new Promise(function(resolve,reject){if(!reg)return reject(Error('no-lampa-network'));
   var req=new reg(),finished=false,tm=0;
   function done(e,v){if(finished)return;finished=true;if(tm&&root.clearTimeout)root.clearTimeout(tm);e?reject(e):resolve(v);}
   if(typeof req[mode]!=='function')return done(Error(mode+'-unavailable'));
   if(req.timeout)req.timeout(10500);
   if(root.setTimeout)tm=root.setTimeout(function(){done(Error('timeout'));},11500);
   try{req[mode](safe,function(p){var h=asText(p);if(!htmlOkay(h))return done(Error('html-unavailable'));done(null,h);},
    function(e){var er=Error('request-failed');er.status=Number(e&&(e.status||e.httpStatus)||0);done(er);},false,{dataType:'text'});}
   catch(e){done(e);}
  });}
  var modes=android?['native','silent']:['silent'];
  function next(i){if(i>=modes.length){if(ctx&&typeof ctx.request==='function')return Promise.resolve().then(function(){return ctx.request(safe);}).then(asText).then(function(h){if(!htmlOkay(h))throw Error('html-unavailable');st.transport='core';st.successes++;return h;});
   return Promise.reject(Error('html-transport-unavailable'));}
   return via(modes[i]).then(function(h){st.transport=modes[i];st.successes++;return h;},function(e){if(i+1>=modes.length&&!(ctx&&typeof ctx.request==='function'))throw e;return next(i+1);});}
  return next(0).catch(function(e){st.failures++;st.lastStatus=Number(e&&e.status||0);st.lastError=errText(e);throw e;});
 }
 function detailTitle(html){var m=/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(String(html||''));
  if(m)return strip(m[1]);m=/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i.exec(String(html||''));
  return m?decoded(m[1]):'';}
 function titleMatches(s,movie){var n=norm(s),names=titleNames(movie),yr=year(movie&&(movie.year||movie.release_date||movie.first_air_date)),py=year(s);
  if(yr&&py&&Math.abs(Number(yr)-Number(py))>1)return false;
  for(var i=0;i<names.length;i++){if(names[i].length<3)continue;
   if((' '+n+' ').indexOf(' '+names[i]+' ')>=0)return true;}
  return false;}
 function extractCatalog(html,movie){var out=[],seen={},doc=null;
  try{doc=root.DOMParser?new root.DOMParser().parseFromString(String(html),'text/html'):null;}catch(_){}
  function push(link,text,title,img){var u=pageUrl(link);if(!u||seen[u])return;
   var t=title||text||'',y=year(t)||year(text),yy=year(movie&&(movie.year||movie.release_date||movie.first_air_date));
   if(yy&&y&&Math.abs(Number(yy)-Number(y))>1)return;
   if(!titleMatches(t,movie)&&!titleMatches(text,movie))return;
   seen[u]=true;out.push({url:u,title:clean(title)||titleNames(movie)[0],year:y,poster:img||'',score:100});}
  if(doc&&doc.querySelectorAll){var a=doc.querySelectorAll('a[href]');for(var i=0;i<a.length&&i<500;i++){
   var el=a[i],href=el.getAttribute('href');if(!pageUrl(href))continue;
   var header=el.querySelector('h1,h2,h3,h4,.title,.card-title'),im=el.querySelector('img'),img=im&&im.getAttribute('src')||'';
   push(href,clean(el.textContent),header&&clean(header.textContent)||im&&clean(im.getAttribute('alt'))||'',img);}
  }else{
   // Best-effort fallback for ES5 tests; Android normally supplies DOMParser.
   var rx=/<a\b([^>]*\bhref\s*=\s*["'][^"']*\/movie\/tt\d{7,10}\/?[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi,m;
   while((m=rx.exec(String(html)))&&out.length<100){var h=/\bhref\s*=\s*["']([^"']+)["']/i.exec(m[1]);if(h)push(h[1],strip(m[2]),strip(m[2]),'');}
  }
  return out.slice(0,25);
 }
 function directMedia(raw){try{var v=decoded(raw).replace(/\\\//g,'/').replace(/\\u002[fF]/g,'/');var u=new URL(v);
  if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.port||u.href.length>3000)return '';
  if(!/\.(?:m3u8|mp4|webm|mpd)(?:$|[?#])/i.test(u.href))return '';
  if(/(?:trailer|promo|advert|pre.?roll|\/ads?\/|vast)/i.test(u.href)||/(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|youtube\.com)$/.test(u.hostname))return '';
  return u.href;}catch(_){return '';}}
 function directStreams(html){var out=[],seen={},text=String(html||'');st.playerTags=(text.match(/<(?:video|source)\b/gi)||[]).length;
  function add(u){var good=directMedia(u);if(!good||seen[good]||out.length>=8)return;seen[good]=1;
   out.push({url:good,title:'DubStudio — прямий потік',voice:'Зі сторінки джерела',source:'DubStudio.party',isonline:true});}
  var rx=/<(?:video|source)\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,m;
  while((m=rx.exec(text))&&out.length<8)add(m[1]);
  // Only explicit, literal media URLs in public HTML; never decode private player internals.
  rx=/(?:["'](?:file|src|contentUrl|hls)["']\s*:\s*["'])(https?:\\?\/\\?\/[^"'\s<>]+\.(?:m3u8|mp4|webm|mpd)(?:\?[^"'\s<>]*)?)["']/gi;
  while((m=rx.exec(text))&&out.length<8)add(m[1]);
  st.publicMediaCandidates=out.length;return out;
 }
 function verify(url,movie,ctx){st.detailRequests++;return getText(url,ctx).then(function(html){st.detailHtmlBytes=html.length;
  var title=detailTitle(html),iid=idFromMovie(movie),urlId=(/\/movie\/(tt\d+)/.exec(url)||[])[1];
  if(iid&&urlId!==iid)return null;
  if(!titleMatches(title,movie))return null;
  st.verified++;return {url:url,title:clean(movie&&(movie.title||movie.name)||title),year:year(title),score:100};},function(){return null;});}
 function search(movie,ctx){st.stage='search';st.lastError='';st.reason='';st.searchPages=0;st.searchCards=0;st.matchedCandidates=0;st.verified=0;st.detailRequests=0;
  st.imdbIdUsed=false;var iid=idFromMovie(movie),pool=[],seen={};if(!movie||!titleNames(movie).length)return Promise.resolve([]);
  function scanCatalog(url){return getText(url,ctx).then(function(html){st.searchPages++;var found=extractCatalog(html,movie);st.searchCards+=found.length;
   found.forEach(function(x){if(!seen[x.url]){seen[x.url]=true;pool.push(x);}});},function(){});}
  function finish(){st.matchedCandidates=pool.length;var result=[];
   function next(i){if(i>=pool.length||i>=8)return Promise.resolve(result);
    return verify(pool[i].url,movie,ctx).then(function(x){if(x)result.push(x);return next(i+1);});}
   return next(0).then(function(x){st.stage=x.length?'results':st.searchPages?'no-verified-results':'transport-unavailable';st.reason=st.stage;return x;});}
  function catalogs(){var primary=isTv(movie)?'/catalog/series':'/catalog/movies';
   return scanCatalog(ORIGIN+primary).then(function(){if(pool.length)return;
    return scanCatalog(ORIGIN+'/');}).then(finish);}
  if(iid){st.imdbIdUsed=true;var url=pageUrl(ORIGIN+'/movie/'+iid);
   return verify(url,movie,ctx).then(function(x){if(x){st.stage='results';st.reason='imdb-exact';return [x];}return catalogs();});}
  return catalogs();
 }
 function getStreams(item,ctx){st.stage='detail';st.streams=0;st.publicMediaCandidates=0;st.playerTags=0;
  var url=pageUrl(item&&item.url);if(!url)return Promise.resolve({streams:[],embeds:[],notice:'Некоректна адреса DubStudio.'});
  return getText(url,ctx).then(function(html){st.detailHtmlBytes=html.length;var streams=directStreams(html);st.streams=streams.length;
   st.stage=streams.length?'direct-candidates':'no-public-direct-media';st.reason=streams.length?'public-media-unverified':'client-rendered-player-unverified';
   return {streams:streams,embeds:[],pageUrl:url,notice:streams.length?
    'Знайдено відкриті медіаадреси; фактичне відтворення ще не перевірено.':
    'DubStudio: у відкритому HTML не знайдено прямого медіапотоку. Клієнтський плеєр/API ще не підтверджено.'};
  },function(e){st.stage='transport-unavailable';st.reason=errText(e);return {streams:[],embeds:[],pageUrl:url,notice:'DubStudio: сторінка недоступна для прямої перевірки.'};});}
 function diagnostic(){var copy={};Object.keys(st).forEach(function(k){copy[k]=st[k];});return copy;}
 function attachDiagnostic(){var src=root.MultiSourceSources1315b;if(!src||typeof src.diagnostic!=='function'||src.diagnostic._msDubStudio)return;
  var old=src.diagnostic;src.diagnostic=function(){var d=old.apply(this,arguments);if(d){if(!d.lastDetailEvidence)d.lastDetailEvidence={};
   if(!d.lastDetailEvidence.sourceExpansionD13)d.lastDetailEvidence.sourceExpansionD13={};
   d.lastDetailEvidence.sourceExpansionD13.dubstudio=diagnostic();}return d;};src.diagnostic._msDubStudio=true;}
 function install(){var api=root.LampaMultiSource;if(!api||!api._coreLoaded||!api.registerSource)return false;
  api.registerSource({id:ID,name:'DubStudio.party (тест)',baseUrl:ORIGIN,isDetail:function(url){return !!pageUrl(url);},
   search:function(movie,ctx){return search(movie,ctx||api);},getStreams:function(item,ctx){return getStreams(item,ctx||api);}});
  st.installed=true;st.stage='ready';attachDiagnostic();return true;}
 root.MultiSourceDubStudio1315={version:VERSION,installed:false,diagnostic:diagnostic,install:install,
  _test:{pageUrl:pageUrl,sameOrigin:sameOrigin,extractCatalog:extractCatalog,directStreams:directStreams,
   directMedia:directMedia,detailTitle:detailTitle,titleMatches:titleMatches,idFromMovie:idFromMovie,search:search,getStreams:getStreams}};
 if(install())root.MultiSourceDubStudio1315.installed=true;
 else if(root.setInterval){timer=root.setInterval(function(){if(install()){root.MultiSourceDubStudio1315.installed=true;root.clearInterval(timer);}
  else if(++attempts>100){root.clearInterval(timer);st.stage='core-timeout';}},350);}
})(window);
