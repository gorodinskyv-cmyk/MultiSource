/*
 * Lampa MultiSource 1.1.0 — TV episode artwork, season, voice, quality and watched UI
 * If direct access is allowed, the embedded page is fetched from the same
 * client as HLS. Otherwise previous worker fallback remains unchanged.
 * Copyright (c) 2026. MIT License.
 * UASerials adapter: HTML discovery, browser-available player metadata and HLS.
 * Optional HTML-only Cloudflare Worker; no streaming, authentication or DRM bypass.
 */
(function () {
  'use strict';
  var VERSION = '1.1.0';
  var COMPONENT = 'multi_source_online_v1';
  var LOG = '[MultiSource]';
  var registry = {};
  var registryOrder = [];
  var initialized = false;
  var bootTimer = null;
  var activeCardTimer = null;
  var domObserver = null;
  var domScanTimer = null;
  var lastCardContext = null;
  var lastFullEvent = null;
  var diagnostics = { initialized: false, bootAttempts: 0, fullEvents: 0, buttonsAdded: 0, lastError: '', lastFull: '', lastScan: '', floating: false };
  var storagePrefix = 'ms_v1_';
  var fetchDiagnostics = { transport: 'direct', lastRequest: '', lastStatus: '', lastError: '',
    tortugaDirect: 'not_tried', tortugaFallback: false, companion: 'not_tried' };
  if (window.LampaMultiSource && window.LampaMultiSource._coreLoaded &&
      window.LampaMultiSource.version === VERSION) return;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function normal(value) {
    return String(value || '').toLowerCase().replace(/[’'`´]/g, '')
      .replace(/[^a-z0-9а-яіїєґё]+/gi, ' ').replace(/\s+/g, ' ').trim();
  }
  // UASerials sometimes wraps the title, rating, year and original name
  // inside one clickable card. Prefer a separate title or the Lampa movie
  // title if it is actually present in the raw card text.
  function cleanSearchTitle(value, movie) {
    var raw = String(value || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    var candidates = [movie && movie.title, movie && movie.name,
      movie && movie.original_title, movie && movie.original_name].filter(Boolean);
    for (var i = 0; i < candidates.length; i++) {
      var requested = String(candidates[i]).trim();
      if (requested && normal(raw).indexOf(normal(requested)) !== -1) return requested;
    }
    // Leading rating + year, e.g. "7.72026Кришталеве озероCrystal Lake".
    raw = raw.replace(/^\s*\d{1,2}[.,]\d\s*(?=(?:19|20)\d{2})/, '');
    raw = raw.replace(/^\s*(?:19|20)\d{2}\s*/, '');
    return raw.trim().slice(0, 160);
  }
  function host(url) {
    var match = String(url || '').match(/^https:\/\/([^\/?#]+)/i);
    return match ? match[1].toLowerCase() : '';
  }
  function absolute(url, base) {
    url = String(url || '').trim().replace(/&amp;/g, '&').replace(/\\\//g, '/');
    if (/^\/\//.test(url)) return 'https:' + url;
    if (/^https:\/\//i.test(url)) return url;
    if (/^(?:javascript|data|blob|file|http):/i.test(url)) return '';
    var origin = String(base || '').match(/^(https:\/\/[^/]+)/i);
    if (!origin) return '';
    if (url.charAt(0) === '/') return origin[1] + url;
    var path = String(base).split(/[?#]/)[0].replace(/\/[^/]*$/, '/');
    return path + url.replace(/^\.\//, '');
  }
  function mediaUrl(value, base) {
    var url = absolute(value, base);
    return /\.(?:m3u8|mp4|mpd|webm)(?:[?#]|$)/i.test(url) ? url : '';
  }
  function dedup(list, key) {
    var seen = {}; return list.filter(function (v) {
      var id = String(key(v) || ''); if (!id || seen[id]) return false;
      seen[id] = true; return true;
    });
  }
  function fromHtml(html) {
    if (window.DOMParser) return new DOMParser().parseFromString(html, 'text/html');
    return null;
  }
  function scoreMatch(item, movie) {
    var names = [movie.title, movie.name, movie.original_title, movie.original_name]
      .filter(Boolean).map(normal);
    var found = normal(item.title);
    var rank = 0;
    names.forEach(function (n) {
      if (n === found) rank = Math.max(rank, 100);
      else if (found.indexOf(n) >= 0 || n.indexOf(found) >= 0) rank = Math.max(rank, 60);
    });
    var year = String(movie.release_date || movie.first_air_date || '').slice(0, 4);
    if (year && String(item.year) === year) rank += 12;
    return rank;
  }
  // Browser Lampa cannot read an unrelated origin without that site's CORS permission.
  // The adapter is deliberately opt-in and proxies UASerials HTML only, not media.
  function getAdapterUrl() {
    return String(getStorage('adapter_url', '') || '').replace(/\/+$/, '');
  }
  function setAdapterUrl(value) {
    var url = String(value || '').trim().replace(/\/+$/, '');
    if (url && !/^https:\/\/[a-z\d.-]+(?::\d+)?$/i.test(url)) {
      throw new Error('Адреса адаптера: потрібен HTTPS URL без шляху, напр. https://name.workers.dev');
    }
    setStorage('adapter_url', url);
    return url;
  }
  // Persist ONLY episode labels. Never persist signed HLS URLs, media tokens,
  // Tortuga embed URLs or cookies: stream URLs must be resolved at playback time.
  function episodeCatalogKey(title, sourceId) {
    var value = (sourceId || 'uaserials') + ':' + normal(title);
    return String(Lampa.Utils.hash(value));
  }
  function episodeLabels(streams) {
    var labels = [];
    (streams || []).forEach(function (entry) {
      var season = Number(entry.season) || 0, episode = Number(entry.episode) || 0;
      if (!season && !episode) return;
      labels.push({ title: String(entry.title || '').slice(0, 120),
        season: season, episode: episode, voice: String(entry.voice || '').slice(0, 80) });
    });
    labels = dedup(labels, function (e) { return [e.season, e.episode, e.voice].join(':'); });
    // An alternate transport may omit the voice label. In that case the
    // unlabeled copy is not an additional episode when a named voice for the
    // same season/episode is already present in the merged catalogue.
    var namedEpisodes = {};
    labels.forEach(function (e) {
      if (e.voice) namedEpisodes[e.season + ':' + e.episode] = true;
    });
    labels = labels.filter(function (e) {
      return !!e.voice || !namedEpisodes[e.season + ':' + e.episode];
    });
    labels.sort(function (a, b) {
      return a.season - b.season || a.episode - b.episode || a.voice.localeCompare(b.voice);
    });
    return labels.slice(0, 250);
  }
  function saveEpisodeLabels(title, sourceId, streams) {
    // Merge non-expired metadata. A partial response (e.g. browser returns
    // 2 episodes after the Worker returned 8) must never erase the other six.
    // Fresh records win on duplicate season/episode/voice keys. No signed URLs
    // are saved or combined here.
    var labels = episodeLabels((streams || []).concat(readEpisodeLabels(title, sourceId)));
    if (!labels.length) return labels;
    var catalog = getStorage('episode_labels', {});
    if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) catalog = {};
    catalog[episodeCatalogKey(title, sourceId)] = { time: Date.now(), labels: labels };
    var keys = Object.keys(catalog);
    if (keys.length > 20) {
      keys.sort(function (a, b) { return (catalog[a].time || 0) - (catalog[b].time || 0); });
      keys.slice(0, keys.length - 20).forEach(function (key) { delete catalog[key]; });
    }
    setStorage('episode_labels', catalog);
    return labels;
  }
  function readEpisodeLabels(title, sourceId) {
    var catalog = getStorage('episode_labels', {});
    var item = catalog && catalog[episodeCatalogKey(title, sourceId)];
    if (!item || !Array.isArray(item.labels) || Date.now() - item.time > 24 * 60 * 60 * 1000) return [];
    return episodeLabels(item.labels);
  }
  // Presentation metadata only: TMDB artwork and names never determine a stream URL.
  function tmdbSeriesId(movie) {
    movie = movie || {};
    var preferred = movie.source && movie.source !== 'tmdb' ? movie.tmdb_id : (movie.tmdb_id || movie.id);
    var id = Number(preferred);
    if (!Number.isInteger(id) || id < 1 || id > 1000000000) return 0;
    // Lampa provides TMDB IDs on TV cards. A movie must not request a TV season.
    if (movie.media_type === 'movie' || movie.type === 'movie') return 0;
    return id;
  }
  function tmdbEpisodeInfo(movie, season) {
    var id = tmdbSeriesId(movie);
    if (!id || !window.Lampa || !Lampa.Api || !Lampa.Api.sources ||
        !Lampa.Api.sources.tmdb || typeof Lampa.Api.sources.tmdb.get !== 'function')
      return Promise.resolve([]);
    return new Promise(function (resolve) {
      var complete = false;
      var timer = setTimeout(function () { finish([]); }, 11000);
      function finish(items) {
        if (complete) return;
        complete = true;
        clearTimeout(timer);
        resolve((Array.isArray(items) ? items : []).filter(function (e) {
          return e && Number(e.episode_number) > 0;
        }));
      }
      try {
        Lampa.Api.sources.tmdb.get('tv/' + id + '/season/' + season,
          { language: 'uk-UA' }, function (data) { finish(data && data.episodes); },
          function () { finish([]); });
      } catch (err) { finish([]); }
    });
  }
  function episodeImagePath(value) {
    var path = String(value || '');
    return /^\/[a-z0-9_\/-]+\.(?:jpg|jpeg|png|webp)$/i.test(path) ?
      'https://image.tmdb.org/t/p/w300' + path : '';
  }
  function watchedEpisodeKey(movie, season, episode, sourceId) {
    var id = tmdbSeriesId(movie) || normal(movie && (movie.name || movie.title));
    return String(sourceId || 'uaserials') + ':' + id + ':' + Number(season) + ':' + Number(episode);
  }
  function isEpisodeWatched(movie, season, episode, sourceId) {
    var all = getStorage('watched_episodes', {});
    return !!(all && all[watchedEpisodeKey(movie, season, episode, sourceId)]);
  }
  function setEpisodeWatched(movie, season, episode, sourceId, watched) {
    var all = getStorage('watched_episodes', {});
    if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
    var key = watchedEpisodeKey(movie, season, episode, sourceId);
    if (watched) all[key] = Date.now(); else delete all[key];
    // Keep storage bounded on Android and TV browsers.
    var keys = Object.keys(all);
    if (keys.length > 1500) keys.sort(function (a, b) { return all[a] - all[b]; }).slice(0, keys.length - 1200)
      .forEach(function (k) { delete all[k]; });
    setStorage('watched_episodes', all);
    return !!watched;
  }
  function getQualitySetting() {
    var value = String(getStorage('quality', 'auto') || 'auto');
    return ['auto', '1080', '720', '480'].indexOf(value) !== -1 ? value : 'auto';
  }
  function extractHlsVariants(body, baseUrl) {
    var result = [], lines = String(body || '').split(/\r?\n/), info = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (/^#EXT-X-STREAM-INF:/i.test(line)) { info = line; continue; }
      if (!line || line.charAt(0) === '#') continue;
      if (info) {
        var resolution = /RESOLUTION=\d+x(\d+)/i.exec(info);
        var height = resolution ? Number(resolution[1]) : 0;
        var url = '';
        try { url = new URL(line, baseUrl).href; } catch (e) {}
        if (/^https:\/\//i.test(url) && /\.m3u8(?:[?#]|$)/i.test(url))
          result.push({ height: height, url: url });
        info = null;
      }
    }
    return result;
  }
  function findEpisode(streams, selected) {
    return (streams || []).filter(function (s) {
      return Number(s.season || 0) === Number(selected.season || 0) &&
        Number(s.episode || 0) === Number(selected.episode || 0) &&
        String(s.voice || '') === String(selected.voice || '');
    })[0] || null;
  }
  function rawRequest(url, timeout) {
    return new Promise(function (resolve, reject) {
      if (!host(url)) return reject(new Error('Недопустима адреса HTTPS'));
      if (!window.Lampa || !Lampa.Reguest) return reject(new Error('Lampa.Reguest недоступний'));
      var request = new Lampa.Reguest();
      if (request.timeout) request.timeout(timeout || 15000);
      try {
        request['native'](url, function (response) {
          fetchDiagnostics.lastStatus = 'ok';
          resolve(typeof response === 'string' ? response : JSON.stringify(response || {}));
        }, function (err) {
          var status = err && (err.status || err.statusCode || err.message) || 'мережевий запит заблокований';
          fetchDiagnostics.lastStatus = String(status);
          fetchDiagnostics.lastError = 'HTTP/мережа: ' + status;
          reject(new Error('HTTP/мережа: ' + status));
        }, false, { dataType: 'text' });
      } catch (e) {
        fetchDiagnostics.lastError = String(e.message || e);
        reject(e);
      }
    });
  }
  // Optional, locally installed Chromium companion extension. It makes the
  // HTML request from the user's own computer rather than a cloud Worker.
  // Its background service worker has strict Tortuga-only host permissions.
  // Messages are bound to the page's own origin; signed URLs are never logged.
  function companionHtml(url) {
    return new Promise(function (resolve, reject) {
      if (!window.postMessage || !window.addEventListener) return reject(new Error('No message bridge'));
      var requestId = 'ms-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      var acknowledged = false, ackTimeout, responseTimeout;
      function finish(error, value) {
        clearTimeout(ackTimeout);
        clearTimeout(responseTimeout);
        window.removeEventListener('message', receiver);
        if (error) reject(error);
        else resolve(value);
      }
      function receiver(event) {
        if (event.source !== window || event.origin !== window.location.origin) return;
        var data = event.data || {};
        if (data.id !== requestId) return;
        if (data.channel === 'multisource:ack') {
          acknowledged = true;
          clearTimeout(ackTimeout);
          responseTimeout = setTimeout(function () { finish(new Error('Companion timeout')); }, 11000);
        } else if (data.channel === 'multisource:response') {
          finish(data.ok ? null : new Error(data.error || 'Companion fetch failed'), data.html);
        }
      }
      window.addEventListener('message', receiver);
      ackTimeout = setTimeout(function () {
        if (!acknowledged) finish(new Error('Companion not installed'));
      }, 800);
      window.postMessage({ channel: 'multisource:request', id: requestId, url: url }, window.location.origin);
    });
  }

  function ajaxText(url, timeout) {
    var adapter = getAdapterUrl();
    var hostname = host(url);
    var tortuga = hostname === 'tortuga.tw' || hostname === 'tortuga.wtf';
    var proxy = ['uaserials.com', 'tortuga.wtf', 'tortuga.tw'].indexOf(hostname) >= 0 && !!adapter;
    // Do NOT disclose signed embed URLs in diagnostics or console output.
    fetchDiagnostics.lastRequest = hostname + (tortuga ? ' / player HTML' : ' / HTML');
    fetchDiagnostics.lastError = '';
    fetchDiagnostics.tortugaFallback = false;
    if (tortuga && proxy) {
      // Signed media URLs may depend on the environment that requested the
      // player HTML. First try the user's browser origin; if the page's CORS
      // policy denies reading it, preserve the original HTML Worker fallback.
      // No media proxying, header spoofing or token alteration.
      fetchDiagnostics.transport = 'browser-first';
      fetchDiagnostics.tortugaDirect = 'attempting';
      return rawRequest(url, timeout).then(function (html) {
        fetchDiagnostics.tortugaDirect = 'success';
        fetchDiagnostics.lastError = '';
        fetchDiagnostics.transport = 'browser';
        return html;
      }, function () {
        fetchDiagnostics.tortugaDirect = 'unavailable';
        fetchDiagnostics.companion = 'attempting';
        return companionHtml(url).then(function (html) {
          fetchDiagnostics.companion = 'success';
          fetchDiagnostics.lastError = '';
          fetchDiagnostics.lastStatus = 'ok';
          fetchDiagnostics.transport = 'chrome-companion';
          return html;
        }, function () {
          fetchDiagnostics.companion = 'unavailable';
          fetchDiagnostics.tortugaFallback = true;
          fetchDiagnostics.transport = 'adapter-fallback';
          return rawRequest(adapter + '/fetch?url=' + encodeURIComponent(url), timeout);
        });
      });
    }
    fetchDiagnostics.transport = proxy ? 'adapter' : 'direct';
    var endpoint = proxy ? adapter + '/fetch?url=' + encodeURIComponent(url) : url;
    return rawRequest(endpoint, timeout);
  }
  function testAdapter() {
    var url = getAdapterUrl();
    if (!url) return Promise.reject(new Error('Спочатку вкажіть адресу адаптера'));
    return rawRequest(url + '/health', 10000).then(function (response) {
      var json;
      try { json = JSON.parse(response); } catch (e) { throw new Error('Сервер не повернув JSON /health'); }
      if (!json.ok || json.service !== 'lampa-multisource-uaserials')
        throw new Error('Сервер не є адаптером MultiSource');
      return json;
    });
  }

  function registerSource(source) {
    if (!source || !/^[a-z][a-z0-9_-]{1,39}$/.test(source.id || '') ||
        !source.name || typeof source.search !== 'function' ||
        typeof source.getStreams !== 'function') {
      throw new Error('Джерело: потрібні id, name, search(movie, api), getStreams(item, api)');
    }
    if (!registry[source.id]) registryOrder.push(source.id);
    registry[source.id] = source;
    return source.id;
  }
  function removeSource(id) {
    if (!registry[id] || id === 'uaserials') return false;
    delete registry[id]; registryOrder = registryOrder.filter(function (key) { return key !== id; });
    return true;
  }
  function getSources() { return registryOrder.map(function (id) { return registry[id]; }); }
  function getStorage(key, fallback) {
    try { return Lampa.Storage.get(storagePrefix + key, fallback); } catch (e) { return fallback; }
  }
  function setStorage(key, value) { try { Lampa.Storage.set(storagePrefix + key, value); } catch (e) {} }
  function chosenSource() {
    var id = getStorage('source', 'uaserials');
    return registry[id] ? id : registryOrder[0];
  }
  function openWeb(url) {
    if (!host(url)) return notify('Некоректна HTTPS-адреса');
    try {
      if (window.open) { var opened = window.open(url, '_blank'); if (opened) return; }
    } catch (e) { /* Some Smart TVs deny popups */ }
    try {
      if (Lampa.Utils && Lampa.Utils.copyTextToClipboard) {
        Lampa.Utils.copyTextToClipboard(url, function () { notify('Посилання скопійовано'); },
          function () { notify(url); });
        return;
      }
    } catch (e) {}
    notify('Не вдалося відкрити браузер на цьому пристрої');
  }
  function notify(message) { if (window.Lampa && Lampa.Noty) Lampa.Noty.show(String(message)); }

  // A user-supplied HLS/MP4 link can be tested independently from Tortuga's
  // embed-page resolver. Never persist the URL: tokenized streams may expire.
  // This does not proxy media, forge access tokens or bypass DRM.
  function validatePlayableUrl(raw) {
    var value = String(raw || '').trim();
    if (!value || value.length > 4096 || !/^https:\/\//i.test(value))
      throw new Error('Потрібне HTTPS-посилання на HLS/MP4');
    if (!/\.(?:m3u8|mp4|webm|mpd)(?:[?#]|$)/i.test(value))
      throw new Error('Підтримується пряме посилання .m3u8, .mp4, .webm або .mpd');
    var url;
    try { url = new URL(value); } catch (e) { throw new Error('Некоректна адреса відео'); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password)
      throw new Error('Недопустима адреса відео');
    return url.href;
  }
  function playDirect(url, title) {
    var safe = validatePlayableUrl(url);
    if (!window.Lampa || !Lampa.Player || typeof Lampa.Player.play !== 'function')
      throw new Error('Lampa.Player недоступний');
    var element = {
      title: String(title || 'Прямий відеопотік'),
      url: safe,
      isonline: true
    };
    Lampa.Player.play(element);
    if (typeof Lampa.Player.playlist === 'function') Lampa.Player.playlist([element]);
    return { launched: true, format: /\.m3u8(?:[?#]|$)/i.test(safe) ? 'HLS' : 'video',
      host: host(safe) };
  }
  // Verify that a decoded HLS URL really serves an HLS manifest before handing
  // it to the video player. A syntactically valid URL can still have an invalid,
  // expired or unauthorized token. No proxy, token rewriting or auth bypass.
  function checkHlsStream(rawUrl, timeoutMs) {
    var safe;
    try { safe = validatePlayableUrl(rawUrl); }
    catch (err) { return Promise.resolve({ ok: false, reason: 'invalid_url', message: err.message }); }
    var hostname = host(safe);
    if (!/\.m3u8(?:[?#]|$)/i.test(safe))
      return Promise.resolve({ ok: true, reason: 'not_hls', host: hostname, checked: false });
    if (typeof window.fetch !== 'function')
      return Promise.resolve({ ok: false, reason: 'fetch_unavailable', host: hostname,
        message: 'Браузер не підтримує перевірку відеоплейлиста' });
    var controller = typeof window.AbortController === 'function' ? new window.AbortController() : null;
    var timer = null;
    if (controller) timer = setTimeout(function () { controller.abort(); }, Math.max(1000, timeoutMs || 10000));
    var opts = { method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'follow' };
    if (controller) opts.signal = controller.signal;
    return window.fetch(safe, opts).then(function (response) {
      var status = response.status;
      var base = { ok: false, host: hostname, status: status, checked: true,
        contentType: String(response.headers && response.headers.get('content-type') || '').split(';')[0] };
      if (!response.ok) {
        base.reason = 'http';
        base.message = 'HLS сервер повернув HTTP ' + status + (status === 403 ? ' Forbidden — адреса або токен не приймається' : '');
        return base;
      }
      return response.text().then(function (body) {
        // Do not log or persist the body: it may contain signed child URLs.
        if (!/^\s*#EXTM3U(?:\s|$)/.test(body)) {
          base.reason = 'not_hls';
          base.message = 'Сервер повернув не HLS-плейлист';
          return base;
        }
        base.ok = true;
        base.reason = 'valid_hls';
        base.variants = (body.match(/#EXT-X-STREAM-INF:/g) || []).length;
        // Resolved signed variant URLs are internal only, never serialized into logs.
        Object.defineProperty(base, 'variantsInfo', { value: extractHlsVariants(body, safe), enumerable: false });
        base.segments = (body.match(/#EXTINF:/g) || []).length;
        return base;
      });
    }).catch(function (err) {
      return { ok: false, host: hostname, checked: true,
        reason: err && err.name === 'AbortError' ? 'timeout' : 'network',
        message: err && err.name === 'AbortError' ? 'Час перевірки HLS вичерпано' :
          'Браузер не зміг прочитати HLS (мережа або CORS)' };
    }).then(function (result) {
      if (timer) clearTimeout(timer);
      return result;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function askDirectUrl(title) {
    function handle(value) {
      if (!String(value || '').trim()) return;
      try { playDirect(value, title || 'Тест прямого потоку'); }
      catch (err) { notify('Не вдалося запустити: ' + String(err.message || err)); }
    }
    if (Lampa.Input && typeof Lampa.Input.edit === 'function') {
      Lampa.Input.edit({ title: 'Вставте прямий HTTPS HLS/MP4 URL', value: '' }, handle);
    } else if (typeof window.prompt === 'function') {
      handle(window.prompt('Вставте пряме посилання на HLS (.m3u8) / MP4:', ''));
    } else notify('Використайте в консолі: LampaMultiSource.playDirect(url, title)');
  }

  // Generic extraction from publicly exposed HTML5/PlayerJS links; no protected player decoding.
  function extractDirect(html, base) {
    var streams = [];
    var frames = [];
    var doc = fromHtml(html);
    function addStream(url, title, extra) {
      var u = mediaUrl(url, base); if (!u) return;
      var item = { title: title || 'Відео', url: u, season: 0, episode: 0, voice: '' };
      if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) item[k] = extra[k];
      streams.push(item);
    }
    if (doc) {
      var els = doc.querySelectorAll('video[src],source[src],a[href],*[data-file],*[data-src]');
      for (var i = 0; i < els.length; i++) {
        var element = els[i];
        var v = element.getAttribute('src') || element.getAttribute('href') ||
          element.getAttribute('data-file') || element.getAttribute('data-src');
        addStream(v, element.getAttribute('title') || element.textContent.trim().slice(0, 55));
      }
      var iframes = doc.querySelectorAll('iframe[src],iframe[data-src]');
      for (var j = 0; j < iframes.length; j++) {
        var src = absolute(iframes[j].getAttribute('src') || iframes[j].getAttribute('data-src'), base);
        if (src) frames.push(src);
      }
    }
    // Match explicit media extensions (including URLs escaped inside JSON/JS strings).
    var cleaned = html.replace(/\\\//g, '/').replace(/\\u0026/gi, '&')
      .replace(/&amp;/g, '&');
    var match, pattern = /(?:https?:)?\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4|mpd|webm)(?:\?[^\s"'<>\\]*)?/gi;
    while ((match = pattern.exec(cleaned)) !== null) {
      addStream(match[0], 'Відео');
      if (streams.length > 100) break;
    }
    // Plain JSON playlist, if the page publishes it without encryption.
    var blocks = doc ? doc.querySelectorAll('script[type="application/json"],script[type="application/ld+json"]') : [];
    function walk(value, level, season, episode) {
      if (level > 7 || !value) return;
      if (Array.isArray(value)) { value.forEach(function (v) { walk(v, level + 1, season, episode); }); return; }
      if (typeof value !== 'object') return;
      var se = Number(value.season || value.season_number || season || 0);
      var ep = Number(value.episode || value.episode_number || episode || 0);
      var url = value.file || value.stream || value.contentUrl || value.url;
      if (typeof url === 'string') addStream(url, value.title || value.name || 'Відео',
        { season: se, episode: ep, voice: value.voice || value.translation || '' });
      Object.keys(value).forEach(function (key) {
        if (key !== 'url' && key !== 'file' && key !== 'stream') walk(value[key], level + 1, se, ep);
      });
    }
    for (var q = 0; q < blocks.length; q++) {
      try { walk(JSON.parse(blocks[q].textContent), 0, 0, 0); } catch (e) {}
    }
    return { streams: dedup(streams, function (s) { return s.url + ':' + s.season + ':' + s.episode; }),
      frames: dedup(frames, function (s) { return s; }) };
  }

  // UASerials publishes the player metadata in data-tag1. Use the browser WebCrypto
  // implementation of the client-side JSON format documented by the Movian adapter.
  // This decodes player metadata, not encrypted media segments or DRM.
  var UAS_META_PASSPHRASE = '297796CCB81D255125';
  function hexBytes(value) {
    if (typeof value !== 'string' || !/^(?:[0-9a-f]{2})+$/i.test(value))
      throw new Error('Неправильне hex-поле метаданих плеєра');
    var out = new Uint8Array(value.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(value.substr(i * 2, 2), 16);
    return out;
  }
  // Accept canonical Base64 and URL-safe Base64 without padding. Always
  // validate the alphabet/length before atob: Tortuga's `file` value is not
  // guaranteed to use the same representation as UASerials data-tag1.
  function b64Bytes(value, label) {
    label = label || 'метаданих плеєра';
    if (typeof value !== 'string' || !value.length || value.length > 500000)
      throw new Error('Некоректна довжина Base64 (' + label + ')');
    var clean = value.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean))
      throw new Error('Невідомий формат: не Base64 або Base64URL (' + label + ')');
    var unpadded = clean.replace(/=+$/, '');
    // Some player responses have noncanonical or incomplete trailing '='.
    // Padding is not data: remove it, validate data length and then reconstruct it.
    // This does NOT imply the decoded content is a media URL.
    if (!unpadded || unpadded.length % 4 === 1)
      throw new Error('Неправильна довжина Base64 (' + label + ')');
    var normalized = unpadded + '==='.slice(0, (4 - unpadded.length % 4) % 4);
    var binary;
    try { binary = atob(normalized); }
    catch (e) { throw new Error('Неможливо прочитати Base64 (' + label + ')'); }
    var out = new Uint8Array(binary.length);
    for (var i = 0; i < out.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  function parseSiteJson(text) {
    if (typeof text !== 'string') return text;
    var value;
    try { value = JSON.parse(text); }
    catch (e) { value = JSON.parse(text.replace(/\\"/g, '"')); }
    if (typeof value === 'string') value = JSON.parse(value);
    return value;
  }
  function encryptedPlayerTag(html) {
    var doc = fromHtml(html);
    var element = doc && doc.querySelector('player-control[data-tag1]');
    return element ? element.getAttribute('data-tag1') : '';
  }
  function decodeUASPlayer(html) {
    var attr = encryptedPlayerTag(html);
    if (!attr) return Promise.resolve(null);
    var cipher = parseSiteJson(attr);
    if (!cipher || !cipher.ciphertext || !cipher.iv || !cipher.salt)
      return Promise.reject(new Error('Невідомий формат data-tag1'));
    if (!window.crypto || !window.crypto.subtle)
      return Promise.reject(new Error('WebCrypto недоступний; потрібен HTTPS та сучасний браузер'));
    var iv = hexBytes(cipher.iv), salt = hexBytes(cipher.salt), payload = b64Bytes(cipher.ciphertext);
    if (iv.length !== 16 || payload.length < 16 || salt.length < 8)
      return Promise.reject(new Error('Неочікувані розміри метаданих плеєра'));
    var subtle = window.crypto.subtle;
    var pw = new TextEncoder().encode(UAS_META_PASSPHRASE);
    return subtle.importKey('raw', pw, 'PBKDF2', false, ['deriveKey']).then(function (key) {
      return subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 999, hash: 'SHA-512' },
        key, { name: 'AES-CBC', length: 256 }, false, ['decrypt']);
    }).then(function (key) {
      return subtle.decrypt({ name: 'AES-CBC', iv: iv }, key, payload);
    }).then(function (plain) {
      var parsed = parseSiteJson(new TextDecoder('utf-8', { fatal: true }).decode(plain));
      if (!Array.isArray(parsed) && !(parsed && Array.isArray(parsed.data)))
        throw new Error('Розшифровані метадані мають невідомий формат');
      return Array.isArray(parsed) ? parsed : parsed.data;
    }).catch(function (err) {
      throw new Error('Не вдалося обробити метадані UASerials: ' + String(err.message || err));
    });
  }
  function episodeNumber(value) {
    var match = String(value || '').match(/\d+/);
    return match ? Number(match[0]) : 0;
  }
  function playerMediaItems(data) {
    var items = [];
    if (!Array.isArray(data)) return items;
    function add(url, title, season, episode, voice) {
      if (typeof url !== 'string' || !/^https:\/\//i.test(url) || url.length > 4000) return;
      var item = { url: url, title: String(title || 'Відео').slice(0, 110),
        season: season || 0, episode: episode || 0, voice: String(voice || '').slice(0, 80) };
      if (!mediaUrl(url, url)) item.resolve = true;
      items.push(item);
    }
    data.forEach(function (tab) {
      if (!tab || !/плеєр|player/i.test(String(tab.tabName || ''))) return;
      if (Array.isArray(tab.seasons)) {
        tab.seasons.forEach(function (s, si) {
          var season = episodeNumber(s.title) || si + 1;
          (s.episodes || []).forEach(function (ep, ei) {
            var number = episodeNumber(ep.title) || ei + 1;
            var voices = Array.isArray(ep.sounds) && ep.sounds.length ? ep.sounds : [ep];
            voices.forEach(function (voice) {
              var voiceTitle = voice.title || voice.voice || '';
              add(voice.url || voice.file,
                'Сезон ' + season + ' • Серія ' + number + (voiceTitle ? ' — ' + voiceTitle : ''),
                season, number, voiceTitle);
            });
          });
        });
      } else if (tab.url) add(tab.url, 'Дивитися онлайн', 0, 0, '');
    });
    return dedup(items, function (s) { return [s.url, s.season, s.episode, s.voice].join('|'); });
  }
  function sourceFromText(text, base) {
    var result = [], seen = {};
    function put(url, voice, season, episode, title) {
      var safe = mediaUrl(url, base);
      if (!safe) return;
      var key = safe + '|' + season + '|' + episode + '|' + voice;
      if (seen[key]) return;
      seen[key] = true;
      result.push({ url: safe, voice: voice || '', season: season || 0, episode: episode || 0,
        title: title || 'Відео' });
    }
    function parseMediaLine(raw, season, episode, title) {
      // Multi-language Tortuga streams may use {voice}URL labels.
      var pattern = /\{([^}]{1,80})\}\s*(https:\/\/[^\s{}"'<>]+?\.m3u8(?:\?[^\s{}"'<>]*)?)/g;
      var m, labelled = false;
      while ((m = pattern.exec(raw)) !== null) { put(m[2], m[1], season, episode, title); labelled = true; }
      if (labelled) return;
      var links = raw.match(/https:\/\/[^\s,"'<>\[\]{}]+?\.(?:m3u8|mp4)(?:\?[^\s,"'<>\[\]{}]*)?/g) || [];
      links.forEach(function (url) { put(url, '', season, episode, title); });
    }
    var value = String(text || '');
    try {
      var obj = JSON.parse(value);
      if (Array.isArray(obj)) {
        obj.forEach(function (s, i) {
          if (!s || typeof s !== 'object') return;
          var season = episodeNumber(s.title) || s.number || i + 1;
          (s.folder || []).forEach(function (ep, ei) {
            if (!ep || !ep.file) return;
            var e = episodeNumber(ep.title) || ei + 1;
            parseMediaLine(String(ep.file), season, e, 'Сезон ' + season + ' • Серія ' + e);
          });
        });
        return result;
      }
    } catch (e) { /* Not a structured playlist */ }
    parseMediaLine(value, 0, 0, 'Відео');
    return result;
  }
  function isReadableVideoConfig(value) {
    // Not a guess at encryption: accept only actual plaintext video data.
    return /^https:\/\//i.test(value) || /^\s*[\[{]/.test(value) ||
      /^\s*#EXTM3U/.test(value) || /https:\/\/[^\s"'<>]+\.(?:m3u8|mp4)/i.test(value);
  }
  function decodeTortugaToken(token) {
    var bytes = b64Bytes(token, 'Tortuga file');
    if (bytes.length < 2) throw new Error('Порожні дані Tortuga file');
    // A valid Base64 envelope can contain plaintext JSON or URLs. Only use
    // that form when the contents are genuinely recognizable.
    try {
      var plain = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (isReadableVideoConfig(plain)) return plain;
    } catch (e) { /* binary payload */ }
    // Compatibility with the earlier sample token representation. Do not
    // assume every valid Base64 value follows this old representation.
    var decoded = new Uint8Array(bytes.length - 1), seed = bytes[0];
    for (var i = 0; i < decoded.length; i++)
      decoded[i] = bytes[i + 1] ^ ((seed + 13 + 7 * i) & 255);
    try {
      var legacy = new TextDecoder('utf-8', { fatal: true }).decode(decoded);
      if (isReadableVideoConfig(legacy)) return legacy;
    } catch (e) { /* not the sample XOR layout */ }
    throw new Error('Base64 прочитано, але формат Tortuga file не підтримується. Потрібна перевірка формату плеєра.');
  }
  function tortugaFileInfo(value) {
    var raw = String(value || '').trim();
    var stripped = raw.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    var isB64 = /^[A-Za-z0-9+/]*={0,2}$/.test(stripped);
    var unpadded = stripped.replace(/=+$/, '');
    var okLength = !!unpadded && unpadded.length % 4 !== 1;
    return { length: raw.length,
      kind: /^https:\/\//i.test(raw) ? 'url' : /^[\[{]/.test(raw) ? 'json-or-list' :
        isB64 ? 'base64-or-token' : 'other',
      base64LengthValid: isB64 && okLength,
      paddingCount: stripped.length - unpadded.length,
      rawModulo4: stripped.length % 4,
      unpaddedModulo4: unpadded.length % 4,
      normalizedPadding: okLength ? (4 - unpadded.length % 4) % 4 : null };
  }
  function unpackTortugaFile(value) {
    var raw = String(value || '').replace(/\\\//g, '/').trim();
    var info = tortugaFileInfo(raw);
    if (info.kind === 'url' || info.kind === 'json-or-list') return raw;
    if (info.kind !== 'base64-or-token')
      throw new Error('Невідомий формат Tortuga file: це не URL, JSON або Base64');
    if (!info.base64LengthValid)
      throw new Error('Некоректна довжина вмісту Tortuga file, потрібен інший формат');
    return decodeTortugaToken(raw);
  }
  function parseTortugaHtml(entry, html) {
    var m = html.match(/\bfile\s*:\s*(["'])([^"']{1,200000})\1/i);
    if (!m) throw new Error('Відповідь Tortuga не містить відкритого поля file');
    var value = unpackTortugaFile(m[2]);
    var streams = sourceFromText(value, entry.url);
    if (!streams.length) throw new Error('Плеєр не надав сумісного HLS/MP4 потоку');
    return streams.map(function (s) {
      s.season = s.season || entry.season;
      s.episode = s.episode || entry.episode;
      s.voice = s.voice || entry.voice;
      if (s.title === 'Відео') s.title = entry.title;
      return s;
    });
  }
  function resolvePlayerEntry(entry) {
    if (mediaUrl(entry.url, entry.url)) return Promise.resolve([entry]);
    if (!/^https:\/\/tortuga\.(?:wtf|tw)\//i.test(entry.url))
      return Promise.reject(new Error('Для цього вебплеєра немає підтримуваного адаптера'));
    return ajaxText(entry.url, 15000).then(function (html) {
      return parseTortugaHtml(entry, html);
    });
  }
  // Only episode metadata from the optional Worker is used to enrich the
  // catalogue. Its signed links may be bound to a different network context:
  // they are NEVER considered playable without the same HLS preflight check.
  function resolveWorkerPlayerEntry(entry) {
    var adapter = getAdapterUrl();
    if (!adapter || !/^https:\/\/tortuga\.(?:wtf|tw)\//i.test(entry.url))
      return Promise.resolve([]);
    return rawRequest(adapter + '/fetch?url=' + encodeURIComponent(entry.url), 15000)
      .then(function (html) { return parseTortugaHtml(entry, html); });
  }

  var uaserials = {
    id: 'uaserials', name: 'UASerials', baseUrl: 'https://uaserials.com',
    search: function (movie, api) {
      var queries = [movie.title || movie.name, movie.original_title || movie.original_name].filter(Boolean);
      queries = dedup(queries, normal);
      if (!queries.length) return Promise.resolve([]);
      // Search path may change. Try the public URL variants sequentially,
      // without treating a 404 or a catalog with no matches as a CORS failure.
      function parseSearch(html) {
        var doc = fromHtml(html), results = [];
        if (!doc) return results;
        var links = doc.querySelectorAll('a[href]');
        for (var i = 0; i < links.length; i++) {
          var a = links[i], href = absolute(a.getAttribute('href'), uaserials.baseUrl);
          if (!/^https:\/\/uaserials\.com\/\d+[-_][^?#]+\.html(?:[?#]|$)/i.test(href)) continue;
          var card = a.closest ? a.closest('article,.short-item,.short,.th-item,.movie-item,.item,.card,.shortstory') : null;
          var titleEl = card && card.querySelector('.short-title,.th-title,.movie-title,.poster__title,.poster-title,.card-title,.title,h2,h3');
          var cover = a.querySelector('img[alt]') || (card && card.querySelector('img[alt]'));
          var alt = cover && cover.getAttribute('alt') || '';
          var rawTitle = titleEl && titleEl.textContent || alt || a.getAttribute('title') || a.textContent || '';
          var title = cleanSearchTitle(rawTitle, movie);
          if (!title || title.length > 160) continue;
          var yearText = card ? card.textContent : '';
          var yearMatch = yearText.match(/(?:19|20)\d{2}/);
          results.push({ title: title, url: href, year: yearMatch ? yearMatch[0] : '' });
        }
        return dedup(results, function (r) { return r.url; });
      }
      function searchOne(query) {
        var encoded = encodeURIComponent(query);
        var urls = [
          uaserials.baseUrl + '/search/' + encoded + '/page/1/',
          uaserials.baseUrl + '/search/' + encoded + '/',
          uaserials.baseUrl + '/index.php?do=search&subaction=search&story=' + encoded
        ];
        var errors = [], anySuccess = false;
        function tryNext(i) {
          if (i >= urls.length) {
            if (!anySuccess && errors.length) throw errors[0];
            return [];
          }
          return api.request(urls[i]).then(function (html) {
            anySuccess = true;
            var items = parseSearch(html);
            return items.length ? items : tryNext(i + 1);
          }, function (err) {
            errors.push(err);
            return tryNext(i + 1);
          });
        }
        return tryNext(0);
      }
      return Promise.all(queries.slice(0, 2).map(function (query) {
        return searchOne(query).then(function (items) { return { items: items }; }, function (error) { return { error: error }; });
      })).then(function (lists) {
        if (lists.every(function (l) { return l.error; })) throw lists[0].error;
        var all = dedup([].concat.apply([], lists.map(function (l) { return l.items || []; })), function (c) { return c.url; });
        all.forEach(function (r) { r.score = scoreMatch(r, movie); });
        all.sort(function (a, b) { return b.score - a.score; });
        return all.slice(0, 30);
      });
    },
    getStreams: function (item, api) {
      return api.request(item.url).then(function (html) {
        var direct = extractDirect(html, item.url);
        return decodeUASPlayer(html).then(function (meta) {
          var found = direct.streams.concat(playerMediaItems(meta));
          return { streams: dedup(found, function (s) { return [s.url, s.season, s.episode, s.voice].join('|'); }).slice(0, 100),
            embeds: direct.frames.slice(0, 5), pageUrl: item.url,
            notice: meta ? 'Метадані плеєра знайдені, але немає підтримуваних відеоджерел.' :
              'У HTML немає відкритих HLS/MP4 посилань або підтримуваних даних плеєра.' };
        });
      });
    }
  };
  registerSource(uaserials);

  // Public API available to separately loaded source scripts.
  var api = {
    _coreLoaded: true,
    version: VERSION,
    registerSource: registerSource,
    unregisterSource: removeSource,
    listSources: getSources,
    request: ajaxText,
    setAdapterUrl: setAdapterUrl,
    getAdapterUrl: getAdapterUrl,
    testAdapter: testAdapter,
    // Manual playback test; URLs are not saved or uploaded by MultiSource.
    playDirect: playDirect,
    checkHlsStream: checkHlsStream,
    validatePlayableUrl: validatePlayableUrl,
    extractDirect: extractDirect,
    inspectPlayer: function (url) {
      return ajaxText(url).then(decodeUASPlayer).then(function (meta) {
        var list = playerMediaItems(meta);
        return { playerControl: !!meta, tabCount: meta ? meta.length : 0,
          entries: list.length, direct: list.filter(function (e) { return !e.resolve; }).length,
          tortuga: list.filter(function (e) { return /^https:\/\/tortuga\./.test(e.url); }).length };
      });
    },
    // Safe diagnostics: never print the value of `file`, signed media URLs,
    // keys, cookies, or embedded authentication tokens.
    inspectResolver: function (pageUrl) {
      if (!/^https:\/\/uaserials\.com\//i.test(String(pageUrl || '')))
        return Promise.reject(new Error('Потрібна HTTPS-адреса сторінки uaserials.com'));
      return uaserials.getStreams({ url: pageUrl }, api).then(function (found) {
        var entry = (found.streams || []).filter(function (s) {
          return s.resolve && /^https:\/\/tortuga\.(?:tw|wtf)\//i.test(s.url);
        })[0];
        if (!entry) return { tortugaEntry: false, entries: (found.streams || []).length };
        return ajaxText(entry.url, 15000).then(function (html) {
          var match = html.match(/\bfile\s*:\s*(["'])([^"']{1,200000})\1/i);
          var info = match ? tortugaFileInfo(match[2]) : null;
          var report = { tortugaEntry: true, embedHost: host(entry.url), htmlSize: html.length,
            fileField: !!match, fileFormat: info ? info.kind : 'absent',
            fileLength: info ? info.length : 0,
            base64LengthValid: info ? info.base64LengthValid : false,
            paddingCount: info ? info.paddingCount : null,
            rawModulo4: info ? info.rawModulo4 : null,
            unpaddedModulo4: info ? info.unpaddedModulo4 : null,
            normalizedPadding: info ? info.normalizedPadding : null };
          if (match) {
            try {
              var unpacked = unpackTortugaFile(match[2]);
              report.decoder = 'decoded';
              report.streamCount = sourceFromText(unpacked, entry.url).length;
            } catch (decodeError) {
              report.decoder = 'unsupported';
              report.decoderMessage = String(decodeError.message || decodeError);
            }
          }
          return report;
        }, function (err) {
          return { tortugaEntry: true, response: 'error', error: String(err.message || err) };
        });
      });
    },
    inspectCatalogTransports: function (pageUrl) {
      if (!/^https:\/\/uaserials\.com\//i.test(String(pageUrl || '')))
        return Promise.reject(new Error('Очікується HTTPS-адреса UASerials'));
      return uaserials.getStreams({ url: pageUrl }, api).then(function (result) {
        var entry = (result.streams || []).filter(function (s) { return s.resolve &&
          /^https:\/\/tortuga\.(?:tw|wtf)\//i.test(s.url); })[0];
        if (!entry) return { playerFound: false, browserCount: 0, workerCount: 0 };
        return Promise.all([
          resolvePlayerEntry(entry).then(function (s) { return episodeLabels(s).length; }, function () { return 0; }),
          resolveWorkerPlayerEntry(entry).then(function (s) { return episodeLabels(s).length; }, function () { return 0; })
        ]).then(function (counts) {
          return { playerFound: true, browserCount: counts[0], workerCount: counts[1],
            browserFirst: fetchDiagnostics.transport };
        });
      });
    },
    episodeCatalogStatus: function (title) {
      var saved = readEpisodeLabels(title, 'uaserials');
      return { title: title, count: saved.length, episodes: saved.map(function (e) {
        return { season: e.season, episode: e.episode, voice: e.voice };
      }) };
    },
    inspectPage: function (url) {
      if (!/^https:\/\//i.test(String(url || ''))) return Promise.reject(new Error('Вкажіть HTTPS-URL'));
      return ajaxText(url).then(function (html) {
        var parsed = extractDirect(html, url);
        return { url: url, htmlSize: html.length, streamCount: parsed.streams.length,
          iframeCount: parsed.frames.length,
          iframeHosts: dedup(parsed.frames.map(host), function (s) { return s; }),
          scriptCount: (html.match(/<script\b/gi) || []).length,
          hasVideoElement: /<video\b/i.test(html) };
      });
    },
    helpers: { absolute: absolute, mediaUrl: mediaUrl, escapeHtml: escapeHtml,
      normalize: normal, cleanSearchTitle: cleanSearchTitle,
      tmdbSeriesId: tmdbSeriesId, episodeImagePath: episodeImagePath,
      extractHlsVariants: extractHlsVariants },
    environment: function () { return { https: location.protocol === 'https:',
      secureContext: !!window.isSecureContext, webCrypto: !!(window.crypto && window.crypto.subtle),
      android: /android/i.test(navigator.userAgent || ''), chromeCompanion: fetchDiagnostics.companion,
      tmdbApi: !!(window.Lampa && Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb),
      version: VERSION }; },
    open: openMovie,
    // Can be run manually in browser console after opening a movie card.
    refreshButton: function () { return ensureActiveCardButton(true); },
    debug: function () {
      return { version: VERSION, initialized: diagnostics.initialized,
        bootAttempts: diagnostics.bootAttempts, fullEvents: diagnostics.fullEvents,
        buttonsAdded: diagnostics.buttonsAdded, lastError: diagnostics.lastError,
        lastFull: diagnostics.lastFull, lastScan: diagnostics.lastScan, floating: diagnostics.floating,
        adapterUrl: getAdapterUrl(), network: { transport: fetchDiagnostics.transport,
          lastRequest: fetchDiagnostics.lastRequest, lastStatus: fetchDiagnostics.lastStatus,
          lastError: fetchDiagnostics.lastError,
          tortugaDirect: fetchDiagnostics.tortugaDirect,
          tortugaFallback: fetchDiagnostics.tortugaFallback,
          companion: fetchDiagnostics.companion, catalogWorker: fetchDiagnostics.catalogWorker || 'not_tried' },
        currentComponent: activeComponent(),
        inDom: typeof document.querySelectorAll === 'function' ? document.querySelectorAll('.ms-open-button').length : 0 };
    }
  };
  window.LampaMultiSource = api;

  function openMovie(movie) {
    movie = movie || {};
    if (!window.Lampa || !Lampa.Activity) return;
    Lampa.Activity.push({ url: '', title: 'MultiSource — Онлайн', component: COMPONENT,
      page: 1, movie: movie, search: movie.title || movie.name || movie.original_title || '' });
  }

  function OnlineComponent(object) {
    var self = this;
    var scroll = new Lampa.Scroll({ mask: true, over: true });
    var explorer = new Lampa.Explorer(object);
    var root = explorer.render();
    var last = null;
    var active = true;
    var currentSource = chosenSource();
    var currentCandidates = [];
    var currentItem = null;
    var currentStreams = [];
    var currentResult = null;
    var selectedSeason = null;
    var selectedVoice = '';
    var tmdbSeasonCache = {};
    var episodeRows = [];
    var lastEpisodeCatalog = null;
    var state = 'results';
    var generation = 0;
    var started = false;
    var viewportTimer = null;
    var viewportBound = false;
    var wheelAccumulator = 0;
    var toolbar = $('<div class="ms-toolbar"></div>');
    scroll.body().addClass('ms-list');
    scroll.render().addClass('ms-scroll-viewport');
    explorer.appendFiles(scroll.render());
    explorer.appendHead(toolbar);

    // Lampa.Scroll has an independent viewport height. When Chrome DevTools
    // opens/closes, window.innerHeight changes. Without scroll.minus() the
    // right pane keeps its former clipping rectangle and later episodes are
    // visually unreachable even though they are in the catalog.
    function measureViewport() {
      if (!active || !scroll || typeof scroll.minus !== 'function') return;
      try {
        var aside = explorer.render().find('.files__left, .explorer__files-left');
        scroll.minus(window.innerWidth > 580 || !aside.length ? false : aside);
      } catch (err) { console.warn(LOG, 'viewport recalculation', err); }
    }
    function scheduleViewport() {
      if (!active) return;
      if (viewportTimer !== null) clearTimeout(viewportTimer);
      viewportTimer = setTimeout(function () {
        viewportTimer = null;
        measureViewport();
        // Focused element should remain visible after the height changes.
        if (last && document.documentElement.contains(last)) {
          try { scroll.update($(last), true); } catch (e) {}
        }
      }, 60);
    }
    function showEpisodePicker(labels, resolverEntry, movieTitle) {
      if (!window.Lampa || !Lampa.Select || typeof Lampa.Select.show !== 'function') {
        notify('Меню вибору серії недоступне у цій версії Lampa');
        return;
      }
      var previous = 'content';
      try { previous = Lampa.Controller.enabled().name || 'content'; } catch (e) {}
      Lampa.Select.show({
        title: 'Оберіть серію • ' + movieTitle,
        items: labels.map(function (label, i) {
          return { title: label.title || ('Сезон ' + label.season + ' • Серія ' + label.episode),
            subtitle: label.voice || '', id: String(i) };
        }),
        onBack: function () { Lampa.Controller.toggle(previous); },
        onSelect: function (choice) {
          var i = Number(choice && choice.id);
          if (!isFinite(i) || i < 0 || i >= labels.length) return;
          Lampa.Select.close();
          Lampa.Controller.toggle('content');
          playSelectedEpisode(resolverEntry, labels[i], movieTitle);
        }
      });
    }
    // Fallback for desktop builds in which the Lampa scroll surface doesn't
    // respond to a physical mouse wheel. Focus navigation activates scroll.update.
    // The listener is local to the MultiSource results (never window/document).
    function onListWheel(event) {
      if (!active || event.ctrlKey || event.metaKey || !event.deltaY) return;
      wheelAccumulator += event.deltaY;
      if (Math.abs(wheelAccumulator) < 36) return;
      var step = wheelAccumulator > 0 ? 1 : -1;
      wheelAccumulator = 0;
      var rows = scroll.body().find('.ms-row.selector');
      if (!rows.length) return;
      var i = rows.index(last);
      if (i < 0) i = 0;
      var next = Math.max(0, Math.min(rows.length - 1, i + step));
      if (next === i && last) return;
      var el = rows.eq(next);
      last = el[0];
      try { Lampa.Controller.collectionFocus(last, scroll.render()); } catch (e) {}
      try { scroll.update(el, true); } catch (e) {}
      event.preventDefault();
      event.stopPropagation();
    }
    scroll.body()[0].addEventListener('wheel', onListWheel, { passive: false });
    function isValid(g) { return active && g === generation; }
    function loading(yes) { if (self.activity && self.activity.loader) self.activity.loader(yes); }
    function showMessage(title, detail, action) {
      scroll.clear();
      var panel = $('<div class="ms-message"></div>');
      panel.append($('<div class="ms-message-title"></div>').text(title));
      panel.append($('<div class="ms-message-detail"></div>').text(detail || ''));
      scroll.append(panel);
      if (action) addRow(action.title, action.subtitle || '', action.click, 'ms-action');
      enableController();
    }
    function addRow(title, info, onEnter, cls) {
      var item = $('<div class="ms-row selector"></div>').addClass(cls || '');
      item.append($('<div class="ms-row-title"></div>').text(title || 'Без назви'));
      if (info) item.append($('<div class="ms-row-info"></div>').text(info));
      item.on('hover:enter', function () { if (onEnter) onEnter(); });
      item.on('hover:focus', function (e) { last = e.currentTarget || e.target; scroll.update(item, true); });
      scroll.append(item);
      return item;
    }
    function beginList() {
      last = null;
      wheelAccumulator = 0;
      scroll.clear();
      if (typeof scroll.reset === 'function') scroll.reset();
      scheduleViewport();
    }
    function sourceCaption() {
      toolbar.empty();
      var source = registry[currentSource];
      var button = $('<div class="ms-toolbar-button selector">Джерело: ' +
        escapeHtml(source ? source.name : currentSource) + ' ▾</div>');
      button.on('hover:enter', chooseSource);
      toolbar.append(button);
      var change = $('<div class="ms-toolbar-button selector">Змінити назву пошуку</div>');
      change.on('hover:enter', changeQuery);
      toolbar.append(change);
      var setupButton = $('<div class="ms-toolbar-button selector">⚙ Налаштування</div>');
      setupButton.on('hover:enter', function () {
        var previous = 'content';
        try { previous = Lampa.Controller.enabled().name || 'content'; } catch (e) {}
        Lampa.Select.show({ title: 'MultiSource — налаштування',
          items: [{ title: 'Якість: ' + (getQualitySetting() === 'auto' ? 'Auto' : getQualitySetting() + 'p'), id: 'quality' },
            { title: getAdapterUrl() ? 'Сервер: налаштовано' : 'Налаштувати сервер', id: 'adapter' },
            { title: 'Вставити HLS/MP4 (тест)', id: 'direct' },
            { title: 'Про TMDB і MultiSource', id: 'credits' }],
          onBack: function () { Lampa.Controller.toggle(previous); },
          onSelect: function (choice) {
            Lampa.Select.close(); Lampa.Controller.toggle('content');
            if (choice.id === 'quality') chooseQuality(sourceCaption);
            if (choice.id === 'adapter') configureAdapter();
            if (choice.id === 'direct') askDirectUrl('Перевірка потоку');
            if (choice.id === 'credits') {
              Lampa.Select.show({ title: 'Про MultiSource',
                items: [{ title: 'This product uses the TMDB API but is not endorsed or certified by TMDB.', id: 'notice' },
                  { title: 'TMDB — www.themoviedb.org', id: 'tmdb' }],
                onBack: function () { Lampa.Controller.toggle('content'); },
                onSelect: function (c) { Lampa.Select.close(); Lampa.Controller.toggle('content');
                  if (c.id === 'tmdb') openWeb('https://www.themoviedb.org/'); }
              });
            }
          }
        });
      });
      toolbar.append(setupButton);
    }
    function configureAdapter() {
      if (Lampa.Input && typeof Lampa.Input.edit === 'function') {
        Lampa.Input.edit({ title: 'HTTPS-адреса Cloudflare Worker', value: getAdapterUrl() }, function (value) {
          try {
            setAdapterUrl(value);
            sourceCaption();
            if (!value) return notify('Сервер відключено');
            testAdapter().then(function () {
              notify('Адаптер доступний'); find();
            }, function (err) { notify('Адаптер: ' + String(err.message || err)); });
          } catch (err) { notify(String(err.message || err)); }
        });
      } else notify('Налаштуйте в консолі: LampaMultiSource.setAdapterUrl("https://...workers.dev")');
    }
    function changeQuery() {
      if (Lampa.Input && typeof Lampa.Input.edit === 'function') {
        Lampa.Input.edit({ title: 'Пошук фільму / серіалу', value: object.search || '' }, function (value) {
          if (value) { object.search = value; find(); }
        });
      } else notify('Пошук: ' + (object.search || 'без назви'));
    }
    function chooseSource() {
      var enabled = Lampa.Controller.enabled().name;
      Lampa.Select.show({ title: 'Оберіть джерело',
        items: getSources().map(function (src) {
          return { title: src.name, id: src.id, selected: src.id === currentSource };
        }),
        onBack: function () { Lampa.Controller.toggle(enabled); },
        onSelect: function (choice) {
          Lampa.Select.close();
          currentSource = choice.id;
          setStorage('source', currentSource);
          currentItem = null; currentCandidates = []; currentStreams = [];
          sourceCaption(); find();
        }
      });
    }
    function find() {
      var src = registry[currentSource];
      if (!src) return showMessage('Джерело не знайдено', 'Підключіть відповідний модуль.');
      var g = ++generation;
      state = 'results'; currentItem = null; currentResult = null;
      sourceCaption(); loading(true);
      showMessage('Шукаємо на ' + src.name, object.search || object.movie.title || '...');
      var movie = {};
      for (var key in object.movie) movie[key] = object.movie[key];
      movie.title = object.search || movie.title || movie.name;
      Promise.resolve().then(function () { return src.search(movie, api); }).then(function (items) {
        if (!isValid(g)) return;
        loading(false); currentCandidates = Array.isArray(items) ? items : [];
        beginList();
        if (!currentCandidates.length) {
          showMessage('Нічого не знайдено', 'Перевірте назву або спробуйте інше джерело.', {
            title: 'Відкрити пошук на UASerials', click: function () {
              if (currentSource === 'uaserials') openWeb(uaserials.baseUrl + '/search/' + encodeURIComponent(object.search) + '/');
            }
          });
          return;
        }
        addRow('Знайдено: ' + currentCandidates.length, 'Оберіть відповідний фільм або серіал', null, 'ms-section');
        currentCandidates.forEach(function (item) {
          addRow(item.title, [item.year, src.name].filter(Boolean).join(' • '), function () { details(item); });
        });
        enableController();
      }, function (err) {
        if (!isValid(g)) return;
        loading(false);
        showMessage('Не вдалося виконати пошук', String(err.message || err) +
          (getAdapterUrl() ? '. Перевірте /health і відповідь джерела (HTTP 403/404).' :
            '. Браузер може блокувати CORS. Налаштуйте власний HTTPS-адаптер у верхньому меню.'),
          { title: getAdapterUrl() ? 'Повторити пошук' : 'Налаштувати сервер',
            click: getAdapterUrl() ? find : configureAdapter });
      });
    }
    function renderStreamOptions(result) {
      result = result || currentResult || {};
      state = 'streams';
      beginList();
      var item = currentItem || { title: 'Відео' };
      var src = registry[currentSource] || { name: currentSource };
      addRow('‹ До результатів', src.name, renderResults, 'ms-action');
      addRow(item.title, item.year || src.name, null, 'ms-section');
      currentStreams.forEach(function (stream, index) {
        var info = [stream.resolve ? 'Вебплеєр (отримати потік)' : '', stream.voice,
          stream.season ? 'Сезон ' + stream.season : '',
          stream.episode ? 'Серія ' + stream.episode : ''].filter(Boolean).join(' • ');
        addRow(stream.title || ('Потік ' + (index + 1)), info || 'HLS / MP4', function () {
          playOrResolve(stream, currentStreams, item.title);
        });
      });
      var saved = readEpisodeLabels(item.title, currentSource);
      if (saved.length && currentStreams.some(function (s) { return s.resolve; })) {
        addRow('📺 Список серій (' + saved.length + ')',
          'Збережені назви серій; актуальне посилання запитується під час запуску',
          function () {
            var entry = currentStreams.filter(function (s) { return s.resolve; })[0];
            renderEpisodeCatalog(saved, entry, item.title, true);
          }, 'ms-action');
      }
      if (!currentStreams.length) {
        addRow('Пряме відеопосилання не знайдено',
          result.notice || 'Плеєр може підвантажувати відео окремим запитом', null, 'ms-warning');
        (result.embeds || []).forEach(function (url, i) {
          addRow('Відкрити вбудований плеєр ' + (i + 1), 'Вебплеєр: ' + host(url),
            function () { openWeb(url); }, 'ms-action');
        });
      }
      addRow('▶ Вставити власне HLS/MP4-посилання',
        'Тест відтворення в Lampa Player (посилання не зберігається)',
        function () { askDirectUrl(item.title + ' — прямий потік'); }, 'ms-action');
      var pageUrl = result.pageUrl || item.url;
      if (pageUrl) addRow('Відкрити на сайті ' + src.name,
        'Для плеєрів, які неможливо запустити безпосередньо', function () { openWeb(pageUrl); }, 'ms-action');
      enableController();
    }
    function details(item) {
      var src = registry[currentSource];
      var g = ++generation;
      state = 'streams'; currentItem = item; currentStreams = []; currentResult = null;
      loading(true);
      showMessage('Завантажуємо відео', item.title);
      Promise.resolve().then(function () { return src.getStreams(item, api); }).then(function (result) {
        if (!isValid(g)) return;
        loading(false);
        currentResult = result || {};
        currentStreams = result && Array.isArray(result.streams) ? result.streams : [];
        renderStreamOptions(currentResult);
      }, function (err) {
        if (!isValid(g)) return;
        loading(false);
        var saved = readEpisodeLabels(item.title, currentSource);
        if (saved.length) {
          state = 'episodes';
          beginList();
          addRow('‹ До результатів', src.name, renderResults, 'ms-action');
          addRow('Збережений список серій: ' + saved.length,
            'Сторінка джерела зараз не відповідає; посилання на відтворення недоступні',
            null, 'ms-warning');
          addRow('↻ Повторити завантаження', String(err.message || err),
            function () { details(item); }, 'ms-action');
          saved.forEach(function (label) {
            addRow(label.title || ('Сезон ' + label.season + ' • Серія ' + label.episode),
              [label.voice, 'Для перегляду потрібно відновити з’єднання'].filter(Boolean).join(' • '));
          });
          addRow('Відкрити на сайті UASerials', '', function () { openWeb(item.url); }, 'ms-action');
          enableController();
        } else {
          showMessage('Не вдалося отримати відео', String(err.message || err),
            { title: 'Відкрити сторінку на сайті', click: function () { openWeb(item.url); } });
        }
      });
    }
    function renderResults() {
      ++generation; state = 'results'; beginList(); sourceCaption();
      addRow('Результати пошуку', registry[currentSource].name, null, 'ms-section');
      currentCandidates.forEach(function (item) {
        addRow(item.title, [item.year, registry[currentSource].name].filter(Boolean).join(' • '),
          function () { details(item); });
      });
      enableController();
    }
    function seasonNumbers(labels) {
      return Array.from(new Set(labels.map(function (e) { return Number(e.season) || 0; })))
        .sort(function (a, b) { return a - b; });
    }
    function episodeGroups(labels, season, voice) {
      var indexed = {}, groups = [];
      labels.forEach(function (e) {
        if (season !== null && Number(e.season) !== Number(season)) return;
        if (voice && String(e.voice || '') !== voice) return;
        var key = (Number(e.season) || 0) + ':' + (Number(e.episode) || 0);
        if (!indexed[key]) {
          indexed[key] = { season: Number(e.season) || 0, episode: Number(e.episode) || 0, labels: [] };
          groups.push(indexed[key]);
        }
        indexed[key].labels.push(e);
      });
      groups.sort(function (a,b) { return a.season-b.season || a.episode-b.episode; });
      return groups;
    }
    function chooseSeason(labels, resolverEntry, movieTitle, cached, failure) {
      var seasons = seasonNumbers(labels);
      var previous = 'content';
      try { previous = Lampa.Controller.enabled().name || 'content'; } catch (e) {}
      Lampa.Select.show({ title: 'Оберіть сезон',
        items: [{ title: 'Усі сезони', id: 'all' }].concat(seasons.map(function (n) {
          return { title: n === 0 ? 'Спецвипуски' : 'Сезон ' + n, id: String(n) };
        })),
        onBack: function () { Lampa.Controller.toggle(previous); },
        onSelect: function (choice) {
          selectedSeason = choice.id === 'all' ? null : Number(choice.id);
          Lampa.Select.close(); Lampa.Controller.toggle('content');
          renderEpisodeCatalog(labels, resolverEntry, movieTitle, cached, failure);
        }
      });
    }
    function chooseVoice(labels, resolverEntry, movieTitle, cached, failure) {
      var voices = Array.from(new Set(labels.map(function (e) { return String(e.voice || ''); }).filter(Boolean))).sort();
      var previous = 'content';
      try { previous = Lampa.Controller.enabled().name || 'content'; } catch (e) {}
      Lampa.Select.show({ title: 'Оберіть озвучення',
        items: [{ title: 'Усі озвучення', id: '__all__' }].concat(voices.map(function (v, i) {
          return { title: v, id: String(i) };
        })),
        onBack: function () { Lampa.Controller.toggle(previous); },
        onSelect: function (choice) {
          selectedVoice = choice.id === '__all__' ? '' : (voices[Number(choice.id)] || '');
          Lampa.Select.close(); Lampa.Controller.toggle('content');
          renderEpisodeCatalog(labels, resolverEntry, movieTitle, cached, failure);
        }
      });
    }
    function chooseEpisodeVoice(group, resolverEntry, movieTitle) {
      if (group.labels.length <= 1) return playSelectedEpisode(resolverEntry, group.labels[0], movieTitle);
      var previous = 'content';
      try { previous = Lampa.Controller.enabled().name || 'content'; } catch (e) {}
      Lampa.Select.show({ title: 'Озвучення • Серія ' + group.episode,
        items: group.labels.map(function (e, i) { return { title: e.voice || 'За замовчуванням', id: String(i) }; }),
        onBack: function () { Lampa.Controller.toggle(previous); },
        onSelect: function (choice) {
          var label = group.labels[Number(choice.id)];
          Lampa.Select.close(); Lampa.Controller.toggle('content');
          if (label) playSelectedEpisode(resolverEntry, label, movieTitle);
        }
      });
    }
    function episodeCard(group, resolverEntry, movieTitle) {
      var movie = object.movie || {};
      var watched = isEpisodeWatched(movie, group.season, group.episode, currentSource);
      var row = $('<div class="ms-row ms-episode-card selector"></div>');
      var thumb = $('<div class="ms-episode-thumb"><span class="ms-episode-placeholder">▶</span></div>');
      var copy = $('<div class="ms-episode-copy"></div>');
      copy.append($('<div class="ms-episode-number"></div>').text('Сезон ' + group.season + ' • Серія ' + group.episode));
      copy.append($('<div class="ms-episode-name"></div>').text('Серія ' + group.episode));
      copy.append($('<div class="ms-episode-voice"></div>').text(group.labels.map(function (e) {
        return e.voice || 'Оригінал';
      }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' / ')));
      var toggle = $('<div class="ms-watched-toggle selector" role="button" tabindex="0"></div>');
      function redrawWatched() {
        var yes = isEpisodeWatched(movie, group.season, group.episode, currentSource);
        row.toggleClass('ms-episode-seen', yes);
        toggle.text(yes ? '✓ Переглянуто' : '○ Позначити');
        toggle.attr('aria-label', yes ? 'Зняти позначку переглянуто' : 'Позначити переглянутим');
      }
      var lastToggle = 0;
      function mark(event) {
        if (event && event.stopPropagation) event.stopPropagation();
        if (event && event.preventDefault) event.preventDefault();
        if (Date.now() - lastToggle < 250) return;
        lastToggle = Date.now();
        var yes = isEpisodeWatched(movie, group.season, group.episode, currentSource);
        setEpisodeWatched(movie, group.season, group.episode, currentSource, !yes);
        redrawWatched();
      }
      toggle.on('hover:enter click', mark);
      row.on('hover:enter', function (event) {
        if (event && $(event.target).closest('.ms-watched-toggle').length) return;
        chooseEpisodeVoice(group, resolverEntry, movieTitle);
      });
      row.on('hover:focus', function (e) { last = e.currentTarget || e.target; scroll.update(row, true); });
      row.append(thumb, copy, toggle);
      scroll.append(row);
      episodeRows.push({ node: row, season: group.season, episode: group.episode });
      redrawWatched();
      return row;
    }
    function attachSeasonMetadata(season) {
      if (tmdbSeasonCache[season] === undefined) {
        tmdbSeasonCache[season] = tmdbEpisodeInfo(object.movie, season).then(function (items) {
          var map = {};
          items.forEach(function (it) { map[Number(it.episode_number)] = it; });
          return map;
        }, function () { return {}; });
      }
      tmdbSeasonCache[season].then(function (map) {
        if (!active || state !== 'episodes') return;
        episodeRows.forEach(function (entry) {
          if (entry.season !== season || !document.documentElement.contains(entry.node[0])) return;
          var info = map[entry.episode];
          if (!info) return;
          var name = String(info.name || '').trim();
          if (name && !/^episode\s+\d+$/i.test(name) && !/^серія\s+\d+$/i.test(name))
            entry.node.find('.ms-episode-name').text(name.slice(0, 130));
          var image = episodeImagePath(info.still_path);
          if (image) {
            var photo = $('<img loading="lazy" alt=""/>').attr('src', image);
            entry.node.find('.ms-episode-thumb').empty().append(photo);
          }
          entry.node.find('.ms-episode-air-date').remove();
          if (info.air_date) entry.node.find('.ms-episode-voice').append(
            $('<span class="ms-episode-air-date"></span>').text(' • ' + String(info.air_date)));
        });
      });
    }
    function chooseQuality(after) {
      var previous = 'content';
      try { previous = Lampa.Controller.enabled().name || 'content'; } catch (e) {}
      var options = [{ title: 'Auto (рекомендовано)', id: 'auto' },
        { title: '1080p', id: '1080' }, { title: '720p', id: '720' }, { title: '480p', id: '480' }];
      Lampa.Select.show({ title: 'Якість відтворення HLS', items: options,
        onBack: function () { Lampa.Controller.toggle(previous); },
        onSelect: function (choice) {
          setStorage('quality', choice.id); Lampa.Select.close(); Lampa.Controller.toggle('content');
          if (after) after();
        }
      });
    }
    function renderEpisodeCatalog(labels, resolverEntry, movieTitle, cached, failure) {
      state = 'episodes';
      lastEpisodeCatalog = labels;
      episodeRows = [];
      beginList();
      addRow('‹ Назад до джерела', '', function () { renderStreamOptions(currentResult); }, 'ms-action');
      addRow('Список серій: ' + labels.length, movieTitle, null, 'ms-section');
      var seasons = seasonNumbers(labels);
      if (selectedSeason !== null && seasons.indexOf(selectedSeason) === -1) selectedSeason = null;
      if (selectedSeason === null && seasons.length === 1) selectedSeason = seasons[0];
      addRow('Сезон: ' + (selectedSeason === null ? 'усі' : selectedSeason),
        'Обрати сезон', function () { chooseSeason(labels, resolverEntry, movieTitle, cached, failure); }, 'ms-action');
      var voices = Array.from(new Set(labels.map(function (e) { return String(e.voice || ''); }).filter(Boolean)));
      if (selectedVoice && voices.indexOf(selectedVoice) === -1) selectedVoice = '';
      addRow('Озвучення: ' + (selectedVoice || 'усі доступні'), 'Фільтр озвучення',
        function () { chooseVoice(labels, resolverEntry, movieTitle, cached, failure); }, 'ms-action');
      addRow('Якість відео: ' + (getQualitySetting() === 'auto' ? 'Auto' : getQualitySetting() + 'p'),
        'Auto / 1080p / 720p / 480p (за наявності у HLS)',
        function () { chooseQuality(function () { renderEpisodeCatalog(labels, resolverEntry, movieTitle, cached, failure); }); }, 'ms-action');
      addRow('☰ Обрати серію зі списку (' + labels.length + ')',
        'Відкрити всі серії в стандартному меню Lampa',
        function () { showEpisodePicker(labels, resolverEntry, movieTitle); }, 'ms-action');
      if (failure) addRow('HLS не вдалося завантажити', failure, null, 'ms-warning');
      if (cached) addRow('Каталог серій збережено',
        'Відеопосилання оновлюються під час запуску', null, 'ms-warning');
      addRow('↻ Оновити список серій', 'Завантажити актуальний каталог Tortuga', function () {
        playOrResolve(resolverEntry, currentStreams, movieTitle);
      }, 'ms-action');
      var groups = episodeGroups(labels, selectedSeason, selectedVoice);
      if (!groups.length) addRow('Немає серій для вибраного озвучення', 'Спробуйте інший фільтр', null, 'ms-warning');
      var seasonRendered = null, seasonRequests = [];
      groups.forEach(function (group) {
        if (seasonRendered !== group.season) {
          seasonRendered = group.season;
          addRow('Сезон ' + group.season, groups.filter(function (g) { return g.season === group.season; }).length + ' серій', null, 'ms-section');
          seasonRequests.push(group.season);
        }
        episodeCard(group, resolverEntry, movieTitle);
      });
      addRow('▶ Вставити власний HLS/MP4', 'Технічний тест потоку',
        function () { askDirectUrl(movieTitle + ' — ручний потік'); }, 'ms-action');
      scroll.append($('<div class="ms-list-end-spacer" aria-hidden="true"></div>'));
      scheduleViewport(); enableController();
      seasonRequests.forEach(attachSeasonMetadata);
    }
    function supplementEpisodeCatalog(resolverEntry, movieTitle, g, baseline) {
      if (!getAdapterUrl()) return;
      fetchDiagnostics.catalogWorker = 'loading';
      resolveWorkerPlayerEntry(resolverEntry).then(function (extra) {
        fetchDiagnostics.catalogWorker = extra.length ? 'found:' + episodeLabels(extra).length : 'empty';
        if (!isValid(g)) return;
        var combined = saveEpisodeLabels(movieTitle, currentSource, extra);
        if (state === 'episodes' && combined.length > baseline) {
          renderEpisodeCatalog(combined, resolverEntry, movieTitle, false);
        }
      }, function () { fetchDiagnostics.catalogWorker = 'unavailable'; });
    }
    function playSelectedEpisode(resolverEntry, selected, movieTitle) {
      var g = ++generation;
      loading(true);
      notify('Отримуємо актуальне посилання для серії…');
      resolvePlayerEntry(resolverEntry).then(function (fresh) {
        if (!isValid(g)) return;
        loading(false);
        saveEpisodeLabels(movieTitle, currentSource, fresh);
        var stream = findEpisode(fresh, selected);
        // Some seasons are listed only in the supplemental Worker metadata.
        // Try this entry only after a fresh request, and ALWAYS preflight it.
        var candidate = stream ? Promise.resolve(stream) :
          resolveWorkerPlayerEntry(resolverEntry).then(function (additional) {
            saveEpisodeLabels(movieTitle, currentSource, additional);
            return findEpisode(additional, selected);
          });
        candidate.then(function (stream) {
          if (!isValid(g)) return;
          if (!stream) {
            renderEpisodeCatalog(readEpisodeLabels(movieTitle, currentSource), resolverEntry,
              movieTitle, true, 'Ця серія є в каталозі, але зараз немає доступного потоку.');
            return;
          }
          // Validate the *fresh* manifest. Do not pass an HTTP 403 or HTML error
          // page to hls.js (it would raise an opaque fatal manifestLoadError).
          notify('Перевіряємо доступність HLS для серії…');
          checkHlsStream(stream.url, 10000).then(function (result) {
          if (!isValid(g)) return;
          if (!result.ok) {
            console.warn(LOG, 'HLS rejected', {
              host: result.host || '', status: result.status || 0,
              reason: result.reason || '', checked: !!result.checked
            });
            renderEpisodeCatalog(readEpisodeLabels(movieTitle, currentSource), resolverEntry,
              movieTitle, false, (result.message || 'HLS недоступний') +
              (fetchDiagnostics.tortugaFallback ? ' • HTML отримано через Worker, тому можливе обмеження прив’язки потоку до сеансу' : ''));
            notify('HLS недоступний. Можна вставити робоче посилання вручну.');
            return;
          }
          // Auto keeps the master playlist so the player can adapt bitrate.
          // Fixed quality selects a variant only when advertised by that master.
          var setting = getQualitySetting();
          var variant = setting === 'auto' ? null : (result.variantsInfo || []).filter(function (v) {
            return v.height === Number(setting);
          })[0];
          if (!variant) {
            if (setting !== 'auto') notify('Якість ' + setting + 'p недоступна; використовуємо Auto');
            play(stream, [stream], movieTitle);
          } else {
            checkHlsStream(variant.url, 10000).then(function (checked) {
              if (!isValid(g)) return;
              if (checked.ok) {
                var preferred = {};
                for (var k in stream) preferred[k] = stream[k];
                preferred.url = variant.url;
                play(preferred, [preferred], movieTitle);
              } else {
                notify('Якість ' + setting + 'p недоступна; використовуємо Auto');
                play(stream, [stream], movieTitle);
              }
            });
          }
          }, function (err) {
            if (!isValid(g)) return;
            notify('Не вдалося перевірити HLS: ' + String(err.message || err));
          });
        }, function (err) {
          if (!isValid(g)) return;
          notify('Немає доступного потоку для цієї серії: ' + String(err.message || err));
        });
      }, function (err) {
        if (!isValid(g)) return;
        loading(false);
        notify('Не вдалося оновити посилання: ' + String(err.message || err));
      });
    }
    function playOrResolve(stream, streams, movieTitle) {
      if (!stream.resolve) return play(stream, streams, movieTitle);
      var g = ++generation;
      loading(true);
      notify('Завантажуємо доступні варіанти відео…');
      resolvePlayerEntry(stream).then(function (resolved) {
        if (!isValid(g)) return;
        loading(false);
        var labels = saveEpisodeLabels(movieTitle, currentSource, resolved);
        if (labels.length) {
          renderEpisodeCatalog(labels, stream, movieTitle, false);
          supplementEpisodeCatalog(stream, movieTitle, g, labels.length);
          return;
        }
        if (resolved.length === 1) return play(resolved[0], resolved, movieTitle);
        state = 'episodes';
        beginList();
        addRow('‹ Назад до джерела', '', function () { renderStreamOptions(currentResult); }, 'ms-action');
        addRow('Доступні потоки: ' + resolved.length, movieTitle, null, 'ms-section');
        resolved.forEach(function (r) {
          addRow(r.title, [r.voice, r.season ? 'Сезон ' + r.season : '',
            r.episode ? 'Серія ' + r.episode : ''].filter(Boolean).join(' • '),
            function () { play(r, resolved, movieTitle); });
        });
        enableController();
      }, function (err) {
        if (!isValid(g)) return;
        loading(false);
        var saved = readEpisodeLabels(movieTitle, currentSource);
        if (saved.length) renderEpisodeCatalog(saved, stream, movieTitle, true);
        else notify('Не вдалося отримати список серій: ' + String(err.message || err));
      });
    }
    function play(stream, streams, movieTitle) {
      if (!mediaUrl(stream.url, stream.url)) {
        notify('Це не пряме відеопосилання'); return;
      }
      // Do not enqueue alternative qualities as if they were sequential episodes.
      var isSerial = !!(stream.season || stream.episode);
      var list = streams.filter(function (s) {
        if (!mediaUrl(s.url, s.url)) return false;
        if (!isSerial) return s.url === stream.url;
        return (s.season || 0) === (stream.season || 0) && (s.voice || '') === (stream.voice || '');
      });
      var playlist = list.map(function (s) {
          return { url: s.url, title: s.title || movieTitle, season: s.season || 0,
            episode: s.episode || 0, voice_name: s.voice || '', isonline: true,
            headers: s.headers || undefined, subtitles: s.subtitles || undefined };
        });
      var selected = playlist.filter(function (s) {
        return s.url === stream.url && (s.episode || 0) === (stream.episode || 0);
      })[0];
      if (!selected) return notify('Відео недоступне');
      try {
        Lampa.Player.play(selected);
        if (Lampa.Player.playlist) Lampa.Player.playlist(playlist);
        if (object.movie && object.movie.id && Lampa.Favorite) Lampa.Favorite.add('history', object.movie, 100);
      } catch (e) { notify('Помилка програвача: ' + e.message); }
    }
    function enableController() {
      if (!active || !self.activity) return;
      Lampa.Controller.enable('content');
      Lampa.Controller.toggle('content');
    }
    this.create = function () {
      sourceCaption();
      measureViewport();
      scheduleViewport();
      return this.render();
    };
    this.render = function () { return root; };
    this.start = function () {
      if (!started) started = true;
      if (!viewportBound) {
        viewportBound = true;
        window.addEventListener('resize', scheduleViewport, false);
        if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
          window.visualViewport.addEventListener('resize', scheduleViewport, false);
        }
      }
      scheduleViewport();
      Lampa.Controller.add('content', {
        toggle: function () {
          Lampa.Controller.collectionSet(scroll.render(), explorer.render());
          Lampa.Controller.collectionFocus(last || false, scroll.render());
        },
        up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else Lampa.Controller.toggle('head'); },
        down: function () { Navigator.move('down'); },
        left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
        right: function () { Navigator.move('right'); },
        back: function () {
          if (state === 'episodes') renderStreamOptions(currentResult);
          else if (state === 'streams') renderResults();
          else Lampa.Activity.backward();
        }
      });
      Lampa.Controller.toggle('content');
      if (!currentCandidates.length && !currentItem) find();
    };
    this.stop = function () {};
    this.pause = function () {};
    this.destroy = function () {
      active = false; ++generation;
      if (viewportTimer !== null) clearTimeout(viewportTimer);
      if (viewportBound) {
        window.removeEventListener('resize', scheduleViewport, false);
        if (window.visualViewport && typeof window.visualViewport.removeEventListener === 'function') {
          window.visualViewport.removeEventListener('resize', scheduleViewport, false);
        }
      }
      if (scroll.body()[0]) scroll.body()[0].removeEventListener('wheel', onListWheel);
      toolbar.remove();
      explorer.destroy(); scroll.destroy();
    };
  }

  // Desktop browser: Lampa versions/themes use different wrappers and some
  // render the full card in a portal outside activity.render(). Handle both.
  function activeActivity() {
    try { return Lampa.Activity && Lampa.Activity.active && Lampa.Activity.active(); }
    catch (e) { return null; }
  }
  function activeComponent() {
    var a = activeActivity();
    return a && (a.component || (a.object && a.object.component)) || '';
  }
  function asJquery(element) {
    if (!element || typeof $ !== 'function') return null;
    try { return element.jquery ? element : $(element); } catch (e) { return null; }
  }
  function movieFrom(event, active) {
    var data = event && event.data || {};
    var obj = event && event.object || {};
    return data.movie || data.card || obj.movie || obj.card ||
      (active && (active.card || active.movie || (active.data && active.data.movie))) ||
      (lastCardContext && lastCardContext.movie) || null;
  }
  function rootFrom(event, active) {
    var candidate = null;
    try {
      if (event && event.object && event.object.activity && typeof event.object.activity.render === 'function')
        candidate = event.object.activity.render();
      if (!candidate && event && event.render) candidate = event.render;
      if (!candidate && active && active.activity && typeof active.activity.render === 'function')
        candidate = active.activity.render();
    } catch (e) { diagnostics.lastError = 'render: ' + String(e.message || e); }
    var root = asJquery(candidate);
    if (root && root.length && typeof root.find === 'function') return root;
    // jQuery's document selector works in desktop Lampa and is the final fallback.
    return asJquery(document.body);
  }
  function bindCardButton(button, fallback) {
    button.off('hover:enter.ms click.ms').on('hover:enter.ms click.ms', function (event) {
      if (event && event.type === 'click') { event.preventDefault(); event.stopPropagation(); }
      var card = button.data('ms-movie') || fallback ||
        movieFrom(lastFullEvent, activeActivity());
      if (!card) return notify('MultiSource: немає даних фільму. Відкрийте його картку.');
      openMovie(card);
    });
  }
  function addFloatingButton(movie) {
    if (!document.body || typeof document.querySelector !== 'function') return false;
    var floating = asJquery(document.querySelector('.ms-floating-button'));
    if (floating && floating.length) {
      if (movie) floating.data('ms-movie', movie);
      bindCardButton(floating, movie);
      diagnostics.floating = true;
      return true;
    }
    var node = $('<div class="ms-open-button ms-floating-button selector" role="button" tabindex="0">▶ MultiSource</div>');
    node.data('ms-movie', movie);
    node.on('keydown.ms', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        node.trigger('hover:enter.ms');
      }
    });
    bindCardButton(node, movie);
    node.appendTo('body');
    diagnostics.buttonsAdded++;
    diagnostics.floating = true;
    return true;
  }
  function hideFloatingButton() {
    if (typeof $ === 'function') $('.ms-floating-button').remove();
    diagnostics.floating = false;
  }
  function addCardButton(event, allowFloat) {
    var active = activeActivity();
    var movie = movieFrom(event, active);
    var root = rootFrom(event, active);
    if (!root || !root.length || typeof root.find !== 'function') {
      diagnostics.lastScan = 'No DOM root';
      return false;
    }
    // Never draw in other sections. Lampa 'full' events may arrive after navigation.
    if (active && active.component && active.component !== 'full') return false;
    if (movie) lastCardContext = { movie: movie };
    var old = root.find('.ms-open-button').not('.ms-floating-button').first();
    if (old.length) {
      if (movie) old.data('ms-movie', movie);
      bindCardButton(old, movie);
      hideFloatingButton();
      diagnostics.lastScan = 'Button already in card';
      return true;
    }
    var anchors = [
      '.view--torrent', '.view--trailer', '.view--online', '.button--play',
      '.full-start__button', '.full-start-new__button',
      '.full-start__buttons .selector', '.full-start-new__buttons .selector',
      '[class*=full-start] [class*=button].selector'
    ];
    var anchor = null;
    for (var i = 0; i < anchors.length; i++) {
      anchor = root.find(anchors[i]).first();
      if (anchor && anchor.length) break;
    }
    var parents = [
      '.full-start-new__buttons', '.full-start__buttons',
      '.full-start-buttons', '.full-start-new__buttons-row',
      '.full__buttons', '.full-buttons'
    ];
    var parent = null;
    if (!anchor || !anchor.length) {
      for (var j = 0; j < parents.length; j++) {
        parent = root.find(parents[j]).first();
        if (parent && parent.length) break;
      }
    }
    if ((!anchor || !anchor.length) && (!parent || !parent.length)) {
      diagnostics.lastScan = 'Card controls not found';
      if (allowFloat && movie) return addFloatingButton(movie);
      return false;
    }
    var btn = $('<div class="full-start__button selector ms-open-button" data-subtitle="MultiSource v' + VERSION + '">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" ' +
      'style="width:1.4em;height:1.4em;fill:currentColor;margin-right:.4em">' +
      '<path d="M8 5v14l11-7z"/></svg><span>MultiSource</span></div>');
    if (movie) btn.data('ms-movie', movie);
    bindCardButton(btn, movie);
    if (anchor && anchor.length) anchor.after(btn);
    else parent.append(btn);
    hideFloatingButton();
    diagnostics.buttonsAdded++;
    diagnostics.lastScan = 'Inserted beside card controls';
    console.log(LOG, 'button attached', VERSION);
    return true;
  }
  function ensureActiveCardButton(force) {
    try {
      var a = activeActivity();
      if (!a || (a.component && a.component !== 'full')) {
        hideFloatingButton();
        diagnostics.lastFull = a ? String(a.component || '') : 'none';
        return false;
      }
      diagnostics.lastFull = 'full';
      return addCardButton({ object: { activity: a.activity }, data: { movie: movieFrom(null, a) } }, !!force);
    } catch (e) { diagnostics.lastError = 'active-card: ' + String(e.message || e); return false; }
  }
  function observeCardChanges() {
    if (domObserver || !window.MutationObserver || !document.body) return;
    domObserver = new MutationObserver(function () {
      if (domScanTimer) return;
      domScanTimer = setTimeout(function () {
        domScanTimer = null;
        ensureActiveCardButton(true);
      }, 120);
    });
    // Observe the card container if possible. A document-level observer would
    // react to Lampa's animated UI and create needless work.
    domObserver.observe(document.body, { childList: true, subtree: true });
  }

  function initializeCss() {
    if (document.getElementById('ms-plugin-css')) return;
    $('<style id="ms-plugin-css">' +
      '.ms-open-button{display:flex!important;align-items:center!important;visibility:visible!important}' +
      '.ms-floating-button{position:fixed!important;right:22px!important;bottom:22px!important;z-index:10090!important;cursor:pointer!important;background:#1b65a6!important;color:white!important;padding:12px 20px!important;border-radius:8px!important;box-shadow:0 4px 16px #0009!important;font-size:17px!important}' +
      '.ms-toolbar{display:flex;gap:.8em;flex-wrap:wrap;padding:.8em 0}' +
      '.ms-toolbar-button{background:rgba(255,255,255,.1);padding:.65em 1em;border-radius:.4em}' +
      '.ms-list{padding:.6em 0 2em;touch-action:pan-y}' +
      '.ms-list-end-spacer{height:clamp(180px,32vh,340px);min-height:180px;pointer-events:none;flex-shrink:0}' +
      '.ms-scroll-viewport{min-height:0;overscroll-behavior:contain}' +
      '.ms-row{background:rgba(255,255,255,.08);padding:1em 1.3em;margin:.45em 0;border-radius:.45em}' +
      '.ms-row-title{font-size:1.22em;font-weight:600}' +
      '.ms-row-info{font-size:.92em;opacity:.72;margin-top:.25em}' +
      '.ms-row.focus,.ms-toolbar-button.focus{background:#fff;color:#161616}' +
      '.ms-row.ms-section{background:rgba(255,255,255,.04);opacity:.85}' +
      '.ms-row.ms-action{border-left:.25em solid #65a8ef}' +
      '.ms-episode-card{display:flex!important;gap:1em;align-items:center;min-height:5.8em;cursor:pointer}' +
      '.ms-episode-thumb{position:relative;flex:0 0 24%;max-width:15em;aspect-ratio:16/9;border-radius:.4em;background:#25303a;overflow:hidden;display:flex;align-items:center;justify-content:center}' +
      '.ms-episode-thumb img{width:100%;height:100%;object-fit:cover;display:block}' +
      '.ms-episode-placeholder{font-size:2em;opacity:.6}' +
      '.ms-episode-copy{min-width:0;flex:1}' +
      '.ms-episode-number{font-size:.82em;opacity:.75}' +
      '.ms-episode-name{font-size:1.14em;font-weight:600;margin:.2em 0;overflow-wrap:anywhere}' +
      '.ms-episode-voice{font-size:.83em;opacity:.75}' +
      '.ms-watched-toggle{align-self:center;border:1px solid currentColor;opacity:.75;border-radius:.45em;padding:.55em .65em;font-size:.8em;min-width:7.7em;text-align:center;cursor:pointer}' +
      '.ms-episode-seen{opacity:.7}' +
      '.ms-watched-toggle.focus{background:white;color:#151515;opacity:1}' +
      '@media(max-width:700px){.ms-episode-card{gap:.6em;padding:.7em}.ms-episode-thumb{flex-basis:30%}.ms-watched-toggle{min-width:0;font-size:.7em;padding:.5em}.ms-episode-name{font-size:1em}}' +
      '.ms-row.ms-warning{border-left:.25em solid #e5af57}' +
      '.ms-message{padding:1.4em 1em}' +
      '.ms-message-title{font-size:1.5em;font-weight:600}' +
      '.ms-message-detail{opacity:.75;margin-top:.65em;line-height:1.5}' +
      '</style>').appendTo('head');
  }

  function init() {
    if (initialized) return;
    if (!window.Lampa || !Lampa.Component || !Lampa.Component.add ||
        !Lampa.Listener || !Lampa.Listener.follow || !Lampa.Activity ||
        typeof $ !== 'function') return;
    try {
      Lampa.Component.add(COMPONENT, OnlineComponent);
      Lampa.Listener.follow('full', function (e) {
        if (!e) return;
        if (e.type !== 'complite' && e.type !== 'ready' && e.type !== 'draw') return;
        lastFullEvent = e;
        diagnostics.fullEvents += 1;
        var eventMovie = movieFrom(e, activeActivity());
        if (eventMovie) lastCardContext = { movie: eventMovie };
        // Some skins do not render action buttons until after `complite`.
        [0, 100, 400, 1000].forEach(function (delay) {
          setTimeout(function () { addCardButton(e, true); }, delay);
        });
      });
      initializeCss();
      if (Lampa.Manifest) {
        Lampa.Manifest.plugins = {
          type: 'video', version: VERSION, name: 'MultiSource',
          description: 'Модульні джерела онлайн-відео', component: COMPONENT,
          onContextMenu: function () { return { name: 'MultiSource' }; },
          onContextLauch: openMovie
        };
      }
      initialized = true;
      diagnostics.initialized = true;
      // If Lampa loaded the plugin after the current film card was rendered.
      setTimeout(function () { ensureActiveCardButton(true); }, 0);
      setTimeout(function () { ensureActiveCardButton(true); }, 500);
      // Non-invasive fallback for dynamic full-card skins and navigation.
      if (!activeCardTimer) activeCardTimer = setInterval(function () { ensureActiveCardButton(true); }, 2500);
      observeCardChanges();
      if (bootTimer) { clearInterval(bootTimer); bootTimer = null; }
      console.log(LOG, 'ready', VERSION, registryOrder.join(', '));
    } catch (e) {
      diagnostics.lastError = 'init: ' + String(e.stack || e);
      console.error(LOG, 'initialization failed', e);
      // A partially initialized component can still be retried later.
    }
  }

  // A one-shot timeout failed when Lampa needed >1.5 seconds to start.
  // Keep retrying while the application loads, including cold Smart TV boots.
  init();
  bootTimer = setInterval(function () {
    if (initialized) { clearInterval(bootTimer); bootTimer = null; return; }
    diagnostics.bootAttempts++;
    if (diagnostics.bootAttempts > 240) {
      clearInterval(bootTimer); bootTimer = null;
      diagnostics.lastError = 'Lampa не стала готовою за 120 секунд';
      console.error(LOG, diagnostics.lastError);
      return;
    }
    init();
  }, 500);
})();
