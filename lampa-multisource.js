/*
 * Lampa MultiSource 1.0.0 — extensible online-source plugin
 * Copyright (c) 2026. MIT License.
 * UASerials adapter: HTML discovery and direct media links only.
 * No DRM circumvention, decryption of protected players or proxy tunnelling.
 */
(function () {
  'use strict';
  var VERSION = '1.0.0';
  var COMPONENT = 'multi_source_online_v1';
  var LOG = '[MultiSource]';
  var registry = {};
  var registryOrder = [];
  var initialized = false;
  var storagePrefix = 'ms_v1_';
  if (window.LampaMultiSource && window.LampaMultiSource._coreLoaded) return;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function normal(value) {
    return String(value || '').toLowerCase().replace(/[’'`´]/g, '')
      .replace(/[^a-z0-9а-яіїєґё]+/gi, ' ').replace(/\s+/g, ' ').trim();
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
  function ajaxText(url, timeout) {
    return new Promise(function (resolve, reject) {
      if (!host(url)) return reject(new Error('Недопустима адреса HTTPS'));
      if (!window.Lampa || !Lampa.Reguest) return reject(new Error('Lampa.Reguest недоступний'));
      var request = new Lampa.Reguest();
      if (request.timeout) request.timeout(timeout || 15000);
      request['native'](url, function (response) {
        resolve(typeof response === 'string' ? response : JSON.stringify(response || {}));
      }, function (err) {
        var status = err && (err.status || err.message);
        reject(new Error('HTTP/CORS: ' + (status || 'джерело недоступне')));
      }, false, { dataType: 'text' });
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
      return Promise.all(queries.slice(0, 2).map(function (query) {
        var url = uaserials.baseUrl + '/search/' + encodeURIComponent(query) + '/page/1/';
        return api.request(url).then(function (html) {
          var doc = fromHtml(html), results = [];
          if (!doc) return results;
          // Search page is an HTML catalogue; cards link to /12345-title.html.
          var links = doc.querySelectorAll('a[href]');
          for (var i = 0; i < links.length; i++) {
            var a = links[i], href = absolute(a.getAttribute('href'), uaserials.baseUrl);
            if (!/^https:\/\/uaserials\.com\/\d+[-_][^?#]+\.html(?:[?#]|$)/i.test(href)) continue;
            var card = a.closest ? a.closest('article,.short-item,.short,.th-item,.movie-item,.item,.card,.shortstory') : null;
            var titleEl = card && card.querySelector('.short-title,.th-title,.movie-title,.title,h2,h3');
            var title = (titleEl && titleEl.textContent || a.getAttribute('title') || a.textContent || '').trim();
            if (!title || title.length > 160) continue;
            var yearText = card ? card.textContent : '';
            var yearMatch = yearText.match(/(?:19|20)\d{2}/);
            results.push({ title: title, url: href, year: yearMatch ? yearMatch[0] : '' });
          }
          return dedup(results, function (r) { return r.url; });
        }, function (error) { return { error: error }; });
      })).then(function (lists) {
        if (lists.every(function (l) { return l && l.error; })) {
          throw lists[0].error;
        }
        var all = dedup([].concat.apply([], lists.filter(Array.isArray)), function (c) { return c.url; });
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
          // The link to the original watch page is retained for unsupported/embedded players.
          return { streams: found.slice(0, 70), pageUrl: item.url, protectedPlayer: !found.length };
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
    extractDirect: extractDirect,
    helpers: { absolute: absolute, mediaUrl: mediaUrl, escapeHtml: escapeHtml, normalize: normal },
    open: openMovie
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
          '. На деяких платформах потрібен дозволений CORS або власний серверний адаптер.',
          { title: 'Повторити пошук', click: find });
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
            'Можливий вбудований захищений плеєр або зміна структури сайту', null, 'ms-warning');
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

  function addCardButton(event) {
    if (!event || !event.object || !event.object.activity || !event.data) return;
    var activity = event.object.activity.render();
    if (!activity || !activity.length || activity.find('.ms-open-button').length) return;
    var movie = event.data.movie || event.data.card || event.data;
    var container = activity.find('.view--torrent').first();
    if (!container.length) container = activity.find('.view--online').first();
    var btn = $('<div class="full-start__button selector view--online ms-open-button">' +
      '<span>▶ MultiSource</span></div>');
    btn.on('hover:enter', function () { openMovie(movie); });
    if (container.length) container.after(btn);
    else {
      var parent = activity.find('.full-start__buttons,.full-start-new__buttons').first();
      if (parent.length) parent.append(btn); else return;
    }
  }

  function init() {
    if (initialized || !window.Lampa || !Lampa.Component || !Lampa.Listener) return;
    initialized = true;
    Lampa.Component.add(COMPONENT, OnlineComponent);
    Lampa.Listener.follow('full', function (e) { if (e.type === 'complite') addCardButton(e); });
    if (!document.getElementById('ms-plugin-css')) {
      $('<style id="ms-plugin-css">' +
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
    try {
      if (Lampa.Manifest && !Lampa.Manifest.plugins) Lampa.Manifest.plugins = {
        type: 'video', version: VERSION, name: 'MultiSource',
        description: 'Модульні джерела онлайн-відео', component: COMPONENT,
        onContextMenu: function () { return { name: '▶ MultiSource' }; },
        onContextLauch: openMovie
      };
    } catch (e) {}
    // When loaded on an already open movie card.
    try {
      var a = Lampa.Activity.active();
      if (a && a.component === 'full' && a.activity) {
        addCardButton({ object: { activity: a.activity }, data: { movie: a.card || a.movie } });
      }
    } catch (e) {}
    console.log(LOG, 'ready', VERSION, registryOrder.join(', '));
  }

  if (window.Lampa && window.appready) init();
  else if (window.Lampa && Lampa.Listener) Lampa.Listener.follow('app', function (e) {
    if (e.type === 'ready' || e.type === 'complite') init();
  });
  // Some forks emit app:ready rather than app/ready.
  if (window.Lampa && Lampa.Listener) Lampa.Listener.follow('app:ready', init);
  setTimeout(init, 1500);
})();
