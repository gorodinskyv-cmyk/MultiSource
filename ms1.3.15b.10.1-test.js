/* MultiSource 1.3.15b.10.1 TEST — UAKino alternate media inspection + grouped stream UI.
 * Install ONLY this entrypoint (not b.8 in parallel). b.8 and its 1.3.15 core
 * remain unchanged; this patch replaces only two source handlers after boot.
 * No DRM/CORS bypass; no cookie, signed stream or URL telemetry.
 */
(function (root) {
  'use strict';
  if (root.MultiSourcePatch1315b10) return;
  var VERSION = '1.3.15b.10.1-uakino-alt-media-ui2';
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
    if(changed && !playerOpen() && !overlay){
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
    layoutToolbar();
    var view=root.document.querySelector('.ms-scroll-viewport');
    if(!view)return;
    var old=view.querySelector('.ms-b10-uakino-player');
    if(old&&old.parentNode)old.parentNode.removeChild(old);
    var slot=view.querySelector('.ms-b101-uakino-slot');
    if(!active()||!uaSelected()||playerOpen()||overlay||!currentUa.pageUrl){
      if(slot&&slot.parentNode)slot.parentNode.removeChild(slot);
      state.uakinocx.button=false;
      return;
    }
    var anchor=sourceRowAnchor(view);
    if(!anchor){if(slot&&slot.parentNode)slot.parentNode.removeChild(slot);return;}
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
    if(needsFocus){
      try{if(root.Lampa.Controller&&root.Lampa.Controller.enabled&&root.Lampa.Controller.toggle){
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
    state.source='registered';state.installed=true;
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
          button:state.uakinocx.button,altProbe:state.uakinocx.altProbe,frame:state.uakinocx.frame,ui:state.ui,error:state.uakinocx.error};
        d.lastDetailEvidence=ev;return d;
      };
      root.MultiSourceSources1315b.diagnostic._msB10=true;
    }
    if(root.MultiSourceDiagnostics1315b && root.MultiSourceDiagnostics1315b.report){
      var prev=root.MultiSourceDiagnostics1315b.report;
      if(!prev._msB10){
        root.MultiSourceDiagnostics1315b.report=function(){var old=prev();old.patchB10=diagnostic();return old;};
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
    uakinocx:state.uakinocx,ui:state.ui};}
  root.MultiSourcePatch1315b10={diagnostic:diagnostic,install:install,showUakinoPlayers:showPlayers,
    _test:{norm:norm,pure:pure,titleMatch:titleMatch,target:target,identity:identity,
      searchCards:searchCards,extractPlayers:collectPlayers,playerUrl:playerUrl,adContainer:adContainer,inferTabs:inferTabs,layoutToolbar:layoutToolbar,mediaAddress:mediaAddress,extractPublishedMedia:extractPublishedMedia,recognizedAlternativeHost:recognizedAlternativeHost,sourceRowAnchor:sourceRowAnchor,attachButton:attachButton}};
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
