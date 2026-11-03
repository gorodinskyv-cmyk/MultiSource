/* MultiSource 1.3.15b Test — Android / LG webOS single JS entrypoint.
 * Loads the exact original 1.3.15 AutoCapture Lab from the published URL when
 * not already present. The existing 1.3.15 core remains unmodified.
 * Extras below install themselves only after the original core is available.
 */
(function (root) {
  'use strict';
  var BASE='https://gorodinskyv-cmyk.github.io/MultiSource/lampa-multisource-v1.3.15.js';
  var boot={version:'1.3.15b.8-uakino-detail-inspection',core:'checking',coreUrl:BASE,coreLoadError:'',started:Date.now()};
  root.MultiSource1315b={diagnostic:function(){return {
    version:boot.version,core:boot.core,coreLoadError:boot.coreLoadError,
    sources:root.MultiSourceSources1315b ? root.MultiSourceSources1315b.diagnostic() : null,
    back:root.MultiSourceBack1315b ? root.MultiSourceBack1315b.diagnostic() : null,
    focus:root.MultiSourceFocusReturn ? root.MultiSourceFocusReturn.diagnostic() : null,
    diagnostics:root.MultiSourceDiagnostics1315b ? root.MultiSourceDiagnostics1315b.diagnostic() : null
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
  var VERSION = '1.3.15b.8-uakino-html-evidence';
  var supported = { eneyida: 'https://eneyida.tv', uakinocx: 'https://uakino.cx' };
  var stats = {version:VERSION, installed:false, eneyida:'waiting', uakinocx:'waiting',
    lastError:'', lastTransport:'', lastSearch:'', lastStreams:0, lastPlayers:0,
    lastStage:'idle', lastHost:'', lastMethod:'', lastHtmlLength:0,
    eneyidaSearches:0, uakinocxSearches:0, attempts:[], lastProvider:'',
    lastRawSearchCards:0,lastRawSearchLinks:0,lastPageTitle:'',lastCandidateTitles:[],lastSearchQueries:[],
    lastDetailStatus:'idle',lastDetailTitle:'',lastDetailTransport:'',lastDetailError:'',
    lastBrowserAttempt:'not-tried',lastBrowserStatus:0,lastBrowserError:'',
    lastDetailEvidence:null};
  var lastUaKinoDetailUrl='';

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
  // Diagnostic only: no HTML, media links, tokens, cookies or full URLs are stored.
  // It distinguishes a real challenge from a normal film page that embeds
  // a Cloudflare Turnstile on a comments/login form.
  function detailEvidence(html) {
    var title=/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    var heading=/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    function clean(v){return String(v||'').replace(/<[^>]*>/g,'').replace(/&(?:nbsp|amp);/gi,' ').replace(/\s+/g,' ').trim().slice(0,90);}
    var og=/<meta[^>]+(?:property|name)\s*=\s*['"]og:title['"][^>]*>/i.test(html);
    var hosts=[],count=0;
    var re=/<iframe\b[^>]*(?:src|data-src)\s*=\s*['"](https:\/\/[^'"]+)['"][^>]*>/gi,match;
    while((match=re.exec(html)) && count++<24){
      try {var h=new URL(match[1]).hostname.toLowerCase(); if(hosts.indexOf(h)<0)hosts.push(h);}catch(_){ }
    }
    return {pageTitle:clean(title&&title[1]),heading:clean(heading&&heading[1]),
      ogTitle:og,iframeCount:count,iframeHosts:hosts.slice(0,8),
      hasTurnstile:/\bcf-turnstile\b/i.test(html),
      hasChallengeContainer:/\b(?:challenge-form|cf-challenge-running|cf-challenge-container)\b/i.test(html),
      hasPlayerMarker:/(?:<iframe\b|\bfile\s*:\s*['"]|data-player|\bPlayerjs\b)/i.test(html),
      challengeReason:''};
  }
  function validPage(html, isUaKinoDetail) {
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
    var challengeForm=/(?:id|class)\s*=\s*['"][^'"]*(?:challenge-form|cf-challenge-running|cf-challenge-container)[^'"]*['"]/i.test(html);
    var challengeBody=/<body[^>]*class=['"][^'"]*cf-challenge/i.test(html);
    var turnstile=/(?:id|class)\s*=\s*['"][^'"]*cf-turnstile[^'"]*['"]/i.test(html);
    // A Turnstile widget on a normal UaKino film page is not itself a
    // challenge interstitial. Accept only if genuine article markers exist.
    var filmMarkers=/<h1\b/i.test(html) && /(?:og:title|дивитися онлайн|фільм|movie|player|video)/i.test(html);
    var blockReason=strongTitle?'challenge-title':challengeBody?'challenge-body':
      challengeForm?'challenge-container':turnstile && (!isUaKinoDetail || !filmMarkers)?'turnstile-without-film-markers':'';
    if (isUaKinoDetail && stats.lastDetailEvidence) stats.lastDetailEvidence.challengeReason=blockReason;
    if (blockReason) {
      var err=Error('Сервер надав сторінку перевірки браузера, а не каталог');
      err.htmlLength=html.length;
      err.pageTitle=title;
      err.challengeReason=blockReason;
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
  // An ordinary browser-context request: allowed only for a user-selected
  // UaKino .html detail page, and only as a fallback when existing Lampa
  // transports cannot return usable HTML. Never spoof headers or defeat a
  // site's challenge. Browser CORS and site cookies are enforced normally.
  function browserHtml(url) {
    if(typeof root.fetch!=='function') return Promise.reject(Error('fetch недоступний у WebView'));
    stats.lastBrowserAttempt='running';stats.lastBrowserStatus=0;stats.lastBrowserError='';
    return Promise.resolve().then(function(){
      return root.fetch(url, {method:'GET',mode:'cors',credentials:'include',
        redirect:'follow',cache:'no-store'});
    }).then(function(response){
      stats.lastBrowserStatus=response && typeof response.status==='number'?response.status:0;
      if(!response || !response.ok || response.type==='opaque' || response.type==='opaqueredirect')
        throw Error('Браузер повернув HTTP '+stats.lastBrowserStatus+' / opaque');
      return response.text();
    }).then(function(html){
      if(typeof html!=='string')throw Error('Браузер не повернув текст сторінки');
      stats.lastBrowserAttempt='html-received';
      return html;
    }).catch(function(err){
      stats.lastBrowserAttempt='failed';
      stats.lastBrowserError=shortError(err);
      throw err;
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
    // Only the UaKino detail page gets an experimental real-browser fetch.
    // This DOES NOT evade Cloudflare and will commonly fail with CORS.
    // Keeping this last preserves the already-working native/core paths.
    var parsed=new URL(url);
    if(method==='GET' && parsed.hostname==='uakino.cx' && /\.html$/i.test(parsed.pathname)) {
      paths.push({label:'browser-fetch',run:function(){return browserHtml(url);}});
    }
    if(!paths.length) return Promise.reject(Error('Немає доступного HTML-транспорту Lampa для '+method));
    var lastError=null;
    function next(index) {
      if(index>=paths.length)return Promise.reject(lastError || Error('Запит не виконано'));
      var path=paths[index];
      return Promise.resolve().then(path.run).then(function(data){
        var raw=htmlBody(data), isDetail=method==='GET' && parsed.hostname==='uakino.cx' && /\.html$/i.test(parsed.pathname);
        if(isDetail) stats.lastDetailEvidence=detailEvidence(raw);
        var page=validPage(raw,isDetail);
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
    // Troubleshooting without logging cookies, HTML, page URLs or media tokens.
    var heading=d.querySelector('title');
    stats.lastPageTitle=text(heading).slice(0,100);
    var rawLinks=d.querySelectorAll('a[href*=".html"]');
    stats.lastRawSearchLinks=rawLinks.length;
    stats.lastCandidateTitles=Array.prototype.slice.call(rawLinks,0,150).map(function(a){
      return (text(a)||String(a.getAttribute('title')||'')).slice(0,90);
    }).filter(Boolean).slice(0,5);
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
    stats.lastPageTitle='';stats.lastRawSearchLinks=0;stats.lastCandidateTitles=[];
    stats[kind+'Searches']++;
    var base=supported[kind], queries=bestQueries(movie);
    stats.lastSearchQueries=queries.map(function(q){return String(q).slice(0,100);});
    if(!queries.length)return Promise.resolve([]);
    var success=0, failures=[];
    return Promise.all(queries.map(function(q){
      // DLE search processes the form at /index.php?do=search, NOT at the
      // home page. Posting to the home page may return HTTP 200 with a normal
      // home catalogue instead of query results (the b.4 false-positive).
      var u=kind==='eneyida'?base+'/index.php?do=search':
        base+'/index.php?do=search&subaction=search&story='+encodeURIComponent(q);
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
    if(kind==='uakinocx'){
      stats.lastPlayers=0;stats.lastStreams=0;stats.lastDetailEvidence=null;
      stats.lastDetailStatus='requested';stats.lastDetailTitle='';
      stats.lastDetailTransport='';stats.lastDetailError='';
      stats.lastBrowserAttempt='not-tried';stats.lastBrowserStatus=0;stats.lastBrowserError='';
    }

    var base=supported[kind],url=safeUrl(item&&item.url,undefined,[new URL(base).hostname]);
    if(!url||!/\.html(?:[?#]|$)/.test(url))return Promise.reject(Error('Некоректна адреса сторінки'));
    if(kind==='uakinocx')lastUaKinoDetailUrl=url;
    return htmlRequest(api,url).then(function(html){
      if(kind==='uakinocx') {
        stats.lastDetailStatus='html-ok';
        stats.lastDetailTransport=stats.lastTransport;
        var foundTitle=/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
        stats.lastDetailTitle=foundTitle?foundTitle[1].replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim().slice(0,100):'';
      }

      var frames=getFrames(html,base,kind);
      if(kind==='uakinocx' && stats.lastDetailEvidence) {
        stats.lastDetailEvidence.recognizedPlayers=frames.length;
        stats.lastDetailEvidence.recognizedHosts=frames.map(function(x){try{return new URL(x).hostname;}catch(_){return '';}}).filter(Boolean).slice(0,5);
      }
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
    }).catch(function(err){
      // b.5 swallowed useful information by leaving lastError empty on detail
      // failures. Explicitly record the failing stage and transport.
      stats.lastStage='detail-error';
      stats.lastError=kind+' detail: '+shortError(err);
      if(kind==='uakinocx'){
        stats.lastDetailStatus='failed';
        stats.lastDetailTransport=stats.lastTransport;
        stats.lastDetailError=shortError(err);
      }
      throw err;
    });
  }
  function openUaKinoPage(){
    // User-initiated only. It opens a regular site, never extracts its contents
    // from a cross-origin WebView/iframe; platform popup handling may vary.
    if(!lastUaKinoDetailUrl)return {ok:false,reason:'Спочатку відкрийте картку UaKino.CX'};
    if(!safeUrl(lastUaKinoDetailUrl,undefined,['uakino.cx']))return {ok:false,reason:'Недозволена адреса'};
    if(typeof root.open!=='function')return {ok:false,reason:'Відкриття браузера не підтримується'};
    try {
      var win=root.open(lastUaKinoDetailUrl,'_blank');
      return win ? {ok:true,reason:'Запит на відкриття сторінки надіслано'} :
        {ok:false,reason:'WebView заблокував нове вікно'};
    } catch(err) {return {ok:false,reason:shortError(err)};}
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
    diagnostic:function(){return Object.assign({},stats, {transport:transportInfo(null),
      lastDetailAvailable:!!lastUaKinoDetailUrl});},install:install,
    openUaKinoPage:openUaKinoPage,
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

/* MultiSource Focus Return Lab v0.2 — Android/webOS iframe + internal/external player.
 * Scoped to MultiSource activity; no global key interception or media modification.
 * This module is a diagnostic/test add-on, not a verified device-level fix.
 */
(function (root) {
  'use strict';
  if (root.MultiSourceFocusReturn) return;
  var COMPONENT = 'multi_source_online_v1';
  var state = {
    version: '1.3.15b.4-focus-v0.2', booted: false, armed: false, external: false,
    webframeOpen: false, webframeEntrances: 0, webframeExits: 0,
    closeEvents: 0, resumeEvents: 0, restores: 0, focusAttempts: 0,
    lastResult: 'idle', lastController: '', lastTrigger: '', lastError: ''
  };
  var pending = [], observer = null, pulse = 0, checks = 0, previousFocus = null;
  var observing = false, scanPending = false;
  function activityName() {
    try { var a = root.Lampa.Activity.active();
      return a && (a.component || a.object && a.object.component || a.activity && a.activity.component) || '';
    } catch (_) { return ''; }
  }
  function inside() { return activityName() === COMPONENT; }
  function visible() { return !root.document.hidden && root.document.visibilityState !== 'hidden'; }
  function viewport() { return root.document.querySelector('.ms-scroll-viewport'); }
  function playerOpen() {
    try { return !!(root.Lampa.Player && root.Lampa.Player.opened && root.Lampa.Player.opened()); }
    catch (_) { return false; }
  }
  function overlays() {
    try {
      var l = root.Lampa;
      return !!(l.Select && l.Select.opened && l.Select.opened() ||
        l.Modal && l.Modal.opened && l.Modal.opened());
    } catch (_) { return false; }
  }
  function frameVisible() {
    var frames = root.document.querySelectorAll('iframe.ms-webframe, .ms-webframe-shell iframe');
    for (var i = 0; i < frames.length; i++) {
      var el = frames[i], hidden = false;
      for (var p = el; p && p.nodeType === 1; p = p.parentElement) {
        if (p.hidden || p.getAttribute && p.getAttribute('aria-hidden') === 'true') {hidden = true; break;}
        if (root.getComputedStyle) {
          var css = root.getComputedStyle(p);
          if (css && (css.display === 'none' || css.visibility === 'hidden')) {hidden = true; break;}
        }
      }
      if (hidden) continue;
      if (typeof el.getClientRects === 'function' && !el.getClientRects().length) continue;
      return true;
    }
    return false;
  }
  function cancel() {
    pending.forEach(function (id) { root.clearTimeout(id); });
    pending.length = 0;
  }
  function rememberFocus() {
    var v = viewport();
    if (!v) return;
    var node = v.querySelector('.selector.focus') || root.document.activeElement;
    if (node && v.contains(node) && node.classList && node.classList.contains('selector')) previousFocus = node;
  }
  function restore(reason, manual) {
    state.lastTrigger = reason;
    state.focusAttempts++;
    if (!manual && !state.armed) return state.lastResult = 'not-armed';
    if (!inside()) return state.lastResult = 'outside-multisource';
    if (!visible()) return state.lastResult = 'document-hidden';
    var v = viewport();
    if (!v || !root.document.documentElement.contains(v)) return state.lastResult = 'view-detached';
    if (playerOpen()) return state.lastResult = 'player-open';
    if (frameVisible()) return state.lastResult = 'webframe-still-visible';
    if (overlays()) return state.lastResult = 'overlay-open';
    var l = root.Lampa;
    if (!l || !l.Controller || typeof l.Controller.toggle !== 'function') return state.lastResult = 'no-controller';
    try {
      var enabled = l.Controller.enabled && l.Controller.enabled();
      state.lastController = enabled && enabled.name || '';
      if (/^(settings|search|keyboard|input)$/.test(state.lastController))
        return state.lastResult = 'controller-busy:' + state.lastController;
      var focused = root.document.activeElement;
      if (focused && focused.tagName === 'IFRAME' && focused.blur) focused.blur();
      l.Controller.toggle('content');
      // Usually the MultiSource content controller itself restores collectionFocus.
      // If it did not, attempt only to reselect a *currently attached* item.
      if (!v.querySelector('.selector.focus') && typeof l.Controller.collectionFocus === 'function') {
        var target = previousFocus && v.contains(previousFocus) ? previousFocus : v.querySelector('.selector');
        if (target) {
          try { l.Controller.collectionFocus(target, v); }
          catch (ignored) { /* preserve successful Controller.toggle */ }
        }
      }
      state.restores++;
      state.armed = false;
      state.external = false;
      state.webframeOpen = false;
      cancel();
      return state.lastResult = 'restored';
    } catch (err) {
      state.lastError = String(err && err.message || err).slice(0, 180);
      return state.lastResult = 'exception';
    }
  }
  function schedule(reason) {
    cancel();
    [100, 380, 950, 1750].forEach(function (ms) {
      pending.push(root.setTimeout(function () {
        if (state.armed) restore(reason, false);
      }, ms));
    });
  }
  function scan(reason) {
    if (!inside() || !visible()) return;
    var present = frameVisible();
    if (present && !state.webframeOpen) {
      rememberFocus();
      state.webframeOpen = true;
      state.armed = true;
      state.webframeEntrances++;
      state.lastResult = 'webframe-armed';
      cancel();
    } else if (!present && state.webframeOpen) {
      state.webframeOpen = false;
      state.webframeExits++;
      schedule('webframe-exit:' + reason);
    }
  }
  function enqueueScan(reason) {
    if (scanPending) return;
    scanPending = true;
    root.setTimeout(function () { scanPending = false; scan(reason); }, 85);
  }
  function markPlaying(external) {
    if (!inside()) return;
    rememberFocus();
    state.armed = true;
    state.external = !!external;
    state.lastResult = external ? 'external-armed' : 'internal-armed';
  }
  function onClose() {
    if (!state.armed) return;
    state.closeEvents++;
    schedule('player-close');
  }
  function onResume() {
    if (!state.armed) return;
    state.resumeEvents++;
    if (state.external && !frameVisible()) schedule('external-resume');
    else enqueueScan('resume');
  }
  function boot() {
    checks++;
    if (!root.document.body || !root.Lampa || !root.Lampa.Activity ||
        !root.Lampa.Controller || !root.Lampa.Player || !root.Lampa.Player.listener ||
        typeof root.Lampa.Player.listener.follow !== 'function') {
      if (checks < 150) root.setTimeout(boot, 400);
      else state.lastResult = 'lampa-api-unavailable';
      return;
    }
    state.booted = true;
    var follow = root.Lampa.Player.listener.follow;
    follow.call(root.Lampa.Player.listener, 'start', function () {markPlaying(false);});
    follow.call(root.Lampa.Player.listener, 'external', function () {markPlaying(true);});
    follow.call(root.Lampa.Player.listener, 'close', onClose);
    if (root.MutationObserver) {
      observer = new root.MutationObserver(function () { enqueueScan('dom'); });
      observer.observe(root.document.body, {childList:true, subtree:true, attributes:true,
        attributeFilter:['class','style','hidden','aria-hidden']});
      observing = true;
    }
    // Lightweight periodic check for browsers that don't report iframe removal reliably.
    pulse = root.setInterval(function () { scan('poll'); }, 500);
    root.addEventListener('pageshow', onResume, false);
    root.addEventListener('focus', onResume, false);
    root.document.addEventListener('visibilitychange', function () {
      if (visible()) onResume();
    }, false);
    root.document.addEventListener('focusin', function () { if (!state.armed) rememberFocus(); }, true);
    // Do not suppress or override any remote key. Only schedule recovery when
    // the player/frame is demonstrably gone but the previous focus is stale.
    root.document.addEventListener('keydown', function (event) {
      if (state.armed && inside() && !playerOpen() && !frameVisible() &&
          /^(?:Arrow(?:Up|Down|Left|Right)|Escape|Backspace)$/.test(event.key))
        schedule('post-exit-key');
    }, true);
    state.lastResult = 'ready';
    scan('boot');
  }
  root.MultiSourceFocusReturn = {
    diagnostic: function () { return {
      version:state.version,booted:state.booted,armed:state.armed,
      external:state.external,webframeOpen:state.webframeOpen,
      webframeEntrances:state.webframeEntrances,webframeExits:state.webframeExits,
      closeEvents:state.closeEvents,resumeEvents:state.resumeEvents,
      restores:state.restores,focusAttempts:state.focusAttempts,
      currentComponent:root.Lampa?activityName():'',
      controller:state.lastController,lastTrigger:state.lastTrigger,
      lastResult:state.lastResult,lastError:state.lastError,
      domObserver:observing
    }; },
    restore: function () {return restore('manual', true);},
    _scan:scan // deterministic synthetic-test hook; no side effects beyond tracking
  };
  boot();
})(window);

/* MultiSource Diagnostics v0.1 — remote-friendly Android/webOS menu.
 * Only reports safe aggregate status/host names. User explicitly starts searches.
 * No player modification, no cookies or media URLs in the report.
 */
(function (root) {
  'use strict';
  if (root.MultiSourceDiagnostics1315b) return;
  var VERSION = '1.3.15b.8-diagnostics';
  var COMPONENT = 'multi_source_online_v1';
  var status = {version: VERSION, booted: false, button: false, opens:0,
    lastAction:'idle',lastError:'',tests:{eneyida:null,uakinocx:null,lavakino:null}};
  var observer = null, timer = 0, bootChecks = 0, busy = false, lastOpenAt = 0;
  function current() {
    try {var a = root.Lampa.Activity.active(); return a &&
      (a.component || a.object && a.object.component || a.activity && a.activity.component) || '';
    } catch (_) {return '';}
  }
  function active() { return current() === COMPONENT; }
  function isPlayerOpen() {
    try {return !!(root.Lampa.Player && root.Lampa.Player.opened && root.Lampa.Player.opened());}
    catch (_) {return false;}
  }
  function isWebframeOpen() {
    return !!(root.MultiSourceFocusReturn && root.MultiSourceFocusReturn.diagnostic().webframeOpen);
  }
  function overlayOpen() {
    try { return !!(root.Lampa.Select && root.Lampa.Select.opened && root.Lampa.Select.opened() ||
      root.Lampa.Modal && root.Lampa.Modal.opened && root.Lampa.Modal.opened()); }
    catch (_) { return false; }
  }
  function notify(msg) {
    try { if (root.Lampa.Noty && root.Lampa.Noty.show) root.Lampa.Noty.show(String(msg)); }
    catch (_) {}
  }
  function sourceList() {
    try { return root.LampaMultiSource && root.LampaMultiSource.listSources &&
      root.LampaMultiSource.listSources() || []; }
    catch (_) { return []; }
  }
  function provider(id) {
    var list=sourceList();
    for(var i=0;i<list.length;i++) if(list[i].id===id) return list[i];
    return null;
  }
  function redactError(e) {
    var m=String(e && e.message || e || '').slice(0,200);
    // Avoid leaking signed URLs, query tokens, and full media URLs.
    return m.replace(/https?:\/\/[^\s)]+/gi,'[URL приховано]');
  }
  function selected() {
    try {return root.Lampa.Storage.get('ms_v1_source', '');}
    catch (_) {return '';}
  }
  function platform() {
    try { if (root.Lampa.Platform && root.Lampa.Platform.is) {
      if (root.Lampa.Platform.is('android')) return 'android';
      if (root.Lampa.Platform.is('webos')) return 'webos';
    } }catch (_){}
    return typeof root.AndroidJS!=='undefined' ? 'android-bridge' : 'unknown';
  }
  function getReport() {
    var sourceState=root.MultiSourceSources1315b && root.MultiSourceSources1315b.diagnostic ?
      root.MultiSourceSources1315b.diagnostic() : {};
    var focus=root.MultiSourceFocusReturn && root.MultiSourceFocusReturn.diagnostic ?
      root.MultiSourceFocusReturn.diagnostic() : {};
    var back=root.MultiSourceBack1315b && root.MultiSourceBack1315b.diagnostic ?
      root.MultiSourceBack1315b.diagnostic() : {};
    var info=root.MultiSource1315b && root.MultiSource1315b.diagnostic ?
      root.MultiSource1315b.diagnostic() : {};
    var matches={};
    ['eneyida','uakinocx'].forEach(function(id){
      var s=provider(id), f=s && s.search;
      matches[id]={registered:!!s,searchType:typeof f,
        addonHandler:!!(f && /\bsearchProvider\s*\(/.test(Function.prototype.toString.call(f)))};
    });
    return {
      version:VERSION,core:info.core||'unknown',platform:platform(),
      selectedSource:selected(),component:current(),
      controller:(function(){try {return (root.Lampa.Controller.enabled()||{}).name||'';}catch(_){return '';}})(),
      providers:matches,
      lavakinoMatch:root.MultiSourceLavakinoMatch && root.MultiSourceLavakinoMatch.diagnostic ? root.MultiSourceLavakinoMatch.diagnostic() : null,
      lastSource:{stage:sourceState.lastStage||'',host:sourceState.lastHost||'',
        transport:sourceState.lastTransport||'',error:redactError(sourceState.lastError),
        search:sourceState.lastSearch||'',streams:sourceState.lastStreams||0,
        players:sourceState.lastPlayers||0,
        eneyidaCalls:sourceState.eneyidaSearches||0,
        uakinoCalls:sourceState.uakinocxSearches||0,
        query:sourceState.lastSearchQueries||[],
        pageTitle:sourceState.lastPageTitle||'',
        searchCards:sourceState.lastRawSearchCards||0,
        contentLinks:sourceState.lastRawSearchLinks||0,
        sampleTitles:sourceState.lastCandidateTitles||[],
        detail:{status:sourceState.lastDetailStatus||'idle',
          title:sourceState.lastDetailTitle||'',transport:sourceState.lastDetailTransport||'',
          error:redactError(sourceState.lastDetailError),
          browserAttempt:sourceState.lastBrowserAttempt||'not-tried',
          browserHttpStatus:sourceState.lastBrowserStatus||0,
          browserError:redactError(sourceState.lastBrowserError),
          pageAvailable:!!sourceState.lastDetailAvailable,
          htmlEvidence:sourceState.lastDetailEvidence||null}},
      transport:sourceState.transport||null,
      attempts:(sourceState.attempts||[]).slice(-8).map(function(x){return {
        host:x.host,method:x.method,via:x.via,ok:x.ok,
        length:x.length,error:redactError(x.error)
      };}),
      tests:status.tests,
      back:{controller:back.controller||'',invoked:back.invoked||0,lastRoute:back.lastRoute||'',
        error:redactError(back.lastError)},
      focus:{armed:!!focus.armed,webframeOpen:!!focus.webframeOpen,
        frameEntrances:focus.webframeEntrances||0,frameExits:focus.webframeExits||0,
        closeEvents:focus.closeEvents||0,restores:focus.restores||0,
        lastResult:focus.lastResult||'',lastTrigger:focus.lastTrigger||'',
        lastError:redactError(focus.lastError)}
    };
  }
  function textReport(){return JSON.stringify(getReport(),null,2);}
  function restoreView() {
    try { if (active() && root.Lampa.Controller && root.Lampa.Controller.toggle)
      root.Lampa.Controller.toggle('content'); }
    catch (err) {status.lastError=redactError(err);}
  }
  function menu() {
    if (Date.now() - lastOpenAt < 450) return;
    if (!active()) return notify('Діагностика доступна в каталозі MultiSource');
    if (isPlayerOpen() || isWebframeOpen()) return;
    if (!root.Lampa.Select || !root.Lampa.Select.show) return notify('Меню Lampa.Select недоступне');
    status.opens++;
    lastOpenAt = Date.now();
    root.Lampa.Select.show({
      title:'Діагностика джерел',
      items:[
        {title:'Показати звіт',action:'report'},
        {title:'Тест пошуку Eneyida.TV',action:'test',source:'eneyida'},
        {title:'Тест пошуку UaKino.CX',action:'test',source:'uakinocx'},
        {title:'Тест пошуку Lavakino · Motor City (2026)',action:'test',source:'lavakino'},
        {title:'Відкрити сторінку UaKino.CX у браузері (тест)',action:'browser'},
        {title:'Копіювати JSON-звіт',action:'copy'},
        {title:'Відновити керування',action:'restore'}
      ],
      onBack:restoreView,
      onSelect:function(item) {
        if(!item) return;
        status.lastAction=item.action;
        if(item.action==='browser'){
          // Call from this direct selection gesture, not a timer, to avoid
          // treating the operation as an unsolicited browser popup.
          var addon=root.MultiSourceSources1315b;
          var out=addon && addon.openUaKinoPage && addon.openUaKinoPage();
          notify(out&&out.reason||'Відкриття сторінки недоступне');
          return;
        }
        root.setTimeout(function(){
          if(item.action==='report') showReport();
          else if(item.action==='test') runTest(item.source);
          else if(item.action==='copy') {copyReport();restoreView();}
          else if(item.action==='restore') {
            var out = root.MultiSourceFocusReturn && root.MultiSourceFocusReturn.restore ?
              root.MultiSourceFocusReturn.restore() : 'недоступно';
            notify('Відновлення: '+out);
          }
        },100);
      }
    });
  }
  function reportElement() {
    var el=root.document.createElement('div');
    el.style.cssText='padding:0.6em;max-height:68vh;overflow:auto;';
    var pre=root.document.createElement('pre');
    pre.style.cssText='font-size:0.88em;line-height:1.45;white-space:pre-wrap;'+
      'overflow-wrap:anywhere;color:inherit;margin:0;';
    pre.textContent=textReport();
    el.appendChild(pre);
    return el;
  }
  function showReport() {
    if(!root.Lampa.Modal || !root.Lampa.Modal.open) {
      notify('Lampa.Modal недоступний');
      return;
    }
    try {
      var el=reportElement();
      // Lampa.Modal accepts a jQuery object as HTML on the supported Lampa builds.
      var content=root.jQuery ? root.jQuery(el) : el;
      root.Lampa.Modal.open({title:'MultiSource · Діагностика джерел',
        html:content,size:'medium',scroll_to_center:false,
        onBack:function(){root.Lampa.Modal.close();restoreView();}});
    } catch(err){status.lastError=redactError(err);notify(status.lastError);restoreView();}
  }
  function copyReport() {
    var data=textReport();
    try {
      if(root.Lampa.Utils && typeof root.Lampa.Utils.copyTextToClipboard==='function') {
        root.Lampa.Utils.copyTextToClipboard(data,function(){notify('Звіт скопійовано');},
          function(){notify('Не вдалося скопіювати; відкрийте звіт на екрані');});
        return;
      }
      if(root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
        root.navigator.clipboard.writeText(data).then(function(){notify('Звіт скопійовано');},
          function(){notify('Не вдалося скопіювати; відкрийте звіт');});
        return;
      }
    } catch(e) {status.lastError=redactError(e);}
    notify('Буфер обміну недоступний; виберіть «Показати звіт»');
  }
  function movieForTest() {
    try {
      var a=root.Lampa.Activity.active()||{}, m=a.movie||a.card||
        a.object && (a.object.movie||a.object.card)||{};
      if(m && (m.title||m.name)) return {
        title:String(m.title||m.name).slice(0,120),
        original_title:String(m.original_title||m.original_name||'').slice(0,120),
        release_date:String(m.release_date||m.first_air_date||'').slice(0,30)
      };
    } catch (_) {}
    return {title:'Джон Уік',original_title:'John Wick',release_date:'2014-10-24'};
  }
  function runTest(id) {
    if (busy) {notify('Тест уже виконується');return;}
    var s=provider(id);
    if(!s || typeof s.search!=='function') {
      status.tests[id]={status:'unavailable'};return showReport();
    }
    var m=id==='lavakino'?{title:'Мотор Сіті',original_title:'Motor City',release_date:'2026-01-01'}:movieForTest(), time=Date.now();
    busy=true;
    status.tests[id]={status:'running',title:m.title,started:new Date(time).toISOString()};
    notify('Тест '+id+': '+m.title);
    // The test calls the exact registered source.search and does not alter selection.
    var settled=false;
    var timeout=root.setTimeout(function(){finish('timeout',null,'Таймаут 45 секунд');},45000);
    function finish(result,items,err) {
      if(settled)return;
      settled=true;root.clearTimeout(timeout);busy=false;
      status.tests[id]={status:result,title:m.title,
        results:Array.isArray(items)?items.length:null,
        error:redactError(err),finished:new Date().toISOString()};
      notify('Тест '+id+': '+(result==='ok'?'результатів '+status.tests[id].results:status.tests[id].error));
      if(active() && !isPlayerOpen() && !overlayOpen()) showReport();
    }
    Promise.resolve().then(function(){return s.search(m,{});}).then(function(items){
      finish('ok',items,'');
    },function(err){finish('error',null,err);});
  }
  function attach() {
    if(!active() || isPlayerOpen() || isWebframeOpen() || overlayOpen())return;
    var view=root.document.querySelector('.ms-scroll-viewport');
    if(!view || !root.document.documentElement.contains(view))return;
    if(view.querySelector('.ms-1315b-diag')) {status.button=true;return;}
    var b=root.document.createElement('div');
    b.className='ms-1315b-diag selector';b.tabIndex=0;
    b.setAttribute('role','button');b.setAttribute('aria-label','Діагностика джерел');
    b.style.cssText='display:inline-flex;align-items:center;padding:.45em .85em;'+
      'margin:0 0 .65em .5em;border:1px solid rgba(255,255,255,.28);'+
      'border-radius:.45em;cursor:pointer;color:inherit;background:rgba(120,130,150,.12)';
    b.textContent='⚙ Діагностика джерел';
    function click(e){ if(e){e.preventDefault();e.stopPropagation();} menu(); }
    b.addEventListener('click',click);
    b.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){click(e);}});
    if(root.jQuery)root.jQuery(b).on('hover:enter',function(){menu();});
    var previous=view.querySelector('.ms-1315b-back');
    if(previous && previous.nextSibling) view.insertBefore(b,previous.nextSibling);
    else view.insertBefore(b,view.firstChild);
    status.button=true;
    // After adding the selector, refresh the native navigation collection once.
    if(root.Lampa.Controller && root.Lampa.Controller.toggle)root.Lampa.Controller.toggle('content');
  }
  function refresh(){if(timer)root.clearTimeout(timer);timer=root.setTimeout(function(){timer=0;attach();},175);}
  function boot() {
    bootChecks++;
    if(!root.Lampa || !root.Lampa.Controller || !root.Lampa.Activity ||
      !root.document.body || !root.LampaMultiSource || !root.LampaMultiSource._coreLoaded) {
      if(bootChecks<220)root.setTimeout(boot,400);
      else status.lastError='Lampa core unavailable';
      return;
    }
    status.booted=true;
    if(root.MutationObserver){observer=new root.MutationObserver(refresh);
      observer.observe(root.document.body,{childList:true,subtree:true});}
    refresh();
  }
  root.MultiSourceDiagnostics1315b={
    diagnostic:function(){return {version:status.version,booted:status.booted,
      button:status.button,opens:status.opens,lastAction:status.lastAction,lastError:status.lastError,
      tests:status.tests};},
    report:getReport,open:menu,showReport:showReport,runTest:runTest
  };
  boot();
})(window);



/* Lavakino exact-title test, additive to MultiSource 1.3.15b.6.
 * Handles the verified ambiguity Motor City (2026) vs Motorcity ONLY.
 * Does not change HTML/network/player logic or any other source.
 * If the core search already discarded the correct film, returns no match
 * instead of returning the incorrect one, and records that limitation.
 */
(function (root) {
  'use strict';
  if (root.MultiSourceLavakinoMatch) return;
  var VERSION='1.3.15b.7-lavakino-match-test';
  var state={version:VERSION,installed:false,lastMovie:'',lastMode:'idle',
    inputCount:0,outputCount:0,candidates:[],selected:[],lastError:''};
  function norm(value) {
    return String(value||'').toLowerCase().replace(/[’'`]/g,'').replace(/[^a-z0-9а-яіїєґё]+/gi,' ').replace(/\s+/g,' ').trim();
  }
  function movieYear(movie) {
    var str=String(movie.release_date||movie.first_air_date||movie.year||'');
    var match=/(?:19|20)\d{2}/.exec(str);return match?match[0]:'';
  }
  function resultTitle(item){return String(item && (item.title||item.name||item.original_title||item.original_name||item.label)||'').trim();}
  function titleYear(item){
    var raw=String(item && (item.year||item.release_date||item.first_air_date)||'');
    var m=/(?:19|20)\d{2}/.exec(raw);
    if(!m) m=/(?:19|20)\d{2}/.exec(resultTitle(item));
    return m?m[0]:'';
  }
  function pureTitle(s){return norm(String(s||'').replace(/[\(\[\s]*\b(?:19|20)\d{2}\b[\)\]\s]*/g,' '));}
  function targetMovie(movie){
    movie=movie||{};
    if(movieYear(movie)!=='2026')return false;
    return [movie.title,movie.name,movie.original_title,movie.original_name].some(function(t){
      return pureTitle(t)==='motor city'||pureTitle(t)==='мотор сіті';
    });
  }
  function safeSamples(items){return items.slice(0,12).map(function(item){return {title:resultTitle(item).slice(0,90),year:titleYear(item)};});}
  function filter(items,movie){
    state.inputCount=items.length;state.candidates=safeSamples(items);
    if(!targetMovie(movie)){
      state.lastMode='unchanged-other-film';state.outputCount=items.length;state.selected=safeSamples(items);return items;
    }
    var valid=items.filter(function(item){
      var t=pureTitle(resultTitle(item));
      var exact=t==='motor city'||t==='мотор сіті';
      var y=titleYear(item);
      return exact && (!y||y==='2026');
    });
    // Prefer a verified 2026 card over one with no explicit year.
    valid.sort(function(a,b){return (titleYear(b)==='2026'?1:0)-(titleYear(a)==='2026'?1:0);});
    state.lastMode=valid.length?'exact-title-filtered':'no-exact-match-in-core-results';
    state.outputCount=valid.length;state.selected=safeSamples(valid);return valid;
  }
  function install(){
    var api=root.LampaMultiSource;
    if(!api||!api._coreLoaded||typeof api.listSources!=='function'||typeof api.registerSource!=='function')return false;
    var list=api.listSources(),source=null;
    for(var i=0;i<list.length;i++)if(list[i]&&list[i].id==='lavakino'){source=list[i];break;}
    if(!source||typeof source.search!=='function'||typeof source.getStreams!=='function')return false;
    if(source.search._msLavakinoExactMatch){state.installed=true;return true;}
    var copy={};for(var k in source)if(Object.prototype.hasOwnProperty.call(source,k))copy[k]=source[k];
    var oldSearch=source.search;
    copy.search=function(movie,coreApi){
      state.lastMovie=String(movie&&(movie.original_title||movie.title||movie.name)||'').slice(0,100);
      state.lastError='';state.lastMode='pending';
      try {
        return Promise.resolve(oldSearch.call(source,movie,coreApi)).then(function(found){
          if(!Array.isArray(found)){
            state.lastMode='unsupported-search-result';return found;
          }
          return filter(found,movie||{});
        },function(error){state.lastMode='search-error';state.lastError=String(error&&error.message||error).slice(0,130);throw error;});
      } catch(error) {state.lastMode='search-error';state.lastError=String(error&&error.message||error).slice(0,130);throw error;}
    };
    copy.search._msLavakinoExactMatch=true;
    api.registerSource(copy);
    state.installed=true;return true;
  }
  root.MultiSourceLavakinoMatch={install:install,diagnostic:function(){return {
    version:state.version,installed:state.installed,lastMovie:state.lastMovie,
    lastMode:state.lastMode,inputCount:state.inputCount,outputCount:state.outputCount,
    candidates:state.candidates,selected:state.selected,lastError:state.lastError
  };},_test:{filter:filter,pureTitle:pureTitle,targetMovie:targetMovie}};
  if(!install()){
    var tries=0,tm=setInterval(function(){if(install()||++tries>150)clearInterval(tm);},400);
  }
})(window);
