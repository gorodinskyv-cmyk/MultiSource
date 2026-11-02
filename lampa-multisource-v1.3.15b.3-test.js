/* MultiSource 1.3.15b Test — Android / LG webOS single JS entrypoint.
 * Loads the exact original 1.3.15 AutoCapture Lab from the published URL when
 * not already present. The existing 1.3.15 core remains unmodified.
 * Extras below install themselves only after the original core is available.
 */
(function (root) {
  'use strict';
  var BASE='https://gorodinskyv-cmyk.github.io/MultiSource/lampa-multisource-v1.3.15.js';
  var boot={version:'1.3.15b.3-transport',core:'checking',coreUrl:BASE,coreLoadError:'',started:Date.now()};
  root.MultiSource1315b={diagnostic:function(){return {
    version:boot.version,core:boot.core,coreLoadError:boot.coreLoadError,
    sources:root.MultiSourceSources1315b ? root.MultiSourceSources1315b.diagnostic() : null,
    back:root.MultiSourceBack1315b ? root.MultiSourceBack1315b.diagnostic() : null,
    focus:root.MultiSourceFocusReturn ? root.MultiSourceFocusReturn.diagnostic() : null
  };}};
  function loaded(){return !!(root.LampaMultiSource && root.LampaMultiSource._coreLoaded);}
  if(loaded()) {boot.core='reused-1.3.15';return;}
  var script=root.document.createElement('script');
  script.src=BASE;
  script.async=true;
  script.onload=function(){boot.core=loaded()?'loaded-1.3.15':'waiting-for-core';};
  script.onerror=function(){boot.core='load-error';boot.coreLoadError='Не вдалося завантажити оригінальний MultiSource 1.3.15 через HTTPS';};
  (root.document.head||root.document.documentElement).appendChild(script);
  var tries=0,timer=setInterval(function(){
    if(loaded()) {boot.core='loaded-1.3.15';clearInterval(timer);}
    else if(++tries>150){if(boot.core!=='load-error')boot.core='timeout';clearInterval(timer);}
  },500);
})(window);


/* MultiSource 1.3.15b — Android/webOS Eneyida and UaKinoCX provider registrations.
 * Additive 1.3.15b module: existing source registrations are NEVER removed.
 * Implementation based on publicly documented HTML structures of Eneyida and UaKinoCX.
 * Media URLs are used only in memory; no tokens/cookies/header impersonation or DRM bypass.
 */
(function (root) {
  'use strict';
  if (root.MultiSourceSources1315b && root.MultiSourceSources1315b.installed) return;
  var VERSION = '1.3.15b.3-transport';
  var supported = { eneyida: 'https://eneyida.tv', uakinocx: 'https://uakino.cx' };
  var stats = {version:VERSION, installed:false, eneyida:'waiting', uakinocx:'waiting',
    lastError:'', lastTransport:'', lastSearch:'', lastStreams:0, lastPlayers:0,
    lastStage:'idle', lastHost:'', lastMethod:'', lastHtmlLength:0,
    eneyidaSearches:0, uakinocxSearches:0, attempts:[], lastProvider:'',
    lastRawSearchCards:0};

  function safeUrl(text, base, allowed) {
    try {
      var u = new URL(String(text || '').trim(), base);
      if (u.protocol !== 'https:' || u.username || u.password || u.hash || u.port || u.href.length > 5000) return '';
      if (allowed && allowed.indexOf(u.hostname.toLowerCase()) < 0) return '';
      return u.href;
    } catch (_) { return ''; }
  }
  function normal(s) { return String(s||'').toLowerCase().replace(/[’'`]/g,'').replace(/[^a-z0-9а-яіїєґё]+/gi,' ').replace(/\s+/g,' ').trim(); }
  function year(s) { var m=/(?:19|20)\d{2}/.exec(String(s||'')); return m ? m[0] : ''; }
  function doc(html) { return new DOMParser().parseFromString(String(html || ''), 'text/html'); }
  function dedup(arr, key) { var seen = Object.create(null); return arr.filter(function(x){ var k=key(x); if(seen[k]) return false;seen[k]=1;return true; }); }
  function text(el) { return el ? String(el.textContent||'').replace(/\s+/g,' ').trim() : ''; }
  function bestQueries(movie) {
    return dedup([movie.title,movie.name,movie.original_title,movie.original_name]
      .filter(Boolean).map(function(s){return String(s).trim();}), normal).slice(0,2);
  }
  function matchesTitle(a, movie) {
    var name = normal(a), opts = bestQueries(movie).map(normal);
    return opts.some(function(k){return name===k || (k.length>4 && name.indexOf(k)>=0) || (name.length>4 && k.indexOf(name)>=0);});
  }
  function score(item,movie) {
    var s = normal(item.title), opts=bestQueries(movie).map(normal);
    var weight=opts.reduce(function(acc,q){return Math.max(acc, s===q?110: q.length>4 && s.indexOf(q)>=0?75: q.length>4 && q.indexOf(s)>=0?65:0);},0);
    var desired=year(movie.release_date||movie.first_air_date||movie.year);
    if (desired && item.year && item.year!==desired) return 0;
    return weight+(desired && desired===item.year?12:0);
  }
  function mediaUrl(raw, base) {
    var url=safeUrl(raw,base);
    return url && /\.(?:m3u8|mp4|mpd|webm)(?:[?#]|$)/i.test(url)?url:'';
  }
  function numberFrom(label, name) {
    var r = name==='season'?/(?:^|\D)(\d{1,2})\s*(?:-?\s*)?(?:сезон|season)/i:
      /(?:^|\D)(\d{1,3})\s*(?:-?\s*)?(?:сері[яї]|episode|ep\b)/i;
    var hit=r.exec(String(label || ''));
    if (!hit) {
      hit = name==='season'?/(?:сезон|season)\s*(\d{1,2})/i.exec(String(label||'')):
        /(?:сері[яї]|episode|ep\b)\s*(\d{1,3})/i.exec(String(label||''));
    }
    return hit?Number(hit[1]):0;
  }
  function subtitle(s) {
    var a=String(s||'').match(/(?:\[[^\]]+\])?(https:\/\/[^\s\]]+\.vtt(?:\?[^\s\]]*)?)/i);
    return a? [{url:a[1],label:'Українські',language:'uk'}]:undefined;
  }
  // Read the quoted JS file: value without executing scripts. The player can contain
  // JSON folder trees, an array of dubbed films, or one direct media URL.
  function readFile(script) {
    var m=/\bfile\s*:\s*(['"])/g.exec(script); if(!m) return '';
    var quote=m[1], i=m.index+m[0].length, out='';
    for(;i<script.length && out.length<1000000;i++){
      var ch=script.charAt(i);
      if(ch===quote) return out;
      if(ch==='\\' && i+1<script.length){
        var next=script.charAt(++i);
        if(next==='n')out+='\n'; else if(next==='r')out+='\r';else out+=next;
      } else out+=ch;
    }
    return '';
  }
  function playerItems(raw) {
    var parsed=null;
    try { parsed=JSON.parse(raw); } catch(_) { try { parsed=JSON.parse(JSON.parse(raw)); } catch(__){} }
    if(parsed && !Array.isArray(parsed)) parsed=[parsed];
    return {tree:Array.isArray(parsed)?parsed:null, direct:mediaUrl(raw,'https://tortuga.wtf/')};
  }
  function flatten(raw, playerPage, source) {
    var parsed=playerItems(raw), items=[], n=0;
    function walk(node, ctx, depth) {
      if(depth>9 || n++>4000 || !node || typeof node!=='object') return;
      var label=String(node.title||node.name||''), s=numberFrom(label,'season'),e=numberFrom(label,'episode');
      var next={season:s||ctx.season,episode:e||ctx.episode,voice:ctx.voice};
      if(label && !s && !e && Array.isArray(node.folder)) next.voice=label;
      if(Array.isArray(node.folder)){node.folder.forEach(function(child){walk(child,next,depth+1);});return;}
      var url=mediaUrl(node.file,playerPage);
      if(!url)return;
      // Film: top-level title is typically the dubbing name.
      var voice=next.voice || (!s&&!e?label:'') || source;
      items.push({url:url,title:next.episode?'Серія '+next.episode:label||'Фільм',
        season:next.season||0,episode:next.episode||0,voice:voice,
        poster:safeUrl(node.poster,playerPage),subtitles:subtitle(node.subtitle)});
    }
    if(parsed.tree) parsed.tree.forEach(function(x){walk(x,{season:0,episode:0,voice:''},0);});
    else if(parsed.direct) items.push({url:parsed.direct,title:'Фільм',season:0,episode:0,voice:source});
    return dedup(items,function(x){return [x.season,x.episode,x.voice,x.url].join('|');}).slice(0,300);
  }
  function shortError(err) {
    if (err && typeof err === 'object') {
      if (err.status) return 'HTTP ' + err.status + (err.statusText ? ' ' + err.statusText : '');
      if (err.message) return String(err.message).slice(0,160);
    }
    return String(err || 'Невідома мережева помилка').slice(0,160);
  }
  function htmlBody(data) {
    // Different Lampa versions return a string or a native HTTP envelope.
    if (typeof data === 'string') return data;
    if (data && typeof data.body === 'string') return data.body;
    if (data && typeof data.responseText === 'string') return data.responseText;
    if (data && typeof data.data === 'string') return data.data;
    if (data && typeof data.html === 'string') return data.html;
    throw Error('Не отримано текст HTML (тип: ' + typeof data + ')');
  }
  function record(transport, method, url, ok, message, length) {
    var host='';try{host=new URL(url).hostname;}catch(_){}
    stats.lastHost=host;stats.lastMethod=method;
    stats.lastTransport=transport;
    if(length !== undefined)stats.lastHtmlLength=length;
    var event={host:host,method:method,via:transport,ok:!!ok};
    if(message)event.error=String(message).slice(0,140);
    if(length !== undefined)event.length=length;
    stats.attempts.push(event);
    if(stats.attempts.length>12)stats.attempts.shift();
  }
  function validPage(html) {
    // A Cloudflare string in an otherwise valid catalogue is not by itself proof
    // that this response is a browser challenge. Only reject challenge-specific
    // pages. No attempt is made to bypass site protections.
    if (!html || !/<(?:html|body|article|div|main|section|iframe)\b/i.test(html)) {
      var missing=Error('HTML порожній або невідомого типу');
      missing.htmlLength=String(html||'').length;
      throw missing;
    }
    var title=/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    title=title ? title[1].replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,100) : '';
    var strongTitle=/^(?:Just a moment|Attention Required|Access denied|Checking your browser|One more step|Please Wait)/i.test(title);
    var challengeForm=/(?:id|class)\s*=\s*['"][^'"]*(?:challenge-form|cf-challenge-running|cf-challenge-container|cf-turnstile)[^'"]*['"]/i.test(html);
    var challengeBody=/<body[^>]*class=['"][^'"]*cf-challenge/i.test(html);
    if (strongTitle || challengeForm || challengeBody) {
      var err=Error('Сервер надав сторінку перевірки браузера, а не каталог');
      err.htmlLength=html.length;
      err.pageTitle=title;
      throw err;
    }
    return html;
  }
  function nativeHtml(url, method, form) {
    return new Promise(function(resolve,reject){
      if (!root.Lampa || typeof Lampa.Reguest !== 'function') return reject(Error('Lampa.Reguest відсутній'));
      var req, settled=false;
      function finish(err,data){if(settled)return;settled=true;err?reject(err):resolve(data);}
      try {
        req=new Lampa.Reguest();
        if(req.timeout)req.timeout(14000);
        if(typeof req.native!=='function')return finish(Error('Lampa.Reguest.native відсутній'));
        var postData= method==='POST' ? Object.keys(form||{}).map(function(key){
          return encodeURIComponent(key)+'='+encodeURIComponent(String(form[key]));
        }).join('&') : false;
        // Lampa.native signature is (url, success, error, post_data, options).
        // The Android native implementation chooses POST based on post_data,
        // NOT on options.data/type alone.
        var options={dataType:'text'};
        if(method==='POST') {
          options.type='POST';
          options.headers={'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'};
        }
        req.native(url, function(data){finish(null,data);},function(err){finish(Error(shortError(err)));},postData,options);
      }catch(e){finish(e);}
    });
  }
  function transportInfo(api) {
    return {
      origin:root.location && root.location.origin || '',
      androidBridge:typeof root.AndroidJS!=='undefined',
      nativeAvailable:!!(root.Lampa && typeof root.Lampa.Reguest==='function'),
      coreRequestAvailable:!!(api && typeof api.request==='function'),
      bridgeMode:'disabled-in-Android-webOS-build'
    };
  }
  function htmlRequest(api,url,method,form) {
    method=method||'GET';
    var accepted=['eneyida.tv','uakino.cx','hdvbua.pro','tortuga.tw','tortuga.wtf'];
    if(!safeUrl(url,undefined,accepted))return Promise.reject(Error('Неприпустимий домен HTML'));
    // The page origin is NOT a platform detector: Android Lampa may load
    // https://cf.lampa.mx inside an Android WebView. Never select Chrome
    // extension messaging just because the origin is cf.lampa.mx.
    var paths=[];
    var hasCore=api && typeof api.request==='function';
    var hasNative=root.Lampa && typeof root.Lampa.Reguest==='function';
    var android=typeof root.AndroidJS!=='undefined';
    if(method==='POST') {
      if(hasNative) paths.push({label:'native-post',run:function(){return nativeHtml(url,method,form);}});
    } else if(android) {
      // Android native bridge first; it does not depend on CORS in WebView.
      if(hasNative) paths.push({label:'native-get',run:function(){return nativeHtml(url,method,form);}});
      if(hasCore) paths.push({label:'core-get',run:function(){return api.request(url);}});
    } else {
      // On webOS, the core transport may be more reliable than native().
      if(hasCore) paths.push({label:'core-get',run:function(){return api.request(url);}});
      if(hasNative) paths.push({label:'native-get',run:function(){return nativeHtml(url,method,form);}});
    }
    if(!paths.length) return Promise.reject(Error('Немає доступного HTML-транспорту Lampa для '+method));
    var lastError=null;
    function next(index) {
      if(index>=paths.length)return Promise.reject(lastError || Error('Запит не виконано'));
      var path=paths[index];
      return Promise.resolve().then(path.run).then(function(data){
        var raw=htmlBody(data),page=validPage(raw);
        record(path.label,method,url,true,'',page.length);
        return page;
      }).catch(function(err){
        lastError=err;
        record(path.label,method,url,false,shortError(err),err && err.htmlLength!==undefined?err.htmlLength:undefined);
        return next(index+1);
      });
    }
    return next(0);
  }
  function searchCards(html, base, kind, movie) {
    var d=doc(html), out=[], seen=Object.create(null);
    var cards=d.querySelectorAll(kind==='eneyida'?
      'article.short, .short, .shortstory, .story':' .grid-items__item, .item, .poster, .shortstory, article');
    function pushCandidate(a, context) {
      if(!a)return;
      var link=a.getAttribute('href') || (a.closest && a.closest('a') && a.closest('a').getAttribute('href'));
      var url=safeUrl(link,base,[new URL(base).hostname]);
      if(!url || !/\.html(?:[?#]|$)/i.test(url) || seen[url])return;
      var title=text(a)||String(a.getAttribute('title')||'').trim();
      if(!title) {
        var heading=context && context.querySelector('h2,h3,h4,.title,.item__title,.short_title');
        title=text(heading);
      }
      if(!title)return;
      var pic=context && context.querySelector('img');
      var img=pic && (pic.getAttribute('data-src')||pic.getAttribute('data-original')||pic.getAttribute('src'));
      var item={title:title,url:url,poster:safeUrl(img,base),year:year(context && context.textContent),score:0};
      item.score=score(item,movie);
      if(item.score){seen[url]=true;out.push(item);}
    }
    for(var i=0;i<cards.length && i<160;i++){
      var el=cards[i];
      var a=el.querySelector(kind==='eneyida'? 'a.short_title, a[href*=".html"]': 'a.item__title, a[href*=".html"]');
      pushCandidate(a,el);
    }
    // Fallback for newer DLE layouts without the historic CSS card classes.
    if(out.length===0){
      var links=d.querySelectorAll('a[href*=".html"]');
      for(var j=0;j<links.length && j<500;j++)pushCandidate(links[j],links[j].parentElement||links[j]);
    }
    stats.lastRawSearchCards=cards.length;
    return out.slice(0,60);
  }
  function searchProvider(movie,api,kind) {
    movie=movie||{}; stats.lastProvider=kind;stats.lastStage='search';stats.lastError='';
    stats[kind+'Searches']++;
    var base=supported[kind], queries=bestQueries(movie); if(!queries.length)return Promise.resolve([]);
    var success=0, failures=[];
    return Promise.all(queries.map(function(q){
      var u=kind==='eneyida'?base:base+'/index.php?do=search&subaction=search&story='+encodeURIComponent(q);
      var post=kind==='eneyida';
      var form=post?{do:'search',subaction:'search',story:q}:null;
      return htmlRequest(api,u,post?'POST':'GET',form)
        .catch(function(err){
          if (!post) throw err;
          var fallback = base + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(q);
          return htmlRequest(api,fallback,'GET').catch(function(){throw err;});
        })
        .then(function(page){success++;return searchCards(page,base,kind,movie);})
        .catch(function(err){failures.push(err);stats.lastError=kind+' search: '+err.message;return [];});
    })).then(function(lists){
      if(!success)throw failures[0] || Error('Джерело не відповіло');
      stats.lastStage='search-complete';
      var out=dedup([].concat.apply([],lists),function(x){return x.url;}).sort(function(a,b){return b.score-a.score;}).slice(0,30);
      stats.lastSearch=kind+': '+out.length;
      if(!out.length && !stats.lastError)stats.lastError=kind+': HTML отримано, але збігів за назвою не знайдено (карток: '+stats.lastRawSearchCards+')';
      return out;
    });
  }
  function getFrames(page,base,kind) {
    var d=doc(page), list=[];
    var selector='iframe[src], iframe[data-src], [data-player], [data-iframe]';
    Array.prototype.forEach.call(d.querySelectorAll(selector),function(node){
      ['src','data-src','data-player','data-iframe'].forEach(function(key){
        var u=safeUrl(node.getAttribute(key),base);
        if(u && /^(hdvbua\.pro|tortuga\.(?:tw|wtf)|api\.ortified\.ws|ortified\.ws)$/.test(new URL(u).hostname))list.push(u);
      });
    });
    var matches=String(page).replace(/\\\//g,'/').match(/https:\/\/(?:hdvbua\.pro|tortuga\.(?:tw|wtf))\/(?:embed|vid)\/\d{1,10}/gi)||[];
    list=list.concat(matches);
    return dedup(list,function(x){return x;}).slice(0,5);
  }
  function streamsFromPlayer(api,frame,kind) {
    var host=new URL(frame).hostname;
    if(host==='ortified.ws'||host==='api.ortified.ws')return Promise.resolve([]);
    return htmlRequest(api,frame).then(function(html){
      var d=doc(html), scripts=Array.prototype.map.call(d.querySelectorAll('script'),function(s){return s.textContent||'';}).join('\n');
      var file=readFile(scripts);
      var out=flatten(file,frame,kind==='eneyida'?'Eneyida':'UaKinoCX');
      // Only parse an explicit file field; embedded HTML is not executed.
      return out;
    });
  }
  // Only Eneyida: show distinguishable real stream metadata already on the movie's
  // choice list, not generic duplicate 'Фільм (eneyida)' labels. Do not infer quality.
  function expandEneyidaMovieChoices(streams) {
    if (!streams.length || streams.some(function(x){ return Number(x.season)>0 || Number(x.episode)>0; })) return streams;
    var counts = Object.create(null);
    streams.forEach(function(x){
      var v = String(x.voice || '').trim();
      var generic = !v || /^(?:eneyida|фільм|film)$/i.test(v);
      var fmt = /\.m3u8(?:[?#]|$)/i.test(x.url) ? 'HLS' : /\.mp4(?:[?#]|$)/i.test(x.url) ? 'MP4' : /\.mpd(?:[?#]|$)/i.test(x.url) ? 'DASH' : 'Відео';
      var quality = /(?:^|[^\d])(2160|1440|1080|720|480|360)p?(?:[^\d]|$)/i.exec(String(x.quality || '') + ' ' + String(x.voice || ''));
      var base = 'Фільм' + (generic ? '' : ' · ' + v) + (quality ? ' · ' + quality[1] + 'p' : '') + ' · ' + fmt;
      counts[base] = (counts[base] || 0) + 1;
      x._msOptionBase = base;
    });
    var seen = Object.create(null);
    streams.forEach(function(x){
      var base = x._msOptionBase;
      seen[base] = (seen[base] || 0) + 1;
      var title = counts[base] > 1 ? base + ' · варіант ' + seen[base] : base;
      // The core uses stream.title for display; retain voice and original media URL.
      x.title = title;
      x.label = title;
      delete x._msOptionBase;
    });
    return streams;
  }
  function getStreamsProvider(item,api,kind){
    stats.lastProvider=kind;stats.lastStage='detail';stats.lastError='';
    var base=supported[kind],url=safeUrl(item&&item.url,undefined,[new URL(base).hostname]);
    if(!url||!/\.html(?:[?#]|$)/.test(url))return Promise.reject(Error('Некоректна адреса сторінки'));
    return htmlRequest(api,url).then(function(html){
      var frames=getFrames(html,base,kind);
      stats.lastPlayers=frames.length;
      if(!frames.length){
        // Some pages initialize PlayerJS directly rather than inside iframe.
        var scripts=Array.prototype.map.call(doc(html).querySelectorAll('script'),function(x){return x.textContent||'';}).join('\n');
        var direct=flatten(readFile(scripts),url,kind);
        if(kind==='eneyida')expandEneyidaMovieChoices(direct);
        stats.lastStreams=direct.length;stats.lastStage='detail-without-iframe';
        return {streams:direct,embeds:[],pageUrl:url,notice:direct.length?'Потік зі скрипта сторінки.':'Плеєр не знайдено або його HTML не містить відкритого потоку.'};
      }
      return Promise.all(frames.map(function(frame){
        return streamsFromPlayer(api,frame,kind).catch(function(err){stats.lastError=kind+' player: '+err.message;return [];});
      })).then(function(found){
        var streams=dedup([].concat.apply([],found),function(x){return [x.url,x.voice,x.season,x.episode].join('|');});
        if (kind==='eneyida') expandEneyidaMovieChoices(streams);
        stats.lastStreams=streams.length;stats.lastStage='streams-complete';
        return {streams:streams,embeds:[],pageUrl:url,notice:streams.length?'HLS отримано з відкритої конфігурації плеєра. Перевіряйте його доступність у Lampa.':
          'Виявлено '+frames.length+' сторінок плеєра, але прямого HLS немає. Вебплеєр не відкриваємо.'};
      });
    });
  }
  function install(){
    var api=root.LampaMultiSource;
    if(!api||!api._coreLoaded||typeof api.registerSource!=='function')return false;
    // No unregisterSource(): preserve ALL installed 1.3.15 source registrations.
    Object.keys(supported).forEach(function(id){
      api.registerSource({id:id,name:id==='eneyida'?'Eneyida.TV':'UaKino.CX',baseUrl:supported[id],
        isDetail:function(url){return !!safeUrl(url,undefined,[new URL(supported[id]).hostname]) && /\.html(?:[?#]|$)/.test(url);},
        search:function(movie,a){return searchProvider(movie,a,id);},
        getStreams:function(item,a){return getStreamsProvider(item,a,id);}});
      stats[id]='registered';
    });
    stats.installed=true;return true;
  }
  root.MultiSourceSources1315b={version:VERSION,installed:false,
    diagnostic:function(){return Object.assign({},stats, {transport:transportInfo(null)});},install:install,
    // Pure functions exported only to verify parsing with synthetic fixtures.
    _test:{readFile:readFile,flatten:flatten,searchCards:searchCards,getFrames:getFrames,normal:normal,expandEneyidaMovieChoices:expandEneyidaMovieChoices,htmlRequest:htmlRequest,nativeHtml:nativeHtml,htmlBody:htmlBody,validPage:validPage,transportInfo:transportInfo}};
  if(install())root.MultiSourceSources1315b.installed=true;
  else {
    var attempts=0,timer=setInterval(function(){
      if(install()) {root.MultiSourceSources1315b.installed=true;clearInterval(timer);}
      else if(++attempts>100){stats.lastError='MultiSource 1.3.15 core not loaded';clearInterval(timer);}
    },400);
  }
})(window);


/* MultiSource 1.3.15b Back Navigation Lab — works only inside the MultiSource activity.
 * Never intercepts global Back keys. Provides an additional focusable Back button and
 * delegates to the most recently registered MultiSource 'content' back handler.
 */
(function (root) {
  'use strict';
  if (root.MultiSourceBack1315b) return;
  var COMPONENT = 'multi_source_online_v1';
  var st = {version:'1.3.15b',booted:false,button:false,invoked:0,lastRoute:'idle',lastError:'',captureCount:0};
  var originalAdd = null, currentBack = null, observer = null, timer = 0, attempts = 0;
  function active() {
    try {
      var a = root.Lampa.Activity.active();
      return !!(a && (a.component || (a.object && a.object.component) || (a.activity && a.activity.component)) === COMPONENT);
    } catch (_) { return false; }
  }
  function viewport() {
    return root.document.querySelector('.ms-scroll-viewport');
  }
  function playerOpen() {
    try { return root.Lampa.Player && typeof root.Lampa.Player.opened === 'function' && root.Lampa.Player.opened(); }
    catch (_) { return false; }
  }
  function overlayOpen() {
    try {
      return !!((root.Lampa.Select && typeof root.Lampa.Select.opened === 'function' && root.Lampa.Select.opened()) ||
        (root.Lampa.Modal && typeof root.Lampa.Modal.opened === 'function' && root.Lampa.Modal.opened()));
    } catch (_) { return false; }
  }
  function back() {
    if (!active()) return st.lastRoute='outside-multisource';
    if (playerOpen() || overlayOpen()) return st.lastRoute='player-or-overlay-open';
    try {
      var focused = root.document.activeElement;
      if (focused && focused.tagName === 'IFRAME' && focused.blur) focused.blur();
      // Restore the regular Lampa content collection, never create a second controller.
      if (root.Lampa.Controller && root.Lampa.Controller.toggle) root.Lampa.Controller.toggle('content');
      if (currentBack) { currentBack(); st.lastRoute='core-content-back'; }
      else if (root.Lampa.Activity && root.Lampa.Activity.backward) { root.Lampa.Activity.backward(); st.lastRoute='activity-backward'; }
      else return st.lastRoute='no-back-handler';
      st.invoked++;
      return st.lastRoute;
    } catch(err) { st.lastError=String(err && err.message || err).slice(0,140);return st.lastRoute='exception'; }
  }
  function attach() {
    if (!active() || playerOpen() || overlayOpen()) return;
    var rootView = viewport();
    if (!rootView || !root.document.documentElement.contains(rootView)) return;
    if (rootView.querySelector('.ms-1315b-back')) { st.button=true; return; }
    var el=root.document.createElement('div');
    el.className='ms-1315b-back selector';
    el.tabIndex=0;
    el.setAttribute('role','button');
    el.setAttribute('aria-label','Назад');
    el.style.cssText='display:inline-flex;align-items:center;gap:.4em;padding:.45em .85em;'+
      'margin:0 0 .65em 0;border:1px solid rgba(255,255,255,.28);'+
      'border-radius:.45em;cursor:pointer;color:inherit;max-width:fit-content;'+
      'background:rgba(120,130,150,.12)';
    el.textContent='‹  Назад';
    el.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();back();});
    el.addEventListener('keydown',function(e){
      if(e.key==='Enter'||e.key===' ') {e.preventDefault();e.stopPropagation();back();}
    });
    if (root.jQuery) root.jQuery(el).on('hover:enter',function(){back();});
    rootView.insertBefore(el,rootView.firstChild);
    st.button=true;
    // Include this selector in the standard remote-control navigation collection.
    try { if(root.Lampa.Controller && root.Lampa.Controller.toggle && !playerOpen())
      root.Lampa.Controller.toggle('content'); } catch(_) {}
  }
  function refresh() {
    if(timer) root.clearTimeout(timer);
    timer=root.setTimeout(function(){timer=0;attach();},120);
  }
  function boot() {
    attempts++;
    if (!root.Lampa || !root.LampaMultiSource || !root.LampaMultiSource._coreLoaded ||
        !root.Lampa.Controller || typeof root.Lampa.Controller.add!=='function' ||
        !root.Lampa.Activity || !root.document || !root.document.body) {
      if(attempts<220)root.setTimeout(boot,400);
      else st.lastRoute='bootstrap-timeout';
      return;
    }
    var controller=root.Lampa.Controller;
    originalAdd=controller.add;
    controller.add=function(name,handlers){
      if(name==='content' && active() && handlers && typeof handlers.back==='function') {
        var fn=handlers.back;
        currentBack=function(){ return fn.call(handlers); };
        st.captureCount++;
      }
      return originalAdd.apply(this,arguments);
    };
    st.booted=true;
    if (root.MutationObserver) {
      observer=new root.MutationObserver(refresh);
      observer.observe(root.document.body,{childList:true,subtree:true});
    }
    refresh();
  }
  root.MultiSourceBack1315b={diagnostic:function(){return {
    version:st.version,booted:st.booted,button:st.button,invoked:st.invoked,
    lastRoute:st.lastRoute,lastError:st.lastError,captureCount:st.captureCount,
    active:active(),controller:root.Lampa && root.Lampa.Controller &&
      root.Lampa.Controller.enabled ? (root.Lampa.Controller.enabled()||{}).name||'' : ''
  };},back:back};
  boot();
})(window);


/*
 * MultiSource Focus Return Lab v0.1 (Android / webOS + Lampa internal player)
 * Independent, opt-in Lampa addon. Core MultiSource 1.3.15 unchanged.
 * MIT; no network or storage. Does NOT intercept remote keys.
 */
(function () {
  'use strict';
  if (window.MultiSourceFocusReturn) return;

  var COMPONENT = 'multi_source_online_v1';
  var state = {
    version: '1.3.15b-focus', booted: false, armed: false, external: false,
    closeEvents: 0, resumeEvents: 0, restores: 0, lastResult: 'idle',
    lastController: '', lastTrigger: '', lastError: '', lastPlayAt: 0
  };
  var timers = [];
  var bootTimer = null;
  var bootTries = 0;

  function activeComponent() {
    try {
      var activity = Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active();
      return activity && (activity.component || (activity.object && activity.object.component) ||
        (activity.activity && activity.activity.component)) || '';
    } catch (err) { return ''; }
  }
  function visibleView() {
    var root = document.querySelector('.ms-scroll-viewport');
    return !!(root && document.documentElement && document.documentElement.contains(root));
  }
  function openedPlayer() {
    try { return !!(Lampa.Player && typeof Lampa.Player.opened === 'function' && Lampa.Player.opened()); }
    catch (err) { return false; }
  }
  function overlayOpen() {
    try {
      if (Lampa.Select && typeof Lampa.Select.opened === 'function' && Lampa.Select.opened()) return true;
      if (Lampa.Modal && typeof Lampa.Modal.opened === 'function' && Lampa.Modal.opened()) return true;
      if (document.body && /(?:^|\s)(?:selectbox--open|settings--open|modal--open)(?:\s|$)/.test(document.body.className || '')) return true;
    } catch (err) {}
    return false;
  }
  function isVisible() { return !document.hidden && document.visibilityState !== 'hidden'; }
  function removeTimers() {
    for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
  }
  function restore(trigger, forceManual) {
    state.lastTrigger = trigger;
    if (!forceManual && !state.armed) return state.lastResult = 'not-armed';
    if (!isVisible()) return state.lastResult = 'document-hidden';
    if (!window.Lampa || !Lampa.Controller || !Lampa.Activity) return state.lastResult = 'no-lampa';
    if (activeComponent() !== COMPONENT) return state.lastResult = 'outside-multisource';
    if (!visibleView()) return state.lastResult = 'view-detached';
    if (openedPlayer()) return state.lastResult = 'player-open';
    if (overlayOpen()) return state.lastResult = 'overlay-open';
    try {
      var enabled = Lampa.Controller.enabled && Lampa.Controller.enabled();
      var name = enabled && enabled.name || '';
      state.lastController = name;
      // Never steal controller from a real active Select, modal, settings or search panel.
      if (/^(select|modal|settings|search|keyboard|input|player|player-loading)$/.test(name) &&
          name !== 'player' && name !== 'player-loading') return state.lastResult = 'controller-busy:' + name;

      var focused = document.activeElement;
      if (focused && focused.matches && focused.matches('iframe.ms-webframe')) {
        try { focused.blur(); } catch (ignored) {}
      }
      // toggle('content') invokes MultiSource's existing collectionSet/collectionFocus.
      // It also works when active controller *already* has the name 'content'.
      Lampa.Controller.toggle('content');
      state.restores += 1;
      state.armed = false;
      state.external = false;
      return state.lastResult = 'restored';
    } catch (err) {
      state.lastError = String(err && err.message || err).slice(0, 120);
      return state.lastResult = 'exception';
    }
  }
  function schedule(trigger) {
    removeTimers();
    [90, 360, 850, 1600].forEach(function (delay) {
      timers.push(setTimeout(function () {
        if (!state.armed) return;
        var result = restore(trigger, false);
        // Stop retrying only on successful restore or when user has left MultiSource.
        if (result === 'restored' || result === 'outside-multisource') removeTimers();
      }, delay));
    });
  }
  function markPlaying(external) {
    if (activeComponent() !== COMPONENT) return;
    removeTimers();
    state.armed = true;
    state.external = !!external;
    state.lastPlayAt = Date.now();
    state.lastResult = external ? 'external-armed' : 'internal-armed';
  }
  function onClose() {
    if (!state.armed) return;
    state.closeEvents++;
    schedule('player-close');
  }
  function onResume() {
    if (!state.armed || !state.external) return;
    state.resumeEvents++;
    schedule('external-resume');
  }
  function boot() {
    bootTries++;
    if (!window.Lampa || !Lampa.Player || !Lampa.Player.listener ||
        typeof Lampa.Player.listener.follow !== 'function' || !Lampa.Controller || !Lampa.Activity ||
        !document.body) {
      if (bootTries < 180) bootTimer = setTimeout(boot, 500);
      else state.lastResult = 'lampa-api-unavailable';
      return;
    }
    state.booted = true;
    Lampa.Player.listener.follow('start', function () { markPlaying(false); });
    Lampa.Player.listener.follow('external', function () { markPlaying(true); });
    Lampa.Player.listener.follow('close', onClose);
    // An Android external app or webOS native player may return without Player.close.
    window.addEventListener('pageshow', onResume, false);
    window.addEventListener('focus', onResume, false);
    document.addEventListener('visibilitychange', function () { if (isVisible()) onResume(); }, false);
    state.lastResult = 'ready';
  }
  window.MultiSourceFocusReturn = {
    diagnostic: function () { return {
      version: state.version, booted: state.booted, armed: state.armed,
      external: state.external, closeEvents: state.closeEvents,
      resumeEvents: state.resumeEvents, restores: state.restores,
      currentComponent: window.Lampa ? activeComponent() : '',
      controller: state.lastController, lastTrigger: state.lastTrigger,
      lastResult: state.lastResult, lastError: state.lastError
    }; },
    restore: function () { return restore('manual', true); }
  };
  boot();
})();

