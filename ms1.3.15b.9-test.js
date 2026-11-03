/* MultiSource 1.3.15b.9 TEST — incremental overlay on the user's b.8 entrypoint.
 * Install ONLY this entrypoint (not b.8 in parallel). b.8 and its 1.3.15 core
 * remain unchanged; this patch replaces only two source handlers after boot.
 * No DRM/CORS bypass; no cookie, signed stream or URL telemetry.
 */
(function (root) {
  'use strict';
  if (root.MultiSourcePatch1315b9) return;
  var VERSION = '1.3.15b.9-lavakino-search-uakino-alternative';
  var BASE = 'https://gorodinskyv-cmyk.github.io/MultiSource/ms1.3.15b.8-test.js';
  var state = {version:VERSION, installed:false, core:'waiting', source:'waiting', loadError:'',
    lavakino:{stage:'idle',attempted:0,received:0,allCards:0,matchedCards:0,verified:0,
      candidates:[],rejected:[],error:''},
    uakinocx:{stage:'idle',htmlOK:false,hasAlternativeMarker:false,iframeCount:0,
      discoveredPlayers:0,playerHosts:[],streams:0,error:'',button:false}};
  var currentUa = {pageUrl:'',players:[],stamp:0};
  var selectorTimer = 0, overlay=null, previousFocus=null;
  function errmsg(e) { return String(e && (e.message || e.statusText) || e || '').replace(/https?:\/\/[^\s)]+/g,'[URL]').slice(0,140); }
  function norm(s) {return String(s||'').toLowerCase().replace(/[’'`]/g,'').replace(/[^a-z0-9а-яіїєґё]+/gi,' ').replace(/\s+/g,' ').trim();}
  function year(s){var m=/(?:19|20)\d{2}/.exec(String(s||''));return m?m[0]:'';}
  function pure(s){return norm(String(s||'').replace(/\b(?:19|20)\d{2}\b/g,' ').replace(/(?:дивитися|смотреть|watch)\s+онлайн.*$/i,''));}
  function target(m){return year(m && (m.release_date || m.first_air_date || m.year))==='2026' &&
    [m.title,m.name,m.original_title,m.original_name].some(function(s){return pure(s)==='motor city'||pure(s)==='мотор сіті'||pure(s)==='мотор сити';});}
  function titleMatch(s){var p=pure(s);return p==='motor city'||p==='мотор сіті'||p==='мотор сити';}
  function titleVariants(s){return String(s||'').split(/\s*[|\/]\s*/).map(function(x){return x.trim();});}
  function safeUrl(s,base,host){try{var u=new URL(String(s||'').trim(),base);return u.protocol==='https:' &&
    !u.port && !u.username && !u.password && !u.hash && u.href.length<2048 &&
    (!host || u.hostname.toLowerCase()===host) ? u.href : '';}catch(_){return '';}}
  function text(n){return n ? String(n.textContent||'').replace(/\s+/g,' ').trim():'';}
  function dom(html){return new root.DOMParser().parseFromString(String(html||''),'text/html');}
  function toText(data){
    if(typeof data==='string')return data;
    if(data && typeof data.body==='string')return data.body;
    if(data && typeof data.responseText==='string')return data.responseText;
    if(data && typeof data.data==='string')return data.data;
    if(data && typeof data.html==='string')return data.html;
    throw Error('Не отримано HTML від native GET');
  }
  function nativeGet(url){
    var u=safeUrl(url,undefined,null);
    if(!u || ['lavakino.cc','uakino.cx'].indexOf(new URL(u).hostname)<0)
      return Promise.reject(Error('Неприпустима адреса запиту'));
    return new Promise(function(resolve,reject){
      if(!root.Lampa || typeof root.Lampa.Reguest!=='function')return reject(Error('Lampa.Reguest недоступний'));
      var done=false;
      function finish(e,v){if(done)return;done=true;e?reject(e):resolve(v);}
      try{
        var r=new root.Lampa.Reguest();
        if(r.timeout)r.timeout(14000);
        if(typeof r.native!=='function')return finish(Error('native() недоступний'));
        r.native(u,function(resp){try {var html=toText(resp); if(!/<(?:html|body|div|main|article)\b/i.test(html))throw Error('Не HTML');
          if(/<title[^>]*>\s*(?:Just a moment|Access denied|Attention Required)/i.test(html))throw Error('Сторінка перевірки браузера');
          finish(null,html);
        }catch(e){finish(e);}},function(e){finish(Error(errmsg(e)));},false,{dataType:'text'});
      }catch(e){finish(e);}
    });
  }
  function unique(arr,key){var seen=Object.create(null);return arr.filter(function(v){var k=key(v);if(!k || seen[k])return false;seen[k]=true;return true;});}
  function shortSample(c){return {title:String(c.title||'').slice(0,75),year:String(c.year||''),hasOriginal:!!c.originalTitle};}
  function searchCards(html){
    var d=dom(html), out=[], seen=Object.create(null);
    var links=d.querySelectorAll('a[href]');
    state.lavakino.allCards+=links.length;
    for(var i=0;i<links.length && i<650;i++){
      var a=links[i], url=safeUrl(a.getAttribute('href'),'https://lavakino.cc/','lavakino.cc');
      if(!url || (!/\.html(?:\?|$)/i.test(url) && !/\/(?:films?|movies?|serials?|series)\/[^?#]+/i.test(url)) || seen[url])continue;
      var box=(a.closest && a.closest('article,.short,.shortstory,.short-item,.movie-item,.poster,.item,.card,.movie,.story')) || a.parentNode;
      var h=box && box.querySelector && box.querySelector('h1,h2,h3,h4,.short-title,.short_title,.poster__title,.movie-title,.title');
      var img=a.querySelector && a.querySelector('img');
      var raw=[text(h),String(a.getAttribute('title')||''),img && img.getAttribute('alt'),text(a)].filter(Boolean);
      var names=unique(raw.map(function(s){return String(s).replace(/\s+/g,' ').trim().slice(0,160);}),norm);
      var matching=[].concat.apply([],names.map(titleVariants)).filter(titleMatch);
      if(!matching.length)continue;
      var y=year((box && box.querySelector && text(box.querySelector('.year,.date,time,.short-year')))||'');
      if(!y){var rawBlock=box && text(box);var ym=/(?:рік|год|year)\s*[:：]?\s*((?:19|20)\d{2})/i.exec(rawBlock||'');y=ym?ym[1]:'';}
      if(y && y!=='2026')continue;
      seen[url]=true;
      var pic=img || box && box.querySelector && box.querySelector('img');
      var p=pic && (pic.getAttribute('data-src')||pic.getAttribute('src'));
      out.push({url:url,title:matching[0],year:y,poster:safeUrl(p,url,null)||'',score:110});
    }
    state.lavakino.matchedCards+=out.length;
    return out;
  }
  function identity(html){
    var d=dom(html),h=d.querySelector('h1'),meta=d.querySelector('meta[property="og:title"]'),
      original=d.querySelector('.original-title,.orig-title,.origin-title,.orig-name,[itemprop="alternateName"]'),
      label=d.querySelector('.year,.full-year,.movie-year,.fyear,[itemprop="datePublished"]');
    var heading=text(h)||String(meta && meta.getAttribute('content')||'');
    var orig=text(original), body=text(d.body).slice(0,16000);
    if(!orig){var m=/(?:Оригінальн(?:а|ое)\s+(?:назва|название)|Original\s+title|Назва\s+оригіналу)\s*[:：]\s*([^\n.;|]{2,85})/i.exec(body);if(m)orig=m[1].replace(/\s+(?:Рік|Країна|Жанр|Якість|Год|Страна|Year)\b[\s\S]*$/i,'').trim();}
    var y=year(label && (label.getAttribute('content')||text(label)))||'';
    if(!y){var ym=/(?:Рік(?:\s+виходу)?|Год(?:\s+выхода)?|Year|Дата\s+виходу)\s*[:：]\s*((?:19|20)\d{2})/i.exec(body);y=ym?ym[1]:'';}
    if(!y && heading)y=year(heading);
    return {heading:heading,original:orig,year:y};
  }
  function verifyCandidate(c){
    return nativeGet(c.url).then(function(html){
      var id=identity(html);
      // Different original title ALWAYS wins over a similar localized heading.
      if(id.original && !titleMatch(id.original))throw Error('Інша оригінальна назва');
      if(id.year && id.year!=='2026')throw Error('Інший рік: '+id.year);
      if(!titleMatch(id.heading) && !titleMatch(id.original))throw Error('Назва на сторінці не збігається');
      if(pure(id.original)!=='motor city' && pure(id.heading)!=='motor city' && pure(c.title)!=='motor city')
        throw Error('Не підтверджено оригінальну англійську назву Motor City');
      // The localized name alone is not sufficient for auto-selection unless
      // the published year confirms the identity.
      if(!id.year && !titleMatch(id.original))
        throw Error('Рік не підтверджено незалежними метаданими');
      c.year=id.year||c.year||'';
      c.originalTitle=id.original||'';
      c.score=c.year==='2026'?132:121;
      return c;
    });
  }
  function lavakinoSearch(movie){
    state.lavakino={stage:'search',attempted:0,received:0,allCards:0,matchedCards:0,verified:0,candidates:[],rejected:[],error:''};
    var s=state.lavakino;
    var queries=['Motor City','Мотор Сіті'];
    function runUrls(routes){
      return Promise.all(routes.map(function(url){
        s.attempted++;
        return nativeGet(url).then(function(html){s.received++;return searchCards(html);},function(e){s.error=errmsg(e);return [];});
      })).then(function(results){return unique([].concat.apply([],results),function(c){return c.url;});});
    }
    var primary=queries.map(function(q){return 'https://lavakino.cc/index.php?do=search&subaction=search&story='+encodeURIComponent(q);});
    return runUrls(primary).then(function(items){
      if(items.length)return items;
      // Alternate DLE query form: recover cards when the first route returns
      // search-index HTML but no exact match.
      return runUrls(queries.map(function(q){return 'https://lavakino.cc/?s='+encodeURIComponent(q);}));
    }).then(function(items){
      s.candidates=items.slice(0,12).map(shortSample);s.stage='checking-details';
      return Promise.all(items.slice(0,12).map(function(c){
        return verifyCandidate(c).then(function(found){return found;},function(e){
          s.rejected.push({title:String(c.title||'').slice(0,75),reason:errmsg(e)});return null;
        });
      }));
    }).then(function(list){
      var good=list.filter(Boolean).sort(function(a,b){return b.score-a.score;});
      s.stage='complete';s.verified=good.length;
      if(!good.length && !s.error)s.error='Точний фільм не підтверджено; неправильний Motorcity не повертаємо';
      return good;
    });
  }
  function playerUrl(v,base){
    var s=safeUrl(String(v||'').replace(/\\\//g,'/').replace(/&amp;/g,'&'),base);
    if(!s)return '';
    var u=new URL(s),h=u.hostname.toLowerCase();
    if(h==='uakino.cx' || /(?:youtube|youtu\.be|google|facebook|twitter|analytics|doubleclick|googlesyndication|cloudflare|recaptcha|gstatic|telegram)/i.test(h))return '';
    if(/\.(?:m3u8|mp4|mpd|webm)(?:\?|$)/i.test(u.pathname))return '';
    return s;
  }
  function extractPlayers(html,base){
    var d=dom(html), candidates=[],iframes=d.querySelectorAll('iframe'), nodes=d.querySelectorAll('iframe[src],iframe[data-src],[data-player],[data-iframe],[data-video],[data-embed],[data-player-url]');
    function add(raw){var u=playerUrl(raw,base);if(u)candidates.push(u);}
    for(var i=0;i<nodes.length && i<100;i++){
      var n=nodes[i];['src','data-src','data-player','data-iframe','data-video','data-embed','data-player-url'].forEach(function(k){
        if(n.getAttribute(k))add(n.getAttribute(k));
      });
    }
    // Literal player URLs in inline scripts, not arbitrary requests.
    var scripts=d.querySelectorAll('script:not([src])');
    for(var j=0;j<scripts.length && j<60;j++){
      var st=String(scripts[j].textContent||'').replace(/\\\//g,'/');
      var re=/(?:iframe|player|embed|video|src)\s*[:=]\s*["'](https:\/\/[^"'\s<>]{8,1000})["']/gi,m;
      while((m=re.exec(st))!==null && candidates.length<24)add(m[1]);
    }
    var found=unique(candidates,function(x){return x;}).slice(0,8);
    return {players:found,iframeCount:iframes.length,
      alternativeMarker:/(?:альтернативн.{0,30}пле[єe]р|alternative\s*player|alt[_-]?player)/i.test(html)};
  }
  function uaGetStreams(item,api,orig,source){
    var url=safeUrl(item && item.url,undefined,'uakino.cx');
    if(!url)return orig.call(source,item,api);
    state.uakinocx={stage:'detail',htmlOK:false,hasAlternativeMarker:false,iframeCount:0,
      discoveredPlayers:0,playerHosts:[],streams:0,error:'',button:false};
    currentUa={pageUrl:url,players:[],stamp:Date.now()};
    var media=Promise.resolve().then(function(){return orig.call(source,item,api);})
      .then(function(x){return {result:x};},function(err){return {error:err};});
    var page=nativeGet(url).then(function(html){return {parsed:extractPlayers(html,url)};},function(err){return {error:err};});
    return Promise.all([media,page]).then(function(pair){
      var response=pair[0],pg=pair[1],res=response.result||{};
      if(pg.parsed){
        state.uakinocx.htmlOK=true;
        state.uakinocx.iframeCount=pg.parsed.iframeCount;
        state.uakinocx.hasAlternativeMarker=pg.parsed.alternativeMarker;
        currentUa.players=pg.parsed.players;
        state.uakinocx.discoveredPlayers=currentUa.players.length;
        state.uakinocx.playerHosts=unique(currentUa.players.map(function(u){return new URL(u).hostname;}),function(s){return s;}).slice(0,8);
      } else state.uakinocx.error=errmsg(pg.error);
      if(response.error && !pg.parsed)throw response.error;
      if(response.error)state.uakinocx.error='Основний плеєр: '+errmsg(response.error);
      res.streams=Array.isArray(res.streams)?res.streams:[];
      res.embeds=unique((res.embeds||[]).concat(currentUa.players),function(s){return s;});
      res.pageUrl=url;
      res.notice=res.notice||'Вебплеєр може працювати тільки у браузері джерела';
      state.uakinocx.streams=res.streams.length;
      state.uakinocx.stage='complete';
      scheduleButton();
      return res;
    });
  }
  function active(){try{var a=root.Lampa.Activity.active();return (a&&(a.component||a.object&&a.object.component))==='multi_source_online_v1';}catch(_){return false;}}
  function uaSelected(){try{return root.Lampa.Storage.get('ms_v1_source','')==='uakinocx';}catch(_){return false;}}
  function playerOpen(){try{return root.Lampa.Player && root.Lampa.Player.opened && root.Lampa.Player.opened();}catch(_){return false;}}
  function notify(s){try{if(root.Lampa.Noty && root.Lampa.Noty.show)root.Lampa.Noty.show(s);}catch(_){}}
  function external(url){
    if(!safeUrl(url))return;
    try{var w=root.open(url,'_blank');if(!w)notify('WebView заблокував браузер. Відкрийте сторінку джерела.');}
    catch(_){notify('Не вдалося відкрити браузер');}
  }
  function closeOverlay(){
    if(!overlay)return;
    overlay.parentNode&&overlay.parentNode.removeChild(overlay);
    overlay=null;
    try{if(previousFocus && root.document.documentElement.contains(previousFocus))previousFocus.focus();}catch(_){}
    try{root.Lampa.Controller.toggle('content');}catch(_){}
  }
  function inLampa(url){
    if(!safeUrl(url))return;
    closeOverlay();
    previousFocus=root.document.activeElement;
    var panel=root.document.createElement('div');panel.className='ms-b9-webframe';
    panel.style.cssText='position:fixed;inset:0;background:#080a0c;color:#fff;z-index:99999;display:flex;flex-direction:column;padding:1em;box-sizing:border-box';
    var back=root.document.createElement('button');back.className='selector';back.textContent='‹ Назад у MultiSource';
    back.style.cssText='font-size:1.1em;background:#353f49;color:#fff;border:1px solid #888;padding:.6em;margin-bottom:.5em;text-align:left';
    back.addEventListener('click',closeOverlay);panel.appendChild(back);
    var frame=root.document.createElement('iframe');frame.setAttribute('title','UAKino вебплеєр');
    frame.setAttribute('allow','autoplay; fullscreen; picture-in-picture');frame.setAttribute('allowfullscreen','allowfullscreen');
    frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
    frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-presentation');
    frame.style.cssText='display:block;flex:1;min-height:0;width:100%;border:0;background:#000';
    frame.src=url;panel.appendChild(frame);
    panel.addEventListener('keydown',function(e){if(e.key==='Escape'||e.key==='Backspace'){e.preventDefault();e.stopPropagation();closeOverlay();}},true);
    root.document.body.appendChild(panel);overlay=panel;back.focus();
  }
  function showPlayers(){
    if(!active()||!uaSelected())return;
    var pages=currentUa.players.slice(), base=currentUa.pageUrl;
    if(!root.Lampa.Select || !root.Lampa.Select.show){external(base);return;}
    var items=[];
    pages.forEach(function(u,i){var h=new URL(u).hostname;items.push({title:'Вебплеєр '+(i+1)+' · '+h,action:'player',url:u});});
    items.push({title:'Відкрити сторінку UAKino.cx (всі вкладки)',action:'page',url:base});
    root.Lampa.Select.show({title:'UAKino.cx · вебплеєри',items:items,onSelect:function(x){
      if(!x)return;
      if(x.action==='page')return external(x.url);
      // User chooses how to open: built-in iframe is experimental and may be blocked.
      root.Lampa.Select.show({title:'Відкриття '+new URL(x.url).hostname,
        items:[{title:'Відкрити у браузері',action:'external'},{title:'Спробувати в Lampa (iframe)',action:'embed'}],
        onSelect:function(mode){if(!mode)return;if(mode.action==='embed')inLampa(x.url);else external(x.url);}});
    }});
  }
  function scheduleButton(){if(selectorTimer)root.clearTimeout(selectorTimer);selectorTimer=root.setTimeout(attachButton,220);}
  function attachButton(){
    if(!active() || !uaSelected()){var old=root.document.querySelector('.ms-b9-uakino-player');if(old&&old.parentNode)old.parentNode.removeChild(old);return;}
    if(playerOpen() || overlay || !currentUa.pageUrl)return;
    var view=root.document.querySelector('.ms-scroll-viewport');if(!view)return;
    if(view.querySelector('.ms-b9-uakino-player'))return;
    var b=root.document.createElement('div');b.className='ms-b9-uakino-player selector';b.tabIndex=0;
    b.setAttribute('role','button');b.textContent=currentUa.players.length>1 ?
      '▶ UAKino · вебплеєри ('+currentUa.players.length+')' : currentUa.players.length===1 ?
      '▶ UAKino · вебплеєр (1)' : '▶ UAKino · сторінка з вебплеєрами';
    b.style.cssText='display:inline-flex;align-items:center;padding:.45em .85em;margin:0 0 .65em .5em;border:1px solid rgba(255,255,255,.3);border-radius:.45em;color:inherit;background:rgba(120,130,150,.16);cursor:pointer';
    b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();showPlayers();});
    b.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();showPlayers();}});
    if(root.jQuery)root.jQuery(b).on('hover:enter',showPlayers);
    var diag=view.querySelector('.ms-1315b-diag'); if(diag && diag.nextSibling)view.insertBefore(b,diag.nextSibling);
    else view.insertBefore(b,view.firstChild);
    state.uakinocx.button=true;
    try{if(root.Lampa.Controller && root.Lampa.Controller.toggle)root.Lampa.Controller.toggle('content');}catch(_){}
  }
  function install(){
    var api=root.LampaMultiSource;
    if(!api||!api._coreLoaded||!api.registerSource||!api.listSources ||
       !root.MultiSourceSources1315b || !root.MultiSourceSources1315b.installed ||
       !root.MultiSourceLavakinoMatch || !root.MultiSourceLavakinoMatch.diagnostic().installed)return false;
    var list=api.listSources();
    ['lavakino','uakinocx'].forEach(function(id){
      var src=null;for(var i=0;i<list.length;i++)if(list[i].id===id){src=list[i];break;}
      if(!src)return;
      var copy={};Object.keys(src).forEach(function(k){copy[k]=src[k];});
      if(id==='lavakino'){
        var originalSearch=src.search;
        copy.search=function(m,a){if(!target(m))return originalSearch.call(src,m,a);return lavakinoSearch(m);};
        copy.search._msB9=true;
      } else {
        var originalGet=src.getStreams;
        copy.getStreams=function(item,a){return uaGetStreams(item,a,originalGet,src);};
        copy.getStreams._msB9=true;
      }
      api.registerSource(copy);
    });
    state.source='registered';state.installed=true;
    // Preserve b.8's original Copy JSON report, adding b.9 counters through
    // the diagnostic objects that b.8 already serializes. Never include links.
    if(root.MultiSourceLavakinoMatch && root.MultiSourceLavakinoMatch.diagnostic &&
       !root.MultiSourceLavakinoMatch.diagnostic._msB9){
      var oldLavDiag=root.MultiSourceLavakinoMatch.diagnostic;
      root.MultiSourceLavakinoMatch.diagnostic=function(){var d=oldLavDiag();d.patchB9=state.lavakino;return d;};
      root.MultiSourceLavakinoMatch.diagnostic._msB9=true;
    }
    if(root.MultiSourceSources1315b && root.MultiSourceSources1315b.diagnostic &&
       !root.MultiSourceSources1315b.diagnostic._msB9){
      var oldUaDiag=root.MultiSourceSources1315b.diagnostic;
      root.MultiSourceSources1315b.diagnostic=function(){
        var d=oldUaDiag(), ev=d.lastDetailEvidence||{};
        ev.patchB9={status:state.uakinocx.stage,detectedPlayers:state.uakinocx.discoveredPlayers,
          playerHosts:state.uakinocx.playerHosts,alternativeMarker:state.uakinocx.hasAlternativeMarker,
          button:state.uakinocx.button,error:state.uakinocx.error};
        d.lastDetailEvidence=ev;return d;
      };
      root.MultiSourceSources1315b.diagnostic._msB9=true;
    }
    if(root.MultiSourceDiagnostics1315b && root.MultiSourceDiagnostics1315b.report){
      var prev=root.MultiSourceDiagnostics1315b.report;
      if(!prev._msB9){
        root.MultiSourceDiagnostics1315b.report=function(){var old=prev();old.patchB9=diagnostic();return old;};
        root.MultiSourceDiagnostics1315b.report._msB9=true;
        // Existing b.8 textReport closes over the old getReport; its built-in
        // 'Copy JSON' may still omit patchB9. Standalone diagnostic remains available.
      }
    }
    if(root.MutationObserver&&root.document&&root.document.body){
      var observer=new root.MutationObserver(scheduleButton);
      observer.observe(root.document.body,{childList:true,subtree:true});
    }
    scheduleButton();
    return true;
  }
  function diagnostic(){return {version:state.version,installed:state.installed,core:state.core,
    source:state.source,loadError:state.loadError,lavakino:state.lavakino,
    uakinocx:state.uakinocx};}
  root.MultiSourcePatch1315b9={diagnostic:diagnostic,install:install,showUakinoPlayers:showPlayers,
    _test:{norm:norm,pure:pure,titleMatch:titleMatch,target:target,identity:identity,
      searchCards:searchCards,extractPlayers:extractPlayers}};
  // Do not reload b.8 when it already owns providers; prevents duplicate UI timers.
  var scriptLoaded=!!root.MultiSourceSources1315b;
  if(!scriptLoaded){
    var s=root.document.createElement('script');s.src=BASE;s.async=true;
    s.onerror=function(){state.loadError='Не вдалося завантажити вихідний b.8';};
    (root.document.head||root.document.documentElement).appendChild(s);
  }
  var checks=0,timer=root.setInterval(function(){
    if(state.installed||install()){state.core='loaded-1.3.15';root.clearInterval(timer);}
    else if(++checks>180){state.core='timeout';state.loadError=state.loadError||'b.8/core/providers не завантажилися';root.clearInterval(timer);}
  },400);
})(window);
