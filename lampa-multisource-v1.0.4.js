/*
 * Lampa MultiSource 1.0.4 — extensible online-source plugin
 * Copyright (c) 2026. MIT License.
 * UASerials adapter: HTML discovery and direct media links only.
 * Optional HTML-only Cloudflare Worker; no streaming or DRM bypass.
 */
(function () {
  'use strict';
  var VERSION = '1.0.4';
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
  var fetchDiagnostics = { transport: 'direct', lastRequest: '', lastStatus: '', lastError: '' };
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
  function ajaxText(url, timeout) {
    var adapter = getAdapterUrl();
    var proxy = host(url) === 'uaserials.com' && !!adapter;
    fetchDiagnostics.transport = proxy ? 'adapter' : 'direct';
    fetchDiagnostics.lastRequest = url;
    fetchDiagnostics.lastError = '';
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
        var main = extractDirect(html, item.url);
        // A media iframe may contain public HTML5 sources; bounded recursion (one level).
        var frames = main.frames.filter(function (url) { return /^https:\/\//.test(url); }).slice(0, 3);
        return Promise.all(frames.map(function (frame) {
          return api.request(frame, 10000).then(function (page) {
            return extractDirect(page, frame).streams;
          }, function () { return []; });
        })).then(function (embedded) {
          var found = dedup(main.streams.concat([].concat.apply([], embedded)), function (s) { return s.url; });
          // Keep iframe URLs as browser-only options. An iframe is not an
          // HLS/MP4 stream and must never be handed directly to Lampa.Player.
          var embeds = dedup(main.frames, function (s) { return s; })
            .filter(function (url) { return /^https:\/\//.test(url); }).slice(0, 5);
          var notice = !found.length ?
            (embeds.length ? 'Знайдено вбудовані плеєри, але не прямі відеопотоки.' :
              'У HTML немає доступних прямих відеопосилань. Плеєр може завантажуватися через JavaScript.') : '';
          return { streams: found.slice(0, 70), embeds: embeds, notice: notice,
            pageUrl: item.url, protectedPlayer: !found.length };
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
    extractDirect: extractDirect,
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
      normalize: normal, cleanSearchTitle: cleanSearchTitle },
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
          lastError: fetchDiagnostics.lastError },
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
    var state = 'results';
    var generation = 0;
    var started = false;
    var toolbar = $('<div class="ms-toolbar"></div>');
    scroll.body().addClass('ms-list');
    explorer.appendFiles(scroll.render());
    explorer.appendHead(toolbar);

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
    function beginList() { last = null; scroll.clear(); }
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
      var adapterLabel = getAdapterUrl() ? 'Сервер: налаштовано' : 'Сервер: не налаштовано';
      var adapterButton = $('<div class="ms-toolbar-button selector"></div>').text(adapterLabel);
      adapterButton.on('hover:enter click', configureAdapter);
      toolbar.append(adapterButton);
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
      state = 'results'; currentItem = null;
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
    function details(item) {
      var src = registry[currentSource];
      var g = ++generation;
      state = 'streams'; currentItem = item; currentStreams = [];
      loading(true);
      showMessage('Завантажуємо відео', item.title);
      Promise.resolve().then(function () { return src.getStreams(item, api); }).then(function (result) {
        if (!isValid(g)) return;
        loading(false); currentStreams = result && Array.isArray(result.streams) ? result.streams : [];
        beginList();
        addRow('‹ До результатів', src.name, function () { renderResults(); }, 'ms-action');
        addRow(item.title, item.year || src.name, null, 'ms-section');
        if (currentStreams.length) {
          currentStreams.forEach(function (stream, index) {
            var info = [stream.voice, stream.season ? 'Сезон ' + stream.season : '',
              stream.episode ? 'Серія ' + stream.episode : ''].filter(Boolean).join(' • ');
            addRow(stream.title || ('Потік ' + (index + 1)), info || 'HLS / MP4', function () {
              play(stream, currentStreams, item.title);
            });
          });
        } else {
          addRow('Пряме відеопосилання не знайдено',
            result && result.notice || 'Плеєр може підвантажувати відео окремим запитом', null, 'ms-warning');
          var embeds = result && Array.isArray(result.embeds) ? result.embeds : [];
          embeds.forEach(function (url, index) {
            addRow('Відкрити вбудований плеєр ' + (index + 1),
              'Вебплеєр: ' + host(url) + ' (не прямий потік Lampa)',
              function () { openWeb(url); }, 'ms-action');
          });
        }
        var pageUrl = result && result.pageUrl || item.url;
        if (pageUrl) addRow('Відкрити на сайті ' + src.name,
          'Для плеєрів, які неможливо запустити безпосередньо', function () { openWeb(pageUrl); }, 'ms-action');
        enableController();
      }, function (err) {
        if (!isValid(g)) return;
        loading(false);
        showMessage('Не вдалося отримати відео', String(err.message || err),
          { title: 'Відкрити сторінку на сайті', click: function () { openWeb(item.url); } });
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
    this.create = function () { sourceCaption(); return this.render(); };
    this.render = function () { return root; };
    this.start = function () {
      if (!started) started = true;
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
          if (state === 'streams') renderResults();
          else Lampa.Activity.backward();
        }
      });
      Lampa.Controller.toggle('content');
      if (!currentCandidates.length && !currentItem) find();
    };
    this.stop = function () {};
    this.pause = function () {};
    this.destroy = function () {
      active = false; ++generation; toolbar.remove();
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
      '.ms-list{padding:.6em 0 2em}' +
      '.ms-row{background:rgba(255,255,255,.08);padding:1em 1.3em;margin:.45em 0;border-radius:.45em}' +
      '.ms-row-title{font-size:1.22em;font-weight:600}' +
      '.ms-row-info{font-size:.92em;opacity:.72;margin-top:.25em}' +
      '.ms-row.focus,.ms-toolbar-button.focus{background:#fff;color:#161616}' +
      '.ms-row.ms-section{background:rgba(255,255,255,.04);opacity:.85}' +
      '.ms-row.ms-action{border-left:.25em solid #65a8ef}' +
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
