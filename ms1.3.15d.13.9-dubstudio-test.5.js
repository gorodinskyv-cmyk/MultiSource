(function (root) {
 'use strict';
 var existing=root.MultiSourceUAKinoBest1315d, previous='';
 if(existing){
   try{previous=String(existing.diagnostic&&existing.diagnostic().version||'unknown').slice(0,72);}catch(_){previous='unknown';}
   root.MultiSourceD13Boot={version:'1.3.15d.13.9',status:previous==='1.3.15d.13.9'?'already-installed':'restart-required',existingVersion:previous};
   // A hot swap cannot undo the old core/player hooks. Require a clean restart.
   return;
 }
 root.MultiSourceD13Boot={version:'1.3.15d.13.9',status:'loading',existingVersion:''};
/* MultiSource 1.3.15d.13.9 INTEGRATED — movies + UAFix TV episodes.
 * Reconstructed from tested 1.3.15d.13.5 full entrypoint and tested d.13.8 TV add-on;
 * d.13.7 original source was not available. Recreated playback event diagnostics. — Transport & Player Resolver.
 * Pauses UAKino.best; adds KlonUA, Kinotron, UAFix. Legacy providers unchanged.
 * Reuses published upstream b.8/core; no secondary Lampa plugins.
 * Poster layout is applied to movie detail cards only, not episodes/TV series.
 * Based on c.10 recovery/base b.8; loads published upstream b.8/core.
 * Lift disabled. No modifications to playback in other sources.
 */
/* MultiSource 1.3.15c.10 TEST — recovery without aggressive UI layout; preserved Lift capture / FocusFix3 for Android/webOS.
 * Install ONLY this entrypoint (not b.8 in parallel). b.8 and its 1.3.15 core
 * remain unchanged; this patch replaces only two source handlers after boot.
 * No DRM/CORS bypass; no cookie, signed stream or URL telemetry.
 */
(function (root) {
  'use strict';
  if (root.MultiSourcePatch1315b10) return;
  var VERSION = '1.3.15d.5-private-worker-transport-test';
  var BASE = 'https://gorodinskyv-cmyk.github.io/MultiSource/ms1.3.15b.8-test.js';
  var state = {version:VERSION, installed:false, core:'waiting', source:'waiting', loadError:'',
    lavakino:{stage:'idle',attempted:0,received:0,allCards:0,matchedCards:0,verified:0,
      candidates:[],rejected:[],error:''},
    uakinocx:{stage:'idle',htmlOK:false,hasAlternativeMarker:false,iframeCount:0,
      discoveredPlayers:0,playerHosts:[],playerInfo:[],discardedAds:0,scriptCandidates:0,
      originalEmbeds:0,streams:0,error:'',button:false,
      altProbe:{stage:'idle',requested:0,received:0,directFound:0,rejectedAds:0,format:'',mediaHost:'',error:''},
      frame:{stage:'idle',mode:'',host:'',loads:0,closes:0,error:''}},
    ui:{version:'toolbar-ui1',status:'waiting',backPosition:'',diagnosticsPosition:'',hiddenLegacy:0}};
  var currentUa = {pageUrl:'',players:[],media:[],title:'',stamp:0};
  var detailSerial=0, cachedPages=Object.create(null);
  var frameKeyHandler=null, frameLoadTimer=0;
  var selectorTimer = 0, overlay=null, previousFocus=null;
  var sourceFocusTimer=0, sourceFocusPending=false, sourceFocusAttempts=0;
  var SOURCE_FOCUS_MAX_ATTEMPTS=18;
  var lastObservedSource=null, sourceFocusWatchUntil=0, sourceFocusRepairs=0;
  var sourceFocus={stage:'idle',source:'',previous:'',trigger:'',requests:0,attempts:0,restores:0,blocked:0,repairs:0,controllerBefore:'',controllerAfter:'',target:'',blockReason:'',windowTop:'',error:''};
  state.ui.sourceFocus=sourceFocus;
  var liftState={version:'1.3.15c.2-lift-capture-test',installed:false,stage:'idle',transport:'',
    attempts:0,searchQueries:0,apiItems:0,matches:0,lastQuery:'',detailId:0,detailTitle:'',
    playerFound:false,playerHost:'',button:false,frame:{stage:'idle',loads:0,closes:0,error:''},error:''};
  var currentLift={id:0,title:'',pageUrl:'',iframe:'',stamp:0};
  var liftSerial=0,liftOverlay=null,liftKeyHandler=null,liftPreviousFocus=null,liftTimer=0;
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
    if(!u || ['lavakino.cc','uakino.cx','api.ortified.ws','ortified.ws','api.ortifield.ws'].indexOf(new URL(u).hostname)<0)
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
  // URL filtering happens before ever presenting a URL as a user-selectable player.
  // Hostnames alone do not establish that the iframe is a movie player.
  function playerUrl(v,base){
    var raw=String(v||'').trim().replace(/\\\//g,'/').replace(/&amp;/g,'&');
    if(!raw || /^(?:javascript|data|blob|about):/i.test(raw))return '';
    var s=safeUrl(raw,base);
    if(!s)return '';
    var u=new URL(s),h=u.hostname.toLowerCase();
    if(h==='uakino.cx' || /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com|google\.com|googleapis\.com|gstatic\.com|googlesyndication\.com|doubleclick\.net|facebook\.com|twitter\.com|x\.com|cloudflare\.com|recaptcha\.net|telegram\.org|t\.me)$/.test(h))return '';
    if(/(?:^|\.)(?:ads?|adserver|adsystem|advertising|analytics|tracker|tracking|popunder|popup)(?:\.|$)/i.test(h))return '';
    if(/\.(?:m3u8|mp4|mpd|webm|jpg|jpeg|png|gif|js|css)(?:$|\?)/i.test(u.pathname))return '';
    if(/(?:^|[\/_-])(?:banner|advert(?:isement)?|popunder|popup|tracking|analytics)(?:$|[\/_-])/i.test(u.pathname))return '';
    return s;
  }
  function attr(node,k){try{return node&&node.getAttribute&&String(node.getAttribute(k)||'')||'';}catch(_){return '';}}
  function nearestContext(n){
    var chain=[],p=n,depth=0;
    while(p && depth++<8){chain.push(p);p=p.parentElement||p.parentNode;}
    return chain;
  }
  function adContainer(n){
    return nearestContext(n).some(function(x){
      var s=[attr(x,'class'),attr(x,'id'),attr(x,'aria-label'),attr(x,'data-ad')].join(' ').toLowerCase();
      return /(?:^|[\s_-])(?:ad|ads|advert|advertisement|banner|sponsor|popunder|popup)(?:$|[\s_-])/.test(s);
    });
  }
  function inferTabs(d){
    var map=Object.create(null),controls=d.querySelectorAll('button,a,[role="tab"],[data-target],[data-tab]');
    for(var i=0;i<controls.length && i<100;i++){
      var n=controls[i],label=text(n).toLowerCase(),role='';
      if(/альтернативн.{0,35}пле[єe]р|alternative\s*player|резервн.{0,20}пле[єe]р/.test(label))role='alternative';
      else if(/дивитися\s+онлайн|основн.{0,30}пле[єe]р|головн.{0,30}пле[єe]р|main\s*player/.test(label))role='primary';
      if(!role)continue;
      var t=attr(n,'data-target')||attr(n,'data-tab')||attr(n,'aria-controls')||attr(n,'href');
      var target=/^#([\w-]+)$/.exec(t.trim());
      if(target)map[target[1]]=role;
      else if(/^[\w-]{2,65}$/.test(t))map[t]=role;
    }
    return map;
  }
  function roleFor(n,tabMap){
    var chain=nearestContext(n);
    for(var i=0;i<chain.length;i++){
      var x=chain[i],id=attr(x,'id'),c=attr(x,'class');
      if(tabMap[id])return tabMap[id];
      if(/(?:^|[\s_-])(?:alt|alternative|reserve|backup)(?:[\s_-]|$)/i.test(id+' '+c))return 'alternative';
      if(/(?:^|[\s_-])(?:main|primary)(?:[\s_-]|$)/i.test(id+' '+c))return 'primary';
    }
    return 'unverified';
  }
  function inPlayerSection(n){
    return nearestContext(n).some(function(x){return /(?:player|video|movie|online|watch|stream|iframe|tab-content|tabs-content)/i.test(attr(x,'class')+' '+attr(x,'id'));});
  }
  function collectPlayers(html,base){
    var d=dom(html),tabs=inferTabs(d),list=[],seen=Object.create(null),ads=0,scriptCandidates=0;
    var iframes=d.querySelectorAll('iframe'),nodes=d.querySelectorAll('iframe[src],iframe[data-src],[data-player],[data-iframe],[data-video],[data-embed],[data-player-url]');
    function add(raw,node,method,scriptContext){
      if(node && adContainer(node)){ads++;return;}
      var u=playerUrl(raw,base);
      if(!u)return;
      if(method==='script' && /\b(?:ads?|advert|banner|popup|pre[ -]?roll|sponsor)\b/i.test(scriptContext||'')){ads++;return;}
      var role=roleFor(node,tabs),strong=method==='iframe'||method==='data';
      // The script may initialize a real iframe dynamically. Mark this as unverified,
      // never as guaranteed playable, and never autoplay it through core embeds.
      var conf=method==='iframe'?'high':method==='data'?'medium':'low';
      var candidate={url:u,host:new URL(u).hostname,role:role,method:method,confidence:conf};
      if(!seen[u]){seen[u]=candidate;list.push(candidate);}
      else if(strong && seen[u].method==='script'){
        seen[u].method=method;seen[u].role=role;seen[u].confidence=conf;
      }
    }
    for(var i=0;i<nodes.length && i<120;i++){
      var n=nodes[i],isIframe=String(n.tagName||'').toLowerCase()==='iframe';
      if(!isIframe && !inPlayerSection(n) && roleFor(n,tabs)==='unverified')continue;
      ['src','data-src','data-player','data-iframe','data-video','data-embed','data-player-url'].forEach(function(k){
        var raw=attr(n,k);if(raw && (isIframe||k!=='src'))add(raw,n,isIframe?'iframe':'data','');
      });
    }
    var scripts=d.querySelectorAll('script:not([src])');
    for(var j=0;j<scripts.length && j<60;j++){
      var st=String(scripts[j].textContent||'').replace(/\\\//g,'/');
      // Only literal player assignment values. Do not scrape all HTTP links from JS.
      var re=/(?:iframe|player|embed|video|src)\s*[:=]\s*["'](https:\/\/[^"'\s<>]{8,1000})["']/gi,m,count=0;
      while((m=re.exec(st))!==null && count++<24 && list.length<24){
        scriptCandidates++;
        var around=st.slice(Math.max(0,m.index-55),Math.min(st.length,re.lastIndex+55));
        add(m[1],null,'script',around);
      }
    }
    // Deduplicate without collapsing different players on the same domain.
    list.sort(function(a,b){
      function rank(x){return (x.role==='primary'?30:x.role==='alternative'?20:0)+(x.method==='iframe'?3:x.method==='data'?2:1);}
      return rank(b)-rank(a);
    });
    return {players:list.slice(0,8),iframeCount:iframes.length,discardedAds:ads,scriptCandidates:scriptCandidates,
      alternativeMarker:/(?:альтернативн.{0,30}пле[єe]р|alternative\s*player|alt[_-]?player)/i.test(html)};
  }
  // Inspect ONLY the published alternate player's HTML. Cross-origin iframe
  // traffic after a pre-roll is not visible to ordinary page JavaScript: this
  // is a best-effort static source inspection, not a network interceptor.
  function recognizedAlternativeHost(host){
    return ['api.ortified.ws','ortified.ws','api.ortifield.ws'].indexOf(String(host||'').toLowerCase())!==-1;
  }
  function mediaAddress(value,base){
    try{
      var v=String(value||'').trim().replace(/\\\//g,'/').replace(/&amp;/g,'&');
      if(v.indexOf('//')===0)v='https:'+v;
      var u=new URL(v,base);
      var host=u.hostname.toLowerCase();
      if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.href.length>4096)return '';
      if(host==='localhost'||host==='::1'||/^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host))return '';
      if(!/\.(?:m3u8|mp4|mpd|webm)(?:$|[?#])/i.test(u.pathname+u.search))return '';
      if(/(?:^|[\/._-])(?:ads?|advert(?:isement)?|preroll|pre-roll|vast|vpaid|banner|teaser|sponsor)(?:$|[\/._-])/i.test(u.pathname))return '';
      return u.href;
    }catch(_){return '';}
  }
  function extractPublishedMedia(html,base){
    var d=dom(html),candidates=[],seen=Object.create(null),ads=0;
    function push(raw,method,context,adNode){
      var url=mediaAddress(raw,base);
      if(!url)return;
      if(adNode||/(?:\b(?:pre[ -]?roll|vast|vpaid|advert(?:isement)?|adtag|adurl|banner|sponsor)\b)/i.test(context||'')){
        ads++;return;
      }
      if(!seen[url]){
        seen[url]=true;
        candidates.push({url:url,host:new URL(url).hostname,method:method,
          format:/\.m3u8(?:[?#]|$)/i.test(url)?'HLS':/\.mp4(?:[?#]|$)/i.test(url)?'MP4':/\.mpd(?:[?#]|$)/i.test(url)?'DASH':'Video'});
      }
    }
    var tags=d.querySelectorAll('video[src],video source[src],source[src]');
    for(var i=0;i<tags.length&&i<40;i++){
      var n=tags[i];push(attr(n,'src'),'video-tag','',adContainer(n));
    }
    var scripts=d.querySelectorAll('script:not([src])');
    for(var j=0;j<scripts.length&&j<60;j++){
      var js=String(scripts[j].textContent||'').replace(/\\\//g,'/');
      // Literal media URL in a file/hls/stream field only: URLs from VAST or
      // generic resource requests are not enough to label a movie stream.
      var rx=/(?:[\"']?(?:file|hls|stream|playlist|videoUrl|src)[\"']?)\s*[:=]\s*[\"'](https?:\/\/[^\"'\s<>]{8,1800})[\"']/gi,m,n=0;
      while((m=rx.exec(js))!==null&&n++<60){
        var before=js.slice(Math.max(0,m.index-130),m.index);
        var boundary=Math.max(before.lastIndexOf(';'),before.lastIndexOf('\n'),before.lastIndexOf('}'));
        var context=before.slice(boundary+1);
        push(m[1],'published-config',context,false);
      }
    }
    // Different direct addresses can be separate bitrate/voice variants;
    // choose one only if unique to avoid guessing which one is movie vs ad.
    return {media:candidates.length===1?candidates:[],found:candidates.length,rejectedAds:ads,
      ambiguous:candidates.length>1};
  }
  function probeAlternate(serial){
    var probe=state.uakinocx.altProbe;
    var target=currentUa.players.filter(function(p){return recognizedAlternativeHost(p.host)&&p.role==='alternative';})[0] ||
      currentUa.players.filter(function(p){return recognizedAlternativeHost(p.host);})[0];
    if(!target){probe.stage='no-alternative-url';return;}
    probe.stage='checking';probe.requested++;
    nativeGet(target.url).then(function(html){
      if(serial!==detailSerial)return;
      probe.received++;
      var parsed=extractPublishedMedia(html,target.url);
      probe.rejectedAds=parsed.rejectedAds;
      probe.directFound=parsed.found;
      if(parsed.media.length){
        currentUa.media=parsed.media;
        probe.stage='published-media-found';probe.format=parsed.media[0].format;
        probe.mediaHost=parsed.media[0].host;
      } else probe.stage=parsed.ambiguous?'ambiguous-sources':'not-in-static-html';
      scheduleButton();
    },function(err){
      if(serial!==detailSerial)return;
      probe.stage='html-unavailable';probe.error=errmsg(err);scheduleButton();
    });
  }
  function cachedNativePage(url){
    // Cache applies only to the B10 page inspection, not to the b.8 core's
    // streams pipeline, which must remain untouched.
    var cached=cachedPages[url],now=Date.now();
    if(cached && now-cached.at<12000)return cached.promise;
    var promise=nativeGet(url);
    cachedPages[url]={at:now,promise:promise};
    return promise.catch(function(err){if(cachedPages[url] && cachedPages[url].promise===promise)delete cachedPages[url];throw err;});
  }
  function uaGetStreams(item,api,orig,source){
    var url=safeUrl(item && item.url,undefined,'uakino.cx');
    if(!url)return orig.call(source,item,api);
    var serial=++detailSerial;
    state.uakinocx={stage:'detail',htmlOK:false,hasAlternativeMarker:false,iframeCount:0,
      discoveredPlayers:0,playerHosts:[],playerInfo:[],discardedAds:0,scriptCandidates:0,
      originalEmbeds:0,streams:0,error:'',button:false,
      altProbe:{stage:'idle',requested:0,received:0,directFound:0,rejectedAds:0,format:'',mediaHost:'',error:''},
      frame:{stage:'idle',mode:'',host:'',loads:0,closes:0,error:''}};
    currentUa={pageUrl:url,players:[],media:[],title:String(item&&item.title||'Фільм'),stamp:Date.now()};
    var media=Promise.resolve().then(function(){return orig.call(source,item,api);})
      .then(function(x){return {result:x};},function(err){return {error:err};});
    var page=cachedNativePage(url).then(function(html){return {parsed:collectPlayers(html,url)};},function(err){return {error:err};});
    return Promise.all([media,page]).then(function(pair){
      var response=pair[0],pg=pair[1],res=response.result||{};
      if(serial!==detailSerial){
        // Do not overwrite UI for a newer selected film.
        if(response.error)throw response.error;
        return res;
      }
      if(pg.parsed){
        state.uakinocx.htmlOK=true;
        state.uakinocx.iframeCount=pg.parsed.iframeCount;
        state.uakinocx.hasAlternativeMarker=pg.parsed.alternativeMarker;
        currentUa.players=pg.parsed.players;
        state.uakinocx.discoveredPlayers=currentUa.players.length;
        state.uakinocx.discardedAds=pg.parsed.discardedAds;
        state.uakinocx.scriptCandidates=pg.parsed.scriptCandidates;
        state.uakinocx.playerHosts=unique(currentUa.players.map(function(p){return p.host;}),function(s){return s;}).slice(0,8);
        state.uakinocx.playerInfo=currentUa.players.map(function(p){return {host:p.host,role:p.role,method:p.method,confidence:p.confidence};});
        probeAlternate(serial);
      }else state.uakinocx.error=errmsg(pg.error);
      if(response.error && !pg.parsed)throw response.error;
      if(response.error)state.uakinocx.error='Основний плеєр: '+errmsg(response.error);
      // Do not push web iframe URLs into embeds. Lampa may treat them as media
      // streams and accidentally pick an ad iframe over an existing HLS stream.
      res.streams=Array.isArray(res.streams)?res.streams:[];
      res.embeds=Array.isArray(res.embeds)?res.embeds:[];
      state.uakinocx.originalEmbeds=res.embeds.length;
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
    if(frameLoadTimer){root.clearTimeout(frameLoadTimer);frameLoadTimer=0;}
    if(frameKeyHandler){root.document.removeEventListener('keydown',frameKeyHandler,true);frameKeyHandler=null;}
    if(!overlay)return;
    var frame=overlay.querySelector&&overlay.querySelector('iframe');
    if(frame){try{frame.src='about:blank';}catch(_){}}
    overlay.parentNode&&overlay.parentNode.removeChild(overlay);
    overlay=null;
    state.uakinocx.frame.closes++;
    state.uakinocx.frame.stage='closed';
    try{if(previousFocus && root.document.documentElement.contains(previousFocus))previousFocus.focus();}catch(_){}
    try{root.Lampa.Controller.toggle('content');}catch(_){}
  }
  function inLampa(url){
    var good=playerUrl(url,currentUa.pageUrl);
    if(!good)return;
    closeOverlay();
    previousFocus=root.document.activeElement;
    var info=null;
    currentUa.players.forEach(function(p){if(p.url===good)info=p;});
    var d=state.uakinocx.frame;
    d.stage='opening';d.mode='iframe';d.host=new URL(good).hostname;d.loads=0;d.error='';
    var panel=root.document.createElement('div');panel.className='ms-b10-webframe';
    panel.style.cssText='position:fixed;inset:0;background:#080a0c;color:#fff;z-index:99999;display:flex;flex-direction:column;padding:1em;box-sizing:border-box';
    var bar=root.document.createElement('div');bar.style.cssText='display:flex;flex-wrap:wrap;gap:.5em;margin-bottom:.5em';
    var back=root.document.createElement('button');back.className='selector';back.textContent='‹ Назад у MultiSource';
    back.style.cssText='font-size:1.1em;background:#353f49;color:#fff;border:1px solid #888;padding:.6em;text-align:left';
    back.addEventListener('click',closeOverlay);bar.appendChild(back);
    var externalButton=root.document.createElement('button');externalButton.className='selector';externalButton.textContent='Відкрити на сайті';
    externalButton.style.cssText=back.style.cssText;
    externalButton.addEventListener('click',function(){external(currentUa.pageUrl);});bar.appendChild(externalButton);
    panel.appendChild(bar);
    var label=root.document.createElement('div');label.style.cssText='font-size:.85em;opacity:.85;margin-bottom:.45em';
    label.textContent='Вебплеєр '+d.host+(info&&info.role==='alternative'?' · альтернативна вкладка':'')+' · завантаження iframe не гарантує відтворення фільму';
    panel.appendChild(label);
    var frame=root.document.createElement('iframe');frame.setAttribute('title','UAKino вебплеєр');
    frame.setAttribute('allow','autoplay; fullscreen; picture-in-picture');frame.setAttribute('allowfullscreen','allowfullscreen');
    frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
    frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-presentation');
    frame.style.cssText='display:block;flex:1;min-height:0;width:100%;border:0;background:#000';
    frame.addEventListener('load',function(){
      if(overlay!==panel)return;
      d.loads++;d.stage='iframe-loaded-unverified';
      // Cross-origin playback cannot be inspected, and an ad can emit "load".
    });
    frame.addEventListener('error',function(){if(overlay===panel){d.stage='iframe-error';d.error='iframe load error';}});
    frame.src=good;panel.appendChild(frame);
    frameKeyHandler=function(e){
      if(['Escape','Backspace','BrowserBack','GoBack'].indexOf(e.key)>=0 || [8,27,461,10009].indexOf(e.keyCode)>=0){
        e.preventDefault();e.stopImmediatePropagation&&e.stopImmediatePropagation();e.stopPropagation();closeOverlay();
      }
    };
    root.document.addEventListener('keydown',frameKeyHandler,true);
    root.document.body.appendChild(panel);overlay=panel;back.focus();
    frameLoadTimer=root.setTimeout(function(){if(overlay===panel && d.stage==='opening')d.stage='iframe-timeout-unverified';},15000);
  }
  function showPlayers(){
    if(!active()||!uaSelected()||!currentUa.pageUrl)return;
    var pages=currentUa.players.slice(),base=currentUa.pageUrl;
    if(!root.Lampa.Select || !root.Lampa.Select.show){external(base);return;}
    var items=[];
    pages.forEach(function(p,i){
      var role=p.role==='primary'?'основна вкладка':p.role==='alternative'?'альтернативна вкладка':'вкладка не визначена';
      items.push({title:'Вебплеєр '+(i+1)+' · '+p.host+' ('+role+')',action:'player',url:p.url});
    });
    items.push({title:'Відкрити сторінку UAKino.cx (оригінальні вкладки)',action:'page',url:base});
    root.Lampa.Select.show({title:'UAKino.cx · вебплеєри',items:items,onSelect:function(x){
      if(!x)return;
      if(x.action==='page')return external(x.url);
      root.Lampa.Select.show({title:'Плеєр '+new URL(x.url).hostname+' · фільм не перевірено',
        items:[{title:'Відкрити у браузері',action:'external'},{title:'Спробувати в Lampa (iframe)',action:'embed'}],
        onSelect:function(mode){
          if(!mode)return;
          if(mode.action==='embed')inLampa(x.url);
          else{var f=state.uakinocx.frame;f.stage='external-open';f.mode='browser';f.host=new URL(x.url).hostname;external(x.url);}
        }});
    }});
  }

  // Lift c.2 experimental media discovery. Observes requests made by this
  // JavaScript realm and explicit postMessage data from the known Lift iframe.
  // Browser same-origin policy prevents inspecting fetch/XHR in a cross-origin
  // iframe. No hidden WebView hooks, proxying, referer spoofing or DRM bypass.
  var liftCapture={stage:'idle',active:false,source:'',requests:0,manifestCandidates:0,
    adRejected:0,manifestVerified:0,manifestUnverified:0,mediaHost:'',format:'',
    durationSeconds:0,playable:false,iframeIsolated:true,error:''};
  var capturedLiftMedia=null,liftCapturedIds=Object.create(null);
  var liftOriginalFetch=null,liftOriginalXhrOpen=null,liftObserver=null,liftMessageHandler=null;
  function liftClearMedia(){capturedLiftMedia=null;liftCapturedIds=Object.create(null);
    liftCapture.stage='idle';liftCapture.active=false;liftCapture.source='';
    liftCapture.requests=0;liftCapture.manifestCandidates=0;liftCapture.adRejected=0;
    liftCapture.manifestVerified=0;liftCapture.manifestUnverified=0;
    liftCapture.mediaHost='';liftCapture.format='';liftCapture.durationSeconds=0;
    liftCapture.playable=false;liftCapture.error='';}
  function liftManifestDuration(s){
    var m=/\bmediaPresentationDuration\s*=\s*["']P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?["']/i.exec(s);
    if(!m)return 0;
    return (Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0));
  }
  function liftMediaUrl(raw){
    try{
      var u=new URL(String(raw||''));
      if(u.protocol!=='https:'||u.username||u.password||u.port||u.href.length>2400)return '';
      var h=u.hostname.toLowerCase();
      if(!(h==='embed.liftw.ws'||h==='cdn.liftw.ws'||h==='api.liftw.ws'||h==='liftw.ws'||
          h==='interkh.com'||h.endsWith('.interkh.com')))return '';
      if(/(?:advert|vast|pre[\-_]?roll|\bads?\b|banner|tracker|pixel|load-xml)/i.test(h+' '+u.pathname))return '';
      return u.href;
    }catch(_){return '';}
  }
  function liftAssessManifest(raw,format,body){
    var url=liftMediaUrl(raw),data=String(body||'');
    if(!url||data.length>1500000)return {status:'invalid',format:'',duration:0};
    var isDash=/dash|mpd/i.test(format)||/\.mpd(?:$|\?)/i.test(url),
      isHls=/mpegurl|hls|m3u8/i.test(format)||/\.m3u8(?:$|\?)/i.test(url);
    if(!isDash&&!isHls)return {status:'unsupported',format:'',duration:0};
    if(/<VAST[\s>]|<Ad\b|<VMAP[\s>]/i.test(data))return {status:'advertising',format:'',duration:0};
    if(isDash){
      if(!/<MPD[\s>]/i.test(data))return {status:'unverified',format:'DASH',duration:0};
      if(/<ContentProtection\b/i.test(data))return {status:'protected',format:'DASH',duration:0};
      var len=liftManifestDuration(data);
      return {status:len>=2400?'verified':'unverified',format:'DASH',duration:len};
    }
    if(!/#EXTM3U/i.test(data))return {status:'unverified',format:'HLS',duration:0};
    if(/#EXT-X-KEY\s*:/i.test(data))return {status:'protected',format:'HLS',duration:0};
    var duration=0,re=/#EXTINF:\s*(\d+(?:\.\d+)?)/gi,m,count=0;
    while((m=re.exec(data))!==null&&count++<40000)duration+=Number(m[1]);
    if(!/#EXT-X-ENDLIST/i.test(data))return {status:'unverified',format:'HLS',duration:duration};
    return {status:duration>=2400?'verified':'unverified',format:'HLS',duration:duration};
  }
  function liftObserveManifest(raw,mime,body,source){
    if(!liftCapture.active||selectedSourceValue()!=='liftw'||!currentLift.id)return false;
    var url=liftMediaUrl(raw);
    if(!url){liftCapture.adRejected++;return false;}
    var tag=(String(mime||'').toLowerCase().indexOf('dash')>=0||/\.mpd(?:$|\?)/i.test(url))?'DASH':
      (String(mime||'').toLowerCase().indexOf('mpegurl')>=0||/\.m3u8(?:$|\?)/i.test(url))?'HLS':'';
    if(!tag)return false;
    var key=url.slice(0,1024);
    if(liftCapturedIds[key])return false;
    liftCapturedIds[key]=true;liftCapture.manifestCandidates++;
    var result=liftAssessManifest(url,tag,body);
    if(result.status==='advertising'){liftCapture.adRejected++;return false;}
    if(result.status!=='verified'){
      liftCapture.manifestUnverified++;
      if(result.status==='protected')liftCapture.stage='protected-manifest';
      else liftCapture.stage='manifest-unverified';
      return false;
    }
    // Manifest is consistent with a full-length VOD, but title identity and
    // TV playback are still unproven. Never auto-start this media URL.
    capturedLiftMedia={url:url,id:currentLift.id,format:result.format,
      durationSeconds:result.duration,source:String(source||'')};
    liftCapture.manifestVerified++;liftCapture.format=result.format;
    liftCapture.durationSeconds=Math.round(result.duration);
    liftCapture.mediaHost=new URL(url).hostname;
    liftCapture.playable=true;liftCapture.stage='candidate-verified-unplayed';
    scheduleButton();return true;
  }
  function liftSniffFetch(url,response){
    try{
      if(!liftCapture.active||!response||!response.headers)return;
      var mime=String(response.headers.get('content-type')||'');
      if(!/(?:dash\+xml|mpegurl)/i.test(mime))return;
      if(typeof response.clone!=='function')return;
      response.clone().text().then(function(txt){liftObserveManifest(url,mime,txt,'parent-fetch');},function(){});
    }catch(_){}
  }
  function liftCaptureStart(){
    if(liftCapture.active)return;
    liftCapture.active=true;liftCapture.stage='observing-parent-only';
    liftCapture.source='parent-fetch-xhr-postMessage';
    // Wrapping the host window never grants access inside a cross-origin iframe.
    if(typeof root.fetch==='function'){
      try{
        liftOriginalFetch=root.fetch;
        root.fetch=function(){
        var args=arguments,url=typeof args[0]==='string'?args[0]:(args[0]&&args[0].url)||'';
        var promise=liftOriginalFetch.apply(this,args);
        return promise.then(function(result){liftCapture.requests++;liftSniffFetch(url,result);return result;});
      };
        root.fetch._msLiftCapture=true;
      }catch(_){liftOriginalFetch=null;}
    }
    var xhr=root.XMLHttpRequest;
    if(xhr&&xhr.prototype&&typeof xhr.prototype.open==='function'){
      try{
        liftOriginalXhrOpen=xhr.prototype.open;
        xhr.prototype.open=function(method,url){
        var targetUrl=url;
        if(typeof this.addEventListener==='function')this.addEventListener('loadend',function(){
          try{
            if(!liftCapture.active)return;
            var ct=String(this.getResponseHeader('content-type')||'');
            if(!/(?:dash\+xml|mpegurl)/i.test(ct))return;
            liftCapture.requests++;
            var response=typeof this.responseText==='string'?this.responseText:'';
            liftObserveManifest(targetUrl,ct,response,'parent-xhr');
          }catch(_){}
        });
          return liftOriginalXhrOpen.apply(this,arguments);
        };
      }catch(_){liftOriginalXhrOpen=null;}
    }
    if(typeof root.addEventListener==='function'){
      liftMessageHandler=function(e){
        try{
          if(!liftOverlay||e.origin!=='https://embed.liftw.ws')return;
          var iframe=liftOverlay.querySelector&&liftOverlay.querySelector('iframe');
          if(!iframe||e.source!==iframe.contentWindow)return;
          var payload=e.data;
          if(typeof payload==='string'){if(payload.length>10000)return;try{payload=JSON.parse(payload);}catch(_){return;}}
          if(!payload||typeof payload!=='object')return;
          var type=String(payload.type||payload.event||payload.action||'').toLowerCase();
          if(!/(?:media|source|stream|player|manifest)/.test(type))return;
          var m=payload.media||payload.source||payload;
          if(m&&typeof m==='object')liftObserveManifest(m.url||m.src||m.file,m.mime||m.contentType||m.format,m.manifest||m.body||'','trusted-iframe-message');
        }catch(_){}
      };
      root.addEventListener('message',liftMessageHandler,false);
    }
    if(root.PerformanceObserver&&root.performance){
      try{
        liftObserver=new root.PerformanceObserver(function(entries){
          (entries.getEntries()||[]).forEach(function(entry){
            if(entry&&typeof entry.name==='string'&&liftCapture.active&&liftMediaUrl(entry.name)&&/\.(?:mpd|m3u8)(?:$|\?)/i.test(entry.name)){
              liftCapture.manifestUnverified++;liftCapture.stage='resource-seen-unverified';
            }
          });
        });
        liftObserver.observe({type:'resource',buffered:false});
      }catch(_){liftObserver=null;}
    }
  }
  function liftCaptureStop(){
    if(!liftCapture.active)return;
    liftCapture.active=false;
    if(liftOriginalFetch&&root.fetch&&root.fetch._msLiftCapture)root.fetch=liftOriginalFetch;
    liftOriginalFetch=null;
    if(liftOriginalXhrOpen&&root.XMLHttpRequest&&root.XMLHttpRequest.prototype)root.XMLHttpRequest.prototype.open=liftOriginalXhrOpen;
    liftOriginalXhrOpen=null;
    if(liftMessageHandler&&root.removeEventListener)root.removeEventListener('message',liftMessageHandler,false);
    liftMessageHandler=null;
    if(liftObserver){try{liftObserver.disconnect();}catch(_){}liftObserver=null;}
    if(liftCapture.stage==='observing-parent-only')liftCapture.stage='stopped-cross-origin-unobservable';
  }
  function liftPlayCaptured(){
    if(!capturedLiftMedia||capturedLiftMedia.id!==currentLift.id||!liftCapture.playable)return;
    if(!root.Lampa||!root.Lampa.Player||typeof root.Lampa.Player.play!=='function')return notify('Lampa.Player недоступний');
    var media=capturedLiftMedia;
    var item={url:media.url,title:currentLift.title+' · Lift '+media.format+' (експеримент)',isonline:true,
      type:media.format==='DASH'?'dash':'hls',mimeType:media.format==='DASH'?'application/dash+xml':'application/vnd.apple.mpegurl'};
    var movie=null;try{var a=root.Lampa.Activity.active();movie=a&&(a.movie||a.object&&a.object.movie);}catch(_){}
    if(movie)item.card=movie;
    item.playlist=[{url:item.url,title:item.title,isonline:true}];
    try{liftCaptureStop();if(liftOverlay)closeLiftOverlay();root.Lampa.Player.play(item);
      if(root.Lampa.Player.playlist)root.Lampa.Player.playlist(item.playlist);
    }catch(e){liftCapture.error=errmsg(e);notify('Lift DASH/HLS не запустився: '+errmsg(e));}
  }
  function liftCaptureDiagnostic(){return {stage:liftCapture.stage,active:liftCapture.active,
    source:liftCapture.source,requests:liftCapture.requests,
    manifestCandidates:liftCapture.manifestCandidates,adRejected:liftCapture.adRejected,
    manifestVerified:liftCapture.manifestVerified,manifestUnverified:liftCapture.manifestUnverified,
    format:liftCapture.format,mediaHost:liftCapture.mediaHost,durationSeconds:liftCapture.durationSeconds,
    playable:liftCapture.playable,iframeIsolated:true,error:liftCapture.error};}

  // Lift official web UI: https://liftw.ws/search.html -> public JSON API.
  // Read catalog metadata and iframe_uri; opt-in observer can inspect
  // same-realm manifests but not traffic from the cross-origin Lift iframe.
  function liftSafeId(value){var t=String(value==null?'':value);return /^\d{1,9}$/.test(t)&&Number(t)>0?Number(t):0;}
  function liftTypeMatches(movie,entry){
    var serial=!!(movie&&(movie.media_type==='tv'||movie.type==='tv'||movie.first_air_date||movie.number_of_seasons));
    var kind=Number(entry&&entry.type);
    return serial?(kind===3||kind===5):(kind===1);
  }
  function liftNames(movie){
    var raw=[movie&&movie.original_title,movie&&movie.original_name,movie&&movie.title,movie&&movie.name];
    return unique(raw.map(function(x){return String(x||'').trim().slice(0,120);}).filter(Boolean),norm);
  }
  function liftRank(entry,movie){
    if(!entry||!liftSafeId(entry.id)||!liftTypeMatches(movie,entry))return 0;
    var names=liftNames(movie),original=pure(entry.origin_name),local=pure(entry.name);
    var exactOrig=!!original&&names.some(function(s){return pure(s)===original;});
    var exactLocal=!!local&&names.some(function(s){return pure(s)===local;});
    if(!exactOrig&&!exactLocal)return 0;
    var expected=year(movie&&(movie.release_date||movie.first_air_date||movie.year));
    var actual=year(entry.year);
    var delta=expected&&actual?Math.abs(Number(expected)-Number(actual)):0;
    // One-year release mismatch is known for Motor City (2025 vs 2026),
    // but require the EXACT original title for this exception.
    if(delta>1||(delta===1&&!exactOrig))return 0;
    return (exactOrig?125:95)-(delta===1?18:0)+(actual&&expected&&actual===expected?12:0);
  }
  function liftInfoUrl(id){return 'https://api.liftw.ws/info/'+liftSafeId(id);}
  function liftDetailUrl(id){return 'https://liftw.ws/details.html?id='+liftSafeId(id);}
  function liftExtractId(item){
    var direct=liftSafeId(item&&(item.liftId||item.id));if(direct)return direct;
    try{
      var u=new URL(String(item&&item.url||''));
      if(u.protocol!=='https:'||u.hostname!=='liftw.ws'||u.pathname!=='/details.html')return 0;
      return liftSafeId(u.searchParams.get('id'));
    }catch(_){return 0;}
  }
  function liftPlayerUrl(raw,id){
    try{
      var u=new URL(String(raw||''));
      if(u.protocol!=='https:'||u.hostname!=='embed.liftw.ws'||u.port||u.username||u.password||u.hash||u.href.length>2000)return '';
      var expected=liftSafeId(id);
      if(!expected||!new RegExp('^/embed/(?:movie|serial|series)/'+expected+'/?$').test(u.pathname))return '';
      // Accept the site's published embed URI; don't rewrite or add tokens.
      return u.href;
    }catch(_){return '';}
  }
  function liftJsonBody(data){
    var val=data;
    if(data&&typeof data==='object'){
      if(typeof data.body==='string')val=data.body;
      else if(typeof data.responseText==='string')val=data.responseText;
      else if(typeof data.data==='string')val=data.data;
      else if(data.data&&typeof data.data==='object')val=data.data;
    }
    if(typeof val==='string'){
      if(val.length>1500000)throw Error('Lift JSON перевищує ліміт');
      try{return JSON.parse(val);}catch(_){throw Error('Lift повернув не JSON');}
    }
    if(val&&typeof val==='object'&&!Array.isArray(val))return val;
    throw Error('Порожня JSON-відповідь Lift');
  }
  function liftHttpJson(url){
    if(typeof root.fetch!=='function')return Promise.reject(Error('Browser fetch недоступний'));
    return root.fetch(url,{method:'GET',mode:'cors',credentials:'omit',redirect:'follow',
      headers:{Accept:'application/json'}}).then(function(r){
      if(!r||!r.ok||r.type==='opaque')throw Error('HTTP '+(r&&r.status||0));
      var ct=r.headers&&r.headers.get&&String(r.headers.get('content-type')||'')||'';
      if(ct&&!/json/i.test(ct))throw Error('Lift повернув не JSON content-type');
      return r.text();
    }).then(liftJsonBody);
  }
  function liftNativeJson(url){
    return new Promise(function(resolve,reject){
      if(!root.Lampa||typeof root.Lampa.Reguest!=='function')return reject(Error('Native transport недоступний'));
      var settled=false;
      function settle(e,v){if(settled)return;settled=true;e?reject(e):resolve(v);}
      try{
        var req=new root.Lampa.Reguest();if(req.timeout)req.timeout(14000);
        if(typeof req.native!=='function')return settle(Error('Native GET недоступний'));
        req.native(url,function(d){try{settle(null,liftJsonBody(d));}catch(e){settle(e);}},
          function(e){settle(Error(errmsg(e)));},false,{dataType:'text'});
      }catch(e){settle(e);}
    });
  }
  function liftRequest(path){
    // No arbitrary URLs: allow only the observed search and info API methods.
    if(!/^\/search\?q=[^#]{1,380}$/.test(path)&&!/^\/info\/\d{1,9}$/.test(path))
      return Promise.reject(Error('Непідтримуваний шлях Lift API'));
    var url='https://api.liftw.ws'+path;liftState.attempts++;
    return liftHttpJson(url).then(function(data){liftState.transport='browser-json';return data;},function(browserErr){
      return liftNativeJson(url).then(function(data){liftState.transport='native-json';return data;},function(nativeErr){
        throw Error('Lift API недоступний: browser '+errmsg(browserErr)+'; native '+errmsg(nativeErr));
      });
    });
  }
  function liftSearch(movie){
    movie=movie||{};liftCaptureStop();liftClearMedia();liftSerial++;currentLift={id:0,title:'',pageUrl:'',iframe:'',stamp:0};
    liftState.stage='search';liftState.button=false;liftState.error='';liftState.apiItems=0;liftState.matches=0;
    var names=liftNames(movie).slice(0,3);
    if(!names.length){liftState.stage='no-query';return Promise.resolve([]);}
    // Prefer original Latin title; run at most two variants and deduplicate IDs.
    var queries=names.slice(0,2);liftState.searchQueries+=queries.length;liftState.lastQuery=queries[0].slice(0,80);
    return Promise.all(queries.map(function(q){
      return liftRequest('/search?q='+encodeURIComponent(q)).then(function(d){
        var items=d&&Array.isArray(d.items)?d.items:[];
        liftState.apiItems+=items.length;return items.slice(0,100);
      });
    })).then(function(lists){
      var input=[].concat.apply([],lists),found=[],ids=Object.create(null);
      input.forEach(function(x){
        var id=liftSafeId(x&&x.id),score=liftRank(x,movie);
        if(!id||!score)return;
        var key=String(id);if(ids[key])return;ids[key]=true;
        found.push({id:id,liftId:id,title:String(x.name||x.origin_name||'').slice(0,140),
          originalTitle:String(x.origin_name||'').slice(0,140),url:liftDetailUrl(id),
          poster:safeUrl(x.poster,'https://img.liftw.ws/')||'',year:String(x.year||''),score:score,
          quality:String(x.quality||'').slice(0,20)});
      });
      found.sort(function(a,b){return b.score-a.score;});
      liftState.matches=found.length;liftState.stage='search-complete';return found.slice(0,25);
    }).catch(function(e){liftState.stage='search-error';liftState.error=errmsg(e);throw e;});
  }
  function liftGetStreams(item){
    var id=liftExtractId(item);
    if(!id)return Promise.reject(Error('Lift: некоректний ID фільму'));
    liftCaptureStop();liftClearMedia();var serial=++liftSerial;
    currentLift={id:id,title:String(item.title||'Lift').slice(0,140),pageUrl:liftDetailUrl(id),iframe:'',stamp:Date.now()};
    liftState.stage='info';liftState.detailId=id;liftState.detailTitle=currentLift.title;
    liftState.playerFound=false;liftState.playerHost='';liftState.button=false;liftState.error='';
    scheduleButton();
    return liftRequest('/info/'+id).then(function(data){
      var result=data&&typeof data==='object'?data:{};
      if(liftSafeId(result.id)!==id)throw Error('Lift: ID відповіді не збігається');
      var published=liftPlayerUrl(result.iframe_uri,id);
      if(result.iframe_uri && !published)throw Error('Lift: некоректний iframe_uri');
      if(serial!==liftSerial)return {streams:[],embeds:[],pageUrl:liftDetailUrl(id)};
      currentLift.iframe=published;
      currentLift.title=String(result.name||item.title||'Lift').slice(0,140);
      liftState.detailTitle=currentLift.title;liftState.playerHost=published?'embed.liftw.ws':'';
      liftState.playerFound=!!published;liftState.stage=published?'info-complete':'info-no-iframe';scheduleButton();
      // Explicitly do not treat a DASH ad/manifest as a playable movie.
      return {streams:[],embeds:[],pageUrl:currentLift.pageUrl,
        notice:published?'Lift: виберіть «Вебплеєр» нижче. Пряме DASH-відтворення не перевірено.':
          'Lift: адреса iframe не опублікована; доступна сторінка фільму.'};
    }).catch(function(e){
      if(serial===liftSerial){liftState.stage='info-error';liftState.error=errmsg(e);scheduleButton();}
      throw e;
    });
  }
  function closeLiftOverlay(){
    liftCaptureStop();
    if(liftTimer){root.clearTimeout(liftTimer);liftTimer=0;}
    if(liftKeyHandler){root.document.removeEventListener('keydown',liftKeyHandler,true);liftKeyHandler=null;}
    var panel=liftOverlay;if(!panel)return;
    var iframe=panel.querySelector&&panel.querySelector('iframe');
    if(iframe){try{iframe.src='about:blank';}catch(_){}}
    if(panel.parentNode)panel.parentNode.removeChild(panel);
    liftOverlay=null;liftState.frame.closes++;liftState.frame.stage='closed';
    try{if(liftPreviousFocus&&root.document.documentElement.contains(liftPreviousFocus))liftPreviousFocus.focus();}catch(_){}
    // Wait until the web frame is removed before restoring the source toolbar.
    try{root.Lampa.Controller.toggle('content');}catch(_){}
  }
  function liftOpenIframe(capture){
    if(!active()||selectedSourceValue()!=='liftw'||!currentLift.iframe)return;
    if(liftOverlay)closeLiftOverlay();
    var published=liftPlayerUrl(currentLift.iframe,currentLift.id);if(!published)return;
    var d=liftState.frame;d.stage='opening';d.loads=0;d.error='';
    liftPreviousFocus=root.document.activeElement;
    var panel=root.document.createElement('div');panel.className='ms-c-lift-overlay';
    panel.style.cssText='position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;background:#080a0c;color:#fff;padding:1em;box-sizing:border-box';
    var bar=root.document.createElement('div');bar.style.cssText='display:flex;gap:.5em;margin-bottom:.6em';
    var back=root.document.createElement('button');back.className='selector';back.textContent='‹ Назад у MultiSource';
    back.style.cssText='font-size:1em;background:#38424d;color:#fff;border:1px solid #888;padding:.6em';
    back.addEventListener('click',closeLiftOverlay);bar.appendChild(back);
    var other=root.document.createElement('button');other.className='selector';other.textContent='Відкрити на сайті Lift';
    other.style.cssText=back.style.cssText;other.addEventListener('click',function(){external(currentLift.pageUrl);});bar.appendChild(other);
    panel.appendChild(bar);
    var label=root.document.createElement('div');label.textContent='Lift · '+currentLift.title+' · iframe (відтворення на TV не підтверджено)';
    label.style.cssText='font-size:.9em;margin-bottom:.4em';panel.appendChild(label);
    var iframe=root.document.createElement('iframe');iframe.setAttribute('title','Lift Web Player');
    iframe.setAttribute('allow','autoplay; fullscreen; picture-in-picture');
    iframe.setAttribute('allowfullscreen','allowfullscreen');
    iframe.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
    iframe.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-presentation');
    iframe.style.cssText='width:100%;flex:1;min-height:0;border:0;background:#000';
    iframe.addEventListener('load',function(){if(liftOverlay===panel){d.loads++;d.stage='iframe-loaded-unverified';}});
    iframe.addEventListener('error',function(){if(liftOverlay===panel){d.stage='iframe-error';d.error='iframe load error';}});
    iframe.src=published;panel.appendChild(iframe);
    liftKeyHandler=function(e){if(['Escape','Backspace','BrowserBack','GoBack'].indexOf(e.key)>=0||[8,27,461,10009].indexOf(e.keyCode)>=0){
      if(e.preventDefault)e.preventDefault();if(e.stopImmediatePropagation)e.stopImmediatePropagation();if(e.stopPropagation)e.stopPropagation();closeLiftOverlay();}};
    root.document.addEventListener('keydown',liftKeyHandler,true);
    root.document.body.appendChild(panel);liftOverlay=panel;
    if(capture===true)liftCaptureStart();
    if(typeof back.focus==='function')back.focus();
    liftTimer=root.setTimeout(function(){if(liftOverlay===panel&&d.stage==='opening')d.stage='iframe-timeout-unverified';},15000);
  }
  function showLiftPlayer(){
    if(!active()||selectedSourceValue()!=='liftw'||!currentLift.iframe)return;
    var select=root.Lampa&&root.Lampa.Select;
    if(!select||typeof select.show!=='function'){external(currentLift.pageUrl);return;}
    select.show({title:'Lift · '+currentLift.title,items:[
      {title:'Спробувати вебплеєр у Lampa (iframe)',action:'embed'},
      {title:'Спробувати перехоплення потоку (експеримент)',action:'capture'},
      {title:'Відкрити сторінку Lift у браузері',action:'page'}
    ],onSelect:function(choice){
      if(!choice)return;
      if(choice.action==='page')external(currentLift.pageUrl);
      else if(choice.action==='embed')root.setTimeout(function(){liftOpenIframe(false);},150);
      else if(choice.action==='capture')root.setTimeout(function(){liftOpenIframe(true);},150);
    }});
  }
  function attachLiftButton(view){
    var slot=view.querySelector('.ms-c-lift-slot');
    if(!active()||selectedSourceValue()!=='liftw'||playerOpen()||overlay||liftOverlay||
       !currentLift.id||!['info-complete','info-no-iframe','info-error'].includes(liftState.stage)){
      if(slot&&slot.parentNode)slot.parentNode.removeChild(slot);
      liftState.button=false;return;
    }
    var anchor=sourceRowAnchor(view);
    if(!slot){slot=root.document.createElement('div');slot.className='ms-c-lift-slot';
      slot.style.cssText='display:flex;flex-direction:column;gap:.2em;margin:0 0 .6em';}
    // The core may render no .ms-movie-panel when there is no direct HLS.
    // In that case append the actions to the detail viewport, not to the
    // previous source's results. liftGetStreams is the only place that arms it.
    if(anchor){if(slot.previousSibling!==anchor)anchor.parentNode.insertBefore(slot,anchor.nextSibling);}
    else if(slot.parentNode!==view)view.appendChild(slot);
    var playerRow=slot.querySelector('.ms-b101-c-lift-player');
    if(currentLift.iframe&&!playerRow){
      slot.appendChild(newSourceRow('c-lift-player','▶ Lift · вебплеєр',
        'Плеєр embed.liftw.ws · '+currentLift.title+' · перевірка на Android/webOS',showLiftPlayer));
    }else if(!currentLift.iframe&&playerRow&&playerRow.parentNode)playerRow.parentNode.removeChild(playerRow);
    var directRow=slot.querySelector('.ms-b101-c-lift-capture');
    if(capturedLiftMedia && capturedLiftMedia.id===currentLift.id && liftCapture.playable){
      if(!directRow){directRow=newSourceRow('c-lift-capture','▶ Lift · підтверджений маніфест ('+liftCapture.format+')',
        'Тривалість '+Math.round(liftCapture.durationSeconds/60)+' хв · тестовий запуск у Lampa.Player',liftPlayCaptured);
        slot.insertBefore(directRow,slot.firstChild);}
    }else if(directRow&&directRow.parentNode)directRow.parentNode.removeChild(directRow);
    if(!slot.querySelector('.ms-b101-c-lift-page')){
      slot.appendChild(newSourceRow('c-lift-page','⇨ Lift · сторінка фільму',
        'Відкрити оригінальну сторінку liftw.ws',function(){external(currentLift.pageUrl);}));
    }
    liftState.button=true;
  }
  function liftDiagnostic(){return {version:liftState.version,installed:liftState.installed,
    stage:liftState.stage,transport:liftState.transport,attempts:liftState.attempts,
    searchQueries:liftState.searchQueries,apiItems:liftState.apiItems,matches:liftState.matches,
    lastQuery:liftState.lastQuery,detailId:liftState.detailId,detailTitle:liftState.detailTitle,
    playerFound:liftState.playerFound,playerHost:liftState.playerHost,
    button:liftState.button,frame:liftState.frame,capture:liftCaptureDiagnostic(),error:liftState.error};}
  function installLift(api){
    api.registerSource({id:'liftw',name:'Lift',baseUrl:'https://liftw.ws',
      isDetail:function(url){return !!liftExtractId({url:url});},
      search:function(movie){return liftSearch(movie);},
      getStreams:function(item){return liftGetStreams(item);}});
    liftState.installed=true;
  }
  // The core replaces toolbar/source controls after a source switch. Lampa's
  // controller can remain on the Select popup, or keep a detached focus item.
  // Repair *after* the picker is closed, never while another modal/player owns
  // the remote. Do not add another Lampa controller or intercept remote keys.
  function selectedSourceValue(){
    try{return String(root.Lampa.Storage.get('ms_v1_source','')||'');}catch(_){return '';}
  }
  function pickerBlockReason(){
    // Lampa Select.init() permanently mounts .selectbox in <body>.
    // Presence of that DOM element is NOT evidence of an open picker.
    // Its actual open state is body.selectbox--open / Select.opened().
    try{
      var l=root.Lampa||{}, body=root.document&&root.document.body;
      if(body&&body.classList){
        if(body.classList.contains('selectbox--open'))return 'selectbox-open';
        if(body.classList.contains('settings--open'))return 'settings-open';
        if(body.classList.contains('search--open'))return 'search-open';
      }
      if(l.Select&&typeof l.Select.opened==='function'&&l.Select.opened())return 'select-api';
      if(l.Modal&&typeof l.Modal.opened==='function'&&l.Modal.opened())return 'modal-api';
      if(l.Controller&&typeof l.Controller.windowTop==='function'){
        var top=l.Controller.windowTop();
        sourceFocus.windowTop=top&&String(top.name||'overlay').slice(0,36)||'';
        if(top)return 'window-'+sourceFocus.windowTop;
      }else sourceFocus.windowTop='';
      return '';
    }catch(e){sourceFocus.error='picker-state: '+errmsg(e);return 'picker-check-error';}
  }
  function selectionOpen(){return !!pickerBlockReason();}
  function sourcePickerClosed(){
    if(!active()||playerOpen()||overlay||liftOverlay)return;
    if(!sourceFocusPending&&sourceFocus.stage==='timeout'&&sourceFocus.source===selectedSourceValue()){
      sourceFocusPending=true;sourceFocusAttempts=0;
      sourceFocus.stage='after-picker-close';sourceFocus.trigger='picker-close';
    }
    if(sourceFocusPending)waitForFocus(180);
  }
  function watchSourcePickerClose(){
    try{
      var listener=root.Lampa&&root.Lampa.Select&&root.Lampa.Select.listener;
      if(listener&&typeof listener.follow==='function'){
        listener.follow('hide',sourcePickerClosed);
        listener.follow('close',sourcePickerClosed);
      }
    }catch(e){sourceFocus.error='picker-listener: '+errmsg(e);}
  }
  function sourceSwitcher(toolbar){
    if(!toolbar)return null;
    var items=toolbar.querySelectorAll('.ms-toolbar-button');
    for(var i=0;i<items.length;i++){
      var t=String(items[i].textContent||'').replace(/\s+/g,' ').trim();
      if(/^(?:Джерело|Источник|Source)\b/i.test(t)||/^Джерело\s*[:：]/i.test(t))return items[i];
    }
    // Ukrainian word boundaries are not always recognized by JS \b.
    for(var j=0;j<items.length;j++)if(/^(?:Джерело|Источник|Source)/i.test(String(items[j].textContent||'').trim()))return items[j];
    return null;
  }
  function safeTargetAttached(node){
    try{return !!(node&&root.document&&root.document.documentElement&&
      root.document.documentElement.contains(node));}catch(_){return false;}
  }
  function sourceFocusAncestor(target,view){
    // For a toolbar target, the scroll viewport is a sibling, not an ancestor.
    // collectionFocus accepts DOM nodes and uses the scope only on fallback.
    return target&&target.parentNode||view;
  }
  function waitForFocus(ms){
    if(sourceFocusTimer)root.clearTimeout(sourceFocusTimer);
    sourceFocusTimer=root.setTimeout(function(){sourceFocusTimer=0;trySourceFocus();},ms||230);
  }
  function armSourceFocus(why){
    if(!active())return;
    sourceFocusPending=true;sourceFocusAttempts=0;
    sourceFocus.stage='pending';sourceFocus.trigger=why;
    sourceFocus.requests++;sourceFocus.source=selectedSourceValue();
    sourceFocusWatchUntil=Date.now()+4500;sourceFocusRepairs=0;
    waitForFocus(230);
  }
  function observeSourceSwitch(){
    var now=selectedSourceValue();
    if(lastObservedSource===null){lastObservedSource=now;sourceFocus.source=now;return;}
    if(now!==lastObservedSource){
      if(lastObservedSource==='liftw'&&now!=='liftw'){
        liftCaptureStop();liftClearMedia();liftSerial++;currentLift={id:0,title:'',pageUrl:'',iframe:'',stamp:0};
        liftState.button=false;
      }
      sourceFocus.previous=lastObservedSource;
      lastObservedSource=now;
      armSourceFocus('source-changed');
    }
  }
  function bindSourceSwitcher(toolbar){
    var switcher=sourceSwitcher(toolbar);
    if(!switcher||switcher._msSourceFocusBound)return;
    switcher._msSourceFocusBound=true;
    function mark(){armSourceFocus('source-picker-activated');}
    switcher.addEventListener('click',mark);
    switcher.addEventListener('keydown',function(e){if(e&&(e.key==='Enter'||e.key===' '))mark();});
    if(root.jQuery)root.jQuery(switcher).on('hover:enter',mark);
  }
  function trySourceFocus(){
    if(!sourceFocusPending)return false;
    if(sourceFocusAttempts>=SOURCE_FOCUS_MAX_ATTEMPTS || (sourceFocusWatchUntil && Date.now()>sourceFocusWatchUntil+1000)){
      sourceFocusPending=false;sourceFocus.stage='bounded-timeout';sourceFocus.blockReason='retry-budget-exhausted';return false;
    }
    if(!active()){
      sourceFocusPending=false;sourceFocus.stage='outside';return false;
    }
    sourceFocusAttempts++;sourceFocus.attempts++;
    var focusCtl=root.Lampa&&root.Lampa.Controller;
    try{var c=focusCtl&&focusCtl.enabled&&focusCtl.enabled();sourceFocus.controllerBefore=c&&c.name||'';}catch(_){}
    // Never close a real picker or player, but do not treat hidden Lampa
    // selectbox templates as open windows (the original FocusFix2 bug).
    var block=pickerBlockReason();
    if(!block&&playerOpen())block='player-open';
    if(!block&&overlay)block='uakino-overlay';
    if(!block&&liftOverlay)block='lift-overlay';
    if(!block){try{var wb=root.MultiSourceUAKinoBest1315d;
      if(wb&&wb.webDiagnostic&&wb.webDiagnostic().frameOpen)block='webframe-open';
    }catch(_){}}
    if(block){
      sourceFocus.blockReason=block;
      sourceFocus.blocked++;sourceFocus.stage='waiting-picker-or-player';
      if(sourceFocusAttempts<48)waitForFocus(350);
      else{sourceFocusPending=false;sourceFocus.stage='timeout';}
      return false;
    }
    sourceFocus.blockReason='';
    var toolbar=root.document.querySelector('.ms-toolbar');
    var view=root.document.querySelector('.ms-scroll-viewport');
    var target=sourceSwitcher(toolbar)||(view&&view.querySelector('.selector'));
    var ctl=root.Lampa&&root.Lampa.Controller;
    if(!target||!safeTargetAttached(target)||!view||!safeTargetAttached(view)||!ctl||typeof ctl.toggle!=='function'){
      sourceFocus.stage='waiting-controls';
      if(sourceFocusAttempts<30)waitForFocus(200);
      else{sourceFocusPending=false;sourceFocus.stage='timeout';}
      return false;
    }
    try{
      var enabled=ctl.enabled&&ctl.enabled();
      sourceFocus.controllerBefore=enabled&&enabled.name||'';
      if(/^(?:settings|keyboard|input|search)$/.test(sourceFocus.controllerBefore)){
        sourceFocus.stage='controller-busy';
        if(sourceFocusAttempts<40)waitForFocus(250);else sourceFocusPending=false;
        return false;
      }
      ctl.toggle('content');
      // toggle can re-render header; never focus the detached old element.
      toolbar=root.document.querySelector('.ms-toolbar');
      target=sourceSwitcher(toolbar)||(view&&view.querySelector('.selector'));
      if(!safeTargetAttached(target)){
        sourceFocus.stage='retry-after-redraw';waitForFocus(160);return false;
      }
      if(typeof ctl.collectionFocus==='function'){
        try{ctl.collectionFocus(target,sourceFocusAncestor(target,view));}
        catch(_){/* fallback to DOM focus */}
      }
      if(typeof target.focus==='function'){
        try{target.focus();}catch(_){}
      }
      enabled=ctl.enabled&&ctl.enabled();
      sourceFocus.controllerAfter=enabled&&enabled.name||'';
      sourceFocus.target=target.classList&&target.classList.contains('ms-toolbar-button')?'source-switcher':'content-item';
      if(sourceFocus.controllerAfter!=='content'){
        sourceFocus.stage='controller-not-content';
        if(sourceFocusAttempts<16)waitForFocus(250);
        else sourceFocusPending=false;
        return false;
      }
      sourceFocus.restores++;sourceFocus.stage='restored';sourceFocusPending=false;
      return true;
    }catch(e){
      sourceFocus.error=errmsg(e);sourceFocus.stage='exception';
      if(sourceFocusAttempts<12)waitForFocus(220);else sourceFocusPending=false;
      return false;
    }
  }
  function checkLostSourceFocus(){
    // Asynchronous result cards can replace focused nodes again *after* the
    // popup closes. Repair at most twice and only while DOM focus is detached.
    if(sourceFocusPending||Date.now()>sourceFocusWatchUntil||sourceFocusRepairs>=2||
      !active()||selectionOpen()||playerOpen()||overlay||liftOverlay)return;
    var f=root.document.activeElement;
    var toolbar=root.document.querySelector('.ms-toolbar');
    var view=root.document.querySelector('.ms-scroll-viewport');
    var valid=!!(safeTargetAttached(f)&&f!==root.document.body&&
      ((toolbar&&toolbar.contains(f))||(view&&view.contains(f))));
    if(valid)return;
    var current=toolbar&&toolbar.querySelector('.selector.focus')||view&&view.querySelector('.selector.focus');
    if(safeTargetAttached(current))return;
    sourceFocusRepairs++;sourceFocus.repairs++;
    sourceFocusPending=true;sourceFocusAttempts=0;
    sourceFocus.stage='rerender-repair';sourceFocus.trigger='focus-node-detached';
    waitForFocus(180);
  }
  // Keep the original b.8 Back and Diagnostics modules untouched. Their actual
  // actions are exposed by MultiSourceBack1315b.back() and
  // MultiSourceDiagnostics1315b.open(). The core owns the .ms-toolbar header,
  // while b.8 adds old controls to .ms-scroll-viewport: create header proxies,
  // and make the old controls non-focusable only after both proxies are ready.
  var uiStylesInstalled=false;
  var lastUiAction={back:0,diagnostics:0};
  function compactStyles(){
    if(uiStylesInstalled)return;
    if(!root.document || !root.document.createElement)return;
    var css=root.document.createElement('style');
    css.id='ms-b10-ui-style';
    css.textContent=
      '.ms-toolbar .ms-b10-ui-back,.ms-toolbar .ms-b10-ui-diag{'+
        'display:inline-flex;align-items:center;justify-content:center;'+
        'padding:.38em .65em;font-size:.86em;line-height:1.2;min-height:2.2em;'+
        'box-sizing:border-box;max-width:100%;white-space:nowrap;'+
        'border:1px solid rgba(255,255,255,.22);border-radius:.4em;'+
        'margin:0;cursor:pointer}'+
      '.ms-toolbar .ms-b10-ui-back{border-left:3px solid #65a8ef}'+
      '.ms-scroll-viewport.ms-b10-ui-relocated .ms-1315b-back,'+
      '.ms-scroll-viewport.ms-b10-ui-relocated .ms-1315b-diag{display:none!important}'+
      '@media(max-width:700px){.ms-toolbar .ms-b10-ui-back,'+
        '.ms-toolbar .ms-b10-ui-diag{padding:.35em .5em;font-size:.8em;min-height:2em}}';
    (root.document.head||root.document.documentElement).appendChild(css);
    uiStylesInstalled=true;
  }
  function uiAction(which){
    var now=Date.now();
    if(now-lastUiAction[which]<350)return;
    lastUiAction[which]=now;
    if(which==='back'){
      if(root.MultiSourceBack1315b && typeof root.MultiSourceBack1315b.back==='function')
        root.MultiSourceBack1315b.back();
    }else if(root.MultiSourceDiagnostics1315b && typeof root.MultiSourceDiagnostics1315b.open==='function')
      root.MultiSourceDiagnostics1315b.open();
  }
  function newUiButton(kind,caption){
    var b=root.document.createElement('div');
    b.className='ms-toolbar-button selector ms-b10-ui-'+kind;
    b.setAttribute('role','button');
    b.setAttribute('aria-label',kind==='back'?'Назад':'Діагностика джерел');
    b.tabIndex=0;
    b.textContent=caption;
    var cb=function(e){if(e){e.preventDefault();e.stopPropagation();}uiAction(kind==='back'?'back':'diagnostics');};
    b.addEventListener('click',cb);
    b.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){cb(e);}});
    if(root.jQuery)root.jQuery(b).on('hover:enter',cb);
    return b;
  }
  function legacyUi(view,hide){
    var count=0,all=view.querySelectorAll('.ms-1315b-back,.ms-1315b-diag');
    for(var i=0;i<all.length;i++){
      var el=all[i];count++;
      // Remove selector, not the original node. The b.8 MutationObserver still
      // finds it by class and won't create a duplicate in the scrolling list.
      if(hide){
        if(el.classList.contains('selector'))el.classList.remove('selector');
        el.tabIndex=-1;
        el.setAttribute('aria-hidden','true');
      }else if(el.getAttribute('aria-hidden')==='true'){
        el.classList.add('selector');el.tabIndex=0;el.removeAttribute('aria-hidden');
      }
    }
    if(hide)view.classList.add('ms-b10-ui-relocated');
    else view.classList.remove('ms-b10-ui-relocated');
    return count;
  }
  function layoutToolbar(){
    if(!active())return false;
    var view=root.document.querySelector('.ms-scroll-viewport');
    if(!view || !root.document.documentElement.contains(view))return false;
    var toolbar=root.document.querySelector('.ms-toolbar');
    var settings=null;
    if(toolbar){
      var buttons=toolbar.querySelectorAll('.ms-toolbar-button');
      for(var i=0;i<buttons.length;i++){
        if(/Налаштування/.test(String(buttons[i].textContent||''))){settings=buttons[i];break;}
      }
    }
    // Do not hide the old UI if the toolbar is not mounted or still rebuilding.
    if(!toolbar || !settings || !root.MultiSourceBack1315b || !root.MultiSourceDiagnostics1315b){
      legacyUi(view,false);state.ui.status='waiting-toolbar';return false;
    }
    compactStyles();
    bindSourceSwitcher(toolbar);
    var changed=false;
    var back=toolbar.querySelector('.ms-b10-ui-back');
    if(!back){back=newUiButton('back','‹ Назад');changed=true;}
    if(toolbar.firstChild!==back){toolbar.insertBefore(back,toolbar.firstChild);changed=true;}
    var diag=toolbar.querySelector('.ms-b10-ui-diag');
    if(!diag){diag=newUiButton('diag','Діагностика джерел');changed=true;}
    if(settings.nextSibling!==diag){toolbar.insertBefore(diag,settings.nextSibling);changed=true;}
    // Both proxies exist before the old scrolling-list buttons are suppressed.
    var wasRelocated=view.classList.contains('ms-b10-ui-relocated');
    state.ui.hiddenLegacy=legacyUi(view,true);
    state.ui.status='ready';state.ui.backPosition='toolbar-first';
    state.ui.diagnosticsPosition='after-settings';
    if(!wasRelocated)changed=true;
    if(changed && !playerOpen() && !overlay && !liftOverlay && !selectionOpen() && !sourceFocusPending){
      try{
        var enabled=root.Lampa.Controller && root.Lampa.Controller.enabled && root.Lampa.Controller.enabled();
        if((!enabled || enabled.name!=='select') && root.Lampa.Controller && root.Lampa.Controller.toggle)
          root.Lampa.Controller.toggle('content');
      }catch(_){}
    }
    return true;
  }
  function scheduleButton(){if(selectorTimer)root.clearTimeout(selectorTimer);selectorTimer=root.setTimeout(attachButton,220);}
  function playAlternateMedia(){
    var entry=currentUa.media[0];
    if(!entry || !mediaAddress(entry.url))return notify('Підтвердженого прямого посилання немає');
    if(!root.Lampa||!root.Lampa.Player||typeof root.Lampa.Player.play!=='function')
      return notify('Lampa.Player недоступний');
    var movie=null;
    try{var activity=root.Lampa.Activity.active();movie=activity&&(activity.movie||activity.object&&activity.object.movie)||null;}catch(_){}
    // Do not persist player tokens or reuse potentially expired media URLs.
    var item={url:entry.url,title:currentUa.title+' · UAKino альтернативний',isonline:true};
    if(movie)item.card=movie;
    item.playlist=[{url:entry.url,title:item.title,isonline:true}];
    try{
      root.Lampa.Player.play(item);
      if(root.Lampa.Player.playlist)root.Lampa.Player.playlist(item.playlist);
    }catch(err){notify('Не вдалося відкрити альтернативний потік: '+errmsg(err));}
  }
  function newSourceRow(kind,title,note,callback){
    var el=root.document.createElement('div');
    el.className='ms-row ms-action selector ms-b101-'+kind;
    el.tabIndex=0;el.setAttribute('role','button');
    var h=root.document.createElement('div');h.className='ms-row-title';h.textContent=title;el.appendChild(h);
    var sub=root.document.createElement('div');sub.className='ms-row-info';sub.textContent=note;el.appendChild(sub);
    var last=0;
    function trigger(e){
      if(e&&e.type==='keydown'&&e.key!=='Enter'&&e.key!==' ')return;
      if(e&&e.preventDefault)e.preventDefault();
      if(e&&e.stopPropagation)e.stopPropagation();
      if(Date.now()-last<320)return;last=Date.now();callback();
    }
    el.addEventListener('click',trigger);el.addEventListener('keydown',trigger);
    if(root.jQuery)root.jQuery(el).on('hover:enter',trigger);
    return el;
  }
  function sourceRowAnchor(view){
    var panel=view.querySelector('.ms-movie-panel');
    if(panel)return panel;
    // No film card for stream-less cases: use the film title section rather
    // than leaving the Web players link above the filters or search results.
    if(view.querySelector('.ms-result-card'))return null;
    var sections=view.querySelectorAll('.ms-row.ms-section');
    if(sections&&sections.length)return sections[sections.length-1];
    return null;
  }
  function attachButton(){
    observeSourceSwitch();
    layoutToolbar();
    var view=root.document.querySelector('.ms-scroll-viewport');
    if(!view)return;
    attachLiftButton(view);
    var old=view.querySelector('.ms-b10-uakino-player');
    if(old&&old.parentNode)old.parentNode.removeChild(old);
    var slot=view.querySelector('.ms-b101-uakino-slot');
    if(!active()||!uaSelected()||playerOpen()||overlay||!currentUa.pageUrl){
      if(slot&&slot.parentNode)slot.parentNode.removeChild(slot);
      state.uakinocx.button=false;
      checkLostSourceFocus();
      return;
    }
    var anchor=sourceRowAnchor(view);
    if(!anchor){if(slot&&slot.parentNode)slot.parentNode.removeChild(slot);checkLostSourceFocus();return;}
    var needsFocus=false;
    if(!slot){
      slot=root.document.createElement('div');slot.className='ms-b101-uakino-slot';
      slot.style.cssText='display:flex;flex-direction:column;gap:.15em;margin:0 0 .6em 0';
      needsFocus=true;
    }
    if(slot.previousSibling!==anchor){
      anchor.parentNode.insertBefore(slot,anchor.nextSibling);
      needsFocus=true;
    }
    var direct=slot.querySelector('.ms-b101-uakino-direct');
    if(currentUa.media.length){
      if(!direct){
        var md=currentUa.media[0];
        direct=newSourceRow('uakino-direct','▶ UAKino.cx · альтернативний потік ('+md.format+')',
          'Публічна конфігурація '+md.host+' · відтворення перевіряється у Lampa',playAlternateMedia);
        slot.insertBefore(direct,slot.firstChild);
        needsFocus=true;
      }
    }else if(direct&&direct.parentNode){direct.parentNode.removeChild(direct);needsFocus=true;}
    var page=slot.querySelector('.ms-b101-uakino-page');
    if(!page){
      page=newSourceRow('uakino-page','⇨ UAKino.cx — сторінка з вебплеєрами',
        'Основний та альтернативний iframe · відкрити меню',showPlayers);
      slot.appendChild(page);needsFocus=true;
    }
    state.uakinocx.button=true;
    checkLostSourceFocus();
    if(needsFocus){
      try{if(!sourceFocusPending&&!selectionOpen()&&root.Lampa.Controller&&root.Lampa.Controller.enabled&&root.Lampa.Controller.toggle){
        var stateController=root.Lampa.Controller.enabled();
        if(!stateController||stateController.name==='content')root.Lampa.Controller.toggle('content');
      }}catch(_){}
    }
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
        copy.search._msB10=true;
      } else {
        var originalGet=src.getStreams;
        copy.getStreams=function(item,a){return uaGetStreams(item,a,originalGet,src);};
        copy.getStreams._msB10=true;
      }
      api.registerSource(copy);
    });
    // 1.3.15d: Lift paused. No registration, iframe hook or capture UI.
    // installLift(api);
    watchSourcePickerClose();
    state.source='registered';state.installed=true;
    lastObservedSource=selectedSourceValue();sourceFocus.source=lastObservedSource;
    // Preserve b.8's original Copy JSON report, adding b.10 counters through
    // the diagnostic objects that b.8 already serializes. Never include links.
    if(root.MultiSourceLavakinoMatch && root.MultiSourceLavakinoMatch.diagnostic &&
       !root.MultiSourceLavakinoMatch.diagnostic._msB10){
      var oldLavDiag=root.MultiSourceLavakinoMatch.diagnostic;
      root.MultiSourceLavakinoMatch.diagnostic=function(){var d=oldLavDiag();d.patchB9=state.lavakino;d.patchB10={preservedLavakinoSearch:true};return d;};
      root.MultiSourceLavakinoMatch.diagnostic._msB10=true;
    }
    if(root.MultiSourceSources1315b && root.MultiSourceSources1315b.diagnostic &&
       !root.MultiSourceSources1315b.diagnostic._msB10){
      var oldUaDiag=root.MultiSourceSources1315b.diagnostic;
      root.MultiSourceSources1315b.diagnostic=function(){
        var d=oldUaDiag(), ev=d.lastDetailEvidence||{};
        ev.patchB10={version:state.version,status:state.uakinocx.stage,detectedPlayers:state.uakinocx.discoveredPlayers,
          playerHosts:state.uakinocx.playerHosts,playerInfo:state.uakinocx.playerInfo,
          discardedAds:state.uakinocx.discardedAds,scriptCandidates:state.uakinocx.scriptCandidates,
          originalEmbeds:state.uakinocx.originalEmbeds,alternativeMarker:state.uakinocx.hasAlternativeMarker,
          button:state.uakinocx.button,altProbe:state.uakinocx.altProbe,frame:state.uakinocx.frame,ui:state.ui,lift:liftDiagnostic(),error:state.uakinocx.error};
        d.lastDetailEvidence=ev;return d;
      };
      root.MultiSourceSources1315b.diagnostic._msB10=true;
    }
    if(root.MultiSourceDiagnostics1315b && root.MultiSourceDiagnostics1315b.report){
      var prev=root.MultiSourceDiagnostics1315b.report;
      if(!prev._msB10){
        root.MultiSourceDiagnostics1315b.report=function(){var old=prev();old.patchB10=diagnostic();old.patchC=liftDiagnostic();return old;};
        root.MultiSourceDiagnostics1315b.report._msB10=true;
        // Existing b.8 textReport closes over the old getReport; its built-in
        // 'Copy JSON' may still omit patchB10. Standalone diagnostic remains available.
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
    uakinocx:state.uakinocx,ui:state.ui,lift:liftDiagnostic()};}
  root.MultiSourceLift1315c={diagnostic:liftDiagnostic,openPlayer:showLiftPlayer,
    capture:{diagnostic:liftCaptureDiagnostic,stop:liftCaptureStop},_test:{liftRank:liftRank,liftTypeMatches:liftTypeMatches,liftExtractId:liftExtractId,liftPlayerUrl:liftPlayerUrl,liftJsonBody:liftJsonBody,liftSearch:liftSearch,liftGetStreams:liftGetStreams,attachLiftButton:attachLiftButton,
      liftAssessManifest:liftAssessManifest,liftManifestDuration:liftManifestDuration,
      liftObserveManifest:liftObserveManifest,liftCaptureStart:liftCaptureStart,liftCaptureStop:liftCaptureStop,liftClearMedia:liftClearMedia}};
  root.MultiSourcePatch1315b10={diagnostic:diagnostic,install:install,showUakinoPlayers:showPlayers,
    _test:{norm:norm,pure:pure,titleMatch:titleMatch,target:target,identity:identity,
      searchCards:searchCards,extractPlayers:collectPlayers,playerUrl:playerUrl,adContainer:adContainer,inferTabs:inferTabs,layoutToolbar:layoutToolbar,mediaAddress:mediaAddress,extractPublishedMedia:extractPublishedMedia,recognizedAlternativeHost:recognizedAlternativeHost,sourceRowAnchor:sourceRowAnchor,attachButton:attachButton,
      sourceSwitcher:sourceSwitcher,observeSourceSwitch:observeSourceSwitch,trySourceFocus:trySourceFocus,
      selectionOpen:selectionOpen,armSourceFocus:armSourceFocus,checkLostSourceFocus:checkLostSourceFocus, liftDiagnostic:liftDiagnostic}};
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

/* MultiSource 1.3.15c.10 RECOVERY & PLAYBACK TRACE (test addon)
 * Reverses c.9 DOM relocation and conservatively restyles existing Lampa nodes.
 * No sources, original player handlers, network endpoints or DRM are changed.
 * Opt-in trace wraps calls transparently and never stores full streaming URLs.
 * Install AFTER the existing MultiSource script; never in addition to multiple cores.
 */
(function (root) {
 'use strict';
 if (root.MultiSourceRecovery1315c10) return;
 var doc = root.document;
 if (!doc) return;
 var VERSION = '1.3.15c.10-recovery-playback-trace-test';
 var STYLE_ID = 'ms-c10-safe-css';
 var state = {version: VERSION, installed: true, stage:'waiting', active:false,
   themeDisabled:[], errors:[], source:'', toolbar:false, viewport:false,
   lastFocus:'', lastAction:'', lastActionTime:0, safeStyles:false,referenceButtonEnabled:false,referenceOpened:0,referenceError:'',
   traceEnabled:false, hooks:[], events:[], requests:[], player:[], core:null};
 var initialized=false, dead=false, timer=0, observer=null, wrappers=[], listeners=[], referenceButton=null;
 var SAFE_CSS =
  'body.ms-c10-safe .ms-toolbar{display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:.35em!important;float:none!important;max-width:100%!important;position:relative!important;transform:none!important;z-index:auto!important}' +
  'body.ms-c10-safe .ms-toolbar .ms-toolbar-button{border-radius:2em!important;margin:0 .5em .5em 0!important;padding:.6em 1.2em!important;min-height:0!important;height:auto!important;position:relative!important;float:none!important;transform:none;background:rgba(255,255,255,.13)!important;color:#fff!important;max-width:100%;box-sizing:border-box}' +
  'body.ms-c10-safe .ms-toolbar .ms-toolbar-button.focus{background:#fff!important;color:#0b0d11!important;box-shadow:0 0 0 .15em #fff!important}' +
  'body.ms-c10-safe .ms-scroll-viewport{position:relative!important;max-width:100%!important;overflow-y:auto!important;transform:none!important;float:none!important;box-sizing:border-box!important}' +
  'body.ms-c10-safe .ms-scroll-viewport .ms-result-card,body.ms-c10-safe .ms-scroll-viewport .ms-row.ms-action{box-sizing:border-box!important;overflow:visible!important;position:relative!important;z-index:auto!important;max-width:100%!important;border-radius:.8em!important}' +
  'body.ms-c10-safe .ms-scroll-viewport .ms-result-card.focus,body.ms-c10-safe .ms-scroll-viewport .ms-row.ms-action.focus{outline:.22em solid #fff!important;outline-offset:.1em!important;z-index:2!important}' +
  'body.ms-c10-safe .ms-scroll-viewport .ms-result-card img{object-fit:cover;border-radius:.45em}' +
  'body.ms-c10-safe .ms-scroll-viewport .ms-row-title{font-weight:600}' +
  'body.ms-c10-safe .ms-scroll-viewport .ms-row-info{color:rgba(255,255,255,.65)}';
 function push(arr, item, limit){arr.push(item);if(arr.length>(limit||40))arr.splice(0,arr.length-(limit||40));}
 function errorText(e){var a=e||{},s='';if(typeof a==='string')s=a;else s=String(a.message||a.statusText||a.error||a.responseText||'');
   return s.replace(/https?:\/\/[^\s\"'<>]+/g,'[url]').replace(/\s+/g,' ').slice(0,150);}
 function activity(){try{var a=root.Lampa&&root.Lampa.Activity&&root.Lampa.Activity.active&&root.Lampa.Activity.active();return a&& (a.component||a.object&&a.object.component)||'';}catch(e){return '';}}
 function source(){try{return String(root.Lampa.Storage.get('ms_v1_source','')||'');}catch(e){return '';}}
 function active(){return activity()==='multi_source_online_v1';}
 function nameHost(url){try{var u=new URL(String(url||''), 'https://cf.lampa.mx');
    if(u.pathname==='/fetch'&&u.searchParams){var nested=u.searchParams.get('url');if(nested)return new URL(nested).hostname+' (via '+u.hostname+')';}
    return u.hostname||'';}catch(e){var m=String(url||'').match(/^https?:\/\/([^/?#]+)/i);return m?m[1]:'';}}
 function preview(s){return String(s||'').replace(/\s+/g,' ').trim().slice(0,85);}
 function disableOld(){var arr=[
   'MultiSourceUAKinoExact1315c9',
   'MultiSourceUAKinoLayout1315c4','MultiSourceUAKinoLayout1315c5','MultiSourceUAKinoLayout1315c6',
   'MultiSourceUAKinoLayout1315c7','MultiSourceUAKinoLayout1315c8'];
   for(var i=0;i<arr.length;i++){var key=arr[i];if(state.themeDisabled.indexOf(key)>=0)continue;
     var ui=root[key];if(ui&&typeof ui.disable==='function'){
       try{ui.disable();state.themeDisabled.push(key);}catch(e){push(state.errors,key+': '+errorText(e),10);}
     }
   }
 }
 function style(){if(doc.getElementById&&doc.getElementById(STYLE_ID))return;
   var s=doc.createElement('style');s.id=STYLE_ID;s.textContent=SAFE_CSS;
   (doc.head||doc.documentElement).appendChild(s);
 }
 function getMovie(){try{var a=root.Lampa&&root.Lampa.Activity&&root.Lampa.Activity.active&&root.Lampa.Activity.active()||{};
    return a.movie||a.object&&a.object.movie||a.params&&a.params.movie||null;}catch(e){return null;}}
 function canOpenReference(){return !!(root.uakino_torrents_plugin&&root.Lampa&&root.Lampa.Activity&&typeof root.Lampa.Activity.push==='function');}
 function openReference(){
   if(!canOpenReference()){state.referenceError='UAKino plugin не підключений';return false;}
   var movie=getMovie();
   if(!movie||!movie.id&&!movie.title&&!movie.name){state.referenceError='Немає TMDB-даних поточної картки';return false;}
   try{
     root.Lampa.Activity.push({url:'',title:'UAKino',component:'uakino_online',movie:movie,page:1});
     state.referenceError='';state.referenceOpened++;return true;
   }catch(e){state.referenceError=errorText(e);return false;}
 }
 function removeReference(){if(referenceButton){
   try{if(root.jQuery)root.jQuery(referenceButton).off('.msC10Recovery');}catch(e){}
   if(referenceButton.parentNode)referenceButton.parentNode.removeChild(referenceButton);
   referenceButton=null;
 }}
 function updateReference(){
   if(!state.referenceButtonEnabled||!active()||!canOpenReference()){removeReference();return;}
   var bar=doc.querySelector('.ms-toolbar');
   if(!bar){removeReference();return;}
   if(referenceButton&&referenceButton.parentNode===bar)return;
   removeReference();
   var item=doc.createElement('div');item.className='ms-toolbar-button selector ms-c10-reference-btn';
   item.textContent='▶ UAKino (еталон)';
   if(item.setAttribute)item.setAttribute('data-ms-c10-reference','1');
   var invoke=function(e){if(e&&e.preventDefault)e.preventDefault();openReference();};
   if(item.addEventListener)item.addEventListener('click',invoke);
   if(root.jQuery)root.jQuery(item).on('hover:enter.msC10Recovery',invoke);
   bar.appendChild(item);referenceButton=item;
 }
 function refresh(){if(dead)return;disableOld();style();
   state.active=active();state.source=source();
   var bar=doc.querySelector?doc.querySelector('.ms-toolbar'):null,view=doc.querySelector?doc.querySelector('.ms-scroll-viewport'):null;
   state.toolbar=!!bar;state.viewport=!!view;updateReference();
   if(doc.body&&doc.body.classList&&typeof doc.body.classList.toggle==='function')doc.body.classList.toggle('ms-c10-safe',state.active&&state.safeStyles);
   state.stage=!state.active?'inactive':bar&&view?'ready':'waiting-dom';
 }
 function schedule(){if(dead||timer)return;timer=root.setTimeout(function(){timer=0;try{refresh();}catch(e){push(state.errors,'refresh: '+errorText(e),10);}},150);}
 function hookedEvent(type,e){if(!state.traceEnabled||!active())return;
   var node=e.target;if(!node||!node.closest)return;
   var target=node.closest('.ms-result-card,.ms-row.ms-action,.ms-toolbar-button');if(!target)return;
   var label=preview(target.textContent);
   state.lastAction=label;state.lastActionTime=Date.now();
   push(state.events,{kind:type,source:source(),target:target.className?String(target.className).slice(0,90):'',label:label},32);
 }
 function rememberWrap(obj,key,wrapper){var old=obj&&obj[key];if(typeof old!=='function')return false;
   var replacement=wrapper(old);
   try{obj[key]=replacement;if(obj[key]!==replacement)return false;}catch(e){return false;}
   wrappers.push({obj:obj,key:key,old:old,wrapped:replacement});return true;
 }
 function tracePlayer(method){var player=root.Lampa&&root.Lampa.Player;if(!player)return;
   if(rememberWrap(player,method,function(old){return function(){
     if(active()||Date.now()-state.lastActionTime<30000){
       var first=arguments[0],url=typeof first==='string'?first:first&&typeof first==='object'?(first.url||first.file||first.src||''):'';
       push(state.player,{method:method,source:source(),host:nameHost(url),hasUrl:!!url,items:method==='playlist'&&first&&first.length||0},32);
     }
     return old.apply(this,arguments);
   };}))state.hooks.push('Player.'+method);
 }
 function traceNetwork(method){var klass=root.Lampa&&root.Lampa.Reguest;if(!klass||!klass.prototype)return;
   var proto=klass.prototype;
   if(rememberWrap(proto,method,function(old){return function(){
     if(!active())return old.apply(this,arguments);
     var args=Array.prototype.slice.call(arguments),t=Date.now(),url=args[0],host=nameHost(url),entry={via:method,host:host,source:source(),status:null,ok:null,ms:0,error:''};
     var ok=args[1],fail=args[2];
     if(typeof ok==='function')args[1]=function(){entry.ok=true;entry.ms=Date.now()-t;push(state.requests,entry,32);return ok.apply(this,arguments);};
     if(typeof fail==='function')args[2]=function(e){entry.ok=false;entry.ms=Date.now()-t;entry.status=e&&e.status||null;entry.error=errorText(e);push(state.requests,entry,32);return fail.apply(this,arguments);};
     try{return old.apply(this,args);}catch(e){entry.ok=false;entry.ms=Date.now()-t;entry.error=errorText(e);push(state.requests,entry,32);throw e;}
   };}))state.hooks.push('Reguest.'+method);
 }
 function startTrace(){if(state.traceEnabled)return;
   state.traceEnabled=true;state.hooks=[];state.events=[];state.requests=[];state.player=[];
   var events=['click','hover:enter'];for(var i=0;i<events.length;i++){
     (function(type){var fn=function(e){hookedEvent(type,e);};doc.addEventListener(type,fn,true);listeners.push({type:type,fn:fn});})(events[i]);
   }
   try{if(root.jQuery)root.jQuery(doc).on('hover:enter.msC10Trace','.ms-result-card,.ms-row.ms-action,.ms-toolbar-button',function(e){hookedEvent('hover:enter',e);});}catch(e){push(state.errors,'jquery-trace: '+errorText(e),10);}
   ['play','playlist','open','start'].forEach(tracePlayer);
   ['native','silent'].forEach(traceNetwork);
 }
 function stopTrace(){state.traceEnabled=false;
   try{if(root.jQuery)root.jQuery(doc).off('.msC10Trace');}catch(e){}
   while(wrappers.length){var w=wrappers.pop();if(w.obj[w.key]===w.wrapped)try{w.obj[w.key]=w.old;}catch(e){}}
   while(listeners.length){var l=listeners.pop();doc.removeEventListener(l.type,l.fn,true);}
 }
 function coreBrief(){try{var d=root.MultiSourceDiagnostics1315b&&root.MultiSourceDiagnostics1315b.report&&root.MultiSourceDiagnostics1315b.report();
   if(!d)return null;
   return {version:d.version,platform:d.platform,selectedSource:d.selectedSource,controller:d.controller,
     stage:d.lastSource&&d.lastSource.stage,host:d.lastSource&&d.lastSource.host,
     error:errorText(d.lastSource&&d.lastSource.error),attempts:d.attempts&&d.attempts.length||0,
     bridge:d.transport&&d.transport.androidBridge};
   }catch(e){return {error:errorText(e)};}}
 function diagnostic(){var copy={};for(var p in state)if(Object.prototype.hasOwnProperty.call(state,p))copy[p]=Array.isArray(state[p])?state[p].slice():state[p];
   copy.core=coreBrief();copy.c9UiPresent=!!root.MultiSourceUAKinoExact1315c9;
   copy.c9UiEnabled=(function(){try{var x=root.MultiSourceUAKinoExact1315c9;return x&&x.diagnostic&&x.diagnostic().enabled;}catch(e){return null;}})();
   copy.referenceAvailable=canOpenReference();copy.referenceButton=!!referenceButton;copy.shells=doc.querySelectorAll?doc.querySelectorAll('#ms-uakino-exact-root').length:0;
   copy.transportTraceSupported=state.hooks.some(function(s){return s.indexOf('Reguest.')===0;});
   return copy;
 }
 function disable(){dead=true;removeReference();stopTrace();if(observer)observer.disconnect();if(timer){root.clearTimeout(timer);timer=0;}
   if(doc.body&&doc.body.classList)doc.body.classList.remove('ms-c10-safe');
   var s=doc.getElementById&&doc.getElementById(STYLE_ID);if(s&&s.parentNode)s.parentNode.removeChild(s);
   state.stage='disabled';state.active=false;}
 function start(){if(initialized)return;initialized=true;refresh();
   if(root.MutationObserver&&doc.body){observer=new root.MutationObserver(schedule);observer.observe(doc.body,{childList:true,subtree:true});}
   try{if(root.Lampa&&root.Lampa.Listener&&root.Lampa.Listener.follow)root.Lampa.Listener.follow('activity',schedule);}catch(e){}
 }
 root.MultiSourceRecovery1315c10={
   diagnostic:diagnostic,
   startTrace:startTrace,stopTrace:stopTrace,
   disable: disable,
   setSafeStyles:function(enabled){state.safeStyles=!!enabled;refresh();},
   setReferenceButton:function(enabled){state.referenceButtonEnabled=!!enabled;refresh();},
   openReference:openReference,
   refresh:refresh
 };
 if(doc.body)start();else if(doc.addEventListener)doc.addEventListener('DOMContentLoaded',start);
})(window);


/* MultiSource d.13.1 - source transport + verified matching + publicly exposed media configs.
 * Requires existing b.8 core. HTML Worker is OPTIONAL but required on most browsers.
 * No ad-player iframe, credentials/DRM bypass, arbitrary proxy, or media relay.
 */
(function(root){
 'use strict';
 if(root.MultiSourceD13 && root.MultiSourceD13.installed)return;
 var VERSION='1.3.15d.13.9',WORKER_VERSION='1.3.15d.13',PAUSED='uakinobest';
 var specs={
  klonua:{id:'klonua',name:'KlonUA.com',origin:'https://klonua.com',detail:/^\/(?:filmy|serialy|multfilmy|multserialy)\/\d{1,9}-[\w-]+\.html$/i},
  kinotron:{id:'kinotron',name:'Kinotron.tv',origin:'https://kinotron.tv',detail:/^\/\d{2,9}-[\w-]+\.html$/i},
  uafix:{id:'uafix',name:'UAFix.net',origin:'https://uafix.net',detail:/^\/(?:films?|serials?|multfilmy|anime|doramy)\/[\w-]+\/$/i}
 };
 var state={version:VERSION,installed:false,stage:'waiting-core',paused:{id:PAUSED,name:'UAKino.best (не працює)',networkRequests:0},
  sources:{},worker:{configured:false,version:'',compatible:false,checks:0,lastStatus:0,lastError:'',networkRequests:0},
  moviePoster:{installed:false,applied:0,skippedTv:0,noPoster:0,lastStatus:'idle'},
  streamCards:{enabled:true,source:'uafix',ready:0,rendered:0,launches:0,lastStatus:'idle',lastFormat:'',lastError:''},
  playbackTrace:{provider:'',mediaHost:'',format:'',phase:'idle',playerInvoked:false,playerCalls:0,observability:'not-observed',mediaLoaded:false,playing:false,timeProgressed:false,waiting:0,stalled:0,videoErrorCode:0,videoErrorName:'',lastError:'',events:[],manifestProbe:{stage:'idle',transport:'',httpStatus:0,manifestType:'',bytes:0,variants:0,segments:0,encrypted:false,protectionHint:false,lastError:''}},
  mediaPolicy:'direct-public-urls-only; no browser iframe, media relay or access-control bypass',
  reference:{url:'https://uakino.ofreshofresh.workers.dev/uakino.js',exactCodeRead:false},lastError:''};
 var networkMemo={},watch=null,drawTimer=0,installTimer=0,installAttempts=0,healthPromise=null;
 var cardChoice=null,cardDrawTimer=0,cardLaunchAt=0;
 Object.keys(specs).forEach(function(id){state.sources[id]={id:id,stage:'idle',requests:0,successes:0,failures:0,transport:'',
  searchPages:0,searchCards:0,candidates:0,verified:0,detailRequests:0,streams:0,embeds:0,lastHttpStatus:0,
  lastFailureStatus:0,lastSuccessfulTransport:'',lastError:'',lastTitle:'',attempts:[],mediaHosts:[],resolverRequests:0,playerDetection:{stage:'idle',playerType:'',iframeCount:0,totalIframes:0,trailerIframes:0,playerTabs:0,videoBoxes:0,embeddedConfigs:0,pagePath:'',pageH1:'',htmlLength:0,accepted:0,playerHosts:[],blockedHosts:[],resolverAttempts:0,htmlResponses:0,configFound:false,mediaCandidates:0,authHint:false,lastError:''},reason:''};});
 function clean(s){return String(s==null?'':s).replace(/\s+/g,' ').trim();}
 function scrub(s){return clean(s).replace(/https?:\/\/[^\s"'<>]+/gi,'[URL]').replace(/(?:token|sig|auth|key|expires)\s*[=:]\s*[^\s,;]+/gi,'[REDACTED]').slice(0,150);}
 function year(s){var m=/(?:19|20)\d{2}/.exec(String(s||''));return m?m[0]:'';}
 function norm(s){return clean(s).toLowerCase().replace(/&(?:amp|nbsp);/g,' ')
  .replace(/^(?:фільм|серіал|film|movie)\s+/i,'').replace(/[«»“”"'’]/g,'')
  .replace(/\b(?:19|20)\d{2}\b/g,' ').replace(/(?:^|\s)(?:дивитись|дивитися|смотреть|watch|онлайн|українською|онлайн)(?=\s|$).*$/i,'')
  .replace(/[^a-z0-9а-яіїєґё]+/gi,' ').replace(/\s+/g,' ').trim();}
 function nameList(movie){var vals=[movie&&movie.title,movie&&movie.name,movie&&movie.original_title,movie&&movie.original_name];
  var out=[],seen={};vals.forEach(function(v){if(!v)return;String(v).split(/\s+[\/|]\s+/).forEach(function(x){var n=norm(x);if(n&&!seen[n]){seen[n]=1;out.push(n);}});});return out;}
 function scoreTitle(title,movie,actualYear,original){var titles=nameList(movie),variants=String(title||'').split(/\s+(?:\/|\||—|–)\s+/),
  exact=variants.some(function(v){return titles.indexOf(norm(v))>=0;}),
  originMatch=!!(original&&titles.indexOf(norm(original))>=0),y=Number(year(movie&&(movie.release_date||movie.first_air_date||movie.year))), a=Number(year(actualYear));
  if(!exact&&!originMatch)return 0;
  if(y&&a&&Math.abs(y-a)>1)return 0;
  if(y&&a&&y!==a&&!originMatch)return exact?70:0;
  return (exact?100:80)+(originMatch?25:0)+(y&&a&&y===a?20:0)-(y&&a&&y!==a?20:0);}
 function safeUrl(raw,base,host){try{var u=new URL(clean(raw).replace(/&amp;/g,'&'),base);
  if(u.protocol!=='https:'||!u.hostname||u.port||u.username||u.password||u.href.length>3500)return '';
  if(host&&u.hostname!==host&&u.hostname!=='www.'+host)return '';
  if(/^(?:localhost|\d+\.\d+\.\d+\.\d+)$|\.(?:local|internal)$/i.test(u.hostname))return '';
  u.hash='';return u.href;}catch(_){return '';}}
 function detailUrl(id,url){var spec=specs[id],u=safeUrl(url,spec.origin+'/',new URL(spec.origin).hostname);
  return u&&spec.detail.test(new URL(u).pathname)?u:'';}
 function movieType(movie){return !!(movie&&(movie.media_type==='tv'||movie.type==='tv'||movie.first_air_date||movie.number_of_seasons||movie.seasons));}
 function asText(res){if(typeof res==='string')return res;var keys=['responseText','body','html','data'];for(var i=0;i<keys.length;i++)if(res&&typeof res[keys[i]]==='string')return res[keys[i]];throw Error('missing-text-response');}
 function status(e){var n=Number(e&&(e.status||e.statusCode||e.httpStatus)||0);return n>0&&n<600?n:0;}
 function note(s,m,mode,err){var e={method:m,transport:mode,ok:!err,httpStatus:status(err),upstreamStatus:err&&err.upstreamStatus||0,error:err?scrub(err.message||err):''};
  s.attempts.push(e);if(s.attempts.length>15)s.attempts.shift();
  if(err){s.failures++;s.lastFailureStatus=e.httpStatus;s.lastError=e.error;s.lastHttpStatus=e.httpStatus;}
  else{s.successes++;s.lastSuccessfulTransport=mode;s.transport=mode;s.lastHttpStatus=200;}}
 function isAndroid(){try{return !!(root.AndroidJS||(root.Lampa&&root.Lampa.Platform&&root.Lampa.Platform.is&&root.Lampa.Platform.is('android')));}catch(_){return false;}}
 function getWorkerUrl(){var v='';try{v=root.MultiSourceD13Config&&root.MultiSourceD13Config.workerUrl||'';
  if(!v&&root.Lampa&&root.Lampa.Storage&&root.Lampa.Storage.get)v=root.Lampa.Storage.get('ms_d13_html_worker','');}catch(_){ }
  if(!v)v='https://msbrowser.gorodinsky-v.workers.dev/';
  var u=safeUrl(v);if(!u)return '';try{var x=new URL(u);if(x.pathname!=='/'&&x.pathname!=='')return '';return x.origin;}catch(_){return '';}}
 function checkWorker(){var u=getWorkerUrl();state.worker.configured=!!u;
  if(!u)return Promise.resolve(false);if(healthPromise)return healthPromise;
  state.worker.checks++;
  healthPromise=(root.fetch?root.fetch(u+'/health',{method:'GET',mode:'cors',credentials:'omit',cache:'no-store'}):Promise.reject(Error('fetch unavailable')))
    .then(function(r){state.worker.lastStatus=r.status;if(!r.ok)throw Error('HTTP '+r.status);return r.json();})
    .then(function(h){state.worker.version=String(h.version||'').slice(0,50);state.worker.compatible=!!(h.ok&&h.publicHtmlOnly&&h.mediaProxy===false&&h.version===WORKER_VERSION);if(!state.worker.compatible)throw Error('worker-version-mismatch');state.worker.lastError='';return true;})
    .catch(function(e){state.worker.compatible=false;state.worker.lastError=scrub(e.message||e);return false;});
  return healthPromise;
 }
 function viaWorker(url,method,body){var base=getWorkerUrl(),uri=base+'/html?url='+encodeURIComponent(url);state.worker.networkRequests++;
  return root.fetch(uri,{method:method||'GET',mode:'cors',credentials:'omit',cache:'no-store',headers:method==='POST'?{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'}:{},body:method==='POST'?body:undefined})
    .then(function(r){if(!r.ok){var upstream=r.headers&&r.headers.get&&r.headers.get('X-MultiSource-Upstream-Status');
     var e=Error('HTTP '+r.status+(upstream?' (upstream '+upstream+')':''));e.status=r.status;e.upstreamStatus=Number(upstream)||0;throw e;}return r.text();});}
 function viaLampa(mode,url,method,body,extraHeaders){return new Promise(function(resolve,reject){var r=root.Lampa&&root.Lampa.Reguest&&new root.Lampa.Reguest();
  if(!r||typeof r[mode]!=='function')return reject(Error('Lampa.'+mode+' unavailable'));
  var finished=false,timer=0;function finish(e,val){if(finished)return;finished=true;if(timer&&root.clearTimeout)root.clearTimeout(timer);e?reject(e):resolve(val);}
  if(root.setTimeout)timer=root.setTimeout(function(){finish(Error('timeout'));},8500);
  try{if(r.timeout)r.timeout(8000);
   r[mode](url,function(v){try{finish(null,asText(v));}catch(e){finish(e);}},function(e){var err=Error('HTTP '+(status(e)||0)+' '+scrub(e&&e.message||e&&e.statusText||e));err.status=status(e);finish(err);},
    method==='POST'?body:false,{dataType:'text',headers:method==='POST'?{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'}:(extraHeaders||{})});
  }catch(e){finish(e);}});}
 function pageOK(t){return typeof t==='string'&&t.length>80&&/<(?:html|body|article|div|main|a|h1|script)\b/i.test(t)&&
   !/<title[^>]*>\s*(?:Just a moment|Access denied|Attention Required)/i.test(t);}
 function getText(url,api,s,method,body,kind){method=method||'GET';var sp=specs[s.id],checked=safeUrl(url,undefined,new URL(sp.origin).hostname);
  if(!checked)return Promise.reject(Error('target-host-not-allowed'));
  s.requests++;
  var modes=[];if(isAndroid())modes.push('native');if(getWorkerUrl())modes.push('worker');
  // On ordinary browsers Lampa.native() is not a network bypass; do not fabricate a native route.
  if(root.Lampa&&root.Lampa.Reguest)modes.push('silent');
  if(method==='GET'&&api&&typeof api.request==='function')modes.push('core');
  var host=new URL(checked).hostname;
  function one(i){if(i===modes.length)return Promise.reject(Error('Немає доступного HTML: '+(s.lastError||'transport-unavailable')));
   var mode=modes[i],key=host+'|'+mode,until=networkMemo[key]||0;
   if(until>Date.now())return one(i+1);
   var p=mode==='worker'?checkWorker().then(function(ok){if(!ok)throw Error('worker-not-ready');return viaWorker(checked,method,body);}):
     mode==='core'?Promise.resolve().then(function(){return api.request(checked);}).then(asText):viaLampa(mode,checked,method,body);
   return p.then(function(t){if(kind==='html'&&!pageOK(t))throw Error('not-html-or-access-denied');
      if(kind==='api'&&(!t||!clean(t)||/^false$/i.test(clean(t))))throw Error('rejected-or-empty-api');
      note(s,method,mode,null);return t;
    }).catch(function(e){note(s,method,mode,e);var code=status(e),message=String(e.message||'');
     if(code===403||code===429||(!code&&/(?:HTTP 0|CORS|fetch|network|timeout|worker-not-ready)/i.test(message)))networkMemo[key]=Date.now()+25000;
     return one(i+1);});
  }
  return one(0);
 }
 function parseDoc(html){try{return root.DOMParser?new root.DOMParser().parseFromString(String(html),'text/html'):null;}catch(_){return null;}}
 function txt(n){return clean(n&&n.textContent||'');}
 function cardTitle(node){if(!node)return '';var h=node.querySelector&&node.querySelector('h1,h2,h3,h4,.title,.movie-title,.short-title,.story__title,.post-title,.entry-title');
  return txt(h)||clean(node.getAttribute&&node.getAttribute('title')||'')||txt(node);}
 function searchCards(id,html,movie){var d=parseDoc(html),links=d&&d.querySelectorAll&&d.querySelectorAll('a[href]'),out=[],seen={};if(!links)return out;
  for(var i=0;i<links.length&&i<650;i++){var a=links[i],url=detailUrl(id,a.getAttribute('href'));if(!url||seen[url])continue;
   var wrap=a.closest&&a.closest('article,.shortstory,.short,.short-item,.movie-item,.poster,.post,.item,.card,.story,.film-item')||a;
   var title=cardTitle(wrap),img=wrap.querySelector&&wrap.querySelector('img');
   var y=year(title)||year(txt(wrap.querySelector&&wrap.querySelector('.year,.date,time,.movie-year')));
   var score=scoreTitle(title,movie,y);if(!score&&img){title=clean(img.getAttribute('alt'));score=scoreTitle(title,movie,y);}
   if(!score)continue;seen[url]=true;
   out.push({url:url,title:clean(title).slice(0,150),year:y,score:score,poster:img&&safeUrl(img.getAttribute('data-src')||img.getAttribute('src'),url)||''});}
  return out;
 }
 function pageDetails(id,html,url){var d=parseDoc(html);if(!d)return {title:'',original:'',year:'',poster:''};
  var h=d.querySelector('h1'),og=d.querySelector('meta[property="og:title"]'),oy=d.querySelector('meta[property="og:image"]');
  var ogTitle=clean(og&&og.getAttribute('content')),title=txt(h)||ogTitle,n=d.querySelector('.original-title,.orig-title,.original-name,.full-original,[itemprop="alternateName"]');
  var original=txt(n),pageText=txt(d.body).slice(0,15000);
  if(!original){var m=/(?:Оригінальна назва|Original Title|Назва оригіналу)\s*[:：]\s*([^.;|]{2,80})/i.exec(pageText);if(m)original=clean(m[1]);}
  // Use a short Latin-title line only when explicitly marked by the page.
  var y=year(title),yr=d.querySelector('.year,.movie-year,.date,[itemprop="datePublished"]');
  y=y||year(yr&&(yr.getAttribute('content')||txt(yr)))||year((/(?:Рік(?: виходу)?|Год|Year)\s*[:：]?\s*((?:19|20)\d{2})/i.exec(pageText)||[])[1]);
  return {title:title,ogTitle:ogTitle,original:original,year:y,poster:safeUrl(oy&&oy.getAttribute('content'),url)||''};
 }
 function searchRoutes(id,q){var sp=specs[id],q2=encodeURIComponent(q),base=sp.origin+'/';
  return id==='uafix'?[{method:'GET',url:base+'?s='+q2},{method:'GET',url:base+'index.php?do=search&subaction=search&story='+q2}]:
   [{method:'GET',url:base+'index.php?do=search&subaction=search&story='+q2},
    {method:'POST',url:base+'index.php?do=search',body:'do=search&subaction=search&story='+q2}];}
 function search(id,movie,api){if(id==='uafix'){cardChoice=null;state.streamCards.ready=0;state.streamCards.rendered=0;}
  var s=state.sources[id],searchToken=s.operationToken=(s.operationToken||0)+1;s.stage='search';s.lastError='';s.lastTitle=clean(movie&&(movie.title||movie.name)).slice(0,80);
  s.searchPages=0;s.searchCards=0;s.candidates=0;s.verified=0;s.reason='';if(!movie||!nameList(movie).length)return Promise.resolve([]);
  var queries=nameList(movie).slice(0,2),pool=[],seen={};
  function routeList(q){var routes=searchRoutes(id,q);function run(i){if(i>=routes.length)return Promise.resolve();var r=routes[i];
    return getText(r.url,api,s,r.method,r.body,'html').then(function(html){s.searchPages++;
      var found=searchCards(id,html,movie);s.searchCards+=found.length;
      found.forEach(function(item){if(!seen[item.url]){seen[item.url]=1;pool.push(item);}});
      if(found.length)return;return run(i+1);},function(){return run(i+1);});}return run(0);}
  function scan(i){if(i>=queries.length||pool.length>=10)return Promise.resolve();return routeList(queries[i]).then(function(){return scan(i+1);});}
  return scan(0).then(function(){pool.sort(function(a,b){return b.score-a.score;});s.candidates=pool.length;
   var picks=pool.slice(0,6),out=[];function verify(i){if(i>=picks.length)return Promise.resolve();var item=picks[i];s.detailRequests++;
    return getText(item.url,api,s,'GET',null,'html').then(function(html){var d=pageDetails(id,html,item.url),score=scoreTitle(d.title,movie,d.year,d.original);
     if(d.ogTitle){var fallbackScore=scoreTitle(d.ogTitle,movie,d.year,d.original);
      if(fallbackScore>score){d.title=d.ogTitle;score=fallbackScore;}}
     if(score){out.push({url:item.url,title:d.title,originalTitle:d.original,year:d.year,poster:d.poster||item.poster,score:score});}},function(){}).then(function(){return verify(i+1);});}
   return verify(0).then(function(){s.verified=out.length;
    if(s.operationToken===searchToken){s.stage=out.length?'results':s.searchPages?'no-verified-results':getWorkerUrl()?'transport-unavailable':'worker-not-configured';
     s.reason=out.length?'verified':s.stage;}return out;});});
 }
 var mediaPattern=/\.(?:m3u8|mp4|mpd|webm)(?:[?#]|$)/i;
 function mediaCandidate(raw,base){var v=String(raw||'').replace(/\\\//g,'/').replace(/\\u002[fF]/g,'/').replace(/&amp;/g,'&');
  var u=safeUrl(v,base);if(!u||!mediaPattern.test(u))return '';
  if(/(?:^|\.)(?:doubleclick|googlesyndication|google-analytics|adnxs|adservice|facebook|youtube)\./i.test(new URL(u).hostname))return '';
  if(/(?:pre.?roll|advert|vast|trailer|promo|\/ads?\/)/i.test(u))return '';return u;}
 function extractStreams(id,html,page){var result=[],seen={},sp=specs[id],d=parseDoc(html);
  function add(raw,label){var u=mediaCandidate(raw,page);if(!u||seen[u]||result.length>=18)return;
   seen[u]=1;result.push({url:u,title:label||'Прямий потік',voice:'Українська',source:sp.name,isonline:true});}
  if(d&&d.querySelectorAll){var tags=d.querySelectorAll('video[src],video source[src],source[src],video[data-file],[data-file],[data-video-url]');
   for(var i=0;i<tags.length&&i<80;i++)add(tags[i].getAttribute('src')||tags[i].getAttribute('data-file')||tags[i].getAttribute('data-video-url'),'Відео');}
  var v=String(html||'').replace(/\\u003[aA]/g,':').replace(/\\u002[fF]/g,'/');
  var regex=/(?:\b(?:file|src|url|contentUrl|hls|data-file|video_url)\b["\x27]?\s*[=:]\s*["'])(https?:\\?\/\\?\/[^"'\s<>]+?\.(?:m3u8|mp4|mpd|webm)(?:\?[^"'\s<>]*)?)["']/gi,m;
  while((m=regex.exec(v))&&result.length<18)add(m[1],'Потік');
  return result;
 }
 // UAFix 2026: the site exposes VOD player iframes inside .tabs-b.video-box.
 // Ashdi and PlayerJS-style VOD players expose file/playlist configuration in their own HTML.
 // This adapter requests only iframe URLs *explicitly present in the verified UAFix page*.
 // No iframe playback, cookie/auth forwarding, dynamic JS evaluation or HLS media proxy.
 function uafixPlayerHost(url){
  var h='';try{h=new URL(url).hostname.toLowerCase();}catch(_){return false;}
  return h==='uafix.net'||h==='www.uafix.net'||h==='ashdi.vip'||/\.ashdi\.vip$/.test(h)||
   /(?:^|\.)zetvideo\.(?:com|net|org|tv|me|io|cc)$/.test(h);
 }
 function uafixPlayerType(url){var h='';try{h=new URL(url).hostname.toLowerCase();}catch(_){}
  return /(?:^|\.)ashdi\.vip$/.test(h)?'ashdi':/zetvideo\./.test(h)?'playerjs-vod':'first-party';}
 function collectUafixPlayers(html,page){var d=parseDoc(html),found=[],seen={},blocked=[],hosts=[];
  var accessNotice=/(?:тільки\s+трейлер|пройдіть\s+авторизацію|після\s+авторизації|змініть\s+країну\s+перегляду|requires\s+login)/i.test(html);
  var path='';try{path=new URL(page).pathname.slice(0,160);}catch(_){}
  var base={players:[],iframeCount:0,totalIframes:0,trailerIframes:0,playerTabs:0,videoBoxes:0,embeddedConfigs:0,pagePath:path,
   pageH1:'',htmlLength:String(html||'').length,blockedHosts:[],playerHosts:[],authHint:accessNotice};
  if(!d||!d.querySelectorAll)return base;
  var tabs=d.querySelectorAll('.tabs-sel .tabs-link'),panels=d.querySelectorAll('.tabs-b.video-box');
  var allFrames=d.querySelectorAll('iframe');
  var candidates=d.querySelectorAll('iframe[src],iframe[data-src],iframe[data-url],iframe[data-lazy-src]');
  var localFrames=d.querySelectorAll('.video-box iframe[src],.video-box iframe[data-src],.video-box iframe[data-url]');
  var count=0,trailer=0,visited={},sourceSeen={};
  function consider(node,label){if(!node)return;
   var raw=node.getAttribute('src')||node.getAttribute('data-src')||node.getAttribute('data-url')||node.getAttribute('data-lazy-src')||'';
   var url=safeUrl(raw,page),host='';try{host=url&&new URL(url).hostname||'';}catch(_){}
   var key=url||raw;if(key&&sourceSeen[key])return;if(key)sourceSeen[key]=1;count++;
   if(/(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)||/(?:trailer|promo)/i.test(url)){trailer++;return;}
   if(!url||/(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|adnxs\.com|adservice\.google\.com|facebook\.com)$/.test(host)||/(?:pre.?roll|\/ads?\/)/i.test(url))return;
   if(!uafixPlayerHost(url)){if(host&&blocked.indexOf(host)<0)blocked.push(host);return;}
   if(seen[url])return;seen[url]=1;if(hosts.indexOf(host)<0)hosts.push(host);
   found.push({url:url,label:clean(label).slice(0,75)||'Основний',type:uafixPlayerType(url)});
  }
  // First scan the known VOD tabs to preserve localized audio labels.
  if(tabs&&tabs.length&&panels&&panels.length){
   for(var i=0;i<panels.length&&i<12;i++){
    var node=panels[i].querySelector&&panels[i].querySelector('iframe[src],iframe[data-src],iframe[data-url],iframe[data-lazy-src]');
    consider(node,tabs[i]?txt(tabs[i]):'Основний');
   }
  }
  for(var j=0;j<localFrames.length&&j<20;j++)consider(localFrames[j],'Основний');
  // Some versions render an eligible VOD iframe outside the old .video-box selector.
  // Only explicitly allowlisted player hosts are accepted; no arbitrary iframe requests.
  for(var k=0;k<candidates.length&&k<30;k++)consider(candidates[k],'Основний');
  // In older synthetic DOM implementations only the scoped selector is supported.
  var total=Math.max(allFrames.length,count);
  var titleNode=d.querySelector&&d.querySelector('h1');
  var h1=titleNode?clean(titleNode.textContent).slice(0,100):'';
  var scripts=/(?:new\s+Playerjs\s*\(|ashdi\.(?:vip|\w+)|zetvideo\.|dle[-_]playlists|data-player\s*=)/gi;
  var markers=String(html||'').match(scripts)||[];
  base.players=found.slice(0,6);base.iframeCount=total;base.totalIframes=total;base.trailerIframes=trailer;
  base.playerTabs=tabs.length;base.videoBoxes=panels.length;base.embeddedConfigs=Math.min(markers.length,99);base.pageH1=h1;
  base.blockedHosts=blocked.slice(0,6);base.playerHosts=hosts.slice(0,6);
  return base;
 }
 function parseUafixPlayer(html,base,voice){
  var streams=extractStreams('uafix',html,base),seen={};
  streams.forEach(function(s){seen[s.url]=true;s.voice=voice;s.title=voice;});
  function add(raw,label){if(typeof raw!=='string'||streams.length>=16)return;
   var single=mediaCandidate(raw,base);
   if(!single){var m=/https?:\\?\/\\?\/[^\s"'<>\]\[{},]+?\.(?:m3u8|mp4|mpd|webm)(?:\?[^\s"'<>\]\[{},]*)?/i.exec(raw);
    if(m)single=mediaCandidate(m[0],base);}
   if(!single||seen[single])return;seen[single]=true;
   streams.push({url:single,title:clean(label||voice).slice(0,80),voice:voice,source:'UAFix.net',isonline:true});
  }
  function scanTree(tree,depth,label){if(depth>5||streams.length>=16||tree==null)return;
   if(typeof tree==='string'){add(tree,label);return;}
   if(Array.isArray(tree)){for(var i=0;i<tree.length&&i<30;i++)scanTree(tree[i],depth+1,label);return;}
   if(typeof tree==='object'){
    if(typeof tree.file==='string')add(tree.file,tree.title||label);
    if(typeof tree.url==='string')add(tree.url,tree.title||label);
    if(Array.isArray(tree.folder))scanTree(tree.folder,depth+1,tree.title||label);
   }
  }
  var text=String(html||'').slice(0,400000),matches=0;
  // A quoted `file` option can be a media URL, quality list, or a JSON PlayerJS playlist.
  var rx=/\bfile\s*:\s*(["'])((?:\\.|(?!\1)[\s\S]){1,70000}?)\1/g,m;
  while((m=rx.exec(text))&&matches++<12){
   var raw=m[2];add(raw,voice);
   if(/^\s*[\[{]/.test(raw)){
    try{scanTree(JSON.parse(raw),0,voice);}catch(_){
     try{scanTree(JSON.parse(raw.replace(/\\"/g,'"').replace(/\\'/g,"'")),0,voice);}catch(__){}
    }
   }
  }
  // Some PlayerJS builds include unquoted JSON arrays in a config object.
  var unquoted=/\bfile\s*:\s*(\[[\s\S]{1,50000}?\])\s*[,}]/.exec(text);
  if(unquoted){try{scanTree(JSON.parse(unquoted[1]),0,voice);}catch(_){}}
  return streams;
 }
 function getUafixIframeHtml(player,s,page){
  var modes=[];if(isAndroid())modes.push('native');
  if(root.Lampa&&root.Lampa.Reguest)modes.push('silent');
  // Browser Worker d.13 explicitly restricts cross-domain requests; do not proxy VOD players.
  function step(i){if(i>=modes.length)return Promise.reject(Error('iframe-html-transport-unavailable'));
   var mode=modes[i];s.resolverRequests++;s.requests++;s.playerDetection.resolverAttempts++;
   return viaLampa(mode,player.url,'GET',null,mode==='native'?{'Referer':page}:{}).then(function(html){
    if(!pageOK(html))throw Error('player-html-unavailable');
    note(s,'GET',mode,null);s.playerDetection.htmlResponses++;return html;
   }).catch(function(err){note(s,'GET',mode,err);s.playerDetection.lastError=scrub(err.message||err);return step(i+1);});
  }
  return step(0);
 }
 function resolveUafix(html,page,s,initial){
  var detected=collectUafixPlayers(html,page),p=s.playerDetection;
  p.stage='detected';p.iframeCount=detected.iframeCount;p.totalIframes=detected.totalIframes;p.trailerIframes=detected.trailerIframes;p.playerTabs=detected.playerTabs;p.videoBoxes=detected.videoBoxes;p.embeddedConfigs=detected.embeddedConfigs;p.pagePath=detected.pagePath;p.pageH1=detected.pageH1;p.htmlLength=detected.htmlLength;p.accepted=detected.players.length;
  p.playerHosts=detected.playerHosts;p.blockedHosts=detected.blockedHosts;p.authHint=detected.authHint;
  p.playerType=detected.players.map(function(x){return x.type;}).filter(function(x,i,a){return a.indexOf(x)===i;}).join(',');
  var found=(initial||[]).slice(),seen={};found.forEach(function(x){seen[x.url]=1;});
  function next(i){if(i>=detected.players.length||found.length>=16)return Promise.resolve(found);
   var player=detected.players[i];
   return getUafixIframeHtml(player,s,page).then(function(payload){
    var arr=parseUafixPlayer(payload,player.url,player.label);
    arr.forEach(function(x){x._msProvider=player.type==='ashdi'?'Ashdi':player.type==='playerjs-vod'?'Zetvideo':'UAFix';});
    if(arr.length)p.configFound=true;
    arr.forEach(function(x){if(!seen[x.url]&&found.length<16){seen[x.url]=1;found.push(x);}});
   },function(){}).then(function(){return next(i+1);});
  }
  return next(0).then(function(){p.mediaCandidates=found.length;
   p.stage=found.length?'candidate-found':detected.players.length?'no-public-media':
     detected.authHint?'authentication-or-trailer-only':detected.trailerIframes?'trailer-only':'no-verified-player';return {streams:found};});
 }
 function dleConfig(html,page){if(!/(?:dle-playlists|engine\/ajax\/playlists\.php)/i.test(html))return '';
  var d=parseDoc(html),node=d&&d.querySelector&&d.querySelector('[data-xfield][data-id],.dle-playlists[data-news_id]');
  var xfield=node&&node.getAttribute('data-xfield')||'',newsId=node&&(node.getAttribute('data-id')||node.getAttribute('data-news_id'))||'';
  var post=/(?:news_id|dle_post_id)\s*[=:]\s*["']?(\d{1,9})/i.exec(html),xf=/(?:xfield)\s*[=:]\s*["']([\w-]{1,60})/i.exec(html);
  if(!newsId&&post)newsId=post[1];if(!xfield&&xf)xfield=xf[1];
  if(!/^\d{1,9}$/.test(newsId)||!/^[\w-]{1,60}$/.test(xfield))return '';
  var u=new URL('/engine/ajax/playlists.php',page);u.searchParams.set('news_id',newsId);u.searchParams.set('xfield',xfield);
  return u.href;
 }
 function getStreams(id,item,api){var s=state.sources[id],url=detailUrl(id,item&&item.url);s.operationToken=(s.operationToken||0)+1;
  if(!url)return Promise.reject(Error('Invalid '+id+' detail URL'));
  s.stage='detail';s.streams=0;s.resolverRequests=0;
  if(id==='uafix')s.playerDetection={stage:'waiting-detail',playerType:'',iframeCount:0,totalIframes:0,trailerIframes:0,playerTabs:0,videoBoxes:0,embeddedConfigs:0,pagePath:'',pageH1:'',htmlLength:0,accepted:0,playerHosts:[],blockedHosts:[],resolverAttempts:0,htmlResponses:0,configFound:false,mediaCandidates:0,authHint:false,lastError:''};
  return getText(url,api,s,'GET',null,'html').then(function(html){var found=extractStreams(id,html,url),resolver=dleConfig(html,url);
   if(id==='uafix')return resolveUafix(html,url,s,found).then(function(result){
    if(result.streams.length||s.playerDetection.accepted||!resolver)return result;
    s.resolverRequests++;
    return getText(resolver,api,s,'GET',null,'api').then(function(json){
     return {streams:extractStreams(id,json,url)};
    },function(){return result;});
   });
   if(found.length||!resolver)return {streams:found};
   s.resolverRequests++;
   return getText(resolver,api,s,'GET',null,'api').then(function(json){var streams=extractStreams(id,json,url);
    return {streams:streams};},function(){return {streams:[]};});
  }).then(function(data){if(id==='uafix')prepareVideoCards(item,data.streams);
   s.streams=data.streams.length;s.stage=s.streams?'direct-candidates':'no-public-direct-media';
   s.mediaHosts=data.streams.map(function(x){return new URL(x.url).hostname;}).slice(0,8);
   s.reason=s.streams?'segment-playback-unverified':id==='uafix'&&s.playerDetection.authHint&&s.playerDetection.accepted===0?'authentication-or-trailer-only':'no-resolvable-media';
   return {streams:data.streams,embeds:[],pageUrl:url,notice:s.streams?'Знайдено публічні прямі адреси. Доступність сегментів перевіряється у Lampa.Player.':
    'Не виявлено доступного прямого потоку. Сторонній плеєр із рекламою не запускається.'};
  },function(e){s.stage='detail-error';s.reason='network';s.lastError=scrub(e.message||e);throw e;});
 }
 function getPoster(movie){var raw=movie&&(movie.poster_path||movie.poster||movie.poster_url||movie.posterUrl)||'';
  if(/^\/[^/]/.test(raw))return 'https://image.tmdb.org/t/p/w500'+raw;return safeUrl(raw)||'';}
 function currentMovie(){try{var a=root.Lampa&&root.Lampa.Activity&&root.Lampa.Activity.active&&root.Lampa.Activity.active();
  return a&&(a.movie||a.card||a.object&&(a.object.movie||a.object.card)||a.activity&&a.activity.movie)||null;}catch(_){return null;}}
 function updatePoster(){if(!root.document||!root.document.querySelector)return false;
  var view=root.document.querySelector('.ms-scroll-viewport'),panel=view&&view.querySelector('.ms-movie-panel');if(!panel)return false;
  var movie=currentMovie(),stale=panel.querySelector('.ms-d13-movie-poster');
  if(!movie||movieType(movie)||!getPoster(movie)){
   if(stale&&stale.parentNode)stale.parentNode.removeChild(stale);
   if(panel.classList)panel.classList.remove('ms-d13-movie-card');if(panel.removeAttribute)panel.removeAttribute('data-ms-d13-poster');
   if(movie&&movieType(movie)){state.moviePoster.skippedTv++;state.moviePoster.lastStatus='tv-unchanged';}
   else{state.moviePoster.noPoster++;state.moviePoster.lastStatus='no-poster';}return false;
  }
  var url=getPoster(movie);if(panel.getAttribute('data-ms-d13-poster')===url)return true;
  if(stale&&stale.parentNode)stale.parentNode.removeChild(stale);
  var img=root.document.createElement('img');img.className='ms-d13-movie-poster';img.src=url;img.alt='Постер фільму';img.loading='lazy';img.decoding='async';
  panel.insertBefore(img,panel.firstChild);panel.setAttribute('data-ms-d13-poster',url);panel.classList.add('ms-d13-movie-card');
  state.moviePoster.applied++;state.moviePoster.lastStatus='poster-mounted';return true;
 }
 function installPosterStyle(){var d=root.document;if(!d||!d.head||d.getElementById('ms-d13-poster-style'))return;
  var style=d.createElement('style');style.id='ms-d13-poster-style';style.textContent=
   '.ms-scroll-viewport .ms-movie-panel.ms-d13-movie-card{position:relative!important;box-sizing:border-box!important;background-image:none!important;padding-left:clamp(9rem,20vw,14rem)!important;min-height:17.5rem!important;}'+
   '.ms-scroll-viewport .ms-movie-panel.ms-d13-movie-card>.ms-d13-movie-poster{display:block!important;position:absolute!important;top:.65rem;left:.65rem;width:clamp(7.6rem,16vw,12rem)!important;aspect-ratio:2/3;object-fit:cover!important;border-radius:.55rem!important;box-shadow:0 .4rem 1.2rem rgba(0,0,0,.28);max-width:none!important;}'+
   '.ms-scroll-viewport .ms-movie-panel.ms-d13-movie-card>.ms-movie-backdrop,.ms-scroll-viewport .ms-movie-panel.ms-d13-movie-card>.ms-movie-art{display:none!important;}'+
   '@media(max-width:640px){.ms-scroll-viewport .ms-movie-panel.ms-d13-movie-card{padding-left:9rem!important;min-height:13rem!important;}.ms-scroll-viewport .ms-movie-panel.ms-d13-movie-card>.ms-d13-movie-poster{width:7.6rem!important;}}';d.head.appendChild(style);state.moviePoster.installed=true;
 }
 function schedulePoster(){if(drawTimer||!root.setTimeout)return;drawTimer=root.setTimeout(function(){drawTimer=0;updatePoster();},160);}
 // d.13.5: turn UAFix's existing multi-stream choice rows into instant-play video cards.
 // The upstream 1.3.15 core uses renderOnlineChoices() -> addRow() for 2+ streams,
 // then playOrResolve() -> renderMovieStreamCard() -> play(). We avoid both extra
 // screens while preserving Lampa's normal Player, playlist, card and Timeline.
 // No source links or signed media URLs are written to DOM/storage/diagnostics.
 function selectedUafix(){try{return !!(root.Lampa&&root.Lampa.Storage&&root.Lampa.Storage.get&&
   root.Lampa.Storage.get('ms_v1_source','')==='uafix');}catch(_){return false;}}
 function streamFormat(raw){var value=String(raw||'').split(/[?#]/)[0];
  return /\.m3u8$/i.test(value)?'HLS':/\.mp4$/i.test(value)?'MP4':
   /\.mpd$/i.test(value)?'DASH':/\.webm$/i.test(value)?'WEBM':'Відео';}
 var videoTraceObserver=null,videoTraceTimer=0,videoTraceNode=null,videoTraceHandlers=[],videoTraceStartedAt=0;
 function detachTrace(){
  if(videoTraceObserver){try{videoTraceObserver.disconnect();}catch(_){ }videoTraceObserver=null;}
  if(videoTraceTimer&&root.clearTimeout){root.clearTimeout(videoTraceTimer);videoTraceTimer=0;}
  if(videoTraceNode&&videoTraceHandlers.length&&videoTraceNode.removeEventListener){
   videoTraceHandlers.forEach(function(h){try{videoTraceNode.removeEventListener(h[0],h[1]);}catch(_){ }});
  }videoTraceHandlers=[];videoTraceNode=null;
 }
 function traceEvent(name,video){var t=state.playbackTrace;if(!t||!t.playerInvoked)return;
  t.events.push(name);if(t.events.length>18)t.events.shift();
  if(name==='loadedmetadata'||name==='loadeddata'||name==='canplay')t.mediaLoaded=true;
  if(name==='playing'){t.playing=true;if(!t.timeProgressed)t.phase='playing';}
  if(name==='waiting')t.waiting++;
  if(name==='stalled')t.stalled++;
  if(name==='error'){
   var err=video&&video.error;t.videoErrorCode=Number(err&&err.code||0);
   t.videoErrorName=['','MEDIA_ERR_ABORTED','MEDIA_ERR_NETWORK','MEDIA_ERR_DECODE','MEDIA_ERR_SRC_NOT_SUPPORTED'][t.videoErrorCode]||'MEDIA_ERR_UNKNOWN';
   t.lastError=t.videoErrorName;t.phase='player-error';
  }
  if(name==='timeupdate'){
   var seconds=Number(video&&video.currentTime||0);
   if(isFinite(seconds)&&seconds>0){
    if(videoTraceStartedAt===0)videoTraceStartedAt=seconds;
    if(seconds-videoTraceStartedAt>=.25){t.timeProgressed=true;t.playing=true;t.phase='progress-confirmed';}
   }
  }
 }
 function bindTraceVideo(){
  if(!state.playbackTrace.playerInvoked||!root.document||!root.document.querySelector)return false;
  var v=root.document.querySelector('video');if(!v||v===videoTraceNode)return !!v;
  if(videoTraceNode&&videoTraceHandlers.length&&videoTraceNode.removeEventListener){
   videoTraceHandlers.forEach(function(h){try{videoTraceNode.removeEventListener(h[0],h[1]);}catch(_){ }});
  }
  videoTraceNode=v;videoTraceHandlers=[];videoTraceStartedAt=0;
  ['loadstart','loadedmetadata','loadeddata','canplay','playing','timeupdate','waiting','stalled','error'].forEach(function(kind){
   var handler=function(){traceEvent(kind,v);};try{v.addEventListener(kind,handler);videoTraceHandlers.push([kind,handler]);}catch(_){ }
  });
  state.playbackTrace.observability='dom-video-events';
  try{if(v.readyState>=2)traceEvent('loadeddata',v);if(!v.paused)traceEvent('playing',v);}catch(_){ }
  return true;
 }
 function trackPlaybackLaunch(provider,url){
  var host='';try{host=new URL(url).hostname;}catch(_){ }
  detachTrace();videoTraceStartedAt=0;
  var t=state.playbackTrace,oldCalls=t.playerCalls||0;
  t.provider=clean(provider||'UAFix').slice(0,50);t.mediaHost=host.slice(0,100);t.format=streamFormat(url);
  t.phase='player-invoked';t.playerInvoked=true;t.playerCalls=oldCalls+1;t.observability='not-observed';
  t.mediaLoaded=false;t.playing=false;t.timeProgressed=false;t.waiting=0;t.stalled=0;
  t.videoErrorCode=0;t.videoErrorName='';t.lastError='';t.events=[];
  t.manifestProbe={stage:'idle',transport:'',httpStatus:0,manifestType:'',bytes:0,variants:0,segments:0,encrypted:false,protectionHint:false,lastError:''};
  bindTraceVideo();
  if(root.MutationObserver&&root.document&&root.document.body){try{
   videoTraceObserver=new root.MutationObserver(function(){bindTraceVideo();});
   videoTraceObserver.observe(root.document.body,{childList:true,subtree:true});
  }catch(_){ }}
  if(root.setTimeout)videoTraceTimer=root.setTimeout(function(){detachTrace();},180000);
 }
 function prepareVideoCards(item,streams){
  var movie=currentMovie(),list=Array.isArray(streams)?streams:[];
  // Series and episode cards belong to the core, even if they have several streams.
  if(movieType(movie)||list.length<2||list.some(function(x){return !x||x.resolve||x.episode||x.season||
      !mediaCandidate(x.url,x.url);})){
   cardChoice=null;state.streamCards.ready=0;state.streamCards.lastStatus='not-applicable';return;
  }
  var title=clean(item&&item.title),poster=getPoster(movie)||safeUrl(item&&item.poster);
  cardChoice={title:title,poster:poster,movie:movie,streams:list.slice()};
  state.streamCards.ready=list.length;state.streamCards.rendered=0;
  state.streamCards.lastStatus='awaiting-core-choice-view';scheduleStreamCardDraw();
 }
 function streamCardRows(list){
  if(!list||!list.children)return [];
  return Array.prototype.filter.call(list.children,function(el){return !!(el&&el.classList&&
   el.classList.contains('ms-row')&&el.classList.contains('selector')&&
   !el.classList.contains('ms-action')&&!el.classList.contains('ms-section'));});
 }
 function directMovieTimeline(movie){
  // Same TMDB movie identity as MultiSource 1.3.15 core (timelineKey/progressFor).
  try{var l=root.Lampa;if(!movie||!l||!l.Timeline||typeof l.Timeline.view!=='function'||
     !l.Utils||typeof l.Utils.hash!=='function')return null;
   var id=String(movie.tmdb_id||movie.id||'').trim();
   var name=clean(movie.original_title||movie.original_name||movie.title||movie.name)
     .toLowerCase().replace(/[’'`´]/g,'').replace(/[^a-z0-9а-яіїєґё]+/gi,' ').replace(/\s+/g,' ').trim();
   var identity=id?'id:'+id:'title:'+name+':'+year(movie.release_date||movie.first_air_date||movie.year);
   var metadata=typeof l.Timeline.link==='function'?l.Timeline.link(movie):null;
   var value=l.Timeline.view(l.Utils.hash('multisource:movie:'+identity),metadata);
   return value&&value.hash?value:null;
  }catch(_){return null;}
 }
 function launchVideoCard(index){
  if(!selectedUafix()||!cardChoice||index<0||index>=cardChoice.streams.length)return false;
  var s=cardChoice.streams[index],url=mediaCandidate(s.url,s.url),l=root.Lampa;
  if(!url||!l||!l.Player||typeof l.Player.play!=='function'){
   state.streamCards.lastStatus='player-unavailable';return false;
  }
  if(Date.now()-cardLaunchAt<450)return false;
  cardLaunchAt=Date.now();
  var movie=cardChoice.movie||currentMovie()||{},timeline=directMovieTimeline(movie);
  var title=clean((movie.title||movie.name||cardChoice.title)+' · '+(s.voice||s._msProvider||'UAFix'));
  var selected={url:url,title:title,season:0,episode:0,voice_name:s.voice||'',isonline:true,
   card:movie,timeline:timeline,_msTimeline:!!timeline};
  if(s.headers)selected.headers=s.headers;
  if(s.subtitles)selected.subtitles=s.subtitles;
  var entry={};Object.keys(selected).forEach(function(k){entry[k]=selected[k];});
  selected.playlist=[entry];
  try{l.Player.play(selected);if(typeof l.Player.playlist==='function')l.Player.playlist([entry]);
   if(movie&&movie.id&&l.Favorite&&typeof l.Favorite.add==='function')l.Favorite.add('history',movie,100);
   trackPlaybackLaunch(s._msProvider||s.voice||'UAFix',url);
   state.streamCards.launches++;state.streamCards.lastStatus='player-invoked';
   state.streamCards.lastFormat=streamFormat(url);state.streamCards.lastError='';return true;
  }catch(e){state.streamCards.lastStatus='player-exception';
   state.streamCards.lastError=scrub(e&&e.message||e);
   try{if(l.Noty)l.Noty.show('Помилка запуску відео');}catch(_){}return false;}
 }
 function enhanceVideoCards(){
  if(!root.document||!root.document.querySelector)return false;
  var view=root.document.querySelector('.ms-scroll-viewport');
  if(!view)return false;
  var list=view.querySelector&&view.querySelector('.ms-list');
  if(!list)return false;
  function clear(){if(list.classList)list.classList.remove('ms-d135-card-grid');
   if(view.classList)view.classList.remove('ms-d135-card-view');}
  if(!selectedUafix()||!cardChoice||cardChoice.streams.length<2){clear();return false;}
  var a=root.Lampa&&root.Lampa.Activity&&root.Lampa.Activity.active&&root.Lampa.Activity.active();
  var component=a&&(a.component||a.object&&a.object.component);
  if(component&&component!=='multi_source_online_v1'){clear();return false;}
  var sections=list.querySelectorAll&&list.querySelectorAll('.ms-row.ms-section')||[];
  var match=null;
  for(var i=0;i<sections.length;i++){
   var h=sections[i].querySelector&&sections[i].querySelector('.ms-row-title');
   var subtitle=sections[i].querySelector&&sections[i].querySelector('.ms-row-info');
   if(clean(h&&h.textContent)==='Оберіть варіант перегляду'&&
       clean(subtitle&&subtitle.textContent)===cardChoice.title){match=sections[i];break;}
  }
  if(!match){clear();return false;}
  var rows=streamCardRows(list),streams=cardChoice.streams;
  if(rows.length!==streams.length||streams.some(function(s,i){
    var h=rows[i].querySelector&&rows[i].querySelector('.ms-row-title');
    return clean(h&&h.textContent)!==clean(s.title||('Варіант '+(i+1)));
  })){clear();return false;}
  if(list.classList)list.classList.add('ms-d135-card-grid');
  if(view.classList)view.classList.add('ms-d135-card-view');
  streams.forEach(function(s,index){
   var row=rows[index];if(row.classList.contains('ms-d135-stream-card'))return;
   var doc=root.document,art=doc.createElement('div'),info=doc.createElement('div'),tag=doc.createElement('div'),action=doc.createElement('div');
   art.className='ms-d135-card-art';
   if(cardChoice.poster){var img=doc.createElement('img');img.src=cardChoice.poster;img.alt='';img.loading='lazy';
    img.onerror=function(){if(img.parentNode)img.parentNode.removeChild(img);};art.appendChild(img);}
   var playIcon=doc.createElement('span');playIcon.className='ms-d135-play-glyph';playIcon.textContent='▶';art.appendChild(playIcon);
   info.className='ms-d135-card-info';tag.className='ms-d135-card-provider';
   tag.textContent=s._msProvider||'UAFix';info.appendChild(tag);
   // Keep original title/voice nodes accessible; move only children, not the row.
   while(row.firstChild)info.appendChild(row.firstChild);
   var label=doc.createElement('span');label.className='ms-d135-card-format';
   label.textContent=streamFormat(s.url);info.appendChild(label);
   action.className='ms-d135-card-action';action.textContent='▶ Дивитися';info.appendChild(action);
   row.appendChild(art);row.appendChild(info);
   row.classList.add('ms-d135-stream-card');row.setAttribute('role','button');row.setAttribute('tabindex','0');
   row.setAttribute('aria-label','Відтворити: '+clean(s._msProvider||'UAFix')+' '+clean(s.voice||''));
   // Core's old hover:enter opens ANOTHER pre-play movie screen. Override on
   // this exact choice row only; keep hover:focus and Lampa controller intact.
   if(typeof root.$==='function'){
    var jq=root.$(row);if(jq&&jq.off&&jq.on)jq.off('hover:enter').on('hover:enter',function(){launchVideoCard(index);});
   }
   row.addEventListener('click',function(e){if(e){e.preventDefault();e.stopPropagation();}launchVideoCard(index);});
  });
  state.streamCards.rendered=rows.length;state.streamCards.lastStatus='cards-visible';return true;
 }
 function scheduleStreamCardDraw(){
  if(cardDrawTimer||!root.setTimeout||!cardChoice)return;
  cardDrawTimer=root.setTimeout(function(){cardDrawTimer=0;enhanceVideoCards();},80);
 }
 function installStreamCardStyles(){var d=root.document;
  if(!d||!d.head||!d.createElement||d.getElementById&&d.getElementById('ms-d135-card-styles'))return;
  var st=d.createElement('style');st.id='ms-d135-card-styles';st.textContent=
   '.ms-scroll-viewport.ms-d135-card-view .ms-list.ms-d135-card-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:.85rem;row-gap:.6rem;align-content:start;}'+
   '.ms-d135-card-grid>.ms-row:not(.ms-d135-stream-card){grid-column:1/-1;min-width:0;}'+
   '.ms-d135-card-grid>.ms-d135-stream-card{min-width:0;display:flex!important;gap:.85rem;align-items:stretch;cursor:pointer;padding:.7rem!important;min-height:10rem!important;border:1px solid rgba(255,255,255,.15);border-radius:.75rem!important;margin:0!important;background:rgba(255,255,255,.09);}'+
   '.ms-d135-stream-card .ms-d135-card-art{position:relative;flex:0 0 6.8rem;min-width:0;aspect-ratio:2/3;overflow:hidden;border-radius:.5rem;background:linear-gradient(135deg,#28394b,#111923);display:flex;align-items:center;justify-content:center;}'+
   '.ms-d135-stream-card .ms-d135-card-art img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0;}'+
   '.ms-d135-stream-card .ms-d135-play-glyph{position:relative;z-index:1;background:rgba(0,0,0,.57);border-radius:50%;height:2.4rem;width:2.4rem;display:flex;align-items:center;justify-content:center;padding-left:.15rem;color:white;font-size:1.2rem;}'+
   '.ms-d135-stream-card .ms-d135-card-info{display:flex;min-width:0;flex:1;flex-direction:column;align-items:flex-start;gap:.4rem;justify-content:center;}'+
   '.ms-d135-stream-card .ms-d135-card-provider{font-size:.82rem;opacity:.86;font-weight:700;letter-spacing:.02em;}'+
   '.ms-d135-stream-card .ms-row-title{font-size:1.05rem!important;overflow-wrap:anywhere;line-height:1.25;}'+
   '.ms-d135-stream-card .ms-row-info{font-size:.81rem!important;opacity:.8!important;line-height:1.25;}'+
   '.ms-d135-stream-card .ms-d135-card-format{font-size:.73rem;font-weight:700;opacity:.85;letter-spacing:.05em;}'+
   '.ms-d135-stream-card .ms-d135-card-action{font-size:.91rem;font-weight:700;margin-top:.2rem;}'+
   '.ms-d135-stream-card.focus,.ms-d135-stream-card:focus{background:#fff!important;color:#131b27!important;outline:2px solid #fff!important;outline-offset:2px;}'+
   '.ms-d135-stream-card.focus .ms-d135-card-action,.ms-d135-stream-card:focus .ms-d135-card-action{color:#135fa6;}'+
   '@media(max-width:850px){.ms-scroll-viewport.ms-d135-card-view .ms-list.ms-d135-card-grid{grid-template-columns:minmax(0,1fr);}.ms-d135-card-grid>.ms-d135-stream-card{min-height:8rem!important;}.ms-d135-stream-card .ms-d135-card-art{flex-basis:5.3rem;}}';
  d.head.appendChild(st);
 }
 function diagnostic(){state.worker.configured=!!getWorkerUrl();return {version:VERSION,installed:state.installed,stage:state.stage,paused:state.paused,
  sources:state.sources,worker:state.worker,moviePoster:state.moviePoster,streamCards:state.streamCards,playbackTrace:state.playbackTrace,mediaPolicy:state.mediaPolicy,reference:state.reference,lastError:state.lastError};}
 function bridge(){var api=root.MultiSourceSources1315b;if(!api||typeof api.diagnostic!=='function')return false;
  if(api.diagnostic._msD13Bridge)return true;var previous=api.diagnostic;
  function wrapped(){var d=previous.apply(this,arguments);if(d){if(!d.lastDetailEvidence)d.lastDetailEvidence={};
   var snap=diagnostic(), dub=root.MultiSourceDubStudio1315, dubInfo=null, registered='unknown';
   try{if(root.LampaMultiSource&&typeof root.LampaMultiSource.listSources==='function'){
    var registeredSources=root.LampaMultiSource.listSources()||[];registered=false;
    for(var i=0;i<registeredSources.length;i++)if(registeredSources[i]&&registeredSources[i].id==='dubstudio')registered=true;
   }}catch(_){registered='unknown';}
   try{if(dub&&typeof dub.diagnostic==='function')dubInfo=dub.diagnostic();}catch(_){dubInfo=null;}
   if(!dubInfo)dubInfo={version:'dubstudio-probe-test.5',installed:false,stage:'adapter-script-not-loaded',
    requests:0,successes:0,failures:0,lastError:'',reason:'adapter-not-detected'};
   dubInfo.adapterLoaded=!!(dub&&typeof dub.diagnostic==='function');
   dubInfo.registeredInCore=registered;
   dubInfo.probe='core-source-bridge-test.5';
   snap.dubstudio=dubInfo;
   d.lastDetailEvidence.sourceExpansionD13=snap;d.lastDetailEvidence.uakinobestD13={version:VERSION,stage:'paused',networkRequests:0};}return d;}
  wrapped._msD13Bridge=true;api.diagnostic=wrapped;return true;
 }
 // d.13.1: do not inject SettingsApi.addParam into Lampa's built-in 'interface' screen.
 // Some Lampa clients fail to render that settings screen when this parameter is inserted.
 // Worker URL is configured via MultiSourceD13.setWorkerUrl or MultiSourceD13Config.workerUrl.
 function installSettings(){return false;}
 function install(){var api=root.LampaMultiSource;if(!api||!api._coreLoaded||typeof api.registerSource!=='function')return false;
  api.registerSource({id:PAUSED,name:'UAKino.best (не працює)',baseUrl:'https://uakino.best',isDetail:function(){return false;},
   search:function(){return Promise.resolve([]);},getStreams:function(){return Promise.resolve({streams:[],embeds:[],notice:'UAKino.best вимкнений.'});}});
  Object.keys(specs).forEach(function(id){var sp=specs[id];api.registerSource({id:id,name:sp.name,baseUrl:sp.origin,
   isDetail:function(url){return !!detailUrl(id,url);},search:function(movie,ctx){return search(id,movie,ctx||api);},
   getStreams:function(item,ctx){return getStreams(id,item,ctx||api);}});});
  try{var st=root.Lampa&&root.Lampa.Storage;if(st&&st.get&&st.set&&['uakinobest','liftw'].indexOf(st.get('ms_v1_source',''))>=0)st.set('ms_v1_source','eneyida');}catch(_){ }
  bridge();state.installed=true;state.stage='ready';root.MultiSourceD13Boot.status='installed';installSettings();
  installPosterStyle();installStreamCardStyles();schedulePoster();scheduleStreamCardDraw();
  if(root.MutationObserver&&root.document&&root.document.body&&!watch){watch=new root.MutationObserver(function(){schedulePoster();scheduleStreamCardDraw();});watch.observe(root.document.body,{childList:true,subtree:true});}
  return true;
 }
 root.MultiSourceD13={version:VERSION,installed:false,diagnostic:diagnostic,install:install,checkWorker:checkWorker,
  _traceLaunch:trackPlaybackLaunch,
  setWorkerUrl:function(url){var safe=safeUrl(url);if(!safe||new URL(safe).pathname!=='/')return false;
   try{root.Lampa.Storage.set('ms_d13_html_worker',new URL(safe).origin);}catch(_){return false;}
   healthPromise=null;state.worker.version='';state.worker.compatible=false;return true;},
  _test:{prepareVideoCards:prepareVideoCards,enhanceVideoCards:enhanceVideoCards,launchVideoCard:launchVideoCard,directMovieTimeline:directMovieTimeline,streamCardRows:streamCardRows,
   norm:norm,nameList:nameList,scoreTitle:scoreTitle,detailUrl:detailUrl,searchRoutes:searchRoutes,searchCards:searchCards,
   pageDetails:pageDetails,extractStreams:extractStreams,collectUafixPlayers:collectUafixPlayers,parseUafixPlayer:parseUafixPlayer,resolveUafix:resolveUafix,dleConfig:dleConfig,mediaCandidate:mediaCandidate,getText:getText,updatePoster:updatePoster,movieType:movieType,getPoster:getPoster}};
 if(install())root.MultiSourceD13.installed=true;
 else if(root.setInterval)installTimer=root.setInterval(function(){if(install()||++installAttempts>100){root.MultiSourceD13.installed=state.installed;
  if(!state.installed){state.stage='core-timeout';root.MultiSourceD13Boot.status='core-timeout';}root.clearInterval(installTimer);}},400);
})(window);

})(window);

/* ---- Integrated UAFix TV season / episode renderer ---- */
/* MultiSource UAFix Series 1.3.15d.13.9 — integrated into single-entrypoint.
 * Registers AFTER the base UAFix provider is installed; only TV catalog paths patched.
 * No iframe playback, credentials, DRM workarounds, media relays, or signed URL logs.
 */
(function(root){
 'use strict';
 if(root.MultiSourceUafixSeriesD139)return;
 var VERSION='1.3.15d.13.9-series-integrated';
 var ORIGIN='https://uafix.net';
 var state={version:VERSION,installed:false,stage:'waiting-core',catalogRequests:0,catalogResponses:0,
  seasonRequests:0,seasonsFound:0,episodesFound:0,renderedEpisodes:0,selectedSeason:0,selectedEpisode:0,
  episodeRequests:0,episodeResponses:0,playerFrames:0,playerRequests:0,playerResponses:0,
  streamsFound:0,renderedStreams:0,launches:0,lastProvider:'',lastFormat:'',lastError:'',
  autoLaunchAttempts:0,autoLaunchSuccess:0,autoLaunchFailures:0,autoLaunchProvider:'',autoLaunchStatus:'idle',
  lastNotice:'',ui:'idle',baseVersion:'',playerInvoked:false,cardLayout:'core-ms-episode-card',timelineAttached:false,watchedMarks:0,metadataSeason:0,metadataStatus:'idle',metadataRecords:0,progressRefreshed:0};
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
 function safeEpisodeImage(raw,base){
  try{var u=safeUrl(raw,base);if(!u)return '';
   var h=new URL(u).hostname.toLowerCase();
   return firstParty(h)||/(?:^|\.)uafix\.net$/.test(h)||h==='image.tmdb.org'?u:'';
  }catch(_){return '';}
 }
 function artFor(ep){
  if(ep&&ep.image)return ep.image;
  var m=movie(),p=clean(m&&m.backdrop_path||'');
  return /^\/[a-z0-9_./-]+\.(?:jpe?g|png|webp)$/i.test(p)?'https://image.tmdb.org/t/p/w500'+p:'';
 }
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
    var image='',img=/<img\b[^>]*(?:data-src|data-original|src)\s*=\s*(?:["']([^"']+)["'])/i.exec(m[2]);
    if(img)image=safeEpisodeImage(img[1],base);
    eps.push({season:sn,episode:en,url:u,title:label.replace(/^(?:прем['’]?єра\.?\s*(?:\d{1,2}\.\d{1,2}\.20\d{2})?\s*)?сезон\s*\d+\s*серія\s*\d+\s*/i,'').trim()||'Серія '+en,upcoming:upcoming,image:image});continue;
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
 var tmdbPending={},tmdbApplied={},currentPlayedEpisode=null;
 function currentCard(){return series&&series.card||movie()||{};}
 function normalized(s){return clean(s).toLowerCase().replace(/[’'`´]/g,'').replace(/[^a-z0-9а-яіїєґё]+/gi,' ').replace(/\s+/g,' ').trim();}
 function releaseYear(s){var m=/(?:19|20)\d{2}/.exec(String(s||''));return m?m[0]:'';}
 function tmdbId(card){card=card||{};
  var raw=card.source&&card.source!=='tmdb'?card.tmdb_id:(card.tmdb_id||card.id);
  var id=Number(raw);return isFinite(id)&&Math.floor(id)===id&&id>0&&id<1000000000&&card.media_type!=='movie'&&card.type!=='movie'?id:0;}
 function timelineFor(card,season,episode){
  var l=root.Lampa;if(!l||!l.Timeline||typeof l.Timeline.view!=='function'||!l.Utils||typeof l.Utils.hash!=='function')return null;
  card=card||{};try{
   var id=clean(card.tmdb_id||card.id||'');
   var identity=id?'id:'+id:'title:'+normalized(card.original_title||card.original_name||card.title||card.name)+
    ':'+releaseYear(card.release_date||card.first_air_date||card.year);
   var link=card;if(!card.original_name){link={};Object.keys(card).forEach(function(k){link[k]=card[k];});
    link.original_name=card.original_title||card.name||card.title||'series';}
   var meta=typeof l.Timeline.link==='function'?l.Timeline.link(link,Number(season),Number(episode)):null;
   var result=l.Timeline.view(l.Utils.hash('multisource:tv:'+identity+':'+Number(season)+':'+Number(episode)),meta);
   return result&&result.hash?result:null;
  }catch(_){return null;}
 }
 function readShared(key,defaultValue){try{return root.Lampa.Storage.get('ms_v1_'+key,defaultValue);}catch(_){return defaultValue;}}
 function writeShared(key,value){try{root.Lampa.Storage.set('ms_v1_'+key,value);return true;}catch(_){return false;}}
 function watchKey(card,season,episode){return 'title:'+(tmdbId(card)||normalized(card&&(card.name||card.title)))+':'+Number(season)+':'+Number(episode);}
 function watchedStatus(card,season,episode){
  var all=readShared('watched_episodes',{}),key=watchKey(card,season,episode);
  if(all&&Object.prototype.hasOwnProperty.call(all,key)){
   var flag=all[key];return !!(flag&&(typeof flag!=='object'||flag.watched!==false));}
  var older=['uaserials','uafix','uakino','kinoukr','uamovie','uaserialsmy','lavakino','uaserialsvip','uaserialtv'];
  for(var i=0;i<older.length;i++)if(all&&all[older[i]+':'+key.replace(/^title:/,'')])return true;
  var progress=timelineFor(card,season,episode);
  return !!(progress&&Number(progress.percent)>=95);
 }
 function markWatched(card,season,episode,watched){var all=readShared('watched_episodes',{});
  if(!all||typeof all!=='object'||Array.isArray(all))all={};
  all[watchKey(card,season,episode)]={watched:!!watched,changed:Date.now()};
  var keys=Object.keys(all);if(keys.length>1500){keys.sort(function(a,b){return Number(all[a]&&all[a].changed||0)-Number(all[b]&&all[b].changed||0);});
   keys.slice(0,keys.length-1200).forEach(function(k){delete all[k];});}
  if(writeShared('watched_episodes',all))state.watchedMarks++;
 }
 function formatTime(seconds){var n=Math.max(0,Math.floor(Number(seconds)||0)),h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;
  function two(x){return (x<10?'0':'')+x;}return h?h+':'+two(m)+':'+two(s):two(m)+':'+two(s);}
 function findSubtree(el,cls){return el&&el.querySelector?el.querySelector('.'+cls):null;}
 function setText(node,value){if(node&&node.textContent!==String(value))node.textContent=String(value);}
 function toggleCss(node,name,on){if(!node)return;
  if(node.classList){if(on)node.classList.add(name);else node.classList.remove(name);}
  else{var classes=String(node.className||'').split(/\s+/).filter(Boolean),i=classes.indexOf(name);
   if(on&&i<0)classes.push(name);if(!on&&i>=0)classes.splice(i,1);node.className=classes.join(' ');}}
 function updateEpisodeStatus(ep){if(!ep||!ep._node)return;
  var row=ep._node,card=currentCard(),seen=watchedStatus(card,ep.season,ep.episode),
   progress=timelineFor(card,ep.season,ep.episode);
  var pct=progress?Math.max(0,Math.min(100,Number(progress.percent)||0)):0;
  var valid=progress&&isFinite(progress.duration)&&progress.duration>0&&isFinite(progress.time)&&progress.time>=0;
  toggleCss(row,'ms-episode-seen',seen);
  var toggle=findSubtree(row,'ms-watched-toggle');
  setText(toggle,seen?'✓ Переглянуто':'○ Позначити');
  if(toggle)toggle.setAttribute('aria-label',seen?'Зняти позначку перегляду':'Позначити переглянутим');
  var display=findSubtree(row,'ms-episode-progress');
  if(display){var show=pct>0&&(seen||valid);display.style.display=show?'':'none';
   var fill=findSubtree(row,'ms-episode-progress-fill');if(fill)fill.style.width=pct+'%';
   setText(findSubtree(row,'ms-episode-progress-label'),seen&&pct>=95?'Переглянуто':
    valid?'Продовжити з '+formatTime(progress.time)+' • '+Math.round(pct)+'%':'');}
  state.progressRefreshed++;
 }
 function refreshVisibleEpisodes(){if(!series||series.phase!=='episodes')return;
  series.episodes.forEach(function(ep){if(ep.season===series.season)updateEpisodeStatus(ep);});}
 function normalizeTmdbRecords(items){return (Array.isArray(items)?items:[]).filter(function(it){return it&&Number(it.episode_number)>0;}).map(function(it){return {
  episode_number:Number(it.episode_number),name:clean(it.name).slice(0,140),overview:clean(it.overview).slice(0,600),
  still_path:/^\/[a-z0-9_\/-]+\.(?:jpe?g|png|webp)$/i.test(String(it.still_path||''))?it.still_path:'',
  air_date:/^\d{4}-\d{2}-\d{2}$/.test(String(it.air_date||''))?it.air_date:'',
  runtime:Number(it.runtime)>0&&Number(it.runtime)<240?Number(it.runtime):0};}).slice(0,200);}
 function seasonMetadata(card,season){var id=tmdbId(card),l=root.Lampa;if(!id)return Promise.resolve([]);
  var cacheKey=id+':'+season,all=readShared('tmdb_episode_metadata_121',{}),saved=all&&all[cacheKey];
  if(saved&&Array.isArray(saved.episodes)&&Date.now()-Number(saved.updated||0)<21*86400000){
   state.metadataStatus='cache';state.metadataRecords=saved.episodes.length;state.metadataSeason=season;return Promise.resolve(normalizeTmdbRecords(saved.episodes));}
  if(tmdbPending[cacheKey])return tmdbPending[cacheKey];
  if(!l||!l.Api||!l.Api.sources||!l.Api.sources.tmdb||typeof l.Api.sources.tmdb.get!=='function'){
   state.metadataStatus='unavailable';return Promise.resolve(saved?normalizeTmdbRecords(saved.episodes):[]);}
  function ask(lang){return new Promise(function(resolve){var done=false,timer=0;
   function finish(data){if(done)return;done=true;if(timer&&root.clearTimeout)root.clearTimeout(timer);
    resolve(normalizeTmdbRecords(data&&data.episodes));}
   if(root.setTimeout)timer=root.setTimeout(function(){finish(null);},7500);
   try{l.Api.sources.tmdb.get('tv/'+id+'/season/'+season,{langs:lang},finish,function(){finish(null);});}catch(_){finish(null);}
  });}
  state.metadataStatus='requesting';state.metadataSeason=season;
  tmdbPending[cacheKey]=ask('uk-UA').then(function(uk){
   var sufficient=uk.length&&uk.every(function(r){return !!(r.still_path&&r.name&&r.overview);});
   if(sufficient)return uk;
   return ask('en-US').then(function(en){var merged={};
    en.forEach(function(r){merged[r.episode_number]=r;});
    uk.forEach(function(r){var old=merged[r.episode_number]||{};merged[r.episode_number]={
     episode_number:r.episode_number,name:r.name||old.name||'',overview:r.overview||old.overview||'',
     still_path:r.still_path||old.still_path||'',air_date:r.air_date||old.air_date||'',runtime:r.runtime||old.runtime||0};});
    return Object.keys(merged).map(function(n){return merged[n];});});
  }).then(function(data){
   state.metadataRecords=data.length;state.metadataStatus=data.length?'loaded':'unavailable';
   if(data.length){var shared=readShared('tmdb_episode_metadata_121',{});if(!shared||typeof shared!=='object')shared={};
    shared[cacheKey]={updated:Date.now(),episodes:data};writeShared('tmdb_episode_metadata_121',shared);}
   else if(saved&&saved.episodes)return normalizeTmdbRecords(saved.episodes);
   return data;
  },function(){state.metadataStatus='unavailable';return saved?normalizeTmdbRecords(saved.episodes):[];});
  return tmdbPending[cacheKey];
 }
 function applyTmdbData(episodes,records){if(!series||series.phase!=='episodes'||!records||!records.length)return;
  var map={};records.forEach(function(rec){map[rec.episode_number]=rec;});
  episodes.forEach(function(ep){if(ep.season!==series.season||!ep._node)return;
   var rec=map[ep.episode];if(!rec)return;
   var row=ep._node,name=findSubtree(row,'ms-episode-name'),voice=findSubtree(row,'ms-episode-voice');
   if(rec.name&&!/^episode\s+\d+$/i.test(rec.name)&&!/^серія\s+\d+$/i.test(rec.name))setText(name,rec.name);
   if(rec.still_path){var thumb=findSubtree(row,'ms-episode-thumb'),img=null;
    if(thumb){img=element('img','ms-tmdb-still');img.alt='';thumb.insertBefore(img,thumb.firstChild||null);
     img.onload=function(){var source=findSubtree(thumb,'ms-source-still');if(source&&source.parentNode)source.parentNode.removeChild(source);};
     img.onerror=function(){if(img.parentNode)img.parentNode.removeChild(img);};
     img.src='https://image.tmdb.org/t/p/w300'+rec.still_path;}}
   if(voice){var parts=[];if(rec.air_date){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(rec.air_date);
     parts.push(m?m[3]+'.'+m[2]+'.'+m[1]:rec.air_date);}
    if(rec.runtime)parts.push(rec.runtime+' хв');
    if(parts.length)setText(voice,parts.join(' • '));}
   var desc=findSubtree(row,'ms-episode-description');if(desc){setText(desc,rec.overview);
    desc.style.display=rec.overview?'':'none';}
  });}
 function decorateSeason(season){if(!series||series.phase!=='episodes')return;
  var activeSession=series.token,episodes=series.episodes,card=currentCard();
  seasonMetadata(card,season).then(function(records){if(series&&series.token===activeSession&&series.phase==='episodes'&&series.season===season)
   applyTmdbData(episodes,records);});
 }
 function element(tag,cls,text){var e=root.document.createElement(tag);if(cls)e.className=cls;
  if(text!=null)e.textContent=String(text);return e;}
 var pendingFocusKey='',lastUiAction=0;
 function activeButton(label,sub,cls,fn,disabled,key){
  var el=element('div',(cls||'ms-row')+(disabled?'':' selector'));
  if(key)el.setAttribute('data-ms-focus-key',key);
  el.setAttribute('role','button');el.setAttribute('tabindex',disabled?'-1':'0');
  if(disabled){el.setAttribute('aria-disabled','true');return el;}
  var click=function(e){if(e){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();}
   if(Date.now()-lastUiAction<170)return;lastUiAction=Date.now();
   pendingFocusKey=key||'';fn();};
  el.addEventListener('click',click);
  el.addEventListener('keydown',function(e){if(e&&(e.key==='Enter'||e.key===' ')){click(e);}});
  if(typeof root.$==='function')try{root.$(el).on('hover:enter',click);}catch(_){ }
  return el;
 }
 function episodeCard(ep){
  var key='episode:'+ep.season+':'+ep.episode;
  // Use the SAME layout classes and child structure as the upstream MultiSource 1.3.15 UASerials renderer.
  var row=activeButton('','','ms-row ms-episode-card ms-s139-episode-card',function(){openEpisode(ep);},ep.upcoming,key);
  row.setAttribute('aria-label','Сезон '+ep.season+', серія '+ep.episode+', '+ep.title+(ep.upcoming?', очікується':''));
  var thumb=element('div','ms-episode-thumb'),img=artFor(ep);
  if(img){var photo=element('img','ms-tmdb-still ms-source-still');photo.src=img;photo.alt='';
   photo.onerror=function(){if(photo.parentNode)photo.parentNode.removeChild(photo);};thumb.appendChild(photo);}
  thumb.appendChild(element('span','ms-episode-thumb-index',ep.episode));
  thumb.appendChild(element('span','ms-episode-thumb-play',ep.upcoming?'◷':'▶'));
  var copy=element('div','ms-episode-copy');
  copy.appendChild(element('div','ms-episode-number','Сезон '+ep.season+'  •  Серія '+ep.episode));
  var title=clean(ep.title),isGeneric=!title||/^серія\s*\d+$/i.test(title);
  copy.appendChild(element('div','ms-episode-name',isGeneric?'Серія '+ep.episode:title));
  copy.appendChild(element('div','ms-episode-voice',ep.upcoming?'Очікується':'UAFix · Натисніть для відтворення'));
  var desc=element('div','ms-episode-description');desc.style.display='none';copy.appendChild(desc);
  var progress=element('div','ms-episode-progress');
  var track=element('div','ms-episode-progress-track');track.appendChild(element('div','ms-episode-progress-fill'));
  progress.appendChild(track);progress.appendChild(element('div','ms-episode-progress-label'));copy.appendChild(progress);
  row.appendChild(thumb);row.appendChild(copy);
  if(!ep.upcoming){var marker=activeButton('','','ms-watched-toggle',function(){
    var card=currentCard();markWatched(card,ep.season,ep.episode,!watchedStatus(card,ep.season,ep.episode));
    updateEpisodeStatus(ep);
   },false,'watch:'+ep.season+':'+ep.episode);
   marker.setAttribute('aria-label','Позначити серію переглянутою');row.appendChild(marker);
  }
  ep._node=row;updateEpisodeStatus(ep);return row;
 }
 function streamCard(s,i){
  var key='stream:'+i,card=activeButton('','','ms-row ms-s138-stream-card ms-d135-video-card',function(){launchStream(i);},false,key);
  card.setAttribute('aria-label','Відтворити '+s.provider+', '+format(s.url));
  var art=element('div','ms-d135-card-art');art.appendChild(element('span','ms-d135-play-glyph','▶'));
  var copy=element('div','ms-d135-card-info');copy.appendChild(element('div','ms-d135-card-provider',s.provider));
  copy.appendChild(element('div','ms-row-title',clean(s.title)||'Потік '+(i+1)));
  copy.appendChild(element('div','ms-row-info',s.voice));
  copy.appendChild(element('span','ms-d135-card-format',format(s.url)));
  copy.appendChild(element('div','ms-d135-card-action','▶ Дивитися'));
  card.appendChild(art);card.appendChild(copy);return card;
 }
 function panelContent(){if(!series)return null;
  var box=element('section','ms-s138-panel ms-s139-core-episode-layout');
  var head=element('div','ms-row ms-section ms-s138-head');
  head.appendChild(element('div','ms-row-title',series.phase==='episodes'?'Оберіть серію':'Оберіть варіант перегляду'));
  head.appendChild(element('div','ms-row-info',series.title||'UAFix · Серіали'));box.appendChild(head);
  if(series.phase==='episodes'){
   var seasons={},active=series.season;
   series.episodes.forEach(function(e){seasons[e.season]=true;});
   var tabs=element('div','ms-s138-seasons ms-episode-nav');Object.keys(seasons).sort(function(a,b){return +a-+b;}).forEach(function(v){
    var sn=+v,row=activeButton('','','ms-episode-nav-button ms-s138-season'+(active===sn?' ms-s138-active':''),function(){
     if(series){series.season=sn;state.selectedSeason=sn;pendingFocusKey='season:'+sn;schedule();}},false,'season:'+sn);
    row.textContent='Сезон '+sn;
    if(active===sn)row.setAttribute('aria-current','true');tabs.appendChild(row);
   });box.appendChild(tabs);
   var grid=element('div','ms-s138-episode-grid ms-s139-episode-list');var count=0;
   series.episodes.forEach(function(ep){if(ep.season!==active)return;count++;grid.appendChild(episodeCard(ep));});
   box.appendChild(grid);state.renderedEpisodes=count;
  }else{
   var back=activeButton('','','ms-row ms-action ms-s138-back',function(){
    series.phase='episodes';series.streams=[];state.ui='episodes';state.renderedStreams=0;
    pendingFocusKey='episode:'+series.episode.season+':'+series.episode.episode;schedule();},false,'back');
   back.appendChild(element('div','ms-row-title','← Назад до серій'));box.appendChild(back);
   var ep=series.episode;box.appendChild(element('div','ms-s138-subtitle',ep?
    'Сезон '+ep.season+' · Серія '+ep.episode+(ep.title?' — '+ep.title:''):''));
   if(series.phase==='loading')box.appendChild(element('div','ms-s138-notice','Завантаження потоків епізоду…'));
   if(series.phase==='error')box.appendChild(element('div','ms-s138-notice',state.lastNotice));
   if(series.phase==='streams'){
    var streams=element('div','ms-s138-stream-grid');series.streams.forEach(function(s,i){streams.appendChild(streamCard(s,i));});
    box.appendChild(streams);state.renderedStreams=series.streams.length;
   }
  }
  return box;
 }
 function draw(){if(!root.document)return false;
  var view=root.document.querySelector('.ms-scroll-viewport');
  if(!series||!selectedUafix()){
   if(series&&!selectedUafix()){reset();return false;}
   var gone=root.document.querySelector('.ms-s138-panel');
   if(gone&&gone.parentNode)gone.parentNode.removeChild(gone);
   if(view&&view.classList)view.classList.remove('ms-s138-series-mode');return false;
  }
  var active=root.Lampa&&root.Lampa.Activity&&root.Lampa.Activity.active&&root.Lampa.Activity.active();
  var component=active&&(active.component||active.object&&active.object.component);
  if(component&&component!=='multi_source_online_v1')return false;
  var list=view&&view.querySelector('.ms-list');if(!list)return false;
  var old=list.querySelector('.ms-s138-panel');
  var fingerprint=series.token+':'+series.phase+':'+series.season+':'+
   (series.episode&&series.episode.episode||0)+':'+series.streams.length+':'+state.lastNotice;
  if(old&&old.getAttribute('data-ms-render')===fingerprint)return true;
  var focusKey=pendingFocusKey;
  if(!focusKey&&old&&root.document.activeElement&&old.contains&&old.contains(root.document.activeElement)){
   focusKey=root.document.activeElement.getAttribute&&root.document.activeElement.getAttribute('data-ms-focus-key')||focusKey;
  }
  if(old&&old.parentNode)old.parentNode.removeChild(old);
  var content=panelContent();if(!content)return false;
  content.setAttribute('data-ms-render',fingerprint);
  list.insertBefore(content,list.firstChild);
  if(view.classList)view.classList.add('ms-s138-series-mode');
  if(focusKey&&content.querySelector){
   var node=content.querySelector('[data-ms-focus-key="'+focusKey+'"]');
   if(node){try{if(root.Lampa&&root.Lampa.Controller&&root.Lampa.Controller.collectionFocus)
    root.Lampa.Controller.collectionFocus(node,view);}catch(_){ }
    try{if(typeof node.focus==='function')node.focus();}catch(_){ }}
  }
  pendingFocusKey='';if(series.phase==='episodes')decorateSeason(series.season);return true;
 }
 function schedule(){if(drawTimer||!root.setTimeout)return;drawTimer=root.setTimeout(function(){drawTimer=null;draw();},80);}
 // For a TV episode, one card action resolves public candidates and launches a stream.
 // Keep the stream-card screen as an emergency fallback only if Player.play fails.
 function defaultStreamIndex(streams){
  for(var i=0;i<streams.length;i++)if(streams[i].provider==='Zetvideo')return i;
  for(var j=0;j<streams.length;j++)if(streams[j].provider==='Ashdi')return j;
  return 0;
 }
 function openEpisode(ep){if(!series||ep.upcoming)return;var key=series.token,request=series.requestId=(series.requestId||0)+1;
  series.episode=ep;series.streams=[];series.phase='loading';state.ui='loading';state.lastError='';pendingFocusKey='episode:'+ep.season+':'+ep.episode;
  state.autoLaunchStatus='resolving';state.autoLaunchProvider='';
  state.playerFrames=0;state.playerRequests=0;state.playerResponses=0;state.streamsFound=0;schedule();
  resolveEpisode(ep).then(function(streams){if(!series||series.token!==key||series.requestId!==request)return;
   series.streams=streams;
   if(!streams.length){series.phase='error';state.ui='error';state.autoLaunchStatus='no-stream';schedule();return;}
   var chosen=defaultStreamIndex(streams);state.autoLaunchAttempts++;state.autoLaunchProvider=streams[chosen].provider;
   // launchStream reuses the verified movie/episode Lampa.Player integration and Timeline identity.
   series.phase='streams';state.ui='auto-launching';
   if(launchStream(chosen)){
    state.autoLaunchSuccess++;state.autoLaunchStatus='player-invoked';
    // Return directly to the episode list when the player closes; no intermediate provider cards.
    series.phase='episodes';series.streams=[];state.renderedStreams=0;
    pendingFocusKey='episode:'+ep.season+':'+ep.episode;
   }else{
    state.autoLaunchFailures++;state.autoLaunchStatus='manual-fallback';
    series.phase='streams';state.ui='streams';pendingFocusKey='stream:'+chosen;schedule();
   }
  },function(e){if(!series||series.token!==key||series.requestId!==request)return;state.lastError=errorText(e);
   state.autoLaunchStatus='resolver-error';state.lastNotice='Не вдалося отримати сторінку епізоду.';
   series.phase='error';state.ui='error';schedule();});}
 function launchStream(index){if(!series||series.phase!=='streams'||!selectedUafix())return false;
  var s=series.streams[index],l=root.Lampa;if(!s||!l||!l.Player||typeof l.Player.play!=='function')return false;
  if(Date.now()-lastLaunch<450)return false;lastLaunch=Date.now();
  var ep=series.episode,card=currentCard(),timeline=timelineFor(card,ep.season,ep.episode),title=clean(card.title||card.name||series.title||'Серіал')+
   ' · S'+String(ep.season).padStart(2,'0')+'E'+String(ep.episode).padStart(2,'0')+' · '+s.provider;
  // Separate season and episode fields preserve series identity. Do not reuse movie timeline hashes.
  var play={url:s.url,title:title,season:ep.season,episode:ep.episode,voice_name:s.voice,
   isonline:true,card:card,timeline:timeline,_msTimeline:!!timeline};if(s.headers)play.headers=s.headers;if(s.subtitles)play.subtitles=s.subtitles;
  var entry={};Object.keys(play).forEach(function(k){entry[k]=play[k];});play.playlist=[entry];
  try{l.Player.play(play);if(typeof l.Player.playlist==='function')l.Player.playlist([entry]);
   state.launches++;state.playerInvoked=true;state.timelineAttached=!!timeline;
   currentPlayedEpisode={season:ep.season,episode:ep.episode};state.lastProvider=s.provider;state.lastFormat=format(s.url);
   state.ui='player-invoked';if(root.MultiSourceD13&&typeof root.MultiSourceD13._traceLaunch==='function')
    root.MultiSourceD13._traceLaunch(s.provider,s.url);
   if(card&&card.id&&l.Favorite&&typeof l.Favorite.add==='function')l.Favorite.add('history',card,100);
   return true;
  }catch(e){state.lastError=errorText(e);state.ui='player-error';return false;}
 }
 function reset(){session++;series=null;state.ui='idle';state.renderedEpisodes=0;state.renderedStreams=0;
  try{var p=root.document&&root.document.querySelector('.ms-s138-panel');if(p&&p.parentNode)p.parentNode.removeChild(p);
   var view=root.document&&root.document.querySelector('.ms-scroll-viewport');if(view&&view.classList)view.classList.remove('ms-s138-series-mode');}catch(_){} }
 function onCatalog(item,original,owner,ctx){var url=safeUrl(item&&item.url,undefined,firstParty);
  if(!url||!matchesCatalog(url))return original.call(owner,item,ctx);
  reset();var token=++session;state.stage='catalog-loading';state.lastError='';
  return loadCatalog(url).then(function(episodes){if(token!==session)return {streams:[],embeds:[],notice:'Вибір серій скасовано.'};
   if(!episodes.length){state.stage='no-episode-links';return original.call(owner,item,ctx);}
   series={token:token,card:movie(),title:clean(item&&item.title)||'Серіал',base:url,episodes:episodes,
    season:episodes[0].season,episode:null,phase:'episodes',streams:[]};
   state.selectedSeason=series.season;state.selectedEpisode=0;state.stage='episodes-ready';state.ui='episodes';state.cardLayout='core-ms-episode-card';
   // Leave the upstream view responsible for its own toolbar/back navigation.
   schedule();return {streams:[],embeds:[],pageUrl:url,notice:'Виберіть сезон і серію в картках UAFix.'};
  },function(e){state.lastError=errorText(e);state.stage='catalog-error';return original.call(owner,item,ctx);});}
 function installStyle(){var d=root.document;if(!d||!d.head||d.getElementById('ms-s139-style'))return;
  var s=element('style');s.id='ms-s139-style';s.textContent=
   // Core v1.3.15 owns the ms-row/ms-episode-card/ms-episode-thumb/voice/progress style.
   '.ms-scroll-viewport.ms-s138-series-mode .ms-list> .ms-row:not(.ms-s138-panel),'+
   '.ms-scroll-viewport.ms-s138-series-mode .ms-list> .ms-result-card:not(.ms-s138-panel){display:none!important}'+
   '.ms-s138-panel{display:block;margin:0 0 1rem;padding:0;background:transparent;color:inherit;min-width:0}'+
   '.ms-s138-head{margin:.3rem 0 .55rem;padding:.8rem 1rem}'+
   '.ms-s138-seasons{display:flex;gap:.45em;flex-wrap:wrap;margin:.5em 0 .9em}'+
   '.ms-s138-season.ms-s138-active{border:1px solid #76b9f2;font-weight:700}'+
   '.ms-s139-episode-list{display:block;margin:.3em 0 .9em}'+
   '.ms-s139-episode-card.ms-row{width:100%;max-width:100%;box-sizing:border-box;min-width:0;min-height:6.3em}'+
   '.ms-s139-episode-card[aria-disabled="true"]{opacity:.55;cursor:default}'+
   '.ms-s139-episode-card .ms-episode-thumb{aspect-ratio:16/9}'+
   '.ms-s139-episode-card .ms-episode-thumb img{width:100%;height:100%;object-fit:cover}'+
   '.ms-s139-episode-card .ms-episode-description[style*="none"]{display:none}'+
   '.ms-s138-stream-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7em;margin:.7em 0 1em}'+
   '.ms-s138-stream-card{box-sizing:border-box;min-width:0;width:100%;padding:.8em;display:flex!important;gap:.85em;align-items:center;cursor:pointer;min-height:8em}'+
   '.ms-s138-stream-card .ms-d135-card-art{position:relative;flex:0 0 5.7em;aspect-ratio:2/3;display:flex;align-items:center;justify-content:center;background:#253143;border-radius:.4em}'+
   '.ms-s138-stream-card .ms-d135-card-info{display:flex;flex:1;min-width:0;flex-direction:column;gap:.3em}'+
   '.ms-s138-stream-card .ms-d135-play-glyph{font-size:1.2em}'+
   '.ms-s138-subtitle,.ms-s138-notice{padding:.7em .9em}'+
   '.ms-s138-back{cursor:pointer;margin:.5em 0}'+
   '.ms-s138-panel .selector.focus,.ms-s138-panel .selector:focus{outline:2px solid #fff;outline-offset:2px}'+
   '@media(max-width:850px){.ms-s138-stream-grid{grid-template-columns:minmax(0,1fr)}}';
  d.head.appendChild(s);
 }
 function diagnostic(){return {version:state.version,installed:state.installed,stage:state.stage,
  catalogRequests:state.catalogRequests,catalogResponses:state.catalogResponses,seasonRequests:state.seasonRequests,
  seasonsFound:state.seasonsFound,episodesFound:state.episodesFound,renderedEpisodes:state.renderedEpisodes,
  selectedSeason:state.selectedSeason,selectedEpisode:state.selectedEpisode,episodeRequests:state.episodeRequests,
  episodeResponses:state.episodeResponses,playerFrames:state.playerFrames,playerRequests:state.playerRequests,
  playerResponses:state.playerResponses,streamsFound:state.streamsFound,renderedStreams:state.renderedStreams,
  launches:state.launches,lastProvider:state.lastProvider,lastFormat:state.lastFormat,lastError:state.lastError,
  lastNotice:state.lastNotice,ui:state.ui,playerInvoked:state.playerInvoked,baseVersion:state.baseVersion,
  autoLaunchAttempts:state.autoLaunchAttempts,autoLaunchSuccess:state.autoLaunchSuccess,autoLaunchFailures:state.autoLaunchFailures,
  autoLaunchProvider:state.autoLaunchProvider,autoLaunchStatus:state.autoLaunchStatus,cardLayout:state.cardLayout,timelineAttached:state.timelineAttached,watchedMarks:state.watchedMarks,metadataSeason:state.metadataSeason,metadataStatus:state.metadataStatus,metadataRecords:state.metadataRecords,progressRefreshed:state.progressRefreshed};}
 function attachDiagnostic(){var s=root.MultiSourceSources1315b;if(!s||!s.diagnostic||s.diagnostic._msSeriesD139)return;
  var before=s.diagnostic;s.diagnostic=function(){var d=before.apply(this,arguments);if(d){if(!d.lastDetailEvidence)d.lastDetailEvidence={};
   var e=d.lastDetailEvidence;if(!e.sourceExpansionD13)e.sourceExpansionD13={};e.sourceExpansionD13.series=diagnostic();}
   return d;};s.diagnostic._msSeriesD139=true;}
 function install(){var api=root.LampaMultiSource,base=root.MultiSourceD13;
  if(!api||!api._coreLoaded||typeof api.listSources!=='function'||typeof api.registerSource!=='function'||
   !base||!base.installed)return false;
  var list=api.listSources()||[],src=null;
  for(var i=0;i<list.length;i++)if(list[i]&&list[i].id==='uafix'){src=list[i];break;}
  if(!src||typeof src.getStreams!=='function'||typeof src.search!=='function')return false;
  if(src.getStreams._msSeriesD139){state.installed=true;state.stage='already-patched';return true;}
  var original=src.getStreams,copy={};Object.keys(src).forEach(function(k){copy[k]=src[k];});
  copy.getStreams=function(item,ctx){return onCatalog(item,original,src,ctx);};copy.getStreams._msSeriesD139=true;
  var oldSearch=src.search;copy.search=function(movie,ctx){reset();return oldSearch.call(src,movie,ctx);};
  api.registerSource(copy);registry=copy;state.installed=true;state.stage='ready';state.baseVersion=clean(base.version);
  installStyle();attachDiagnostic();
  try{var pl=root.Lampa&&root.Lampa.Player;if(pl&&pl.listener&&typeof pl.listener.follow==='function')
   pl.listener.follow('close',function(){if(root.setTimeout)root.setTimeout(function(){schedule();refreshVisibleEpisodes();},330);});}catch(_){ }
  if(root.MutationObserver&&root.document&&root.document.body){observer=new root.MutationObserver(function(){schedule();});
   observer.observe(root.document.body,{childList:true,subtree:true});}
  return true;
 }
 root.MultiSourceUafixSeriesD139={version:VERSION,install:install,diagnostic:diagnostic,
  _test:{parseListing:parseListing,matchesCatalog:matchesCatalog,media:media,detectPlayerHtml:detectPlayerHtml,
   uniqueEpisodes:uniqueEpisodes,resolveEpisode:resolveEpisode,loadCatalog:loadCatalog,onCatalog:onCatalog,
   openEpisode:openEpisode,launchStream:launchStream,defaultStreamIndex:defaultStreamIndex,render:draw,reset:reset,
   timelineFor:timelineFor,watchedStatus:watchedStatus,markWatched:markWatched,
   seasonMetadata:seasonMetadata,refreshVisibleEpisodes:refreshVisibleEpisodes}};
 if(!install()&&root.setInterval){var attempts=0;installTimer=root.setInterval(function(){
  if(install()||++attempts>100){root.clearInterval(installTimer);if(!state.installed)state.stage='core-timeout';}
 },350);}
})(window);
/* MultiSource DubStudio.party discovery adapter — experimental, 2026-11-23.
 * Requires main MultiSource 1.3.15d.13.9 and its LampaMultiSource API.
 * Public catalog and same-origin HTML only; no private API guesses, iframe playback,
 * credentials, DRM bypass, media relay, or recording of signed media addresses.
 */
(function(root){
 'use strict';
 if(root.MultiSourceDubStudio1315 && root.MultiSourceDubStudio1315.installed)return;
 var VERSION='1.3.15d.13.9-dubstudio-test.5',ID='dubstudio',ORIGIN='https://dubstudio.party';
 var st={version:VERSION,installed:false,stage:'waiting-core',transport:'',requests:0,successes:0,failures:0,
  lastStatus:0,lastError:'',searchPages:0,searchCards:0,matchedCandidates:0,verified:0,
  imdbIdUsed:false,detailRequests:0,detailHtmlBytes:0,playerTags:0,publicMediaCandidates:0,
  streams:0,reason:'',diagnosticHook:'waiting',diagnosticRepairs:0,pageFingerprint:{stage:'idle',scriptTags:0,externalScripts:0,sameOriginScripts:0,thirdPartyScripts:0,inlineScripts:0,moduleScripts:0,clientHydration:false,framework:'unknown',iframeTags:0,mediaTags:0,mediaLiteralHints:0,seasonTextHint:false,episodeTextHint:false,playerMountHint:false},policy:'public-first-party-html-only; direct-public-media-only; no iframe playback, auth bypass or media relay'};
 var timer=0,attempts=0;
 st.transportAttempts=[];st.transportCapabilities={};st.lastFailureStatus=0;st.contentType='unknown';st.metadata={};st.operation=0;
 st.versions={core:'1.3.15',base:'1.3.15d.13.9',adapter:VERSION,diagnostic:'dubstudio-5'};
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
 function httpStatus(e){var n=Number(e&&(e.status||e.httpStatus||e.statusCode)||0);return n>=100&&n<=599?n:0;}
 function fault(code,status){var e=Error(code);e.status=status||0;return e;}
 function capabilities(ctx){var l=root.Lampa||{},platform=l.Platform,android=false,webos=false,bridge=!!root.AndroidJS;
  try{if(platform&&typeof platform.is==='function'){android=!!(platform.is('android')||platform.is('android_tv'));webos=!!platform.is('webos');}}catch(_){}
  try{bridge=bridge||!!(l.Android&&l.Android.enabled===true);}catch(_){}
  return {platform:android||bridge?'android':webos?'webos':root.document?'web-runtime':'unknown',androidBridge:bridge,
   androidPlatform:android,fetchAvailable:typeof root.fetch==='function',lampaRequestAvailable:typeof l.Reguest==='function',
   coreRequestAvailable:!!(ctx&&typeof ctx.request==='function'),nativeEligible:android||bridge,workerUsed:false};}
 function classify(e){var status=httpStatus(e),msg=String(e&&e.message||'');
  if(status===401||status===403||/access-denied|challenge/i.test(msg))return 'access-restricted';
  if(status===429)return 'rate-limited';if(status)return 'http-error';
  if(/timeout|AbortError/i.test(msg))return 'timeout';
  if(/invalid-html|html-unavailable/i.test(msg))return 'invalid-html';
  if(/unavailable/i.test(msg))return 'transport-unavailable';
  return 'network-or-cors';}
 function getText(url,ctx){var safe=sameOrigin(url);if(!safe)return Promise.reject(fault('unapproved-source-url'));
  var op=st.operation,cap=capabilities(ctx),l=root.Lampa||{},reg=l.Reguest;st.transportCapabilities=cap;st.requests++;
  var kind=/\/movie\//.test(safe)?'detail':'catalog';
  function record(mode,started,e,status,body){if(op!==st.operation)return;
   st.transportAttempts.push({transport:mode,kind:kind,ok:!e,httpStatus:status||httpStatus(e),elapsedMs:Date.now()-started,
    bytes:body?body.length:0,outcome:e?classify(e):'html-received',error:e?errText(e):''});
   if(st.transportAttempts.length>40)st.transportAttempts.shift();if(e)st.lastFailureStatus=httpStatus(e);}
  function check(h){if(/<title[^>]*>\s*(?:Just a moment|Access denied|Attention required)/i.test(h))throw fault('access-denied-or-challenge');
   if(!htmlOkay(h))throw fault('invalid-html');return h;}
  function bounded(fn){return new Promise(function(resolve,reject){var ended=false,tm=0;
   function done(e,v){if(ended)return;ended=true;if(tm)root.clearTimeout(tm);e?reject(e):resolve(v);}
   if(root.setTimeout)tm=root.setTimeout(function(){done(fault('timeout'));},11500);
   try{fn(done);}catch(e){done(e);}});}
  function via(mode){return bounded(function(done){
   if(mode==='fetch'){
    var ctl=typeof root.AbortController==='function'?new root.AbortController():null, abortTimer=ctl&&root.setTimeout?root.setTimeout(function(){ctl.abort();},10500):0;
    var opts={method:'GET',mode:'cors',credentials:'omit',redirect:'error'};if(ctl)opts.signal=ctl.signal;
    Promise.resolve().then(function(){return root.fetch(safe,opts);}).then(function(r){if(!r||r.type==='opaque')throw fault('network-or-cors');
     if(!r.ok)throw fault('HTTP '+r.status,r.status);return r.text().then(function(h){return {html:check(h),status:r.status};});
    }).then(function(v){if(abortTimer)root.clearTimeout(abortTimer);done(null,v);},function(e){if(abortTimer)root.clearTimeout(abortTimer);done(e);});return;
   }
   if(mode==='core'){Promise.resolve().then(function(){return ctx.request(safe);}).then(function(v){done(null,{html:check(asText(v)),status:httpStatus(v)});}).catch(done);return;}
   if(typeof reg!=='function')return done(fault('lampa-unavailable'));
   var req=new reg();if(typeof req[mode]!=='function')return done(fault(mode+'-unavailable'));
   if(req.timeout)req.timeout(10500);
   req[mode](safe,function(p){try{done(null,{html:check(asText(p)),status:httpStatus(p)});}catch(e){done(e);}},
    function(e){done(fault(errText(e&& (e.message||e.statusText)||'request-failed'),httpStatus(e)));},false,{dataType:'text'});
  });}
  var modes=[];if(cap.nativeEligible&&cap.lampaRequestAvailable)modes.push('native');
  if(cap.fetchAvailable)modes.push('fetch');if(cap.lampaRequestAvailable)modes.push('silent');if(cap.coreRequestAvailable)modes.push('core');
  function next(i,previous){if(i>=modes.length)return Promise.reject(previous||fault('transport-unavailable'));
   var mode=modes[i],started=Date.now();return via(mode).then(function(v){record(mode,started,null,v.status,v.html);
    if(op===st.operation){st.transport=mode;st.successes++;st.lastStatus=v.status;st.lastError='';}return v.html;
   },function(e){record(mode,started,e);var outcome=classify(e);
    if(outcome==='access-restricted'||outcome==='rate-limited')throw e;return next(i+1,e);});}
  return next(0).catch(function(e){if(op===st.operation){st.failures++;st.lastStatus=httpStatus(e);st.lastError=errText(e);}throw e;});
 }
 function resetEvidence(){st.operation++;st.transport='';st.requests=0;st.successes=0;st.failures=0;st.lastStatus=0;st.lastFailureStatus=0;
  st.transportAttempts=[];st.lastError='';st.detailHtmlBytes=0;st.playerTags=0;st.publicMediaCandidates=0;st.streams=0;
  st.pageFingerprint={stage:'idle'};st.metadata={stage:'idle'};}
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
 function inspectHtml(html){
  var text=String(html||''), f={stage:'inspected',scriptTags:0,externalScripts:0,sameOriginScripts:0,thirdPartyScripts:0,inlineScripts:0,moduleScripts:0,
   clientHydration:false,framework:'unknown',iframeTags:0,mediaTags:0,mediaLiteralHints:0,seasonTextHint:false,episodeTextHint:false,playerMountHint:false};
  var script=/<script\b([^>]*)>/gi,m;
  while((m=script.exec(text))&&f.scriptTags<150){
   f.scriptTags++;var attrs=m[1]||'',src=/\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
   if(src){f.externalScripts++;var u=src[1],host='';
    try{host=new URL(u,ORIGIN).hostname;}catch(_){host='';}
    if(host==='dubstudio.party')f.sameOriginScripts++;else f.thirdPartyScripts++;
   }else f.inlineScripts++;
   if(/\btype\s*=\s*["']module["']/i.test(attrs))f.moduleScripts++;
  }
  f.iframeTags=Math.min(99,(text.match(/<iframe\b/gi)||[]).length);
  f.mediaTags=Math.min(99,(text.match(/<(?:video|source|audio)\b/gi)||[]).length);
  f.mediaLiteralHints=Math.min(99,(text.match(/\.(?:m3u8|mp4|webm|mpd)(?:[?"'\s<]|$)/gi)||[]).length);
  if(/(?:self\.__next_f\.push|__NEXT_DATA__|\/_next\/static\/)/.test(text)){f.framework='nextjs';f.clientHydration=true;}
  else if(/(?:id\s*=\s*["'](?:root|app)["']|data-reactroot|react-dom)/i.test(text)){f.framework='react-like';f.clientHydration=true;}
  f.seasonTextHint=/(?:season\b|сезон)/i.test(text);
  f.episodeTextHint=/(?:episode\b|сері(?:я|ї|й))/i.test(text);
  f.playerMountHint=/(?:id|class|data-testid)\s*=\s*["'][^"']*(?:video-player|player-root|watch-player|media-player)[^"']*["']/i.test(text);
  st.pageFingerprint=f;
  var meta={stage:'inspected',jsonLdScripts:0,validJsonLd:0,nextDataPresent:/id=["']__NEXT_DATA__["']/i.test(text),
   hydrationMarkerCount:Math.min(999,(text.match(/self\.__next_f\.push/g)||[]).length),schemaTypes:[],seasonObjects:0,episodeObjects:0,
   accessTextHint:false,apiIntegration:'not-verified'};
  var ld=/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,part,visited=0;
  function scan(v,depth){if(!v||typeof v!=='object'||depth>8||visited++>2000)return;
   if(Array.isArray(v)){v.slice(0,100).forEach(function(x){scan(x,depth+1);});return;}
   var types=Array.isArray(v['@type'])?v['@type']:[v['@type']];types.forEach(function(t){
    if(typeof t!=='string'||! /^(?:Movie|TVSeries|TVSeason|TVEpisode|VideoObject|CreativeWork|WebPage|BreadcrumbList|Organization|Person|ItemList)$/.test(t))return;
    if(meta.schemaTypes.indexOf(t)<0)meta.schemaTypes.push(t);if(t==='TVSeason')meta.seasonObjects++;if(t==='TVEpisode')meta.episodeObjects++;
   });['@graph','mainEntity','containsSeason','episode','season','hasPart','itemListElement','item'].forEach(function(k){scan(v[k],depth+1);});}
  while((part=ld.exec(text))&&meta.jsonLdScripts<20){if(!/type\s*=\s*["']application\/ld\+json["']/i.test(part[1]))continue;meta.jsonLdScripts++;
   if(part[2].length>200000)continue;try{var obj=JSON.parse(part[2]);meta.validJsonLd++;scan(obj,0);}catch(_){}}
  meta.accessTextHint=/(?:requires login|sign in to watch|увійдіть для перегляду|потрібна авторизація)/i.test(strip(text).slice(0,40000));
  st.metadata=meta;
  return f;
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
 function verify(url,movie,ctx){st.detailRequests++;return getText(url,ctx).then(function(html){st.detailHtmlBytes=html.length;inspectHtml(html);
  var title=detailTitle(html),iid=idFromMovie(movie),urlId=(/\/movie\/(tt\d+)/.exec(url)||[])[1];
  if(iid&&urlId!==iid)return null;
  if(!titleMatches(title,movie))return null;
  st.verified++;return {url:url,title:clean(movie&&(movie.title||movie.name)||title),year:year(title),score:100};},function(){return null;});}
 function search(movie,ctx){resetEvidence();st.contentType=isTv(movie)?'series':'movie';st.stage='search';st.lastError='';st.reason='';st.searchPages=0;st.searchCards=0;st.matchedCandidates=0;st.verified=0;st.detailRequests=0;
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
 function getStreams(item,ctx){st.stage='detail';st.lastError='';st.detailHtmlBytes=0;st.pageFingerprint={stage:'idle'};st.metadata={stage:'idle'};st.streams=0;st.publicMediaCandidates=0;st.playerTags=0;
  var url=pageUrl(item&&item.url);if(!url)return Promise.resolve({streams:[],embeds:[],notice:'Некоректна адреса DubStudio.'});
  return getText(url,ctx).then(function(html){st.detailHtmlBytes=html.length;inspectHtml(html);var streams=directStreams(html);st.streams=streams.length;
   st.stage=streams.length?'direct-candidates':'no-public-direct-media';st.reason=streams.length?'public-media-unverified':st.metadata.accessTextHint?'access-text-hint-unverified':st.pageFingerprint.clientHydration?'client-rendered-player-unverified':'no-public-media-in-html';
   return {streams:streams,embeds:[],pageUrl:url,notice:streams.length?
    'Знайдено відкриті медіаадреси; фактичне відтворення ще не перевірено.':
    'DubStudio: у відкритому HTML не знайдено прямого медіапотоку. Клієнтський плеєр/API ще не підтверджено.'};
  },function(e){st.stage='transport-unavailable';st.reason=classify(e);return {streams:[],embeds:[],pageUrl:url,notice:'DubStudio: сторінка недоступна для прямої перевірки.'};});}
 function diagnostic(){var copy={};Object.keys(st).forEach(function(k){copy[k]=st[k];});
  var registered='unknown';try{if(root.LampaMultiSource&&typeof root.LampaMultiSource.listSources==='function'){
   registered=false;var srcs=root.LampaMultiSource.listSources()||[];for(var i=0;i<srcs.length;i++)if(srcs[i]&&srcs[i].id===ID)registered=true;
  }}catch(_){registered='unknown';}
  copy.adapterLoaded=true;copy.registeredInCore=registered;return copy;}
 // The d.13 source/series wrappers can install after this adapter and replace
 // sourceExpansionD13 with a fresh object. Keep our evidence at the OUTER edge.
 // Reattach on source activity and briefly after boot; never patch other sources.
 function attachDiagnostic(){
  var src=root.MultiSourceSources1315b;
  if(!src||typeof src.diagnostic!=='function'){st.diagnosticHook='waiting-source-diagnostic';return false;}
  if(src.diagnostic._msDubStudio){st.diagnosticHook='attached';return true;}
  var previous=src.diagnostic;
  function wrapped(){var d=previous.apply(this,arguments);if(d){
   if(!d.lastDetailEvidence)d.lastDetailEvidence={};
   if(!d.lastDetailEvidence.sourceExpansionD13)d.lastDetailEvidence.sourceExpansionD13={};
   d.lastDetailEvidence.sourceExpansionD13.dubstudio=diagnostic();
  }return d;}
  wrapped._msDubStudio=true;src.diagnostic=wrapped;
  st.diagnosticHook='attached';st.diagnosticRepairs++;return true;
 }
 function watchDiagnostic(){
  // A few bounded checks cover asynchronous initialization order on Android;
  // source search/getStreams also reattach if another adapter replaces the hook.
  if(!root.document||!root.setTimeout)return;
  var checks=0;
  function tick(){attachDiagnostic();if(++checks<5)root.setTimeout(tick,450);}
  root.setTimeout(tick,450);
 }
 function install(){var api=root.LampaMultiSource;if(!api||!api._coreLoaded||!api.registerSource)return false;
  api.registerSource({id:ID,name:'DubStudio.party (тест)',baseUrl:ORIGIN,isDetail:function(url){return !!pageUrl(url);},
   search:function(movie,ctx){attachDiagnostic();return search(movie,ctx||api).then(function(items){attachDiagnostic();return items;});},
   getStreams:function(item,ctx){attachDiagnostic();return getStreams(item,ctx||api).then(function(result){attachDiagnostic();return result;});}});
  st.installed=true;st.stage='ready';attachDiagnostic();watchDiagnostic();return true;}
 root.MultiSourceDubStudio1315={version:VERSION,installed:false,diagnostic:diagnostic,install:install,refreshDiagnostics:attachDiagnostic,
  _test:{pageUrl:pageUrl,sameOrigin:sameOrigin,extractCatalog:extractCatalog,directStreams:directStreams,
   directMedia:directMedia,detailTitle:detailTitle,titleMatches:titleMatches,idFromMovie:idFromMovie,inspectHtml:inspectHtml,search:search,getStreams:getStreams,getText:getText,capabilities:capabilities,classify:classify}};
 if(install())root.MultiSourceDubStudio1315.installed=true;
 else if(root.setInterval){timer=root.setInterval(function(){if(install()){root.MultiSourceDubStudio1315.installed=true;root.clearInterval(timer);}
  else if(++attempts>100){root.clearInterval(timer);st.stage='core-timeout';}},350);}
})(window);
