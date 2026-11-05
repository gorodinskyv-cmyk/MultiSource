/* MultiSource 1.3.15d.1 UAKino.best TEST — single entrypoint.
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
  var VERSION = '1.3.15d.1-uakinobest-test';
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

/* MultiSource 1.3.15d TEST | UAKino.best public-page adapter (ES5 compatible)
 * - Installs next to the existing core, with NO DOM/UI/player rewrites.
 * - Only requests public HTML, never proxies video or fabricates media addresses.
 * - Original UAKino code serves as parser architecture reference; not dependent on
 *   the UAKino plugin or its private Worker.
 */
(function (root) {
  'use strict';
  if (root.MultiSourceUAKinoBest1315d) return;
  var VERSION = '1.3.15d.1-uakinobest-test';
  var ID = 'uakinobest', HOST = 'https://uakino.best';
  var config = { worker: '', fallback: true };
  var stat = {
    version: VERSION, installed: false, stage: 'waiting-core', disabledLift: false,
    transport: '', requests: 0, successes: 0, errors: 0,
    searchQueries: [], searchRoutes: [], searchCards: 0, candidates: 0, verified: 0,
    lastMovie: '', lastResult: '', lastYear: '', pageAvailable: false,
    directStreams: 0, embeds: 0, playerScripts: 0, playlistEntries: 0,
    rejectedUnsafe: 0, rejectedAds: 0, lastError: '', workerConfigured: false,
    mediaCheckedOnDevice: false, note: 'Потоки з uakino.best не перевірені на реальному пристрої'
  };
  var cache = {}, serial = 0, timer = 0, checks = 0;
  function compact(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function errorText(err) {
    var v = err || {}, code = v.status || v.statusCode || v.code || '';
    var s = typeof v === 'string' ? v : String(v.message || v.statusText || v.error || v.responseText || 'Немає відповіді');
    s = s.replace(/https?:\/\/[^\s\"'<>]+/gi,'[URL]').replace(/\s+/g,' ').slice(0,150);
    return (code ? 'HTTP ' + code + ': ' : '') + s;
  }
  function validUrl(input, base, siteOnly) {
    try {
      var u = new URL(String(input || '').replace(/&amp;/g,'&').trim(), base || HOST + '/');
      if (u.protocol !== 'https:' || !u.hostname || u.port || u.username || u.password || u.href.length > 4000) return '';
      if (siteOnly && !/^(?:www\.)?uakino\.best$/i.test(u.hostname)) return '';
      if (u.hash) u.hash = '';
      return u.href;
    } catch (_) { return ''; }
  }
  function detailUrl(u) {
    var safe = validUrl(u, HOST, true);
    if (!safe) return '';
    try { return /^\/(?:[^?#]*\/)?\d{2,8}-[a-z0-9-]+\.html$/i.test(new URL(safe).pathname) ? safe : ''; }
    catch (_) { return ''; }
  }
  function mediaUrl(text, base) {
    var s = validUrl(text, base, false);
    return s && /\.(?:m3u8|mp4|webm|mpd)(?:[?#]|$)/i.test(s) ? s : '';
  }
  function yearOf(s) { var m = /(?:19|20)\d{2}/.exec(String(s||'')); return m ? m[0] : ''; }
  function titleKey(s) {
    var text = compact(s).replace(/\s*\((?:19|20)\d{2}\)\s*$/,'').replace(/\s+(?:19|20)\d{2}$/,'')
      .replace(/\s+(?:дивитися|смотреть|watch)\s+(?:онлайн|online).*$/i,'')
      .replace(/^\s*(?:фільм|серіал|мультфільм)\s+[«\"“]?/i,'')
      .replace(/[«»"“”ʼ’'`]/g,'').toLowerCase();
    return text.replace(/[^0-9a-z\u00c0-\u024f\u0400-\u04ff]+/g,' ').trim().replace(/\s+/g,' ');
  }
  function namesOf(movie) {
    var arr = [movie && movie.title, movie && movie.name, movie && movie.original_title, movie && movie.original_name];
    var seen = {}, list = [];
    arr.forEach(function(x){ var k=titleKey(x); if(k&&!seen[k]){ seen[k]=true; list.push(k); } });
    return list;
  }
  function titleScore(item, movie) {
    var names = namesOf(movie), variants = [];
    [item.title,item.originalTitle].forEach(function(s){ String(s||'').split(/\s+\/\s+/).forEach(function(p){ var k=titleKey(p);if(k&&variants.indexOf(k)<0)variants.push(k); }); });
    if (!names.length || !variants.some(function(k){return names.indexOf(k)>=0;})) return 0;
    var requestedYear = yearOf(movie && (movie.release_date || movie.first_air_date || movie.year));
    var foundYear = yearOf(item.year);
    if (requestedYear && foundYear && requestedYear !== foundYear) {
      // Adjacent-year exception needs independently published title+original and
      // the caller's independent original title. Never silently relabel a film.
      var movieOriginal = titleKey(movie && (movie.original_title || movie.original_name));
      var sourceOriginal = titleKey(item.originalTitle);
      var sourceLocalized = titleKey(item.title);
      var movieLocalized = titleKey(movie && (movie.title || movie.name));
      var film = !movie.first_air_date && !movie.original_name;
      if (!film || Math.abs(Number(requestedYear)-Number(foundYear))!==1 ||
        !sourceOriginal || !sourceLocalized || !movieOriginal || !movieLocalized ||
        sourceOriginal===sourceLocalized || movieOriginal===movieLocalized ||
        sourceOriginal !== movieOriginal || sourceLocalized !== movieLocalized) return 0;
      return 111;
    }
    return 100 + (requestedYear && foundYear ? 12 : 0);
  }

  function titleMatches(item,movie){
    var keys=namesOf(movie),names=[item.title,item.originalTitle],ok=false;
    names.forEach(function(s){String(s||'').split(/\s+\/\s+/).forEach(function(p){if(keys.indexOf(titleKey(p))>=0 && titleKey(p))ok=true;});});
    return ok;
  }

  function queryNames(movie) {
    var list=[], seen={};
    [movie && movie.title,movie && movie.name,movie && movie.original_title,movie && movie.original_name]
      .forEach(function(s){s=compact(s);var key=titleKey(s);if(key.length>1&&!seen[key]){seen[key]=true;list.push(s);}});
    return list.slice(0,3);
  }
  function cleanImage(raw,base) {
    var u=validUrl(raw,base,false);
    if(!u||/(?:blank|spacer|pixel|no-?image|placeholder)\b/i.test(u))return '';
    return u;
  }
  function htmlDoc(raw) {
    if (!root.DOMParser) throw Error('DOMParser недоступний');
    return new root.DOMParser().parseFromString(String(raw||''),'text/html');
  }
  function getText(node) {return compact(node && node.textContent);}
  function firstText(node, selectors){
    if(!node||!node.querySelector)return '';
    for(var i=0;i<selectors.length;i++){var x=node.querySelector(selectors[i]);if(x&&getText(x))return getText(x);}
    return '';
  }
  function getAttr(el,list){if(!el||!el.getAttribute)return '';for(var i=0;i<list.length;i++){var v=el.getAttribute(list[i]);if(v)return v;}return '';}
  function findCard(a){
    var p=a, i=0, best=a;
    for(;p&&i<4;p=p.parentElement,i++){
      if(p.className && /(?:shortstory|short-item|movie-item|movie-card|poster|card|movie|item|short)/i.test(String(p.className))){best=p;break;}
    }
    return best;
  }
  function parseSearch(html, movie) {
    var doc=htmlDoc(html), anchors=doc.querySelectorAll('a[href]'), found={}, result=[];
    for(var i=0;i<anchors.length && i<900;i++){
      var a=anchors[i], href=detailUrl(getAttr(a,['href']));
      if(!href || found[href])continue;
      var card=findCard(a), img=(card&&card.querySelector&&card.querySelector('img')) || (a.querySelector&&a.querySelector('img'));
      var heading=firstText(card,['.movie-title','.pmovie__title','.short-title','.shortstory-title','.title','h2','h3','h4']);
      var alt=getAttr(img,['alt','title']).replace(/\s+(?:постер|poster).*$/i,'').trim();
      var fromLink=getText(a).replace(/\s+(?:дивитися|смотреть|watch).*$/i,'').trim();
      var title=compact(heading||getAttr(a,['title'])||alt||fromLink).slice(0,160);
      if(!title || title.length>125 || /^(?:детальніше|дивитися|плеєр|фільми|серіали)$/i.test(title))continue;
      var original=firstText(card,['.oname','.original-title','.orig-title','.pmovie__original','.origintitle','.full-original','.full-title-eng','.original-name']).slice(0,120);
      var cardText=getText(card).slice(0,350);
      var y = (cardText.match(/(?:Рік(?:\s+виходу)?|Year)\s*:?\s*((?:19|20)\d{2})/i)||[])[1]||'';
      if(!y && card===a){y=yearOf(title);}
      var poster=cleanImage(getAttr(img,['data-src','data-original','src','data-lazy-src']),href);
      found[href]=true;
      result.push({url:href,title:title,originalTitle:original,year:y,poster:poster,score:titleScore({title:title,originalTitle:original,year:y},movie)});
    }
    return result;
  }
  function pageIdentity(html,url) {
    var doc=htmlDoc(html), h=firstText(doc,['h1','.pmovie__title','.full-title','.movie-title']),
      og=doc.querySelector('meta[property="og:title"]'), ogImg=doc.querySelector('meta[property="og:image"]');
    var title=h || getAttr(og,['content']);
    title=compact(title).replace(/\s+(?:дивитися|смотреть)\s+онлайн.*$/i,'').slice(0,150);
    var orig=firstText(doc,['.pmovie__original','.origintitle','.oname','.original-title','.orig-title','.full-original','.full-title-eng','.original-name']);
    // When the site renders "Motor City" as a simple line right after the H1,
    // do NOT infer it from the user's TMDB metadata; allow title-only matches.
    var body=getText(doc.body).slice(0,5000);
    if(!orig){var label=body.match(/(?:Оригінальна\s+назва|Original\s+title)\s*:?\s*([^:]{2,90}?)(?=\s*(?:Рік|Якість|Жанр|Країна)\s*:|$)/i);if(label)orig=compact(label[1]).slice(0,90);}
    var y=(body.match(/Рік\s+виходу\s*:?\s*((?:19|20)\d{2})/i)||[])[1]||
          (body.match(/Рік\s*:?\s*((?:19|20)\d{2})/i)||[])[1]||'';
    if(!y){var ld=String(html).match(/"dateCreated"\s*:\s*"((?:19|20)\d{2})/);if(ld)y=ld[1];}
    var img=doc.querySelector('meta[property="og:image"]');
    return {url:url,title:title,originalTitle:orig,year:y,poster:cleanImage(getAttr(img,['content']),url)};
  }
  function cachePut(key,promise) {
    cache[key]={time:Date.now(),promise:promise};
    promise.then(null,function(){if(cache[key]&&cache[key].promise===promise)delete cache[key];});
    return promise;
  }
  function fromCache(key,fn,ttl) {
    var hit=cache[key];if(hit && Date.now()-hit.time<(ttl||35000))return hit.promise;
    return cachePut(key,Promise.resolve().then(fn));
  }
  function toHtml(value) {
    if(typeof value==='string')return value;
    if(value && typeof value.responseText==='string')return value.responseText;
    if(value && typeof value.body==='string')return value.body;
    if(value && typeof value.html==='string')return value.html;
    if(value && typeof value.data==='string')return value.data;
    throw Error('Сервер не повернув HTML');
  }
  function validHtml(text){
    return text && typeof text==='string' && text.length>100 &&
      /<(?:html|body|article|div|main|a)\b/i.test(text) &&
      !/<title[^>]*>\s*(?:Just a moment|Attention required|Access denied)/i.test(text);
  }
  function nativeGet(url,options) {
    return new Promise(function(resolve,reject){
      var L=root.Lampa, net=L && L.Reguest ? new L.Reguest() : null;
      if(!net || typeof net.native!=='function')return reject(Error('Native GET недоступний'));
      var done=false;
      function finish(err,data){if(done)return;done=true;err?reject(err):resolve(data);}
      try{
        if(net.timeout)net.timeout(13000);
        net.native(url,function(data){try{finish(null,toHtml(data));}catch(e){finish(e);}},function(e){finish(Error('native: '+errorText(e)));},
          options && options.body || false,{dataType:'text',headers:options && options.headers || {}});
      }catch(e){finish(e);}
    });
  }
  function safeWorkerUrl(u){
    var s=validUrl(u,null,false);
    if(!s)return '';
    try{var p=new URL(s);return !/^(?:www\.)?uakino\.best$/i.test(p.hostname)&&!p.search&&!p.hash?p.origin:'';}catch(_){return '';}
  }
  function workerGet(url) {
    if(!config.worker)return Promise.reject(Error('HTML Worker не налаштований'));
    var endpoint=config.worker + '/fetch?url=' + encodeURIComponent(url);
    var L=root.Lampa;
    return new Promise(function(resolve,reject){
      var net=L && L.Reguest ? new L.Reguest() : null;
      if(!net || typeof net.silent!=='function')return reject(Error('Lampa.Reguest.silent недоступний'));
      var done=false;function finish(err,v){if(done)return;done=true;err?reject(err):resolve(v);}
      try{if(net.timeout)net.timeout(14000);
        net.silent(endpoint,function(v){try{finish(null,toHtml(v));}catch(e){finish(e);}},function(e){finish(Error('Worker: '+errorText(e)));},false,{dataType:'text'});
      }catch(e){finish(e);}
    });
  }
  function requestHtml(url,api,method,body,plain,headers) {
    var safe=validUrl(url,null,true);
    if(!safe)return Promise.reject(Error('Заборонено запит поза uakino.best'));
    var options={body:body || false,headers:headers || {}};
    var paths=[];
    if(method==='POST'){
      // POST uses native transport only: core api.request() is GET-only.
      paths=[{name:'native-post',call:function(){return nativeGet(safe,{body:body,headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'}});}}];
    }else{
      paths=[{name:'native-get',call:function(){return nativeGet(safe,options);}}];
      if(api&&typeof api.request==='function')paths.push({name:'core-request',call:function(){return api.request(safe);}});
      if(config.worker)paths.push({name:'html-worker',call:function(){return workerGet(safe);}});
    }
    var messages=[];stat.requests++;
    function next(i){
      if(i>=paths.length){stat.errors++;stat.lastError=messages.slice(-3).join(' | ');return Promise.reject(Error(stat.lastError || 'HTML недоступний'));}
      return Promise.resolve().then(paths[i].call).then(function(html){
        if(plain ? (typeof html!=='string' || html.length<3) : !validHtml(html))throw Error('Порожня відповідь, HTML або захисна сторінка');
        stat.transport=paths[i].name;stat.successes++;stat.lastError='';return html;
      }).catch(function(e){messages.push(paths[i].name+': '+errorText(e));return next(i+1);});
    }
    return next(0);
  }
  function fetchPage(url,api){return fromCache('page:'+url,function(){return requestHtml(url,api,'GET');},45000);}
  function searchRoutes(q){
    var encoded=encodeURIComponent(q);
    return [HOST+'/index.php?do=search&subaction=search&story='+encoded,
            HOST+'/?s='+encoded,
            HOST+'/index.php?do=search&search_start=0&full_search=0&story='+encoded];
  }
  function search(movie,api) {
    movie=movie || {};
    var runId=++serial, queries=queryNames(movie);
    stat.stage='search';stat.lastMovie=compact(movie.title||movie.name||'').slice(0,70);
    stat.searchQueries=queries.map(function(s){return s.slice(0,80);});stat.searchRoutes=[];
    stat.searchCards=0;stat.candidates=0;stat.verified=0;stat.lastError='';
    if(!queries.length){stat.stage='empty';return Promise.resolve([]);}
    var seen={}, matches=[], visited=false, failures=[];
    function tryQuery(q){
      var routes=searchRoutes(q);
      function tryRoute(i){
        if(i>=routes.length)return Promise.resolve([]);
        var addr=routes[i];stat.searchRoutes.push('GET '+(i+1));
        return requestHtml(addr,api,'GET').then(function(html){
          visited=true;var list=parseSearch(html,movie);stat.searchCards+=list.length;
          if(list.some(function(x){return x.score>=100;}))return list;
          return tryRoute(i+1).then(function(next){return list.concat(next);});
        },function(err){failures.push(errorText(err));return tryRoute(i+1);});
      }
      return tryRoute(0).then(function(list){
        if(list.some(function(x){return x.score>=100;}))return list;
        // Reference UAKino plugin uses DLE POST as primary search method.
        var form='do=search&subaction=search&search_start=0&full_search=0&result_from=1&story='+encodeURIComponent(q);
        stat.searchRoutes.push('POST');
        return requestHtml(HOST+'/index.php?do=search',api,'POST',form).then(function(html){
          visited=true;var got=parseSearch(html,movie);stat.searchCards+=got.length;return list.concat(got);
        },function(e){failures.push(errorText(e));return list;});
      });
    }
    function runQueries(i){
      if(i>=queries.length)return Promise.resolve();
      return tryQuery(queries[i]).then(function(list){
        list.forEach(function(item){if(!seen[item.url]){seen[item.url]=1;matches.push(item);}});
        if(matches.some(function(x){return x.score>=112;}))return;
        return runQueries(i+1);
      });
    }
    return runQueries(0).then(function(){
      stat.candidates=matches.length;
      var candidate=matches.filter(function(x){return titleMatches(x,movie);}).sort(function(a,b){return b.score-a.score;}).slice(0,10);
      // Search cards may omit year and original title. Inspect the detail page,
      // never substitute TMDB metadata as if it came from the source.
      function verifyOne(item){
        if(item.score>=112)return Promise.resolve(item);
        return fetchPage(item.url,api).then(function(html){
          var detail=pageIdentity(html,item.url);if(!detail.title)return null;
          var checked={url:item.url,title:detail.title,originalTitle:detail.originalTitle || item.originalTitle,
            year:detail.year || item.year,poster:detail.poster || item.poster};
          checked.score=titleScore(checked,movie);
          if(checked.score===0)return null;
          checked.unverifiedYear=!checked.year;
          return checked;
        },function(){return item.score>=100?item:null;});
      }
      return Promise.all(candidate.map(verifyOne));
    }).then(function(list){
      var ok=(list||[]).filter(Boolean).sort(function(a,b){return b.score-a.score;});
      // Only results with source-verified year may be auto-opened by the core.
      ok.forEach(function(x){if(!x.year)x.unverifiedYear=true;});
      if(runId===serial){stat.verified=ok.filter(function(x){return x.score>=111;}).length;
        stat.stage=ok.length?'results':visited?'no-exact-match':'transport-error';
        stat.lastResult=ok.length?ok[0].title:'';
        stat.lastYear=ok.length?ok[0].year:'';
        if(!visited && failures.length)stat.lastError=failures.slice(-3).join(' | ');}
      if(!visited && failures.length)throw Error('UAKino.best пошук: '+failures.slice(-2).join(' | '));
      return ok;
    });
  }
  function isAd(url){return /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|google-analytics\.com|youtube\.com|youtu\.be|adnxs\.com|adservice\.|ads\.|vast\.|facebook\.com|google\.com|adfox\.|yandex\.)/i.test(url)||/\b(?:trailer|promo|preroll|advert|banner|vast)\b/i.test(url);}
  function iframeAllowed(url){
    try{var u=new URL(url),h=u.hostname.toLowerCase();
      return /^(?:www\.)?uakino\.best$/.test(h) || /(?:^|\.)(?:ashdi\.vip|zetvideo\.net|hdvbua\.pro|tortuga\.[a-z]+)$/.test(h) || /(?:^|\.)[a-z0-9-]*hdvb[a-z0-9-]*\.[a-z]+$/.test(h);
    }catch(_){return false;}
  }
  function playerLiteral(script){
    var s=String(script||'');if(!/(?:Playerjs|playerjs|\bfile\s*:)/.test(s))return '';
    var m=/\bfile\s*:\s*(['"])((?:\\.|(?!\1)[\s\S]){1,100000}?)\1/m.exec(s);
    return m ? m[2].replace(/\\(['"\\])/g,'$1').replace(/\\\//g,'/'):'';
  }
  function numbered(label,what){
    var re=what==='season'?/(?:сезон|season|sezon)\s*(\d{1,2})|(\d{1,2})\s*(?:сезон|season|sezon)/i:
      /(?:сері[яї]|епізод|episode|ep)\s*(\d{1,3})|(\d{1,3})\s*(?:сері[яї]|епізод|episode|ep)/i;
    var m=String(label||'').match(re);return m?Number(m[1]||m[2]):0;
  }
  function parseFileLabels(file,title,voice,season,episode) {
    var out=[], list=String(file||'').split(/,(?=\s*(?:\[|https?:\/\/|\/\/))/);
    list.forEach(function(part){
      var m=part.trim().match(/^\[([^\]]{1,25})\]([\s\S]+)$/),quality=m?m[1]:'',url=mediaUrl(m?m[2].trim():part.trim());
      if(!url)return;
      out.push({url:url,title:title||'Фільм',voice:voice||'',season:season||0,episode:episode||0,
        quality:quality||'',source:'UAKino.best'});
    });
    return out;
  }
  function parsePlayerConfig(raw,base) {
    // Only static quoted literal and valid JSON folder tree. Do not run eval.
    var text=String(raw||'').trim(),streams=[];
    if(!text||text.charAt(0)==='#')return streams;
    if(/^\s*\[\s*\{/.test(text)){
      var data;try{data=JSON.parse(text);}catch(_){return [];} 
      function walk(items,path,depth){if(!Array.isArray(items)||depth>6||streams.length>250)return;
        items.forEach(function(it){if(!it||typeof it!=='object')return;
          var title=compact(it.title||''),next=path.concat([title]).filter(Boolean);
          if(Array.isArray(it.folder)){walk(it.folder,next,depth+1);return;}
          var group=next.slice(0,-1).filter(function(x){return !numbered(x,'season');}).join(' / ');
          var season=0,episode=numbered(title,'episode');
          next.forEach(function(x){season=season||numbered(x,'season');});
          streams=streams.concat(parseFileLabels(it.file,title||'Серія '+episode,group,season,episode));
        });
      }
      walk(data,[],0);
    }else streams=parseFileLabels(text,'Фільм','','',0);
    return streams;
  }
  function parseStreams(html,url) {
    var doc=htmlDoc(html), streams=[], embeds=[], scripts=doc.querySelectorAll('script');
    stat.playerScripts=0;stat.playlistEntries=0;stat.rejectedAds=0;stat.rejectedUnsafe=0;
    function addFrame(raw){
      var safe=validUrl(raw,url,false);if(!safe){stat.rejectedUnsafe++;return;}
      if(isAd(safe)){stat.rejectedAds++;return;}
      if(!iframeAllowed(safe)){stat.rejectedUnsafe++;return;}
      if(embeds.indexOf(safe)<0)embeds.push(safe);
    }
    // Restrict direct HTML media to actual <video> and <source> nodes.
    var videos=doc.querySelectorAll('video[src],video source[src],source[type^="video/"]');
    for(var i=0;i<videos.length && i<30;i++){
      var u=mediaUrl(getAttr(videos[i],['src','data-src']),url);
      if(u)streams.push({url:u,title:'Фільм',voice:'',season:0,episode:0});
    }
    var frames=doc.querySelectorAll('iframe[src],iframe[data-src],iframe[data-lazy-src]');
    for(var j=0;j<frames.length && j<35;j++)addFrame(getAttr(frames[j],['src','data-src','data-lazy-src']));
    for(var k=0;k<scripts.length && k<150;k++){
      var src=String(scripts[k].textContent||'');
      if(!src||src.length>150000)continue;
      var f=playerLiteral(src);
      if(f){stat.playerScripts++;streams=streams.concat(parsePlayerConfig(f,url));}
      // A known player URL may be supplied in a static string rather than iframe.
      var known=src.match(/https?:\\?\/\\?\/[a-z0-9.\-]+\/(?:embed|player)\/[a-z0-9/_?=&.\-]+/gi)||[];
      known.slice(0,12).forEach(function(h){addFrame(h.replace(/\\\//g,'/'));});
    }
    var unique={},clean=[];
    streams.forEach(function(s){
      if(!s.url || isAd(s.url) || unique[s.url+'|'+s.season+'|'+s.episode+'|'+s.voice])return;
      unique[s.url+'|'+s.season+'|'+s.episode+'|'+s.voice]=1;clean.push(s);
    });
    stat.playlistEntries=clean.filter(function(s){return !!s.episode;}).length;
    return {streams:clean.slice(0,120),embeds:embeds.slice(0,6)};
  }

  function ajaxPlaylists(html,pageUrl,api) {
    // DLE's public playlists.php endpoint is used by the supplied UAKino plugin.
    // Parse only returned data-file attributes; never execute server JS/HTML.
    var doc=htmlDoc(html), marker=doc.querySelector('.playlists-ajax[data-news_id]');
    if(!marker)return Promise.resolve({streams:[],embeds:[],entries:0});
    var newsId=getAttr(marker,['data-news_id']),xfield=getAttr(marker,['data-xfname'])||'playlist';
    if(!/^\d{1,10}$/.test(newsId)||!/^[a-z0-9_]{1,30}$/i.test(xfield))return Promise.resolve({streams:[],embeds:[],entries:0});
    var hash=(String(html).match(/dle_login_hash\s*=\s*['"]([a-z0-9]+)['"]/i)||[])[1]||'';
    var url=HOST+'/engine/ajax/playlists.php?news_id='+encodeURIComponent(newsId)+'&xfield='+encodeURIComponent(xfield)+
      (hash?'&user_hash='+encodeURIComponent(hash):'')+'&time='+Date.now();
    return requestHtml(url,api,'GET',null,true,{'X-Requested-With':'XMLHttpRequest','Referer':pageUrl}).then(function(raw){
      var content=raw;
      if(/^\s*\{/.test(raw)){var json;try{json=JSON.parse(raw);}catch(_){json=null;}
        if(json&&json.success===false)throw Error('Плейлист недоступний');
        if(json&&typeof json.response==='string')content=json.response;
      }
      var tree=htmlDoc('<div id="ms-d-ajax">'+content+'</div>'), lis=tree.querySelectorAll('li[data-id],li[data-file]');
      var labels={},items=[],embeds=[];
      for(var i=0;i<lis.length&&i<350;i++){
        var li=lis[i],key=getAttr(li,['data-id']),rawFile=getAttr(li,['data-file']);
        if(key&&!rawFile){labels[key]=getText(li).slice(0,70);continue;}
        if(!rawFile)continue;
        var parts=key.split('_'),names=[];
        for(var j=1;j<=parts.length;j++){var label=labels[parts.slice(0,j).join('_')];if(label&&names.indexOf(label)<0)names.push(label);}
        var voice=getAttr(li,['data-voice'])||names.filter(function(name){return !/(?:сезон|season|сері[яї]|episode)/i.test(name);}).join(' · ');
        var title=getText(li).slice(0,90),season=0,episode=numbered(title,'episode');
        names.forEach(function(n){season=season||numbered(n,'season');});
        var direct=parseFileLabels(rawFile,title||'Серія '+episode,voice,season,episode);
        if(direct.length)items=items.concat(direct);
        else {var external=validUrl(rawFile,pageUrl,false);if(external&&iframeAllowed(external)&&!isAd(external)&&embeds.indexOf(external)<0)embeds.push(external);}
      }
      return {streams:items,embeds:embeds,entries:lis.length};
    },function(e){stat.lastError='DLE playlist: '+errorText(e);return {streams:[],embeds:[],entries:0};});
  }

  function getStreams(item,api){
    var url=detailUrl(item&&item.url);
    if(!url)return Promise.reject(Error('Адреса UAKino.best не є сторінкою фільму або серіалу'));
    stat.stage='detail';stat.directStreams=0;stat.embeds=0;stat.pageAvailable=false;stat.lastError='';
    return fetchPage(url,api).then(function(html){
      stat.pageAvailable=true;
      var identity=pageIdentity(html,url);
      if(!identity.title)throw Error('Сторінка без назви або HTML недоступний');
      // Ensure the requested result is still the same title/year when a page
      // changes, without mistaking an unrelated embed for the desired film.
      var titleOk=titleKey(identity.title)===titleKey(item.title) ||
        (identity.originalTitle && titleKey(identity.originalTitle)===titleKey(item.originalTitle));
      if(!titleOk){throw Error('Назва на сайті змінилась; відтворення зупинено');}
      if(item.year && identity.year && Math.abs(Number(item.year)-Number(identity.year))>1)
        throw Error('Рік фільму не відповідає вибраному результату');
      var found=parseStreams(html,url);
      return ajaxPlaylists(html,url,api).then(function(extra){
        var known={},streams=[],embeds=[];
        found.streams.concat(extra.streams).forEach(function(s){var k=s.url+'|'+s.season+'|'+s.episode+'|'+s.voice;if(!known[k]){known[k]=1;streams.push(s);}});
        found.embeds.concat(extra.embeds).forEach(function(u){if(embeds.indexOf(u)<0)embeds.push(u);});
        stat.directStreams=streams.length;stat.embeds=embeds.length;stat.playlistEntries+=extra.streams.length;
        stat.stage=streams.length?'direct-media-found':embeds.length?'web-players-only':'html-without-media';
        stat.lastYear=identity.year;stat.lastResult=identity.title;
        var notice=streams.length?
          'Виявлено відкриту конфігурацію відео. Сумісність потоку перевіряється під час запуску Lampa.':
          embeds.length?'Прямий HLS/MP4 не опублікований у HTML. Доступні лише вебплеєри; відтворення в Lampa не підтверджено.':
          'Сторінку знайдено, але прямого відеопотоку або підтримуваного вебплеєра немає. Перевірте сторінку джерела.';
        return {streams:streams.slice(0,150),embeds:embeds.slice(0,6),pageUrl:url,notice:notice};
      });
    },function(err){stat.stage='detail-error';stat.lastError=errorText(err);throw err;});
  }
  function chosenSource(){try{return root.Lampa.Storage.get('ms_v1_source','')||'';}catch(_){return '';}}
  function chooseFallback(api){
    if(chosenSource()==='liftw'){
      try{root.Lampa.Storage.set('ms_v1_source',api.listSources().some(function(s){return s.id==='uaserials';})?'uaserials':'uakinobest');}catch(_){}
    }
  }
  function install(){
    var api=root.LampaMultiSource;
    if(!api||!api._coreLoaded||typeof api.registerSource!=='function'||typeof api.listSources!=='function')return false;
    if(typeof api.unregisterSource==='function')stat.disabledLift=api.unregisterSource('liftw') || !api.listSources().some(function(s){return s.id==='liftw';});
    chooseFallback(api);
    api.registerSource({id:ID,name:'UAKino.best',baseUrl:HOST,isDetail:function(url){return !!detailUrl(url);},
      search:search,getStreams:getStreams});
    stat.installed=true;stat.stage='ready';return true;
  }
  function diagnostic(){var s={};Object.keys(stat).forEach(function(k){s[k]=stat[k];});s.currentSource=chosenSource();
    s.workerConfigured=!!config.worker;s.workerHost=config.worker ? new URL(config.worker).hostname : '';return s;}
  function setHtmlWorker(url){
    var safe=url?safeWorkerUrl(url):'';
    if(url&&!safe)throw Error('Потрібна проста HTTPS-адреса HTML Worker без параметрів');
    config.worker=safe;
    try{root.Lampa.Storage.set('ms_d_uakinobest_worker',safe);}catch(_){}
    return diagnostic();
  }
  function clearCache(){cache={};stat.stage='cache-cleared';}
  try{config.worker=safeWorkerUrl(root.Lampa&&root.Lampa.Storage&&root.Lampa.Storage.get('ms_d_uakinobest_worker','')||'');}catch(_){}
  root.MultiSourceUAKinoBest1315d={diagnostic:diagnostic,install:install,setHtmlWorker:setHtmlWorker,
    clearCache:clearCache,search:function(movie){return search(movie,root.LampaMultiSource);},
    getStreams:function(item){return getStreams(item,root.LampaMultiSource);},
    _test:{validUrl:validUrl,detailUrl:detailUrl,titleKey:titleKey,titleScore:titleScore,titleMatches:titleMatches,parseSearch:parseSearch,
      pageIdentity:pageIdentity,parseStreams:parseStreams,parsePlayerConfig:parsePlayerConfig,searchRoutes:searchRoutes}};
  // Retry until core loads. Do not move DOM, hook Player, or override providers.
  if(!install() && root.setInterval){
    timer=root.setInterval(function(){if(install()||++checks>180){root.clearInterval(timer);if(!stat.installed)stat.stage='core-timeout';}},400);
  }
})(window);
