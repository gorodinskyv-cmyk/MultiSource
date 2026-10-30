/*
 * Lampa MultiSource 1.2.1 — resilient TMDB metadata and source diagnostics
 * If direct access is allowed, the embedded page is fetched from the same
 * client as HLS. Otherwise previous worker fallback remains unchanged.
 * Copyright (c) 2026. MIT License.
 * UASerials adapter: HTML discovery, browser-available player metadata and HLS.
 * Optional HTML-only Cloudflare Worker; no streaming, authentication or DRM bypass.
 */
(function () {
  'use strict';
  var VERSION = '1.2.1';
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
  // Search metadata are separate fields, never a concatenated title.
  // UASerials occasionally places the Ukrainian and original name in one link.
  function splitSearchNames(raw, movie) {
    var text = String(raw || '').replace(/\s+/g, ' ').trim();
    text = text.replace(/^\s*\d{1,2}[.,]\d\s*(?=(?:19|20)\d{2})/, '')
      .replace(/^\s*(?:19|20)\d{2}\s*/, '').trim();
    var part = text.match(/^(.+?[а-яіїєґёА-ЯІЇЄҐЁ])(?=[A-Z][a-z])/);
    var ua = part ? part[1].trim() : text;
    var original = part ? text.slice(part[1].length).trim() : '';
    if (ua && !/[а-яіїєґё]/i.test(ua) && !original) {
      original = ua; ua = '';
    }
    // The active TMDB card provides reliable original spelling only for an
    // exact title match; do not assign it to unrelated search results.
    var knownUa = String(movie && (movie.title || movie.name) || '').trim();
    var knownOriginal = String(movie && (movie.original_title || movie.original_name) || '').trim();
    if (knownUa && normal(text).indexOf(normal(knownUa)) >= 0 &&
        (normal(ua) === normal(knownUa) || normal(text) === normal(knownUa + knownOriginal))) {
      ua = knownUa;
      // Never synthesize the source original title from TMDB: auto-match
      // needs two independent pieces of source metadata.
    }
    if (!ua) ua = cleanSearchTitle(text, movie);
    if (original && normal(original) === normal(ua)) original = '';
    return { title: ua.slice(0, 160), originalTitle: original.slice(0, 160) };
  }
  function validReleaseYear(value) {
    var year = String(value || '').match(/(?:19|20)\d{2}/);
    if (!year) return '';
    var n = Number(year[0]);
    return n >= 1900 && n <= new Date().getFullYear() + 2 ? year[0] : '';
  }
  function posterUrl(value, base) {
    var text = String(value || '').trim().replace(/&amp;/g, '&');
    if (!text || /^(?:data:|blob:|javascript:|#)/i.test(text)) return '';
    // srcset can be supplied instead of src; take the first candidate only.
    if (/\s+\d+(?:w|x)(?:,|$)/.test(text)) text = text.split(',')[0].trim().split(/\s+/)[0];
    try {
      var u = new URL(text, base || 'https://uaserials.com/');
      if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return '';
      if (/(?:placeholder|spacer|blank|loading|no-?poster|no-?image|pixel)(?:[.\/_-]|$)/i.test(u.pathname)) return '';
      return u.href;
    } catch (e) { return ''; }
  }
  function getPosterFromElement(node, base) {
    if (!node || !node.querySelectorAll) return '';
    var imgs = [];
    if (node.tagName && String(node.tagName).toLowerCase() === 'img') imgs.push(node);
    var found = node.querySelectorAll('img');
    for (var i = 0; i < found.length; i++) imgs.push(found[i]);
    for (var j = 0; j < imgs.length; j++) {
      var img = imgs[j];
      var attrs = ['data-src','data-original','data-lazy-src','data-poster','data-srcset','srcset','src'];
      for (var k = 0; k < attrs.length; k++) {
        var out = posterUrl(img.getAttribute(attrs[k]), base);
        if (out) return out;
      }
    }
    var styled = node.querySelectorAll('[data-bg], [data-background], [style]');
    for (var z = 0; z < styled.length; z++) {
      var el = styled[z];
      var style = el.getAttribute('style') || '';
      var match = style.match(/background(?:-image)?\s*:\s*url\(["']?([^)'\"]+)/i);
      var out2 = posterUrl(el.getAttribute('data-bg') || el.getAttribute('data-background') || (match && match[1]), base);
      if (out2) return out2;
    }
    return '';
  }
  function getNamedText(container, selector) {
    if (!container || !container.querySelector) return '';
    var el = container.querySelector(selector);
    return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }
  function parseUASearch(html, movie) {
    var doc = fromHtml(html), byUrl = {}, order = [];
    if (!doc) return [];
    var links = doc.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i], href = absolute(a.getAttribute('href'), 'https://uaserials.com/');
      if (!/^https:\/\/uaserials\.com\/\d+[-_][^?#]+\.html(?:[?#]|$)/i.test(href)) continue;
      var card = a.closest ? a.closest('article,.short-item,.short,.th-item,.movie-item,.item,.card,.shortstory,.movie,.poster') : null;
      var title = getNamedText(card, '.short-title,.th-title,.movie-title,.poster__title,.poster-title,.card-title,.title,h2,h3');
      var original = getNamedText(card, '.original-title,.orig-title,.origin-title,.title-original,.poster__original,.short-original,.th-original,.orig-name');
      var image = a.querySelector('img') || (card && card.querySelector('img'));
      var alt = image && image.getAttribute('alt') || '';
      var names = splitSearchNames(title || alt || a.getAttribute('title') || a.textContent || '', movie);
      if (!names.title) continue;
      var originalTitle = original || names.originalTitle;
      var year = validReleaseYear((card && card.getAttribute('data-year')) ||
        getNamedText(card, '.year,.short-year,.th-year,.poster__year,.movie-year,time,.date') ||
        (card ? card.textContent : a.textContent));
      var poster = getPosterFromElement(card || a, href) || getPosterFromElement(a, href);
      var item = { title: names.title, originalTitle: originalTitle, url: href,
        poster: poster, year: year };
      if (!byUrl[href]) { byUrl[href] = item; order.push(href); }
      else {
        var prior = byUrl[href];
        ['originalTitle','poster','year'].forEach(function (field) {
          if (!prior[field] && item[field]) prior[field] = item[field];
        });
        // Title-only anchors are often less descriptive than poster cards.
        if (item.title.length > prior.title.length && item.title.length < 160) prior.title = item.title;
      }
    }
    return order.map(function (url) { return byUrl[url]; });
  }
  // A detail page supplies og:image and explicit release information when
  // a lazy-loaded search card has no image/year/original title.
  function parseUADetail(html, entry, movie) {
    var doc = fromHtml(html), out = {};
    if (!doc) return out;
    var og = doc.querySelector('meta[property="og:image"],meta[name="twitter:image"]');
    var picture = posterUrl(og && og.getAttribute('content'), entry.url);
    if (!picture) picture = getPosterFromElement(doc.querySelector('.full-poster,.movie-poster,.poster,.full-image,.poster-block') || doc.body, entry.url);
    if (picture) out.poster = picture;
    var year = validReleaseYear(getNamedText(doc, '.full-year,.movie-year,.fyear,.year,[itemprop="datePublished"]'));
    if (!year) {
      var text = doc.body && doc.body.textContent || '';
      var match = text.match(/(?:Рік|Год|Year)\s*[:：]?\s*((?:19|20)\d{2})/i);
      year = validReleaseYear(match && match[1]);
    }
    if (year) out.year = year;
    var original = getNamedText(doc, '.original-title,.orig-title,.full-original,.full-title-eng,.orig-name,.full-name-orig,.fsubtitle');
    if (!original) {
      var heading = doc.querySelector('h1');
      var sibling = heading && heading.nextElementSibling;
      var txt = sibling && String(sibling.textContent || '').replace(/\s+/g,' ').trim();
      if (txt && txt.length < 100 && /[a-z]/i.test(txt) && !/[а-яіїєґ]/i.test(txt) && !/^\d/.test(txt)) original = txt;
    }
    if (original && original !== entry.title) out.originalTitle = original.slice(0, 160);
    return out;
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
  // Route to a unique, independently verified title/year match only.
  // Missing metadata, one-field matches, and duplicate exact matches all
  // require manual selection from the normal result list.
  function exactSearchMatch(items, movie, query) {
    movie = movie || {};
    var original = normal(movie.original_title || movie.original_name);
    var year = validReleaseYear(movie.release_date || movie.first_air_date || movie.year);
    var acceptedQueries = [movie.title, movie.name, movie.original_title, movie.original_name]
      .filter(Boolean).map(normal);
    if (!original || !year || (query && acceptedQueries.indexOf(normal(query)) < 0)) return null;
    var matches = (Array.isArray(items) ? items : []).filter(function (item) {
      return item && normal(item.originalTitle) === original &&
        validReleaseYear(item.year) === year && item.url;
    });
    return matches.length === 1 ? matches[0] : null;
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
  // Episode images/names are presentation metadata. Persist small successful TMDB
  // responses per device so a later transient API failure does not blank cards.
  // Never store stream URLs, source HTML, signed embed data or private credentials.
  var TMDB_CACHE_TTL = 21 * 24 * 60 * 60 * 1000;
  var tmdbDiagnostics = { lastId: 0, lastSeason: 0, status: 'not_tried', records: 0 };
  function seasonMetaKey(movie, season) {
    var id = tmdbSeriesId(movie);
    return id ? String(id) + ':' + Number(season) : '';
  }
  function validTmdbRecord(item) {
    if (!item || typeof item !== 'object') return null;
    var episode = Number(item.episode_number);
    if (!Number.isInteger(episode) || episode < 1 || episode > 500) return null;
    return { episode_number: episode, name: String(item.name || '').slice(0, 140),
      overview: String(item.overview || '').slice(0, 600),
      still_path: /^\/[a-z0-9_\/-]+\.(?:jpg|jpeg|png|webp)$/i.test(String(item.still_path || '')) ? item.still_path : '',
      air_date: /^\d{4}-\d{2}-\d{2}$/.test(String(item.air_date || '')) ? item.air_date : '',
      runtime: Number(item.runtime) > 0 && Number(item.runtime) < 240 ? Number(item.runtime) : 0 };
  }
  function normalTmdbRecords(items) {
    return (Array.isArray(items) ? items : []).map(validTmdbRecord).filter(Boolean).slice(0, 200);
  }
  function readSeasonMetadata(movie, season, allowStale) {
    var key = seasonMetaKey(movie, season), all = getStorage('tmdb_episode_metadata_121', {});
    if (!key || !all || !all[key] || !Array.isArray(all[key].episodes)) return [];
    if (!allowStale && Date.now() - Number(all[key].updated || 0) > TMDB_CACHE_TTL) return [];
    return normalTmdbRecords(all[key].episodes);
  }
  function saveSeasonMetadata(movie, season, episodes) {
    var key = seasonMetaKey(movie, season), data = normalTmdbRecords(episodes);
    if (!key || !data.length) return;
    var all = getStorage('tmdb_episode_metadata_121', {});
    if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
    all[key] = { updated: Date.now(), episodes: data };
    var keys = Object.keys(all);
    if (keys.length > 32) keys.sort(function (a, b) {
      return Number(all[a].updated || 0) - Number(all[b].updated || 0);
    }).slice(0, keys.length - 32).forEach(function (k) { delete all[k]; });
    setStorage('tmdb_episode_metadata_121', all);
  }
  function tmdbSeasonRequest(id, season, language) {
    return new Promise(function (resolve) {
      if (!window.Lampa || !Lampa.Api || !Lampa.Api.sources || !Lampa.Api.sources.tmdb ||
          typeof Lampa.Api.sources.tmdb.get !== 'function') return resolve([]);
      var done = false;
      var timer = setTimeout(function () { finish([]); }, 8500);
      function finish(items) {
        if (done) return;
        done = true; clearTimeout(timer); resolve(normalTmdbRecords(items));
      }
      try {
        Lampa.Api.sources.tmdb.get('tv/' + id + '/season/' + season,
          { language: language }, function (data) { finish(data && data.episodes); },
          function () { finish([]); });
      } catch (e) { finish([]); }
    });
  }
  function mergeTmdbLanguages(uk, en) {
    var result = {}, order = [];
    (uk || []).forEach(function (r) { result[r.episode_number] = r; order.push(r.episode_number); });
    (en || []).forEach(function (r) {
      var own = result[r.episode_number];
      if (!own) { result[r.episode_number] = r; order.push(r.episode_number); return; }
      ['name', 'overview', 'still_path', 'air_date', 'runtime'].forEach(function (key) {
        if (!own[key]) own[key] = r[key];
      });
    });
    return order.map(function (id) { return result[id]; });
  }
  function tmdbEpisodeInfo(movie, season) {
    var id = tmdbSeriesId(movie), saved = readSeasonMetadata(movie, season, false);
    tmdbDiagnostics.lastId = id; tmdbDiagnostics.lastSeason = season;
    if (saved.length) {
      tmdbDiagnostics.status = 'cache'; tmdbDiagnostics.records = saved.length;
      return Promise.resolve(saved);
    }
    if (!id) {
      tmdbDiagnostics.status = 'missing_tmdb_id'; return Promise.resolve([]);
    }
    tmdbDiagnostics.status = 'requesting';
    // UK metadata can omit a still or overview; merge missing fields from EN.
    return tmdbSeasonRequest(id, season, 'uk-UA').then(function (uk) {
      if (uk.length && uk.every(function (r) {
        return r.still_path && r.name && r.overview;
      })) return uk;
      return tmdbSeasonRequest(id, season, 'en-US').then(function (en) {
        return mergeTmdbLanguages(uk, en);
      });
    }).then(function (records) {
      if (records.length) saveSeasonMetadata(movie, season, records);
      var existing = records.length ? records : readSeasonMetadata(movie, season, true);
      tmdbDiagnostics.records = existing.length;
      tmdbDiagnostics.status = records.length ? 'loaded' : existing.length ? 'stale_cache' : 'unavailable';
      return existing;
    }, function () {
      var old = readSeasonMetadata(movie, season, true);
      tmdbDiagnostics.records = old.length;
      tmdbDiagnostics.status = old.length ? 'stale_cache' : 'unavailable';
      return old;
    });
  }
  function episodeImagePath(value) {
    var path = String(value || '');
    return /^\/[a-z0-9_\/-]+\.(?:jpg|jpeg|png|webp)$/i.test(path) ?
      'https://image.tmdb.org/t/p/w300' + path : '';
  }
  // A watch mark belongs to a TMDB title/episode, not to an upstream server.
  // Preserve older v1.1.5 source-specific marks when migrating.
  function watchedEpisodeKey(movie, season, episode, sourceId) {
    var id = tmdbSeriesId(movie) || normal(movie && (movie.name || movie.title));
    return 'title:' + id + ':' + Number(season) + ':' + Number(episode);
  }
  function nativeProgressAvailable() {
    return !!(window.Lampa && Lampa.Timeline && typeof Lampa.Timeline.view === 'function' &&
      Lampa.Utils && typeof Lampa.Utils.hash === 'function');
  }
  function timelineKey(movie, season, episode) {
    movie = movie || {};
    var isSerial = Number(season) > 0 || Number(episode) > 0 ||
      movie.media_type === 'tv' || movie.type === 'tv' || !!movie.original_name;
    var id = String(movie.tmdb_id || movie.id || '').trim();
    var identity = id ? 'id:' + id : 'title:' + normal(movie.original_title || movie.original_name || movie.title || movie.name) +
      ':' + validReleaseYear(movie.release_date || movie.first_air_date || movie.year);
    return 'multisource:' + (isSerial ? 'tv' : 'movie') + ':' + identity +
      (isSerial ? ':' + Number(season || 0) + ':' + Number(episode || 0) : '');
  }
  function progressFor(movie, season, episode) {
    if (!nativeProgressAvailable()) return null;
    var card = movie || {}, serial = Number(season) > 0 || Number(episode) > 0;
    var linkedCard = card;
    if (serial && !card.original_name) {
      linkedCard = {};
      for (var k in card) if (Object.prototype.hasOwnProperty.call(card, k)) linkedCard[k] = card[k];
      linkedCard.original_name = card.original_title || card.name || card.title || 'series';
    }
    try {
      var meta = typeof Lampa.Timeline.link === 'function' ?
        Lampa.Timeline.link(linkedCard, serial ? Number(season) : undefined,
          serial ? Number(episode) : undefined) : null;
      var result = Lampa.Timeline.view(Lampa.Utils.hash(timelineKey(card, season, episode)), meta);
      return result && result.hash ? result : null;
    } catch (e) { return null; }
  }
  function validProgress(progress) {
    return progress && isFinite(progress.duration) && progress.duration > 0 &&
      isFinite(progress.time) && progress.time >= 0;
  }
  function isEpisodeWatched(movie, season, episode, sourceId) {
    var all = getStorage('watched_episodes', {});
    var key = watchedEpisodeKey(movie, season, episode);
    if (all && Object.prototype.hasOwnProperty.call(all, key)) {
      var rec = all[key];
      return !!(rec && (typeof rec !== 'object' || rec.watched !== false));
    }
    var older = ['uaserials', 'uafix', 'uakino'];
    for (var i = 0; i < older.length; i++) {
      var prior = older[i] + ':' + key.replace(/^title:/, '');
      if (all && all[prior]) return true;
    }
    var progress = progressFor(movie, season, episode);
    return !!(progress && Number(progress.percent) >= 95);
  }
  function setEpisodeWatched(movie, season, episode, sourceId, watched) {
    var all = getStorage('watched_episodes', {});
    if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
    var key = watchedEpisodeKey(movie, season, episode);
    all[key] = { watched: !!watched, changed: Date.now() };
    var keys = Object.keys(all);
    if (keys.length > 1500) keys.sort(function (a, b) {
      var aa = all[a] && (all[a].changed || all[a]) || 0;
      var bb = all[b] && (all[b].changed || all[b]) || 0;
      return Number(aa) - Number(bb);
    }).slice(0, keys.length - 1200).forEach(function (k) { delete all[k]; });
    setStorage('watched_episodes', all);
    return !!watched;
  }
  function readableTime(seconds) {
    var value = Math.max(0, Math.floor(Number(seconds) || 0));
    var hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60), secs = value % 60;
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return hours ? hours + ':' + two(minutes) + ':' + two(secs) : two(minutes) + ':' + two(secs);
  }

  // Lampa owns actual seeking and native Android-player result handling.
  // Improve in-app durability: write the native Timeline every 5 seconds and on pause.
  // External players must report the position to Lampa; we never invent it.
  function saveVideoProgress(force, ended) {
    if (!window.Lampa || !Lampa.Player || !Lampa.PlayerVideo || !Lampa.PlayerVideo.video) return;
    var playing = typeof Lampa.Player.playdata === 'function' && Lampa.Player.playdata();
    if (!playing || !playing._msTimeline || !playing.timeline || !playing.timeline.handler) return;
    var node = Lampa.PlayerVideo.video();
    if (!node || !isFinite(node.duration) || node.duration <= 0 || !isFinite(node.currentTime)) return;
    if (!force && Date.now() - (playing._msLastSave || 0) < 5000) return;
    // Avoid writing 0 seconds while the native resume seek is still pending.
    if (!ended && playing.timeline.percent && !playing.timeline.continued && node.currentTime < 3) return;
    var duration = Number(node.duration), current = Math.max(0, Math.min(duration, Number(node.currentTime)));
    var percent = ended ? 100 : Math.max(0, Math.min(100, Math.round(current / duration * 100)));
    try {
      playing.timeline.handler(percent, ended ? duration : current, duration);
      playing.timeline.percent = percent;
      playing.timeline.time = ended ? duration : current;
      playing.timeline.duration = duration;
      playing._msLastSave = Date.now();
    } catch (e) { /* A failure must never interrupt playback. */ }
  }
  var playbackEventsBound = false;
  function bindPlaybackEvents() {
    if (playbackEventsBound || !Lampa.PlayerVideo || !Lampa.PlayerVideo.listener ||
        typeof Lampa.PlayerVideo.listener.follow !== 'function') return;
    playbackEventsBound = true;
    Lampa.PlayerVideo.listener.follow('timeupdate', function () { saveVideoProgress(false, false); });
    Lampa.PlayerVideo.listener.follow('pause', function () { saveVideoProgress(true, false); });
    Lampa.PlayerVideo.listener.follow('ended', function () { saveVideoProgress(true, true); });
    if (Lampa.Player && Lampa.Player.listener && Lampa.Player.listener.follow)
      Lampa.Player.listener.follow('close', function () { saveVideoProgress(true, false); });
    if (window.addEventListener) window.addEventListener('pagehide', function () { saveVideoProgress(true, false); });
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

  // Separate optional HTML-only Worker for public UAFix/UAKino pages. The
  // original UASerials Worker is intentionally unchanged and cannot fetch them.
  function getPublicAdapterUrl() {
    return String(getStorage('public_adapter_url', '') || '').replace(/\/+$/, '');
  }
  function setPublicAdapterUrl(value) {
    var u = String(value || '').trim().replace(/\/+$/, '');
    if (u && !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(u))
      throw new Error('Потрібен HTTPS origin без шляху');
    setStorage('public_adapter_url', u);
    return u;
  }
  function testPublicAdapter() {
    var u = getPublicAdapterUrl();
    if (!u) return Promise.reject(new Error('HTML-адаптер не задано'));
    return rawRequest(u + '/health', 9000).then(function (body) {
      var info;
      try { info = JSON.parse(body); } catch (e) { throw new Error('Некоректна відповідь /health'); }
      if (!info.ok || info.service !== 'lampa-multisource-public-html')
        throw new Error('Неправильний тип HTML-адаптера');
      return info;
    });
  }
  function publicHtmlRequest(url, timeout, apiContext) {
    var domain = host(url), server = getPublicAdapterUrl();
    if (domain !== 'uafix.net' && domain !== 'uakino.best')
      return Promise.reject(new Error('Домен публічного джерела не підтримується'));
    if (!server) return (apiContext && apiContext.request ? apiContext.request(url, timeout) : rawRequest(url, timeout)).catch(function () {
      throw new Error('Браузер не може прочитати ' + domain + ' (CORS/мережа). Налаштуйте окремий HTML-адаптер у MultiSource.');
    });
    // Only the HTML page is fetched by the Worker. Media is never proxied.
    return rawRequest(server + '/fetch?url=' + encodeURIComponent(url), timeout).catch(function (err) {
      throw new Error('HTML-адаптер не прочитав ' + domain + ': ' + String(err.message || err));
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
    // Some Tortuga versions append extra '=' at the end of their Base64
    // value. Padding carries no payload bits: ignore up to 8 trailing '='
    // and reconstruct canonical padding, but reject any other alphabet errors.
    if (!/^[A-Za-z0-9+/]+={0,8}$/.test(clean))
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
    var isB64 = /^[A-Za-z0-9+/]+={0,8}$/.test(stripped);
    var unpadded = stripped.replace(/=+$/, '');
    var okLength = !!unpadded && unpadded.length % 4 !== 1;
    var normalizedPad = okLength ? (4 - unpadded.length % 4) % 4 : null;
    return { length: raw.length,
      kind: /^https:\/\//i.test(raw) ? 'url' : /^[\[{]/.test(raw) ? 'json-or-list' :
        isB64 ? 'base64-or-token' : 'other',
      base64LengthValid: isB64 && okLength,
      paddingCount: stripped.length - unpadded.length,
      rawModulo4: stripped.length % 4,
      unpaddedModulo4: unpadded.length % 4,
      normalizedPadding: normalizedPad,
      redundantPadding: isB64 && normalizedPad !== null && stripped.length - unpadded.length > normalizedPad };
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
    if (entry.resolvePage) {
      var cfg = host(entry.url) === 'uafix.net' ? uafixCfg :
        host(entry.url) === 'uakino.best' ? uakinoCfg : null;
      if (!cfg || !publicPageUrl(entry.url, cfg.baseUrl))
        return Promise.reject(new Error('Невідоме джерело сторінки'));
      return publicHtmlRequest(entry.url, 15000).then(function (html) {
        var extracted = extractDirect(html, entry.url).streams;
        if (!extracted.length) throw new Error('На сторінці серії немає відкритого прямого HLS/MP4 потоку');
        return extracted.map(function (video) {
          video.season = entry.season || video.season || 0;
          video.episode = entry.episode || video.episode || 0;
          video.voice = entry.voice || video.voice || '';
          video.title = entry.title || video.title;
          return video;
        });
      });
    }
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
        return parseUASearch(html, movie);
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
        all.forEach(function (r) {
          r.score = scoreMatch(r, movie);
          if (r.score >= 100) {
            if (!r.poster && movie.poster_path)
              r.poster = posterUrl('https://image.tmdb.org/t/p/w300' + movie.poster_path, 'https://image.tmdb.org/');
            // Do not copy TMDB year/original title into source results.
            // Missing source metadata is enriched from that result's detail page.
          }
        });
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

  // Generic *public-page* adapters. These may extract direct HTML5 HLS/MP4,
  // or offer first-party episode pages. No login, CAPTCHA, DRM or private API bypass.
  function publicPageUrl(url, baseUrl) {
    try {
      var candidate = new URL(String(url || ''), baseUrl + '/');
      if (candidate.protocol !== 'https:' || candidate.username || candidate.password ||
          candidate.hostname.toLowerCase() !== host(baseUrl)) return '';
      return candidate.href;
    } catch (e) { return ''; }
  }
  function publicSearchCards(html, cfg, movie) {
    var doc = fromHtml(html), byUrl = {}, order = [];
    if (!doc) return [];
    var links = doc.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i], url = publicPageUrl(a.getAttribute('href'), cfg.baseUrl);
      if (!url || !cfg.isDetail(url)) continue;
      var card = a.closest ? a.closest('article,.shortstory,.short-item,.short,.th-item,.movie-item,.item,.card,.poster,.movie,.story,.sres-wrap') : null;
      var heading = getNamedText(card, '.short-title,.th-title,.movie-title,.card-title,.title,.poster__title,.sres-title,h2,h3');
      var image = a.querySelector('img') || (card && card.querySelector('img'));
      var rawTitle = heading || (image && image.getAttribute('alt')) || a.getAttribute('title') || a.textContent || '';
      rawTitle = String(rawTitle).replace(/\s+/g, ' ').replace(/\s+\d+\s*(?:сезон|season)(?:\s|$).*$/i, '').trim();
      if (!rawTitle || rawTitle.length > 170) continue;
      var parts = /^(.+?)\s+\/\s+([A-Za-z][A-Za-z\s'’:.\-]+)$/.exec(rawTitle);
      var title = (parts ? parts[1] : rawTitle).trim();
      var original = parts ? parts[2].trim() : getNamedText(card, '.original-title,.orig-title,.origin-title,.orig-name');
      var year = validReleaseYear(getNamedText(card, '.year,.short-year,.th-year,.movie-year,time,.date') ||
        (card && card.textContent) || '');
      if (!byUrl[url]) {
        byUrl[url] = { title: title.slice(0, 160), originalTitle: original.slice(0, 160), year: year,
          poster: getPosterFromElement(card || a, url) || getPosterFromElement(a, url), url: url };
        order.push(url);
      }
    }
    return order.map(function (url) { var it = byUrl[url]; it.score = scoreMatch(it, movie); return it; })
      .filter(function (it) { return it.score >= 60; })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, 30);
  }
  function publicSearch(movie, api, cfg) {
    var queries = dedup([movie.title || movie.name, movie.original_title || movie.original_name]
      .filter(Boolean), normal).slice(0, 2);
    if (!queries.length) return Promise.resolve([]);
    function one(query) {
      var urls = cfg.searchUrls(query), errors = [], success = false;
      function next(index) {
        if (index >= urls.length) return success ? Promise.resolve([]) : Promise.reject(errors[0] || Error('Немає відповіді пошуку'));
        return publicHtmlRequest(urls[index], 12000, api).then(function (html) {
          success = true;
          var items = publicSearchCards(html, cfg, movie);
          return items.length ? items : next(index + 1);
        }, function (err) { errors.push(err); return next(index + 1); });
      }
      return next(0);
    }
    return Promise.all(queries.map(function (q) {
      return one(q).then(function (items) { return { items: items }; }, function (error) { return { error: error }; });
    })).then(function (replies) {
      if (replies.every(function (r) { return r.error; })) throw replies[0].error;
      return dedup([].concat.apply([], replies.map(function (r) { return r.items || []; })),
        function (e) { return e.url; }).sort(function (a,b) { return b.score-a.score; }).slice(0,30);
    });
  }
  function publicEpisodes(html, pageUrl, cfg) {
    var doc = fromHtml(html), result = [];
    if (!doc) return result;
    var anchors = doc.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var url = publicPageUrl(anchors[i].getAttribute('href'), cfg.baseUrl);
      if (!url) continue;
      var numbers = cfg.episodeNumbers && cfg.episodeNumbers(url);
      if (!numbers || !numbers.episode) continue;
      result.push({ url: url, title: 'Сезон ' + numbers.season + ' • Серія ' + numbers.episode,
        season: numbers.season, episode: numbers.episode, voice: '', resolve: true, resolvePage: true });
    }
    return dedup(result, function (e) { return e.season + ':' + e.episode + ':' + e.url; });
  }
  function publicSeasonLinks(html, pageUrl, cfg) {
    if (cfg.baseUrl !== 'https://uakino.best') return [];
    var doc = fromHtml(html), list = [];
    var links = doc ? doc.querySelectorAll('a[href]') : [];
    for (var i = 0; i < links.length; i++) {
      var u = publicPageUrl(links[i].getAttribute('href'), cfg.baseUrl);
      var label = String(links[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (!u || !cfg.isDetail(u) || !/^\d{1,2}\s*сезон$/i.test(label)) continue;
      list.push({url:u, title:label});
    }
    return dedup(list, function (item) { return item.url; }).slice(0, 15);
  }
  function publicPageStreams(html, pageUrl, cfg) {
    var raw = extractDirect(html, pageUrl);
    return { streams: raw.streams.concat(publicEpisodes(html, pageUrl, cfg)),
      embeds: raw.frames, pageUrl: pageUrl, siteSeasons: publicSeasonLinks(html, pageUrl, cfg),
      notice: 'Сторінка не публікує прямого HLS/MP4 або сумісного списку серій. Захищені вебплеєри не обробляються.' };
  }
  function publicGetStreams(item, api, cfg) {
    if (!publicPageUrl(item.url, cfg.baseUrl)) return Promise.reject(new Error('URL не належить джерелу'));
    return publicHtmlRequest(item.url, 15000, api).then(function (html) {
      var base = publicPageStreams(html, item.url, cfg);
      if (!cfg.seasonLinks) return base;
      var doc = fromHtml(html), seasonUrls = [], links = doc ? doc.querySelectorAll('a[href]') : [];
      for (var i = 0; i < links.length; i++) {
        var url = publicPageUrl(links[i].getAttribute('href'), cfg.baseUrl);
        if (url && cfg.seasonLinks(url)) seasonUrls.push(url);
      }
      seasonUrls = dedup(seasonUrls, function (u) { return u; }).filter(function (u) { return u !== item.url; }).slice(0, 8);
      if (!seasonUrls.length) return base;
      return Promise.all(seasonUrls.map(function (url) {
        return publicHtmlRequest(url, 10000, api).then(function (page) { return publicEpisodes(page, url, cfg); }, function () { return []; });
      })).then(function (lists) {
        base.streams = dedup(base.streams.concat([].concat.apply([], lists)),
          function (e) { return e.url + ':' + e.season + ':' + e.episode; });
        return base;
      });
    });
  }
  var uafixCfg = {
    baseUrl: 'https://uafix.net',
    isDetail: function (url) { return /^https:\/\/uafix\.net\/(?:serials|films|movies|multfilms|anime|doramas)\/[^/?#]+\/?(?:[?#]|$)/i.test(url); },
    searchUrls: function (q) { var e = encodeURIComponent(q); return [
      'https://uafix.net/?s=' + e,
      'https://uafix.net/index.php?do=search&subaction=search&story=' + e,
      'https://uafix.net/search/' + e + '/']; },
    episodeNumbers: function (url) {
      var match = /\/season-(\d+)-episode-(\d+)\/?(?:[?#]|$)/i.exec(url);
      return match ? { season: Number(match[1]), episode: Number(match[2]) } : null;
    },
    seasonLinks: function (url) { return /\/(?:sezon|season)-\d+\/?(?:[?#]|$)/i.test(url); }
  };
  var uakinoCfg = {
    baseUrl: 'https://uakino.best',
    isDetail: function (url) { return /^https:\/\/uakino\.best\/[^?#]+\/\d+-[^/?#]+\.html(?:[?#]|$)/i.test(url); },
    searchUrls: function (q) { var e = encodeURIComponent(q); return [
      'https://uakino.best/index.php?do=search&subaction=search&story=' + e,
      'https://uakino.best/ua/index.php?do=search&subaction=search&story=' + e,
      'https://uakino.best/?s=' + e]; },
    episodeNumbers: function (url) {
      var match = /\/season-(\d+)-episode-(\d+)\/?(?:[?#]|$)/i.exec(url);
      return match ? { season: Number(match[1]), episode: Number(match[2]) } : null;
    }
  };
  [ {id:'uafix', name:'UAFix', cfg:uafixCfg},
    {id:'uakino', name:'UAKino', cfg:uakinoCfg} ].forEach(function (record) {
    var cfg = record.cfg;
    registerSource({id: record.id, name: record.name, baseUrl: cfg.baseUrl,
      search: function (movie, api) { return publicSearch(movie, api, cfg); },
      getStreams: function (item, api) { return publicGetStreams(item, api, cfg); }});
  });

  // Public API available to separately loaded source scripts.
  var api = {
    _coreLoaded: true,
    version: VERSION,
    registerSource: registerSource,
    unregisterSource: removeSource,
    listSources: getSources,
    probeSource: function (id, movie) {
      var source = registry[id];
      if (!source) return Promise.reject(new Error('Невідоме джерело'));
      return Promise.resolve().then(function () { return source.search(movie || {}, api); }).then(function (items) {
        return { source: id, search: 'ok', results: (items || []).length,
          htmlAdapterConfigured: !!getPublicAdapterUrl() };
      }, function (err) {
        return { source: id, search: 'error', detail: String(err.message || err),
          htmlAdapterConfigured: !!getPublicAdapterUrl() };
      });
    },
    request: ajaxText,
    setAdapterUrl: setAdapterUrl,
    getPublicAdapterUrl: getPublicAdapterUrl,
    setPublicAdapterUrl: setPublicAdapterUrl,
    testPublicAdapter: testPublicAdapter,
    readSeasonMetadata: readSeasonMetadata,
    tmdbStatus: function () { return { lastId: tmdbDiagnostics.lastId, season: tmdbDiagnostics.lastSeason, status: tmdbDiagnostics.status, episodes: tmdbDiagnostics.records }; },
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
            normalizedPadding: info ? info.normalizedPadding : null,
            redundantPadding: info ? info.redundantPadding : false };
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
      exactSearchMatch: exactSearchMatch,
      tmdbSeriesId: tmdbSeriesId, episodeImagePath: episodeImagePath,
       extractHlsVariants: extractHlsVariants,
       timelineKey: timelineKey, progressFor: progressFor,
       publicSearchCards: publicSearchCards, publicEpisodes: publicEpisodes },
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
    var selectedViewed = 'all'; // all / unwatched / watched
    var episodeContext = null; // active episode filters, not retained across titles
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
    function updateResultCard(row, item) {
      if (!row || !row.length) return;
      row.find('.ms-result-ua').text(item.title || 'Без назви');
      row.find('.ms-result-original').text(item.originalTitle || 'Оригінальна назва не вказана');
      row.find('.ms-result-year').text(item.year ? 'Рік: ' + item.year : 'Рік: не вказано');
      var box = row.find('.ms-result-poster');
      var img = box.find('img');
      if (item.poster && !img.length) {
        img = $('<img loading="lazy" alt="" />');
        img.on('error', function () { img.remove(); box.addClass('ms-poster-empty'); });
        box.empty().append(img);
      }
      if (img.length && item.poster && img.attr('src') !== item.poster) img.attr('src', item.poster);
    }
    function addResultCard(item, sourceName, onEnter) {
      var row = $('<div class="ms-row ms-result-card selector" tabindex="0"></div>');
      var poster = $('<div class="ms-result-poster ms-poster-empty"><span class="ms-result-placeholder">▣</span></div>');
      var text = $('<div class="ms-result-copy"></div>');
      text.append($('<div class="ms-result-ua"></div>'));
      text.append($('<div class="ms-result-original"></div>'));
      var bottom = $('<div class="ms-result-meta"></div>');
      bottom.append($('<span class="ms-result-year"></span>'));
      bottom.append($('<span class="ms-result-source"></span>').text(sourceName));
      text.append(bottom);
      row.append(poster).append(text);
      row.on('hover:enter click', function (evt) {
        if (evt && evt.type === 'click') { evt.preventDefault(); evt.stopPropagation(); }
        if (onEnter) onEnter();
      });
      row.on('hover:focus', function (e) { last = e.currentTarget || e.target; scroll.update(row, true); });
      scroll.append(row);
      updateResultCard(row, item);
      return row;
    }
    // Progressive enrichment: 3 parallel metadata-only page requests at a time,
    // update card without resetting focus or rebuilding the list. No network
    // errors from thumbnails should block finding or playing a title.
    function enrichCandidate(item) {
      if (item._msDetailLoaded) return Promise.resolve(item);
      if (item._msDetailPromise) return item._msDetailPromise;
      item._msDetailPromise = Promise.resolve().then(function () { return api.request(item.url); })
        .then(function (html) {
          var parsed = parseUADetail(html, item, object.movie);
          ['poster','originalTitle','year'].forEach(function (field) {
            if (!item[field] && parsed[field]) item[field] = parsed[field];
          });
          item._msDetailLoaded = true;
          return item;
        }, function () { item._msDetailLoaded = true; return item; });
      return item._msDetailPromise;
    }
    // At most three concurrent detail requests; prevents a burst of 30 XHRs.
    function enrichCandidates(items, g, onItem) {
      var cursor = 0;
      function worker() {
        if (!isValid(g) || cursor >= items.length) return Promise.resolve();
        var entry = items[cursor++];
        return enrichCandidate(entry.item || entry).then(function () {
          if (isValid(g) && onItem) onItem(entry);
        }).then(worker);
      }
      var pending = [];
      for (var i = 0; i < Math.min(3, items.length); i++) pending.push(worker());
      return Promise.all(pending);
    }
    function enrichResultCards(items, rows, g) {
      if (currentSource !== 'uaserials') return;
      var pending = items.map(function (item, index) { return { item: item, index: index }; })
        .filter(function (rec) { return !rec.item.poster || !rec.item.year || !rec.item.originalTitle; });
      enrichCandidates(pending, g, function (entry) {
        if (state === 'results') updateResultCard(rows[entry.index], entry.item);
      });
    }
    // Probe plausible source results for missing original title or year before
    // routing. Limit work and time so manual navigation stays responsive.
    function enrichForAutoRoute(items, g) {
      if (currentSource !== 'uaserials') return Promise.resolve();
      var targetYear = validReleaseYear(object.movie.release_date || object.movie.first_air_date);
      var todo = items.filter(function (item, i) {
        return (!item.originalTitle || !item.year) &&
          (i < 8 || item.score >= 60 || (targetYear && item.year === targetYear));
      }).slice(0, 12);
      if (!todo.length) return Promise.resolve();
      return Promise.race([
        enrichCandidates(todo, g),
        new Promise(function (resolve) { setTimeout(resolve, 3500); })
      ]);
    }
    function beginList() {
      last = null;
      wheelAccumulator = 0;
      scroll.clear();
      if (typeof scroll.reset === 'function') scroll.reset();
      scheduleViewport();
    }
    // Compact, D-pad/touch-friendly episode navigation on a SINGLE row.
    function episodeNavButton(title, handler, extraClass) {
      var node = $('<div class="ms-episode-nav-button selector" tabindex="0" role="button"></div>')
        .addClass(extraClass || '').text(title);
      node.on('hover:enter click', function (event) {
        if (event && event.type === 'click') { event.preventDefault(); event.stopPropagation(); }
        if (handler) handler();
      });
      node.on('hover:focus', function (e) {
        last = e.currentTarget || e.target;
        scroll.update(node, true);
      });
      return node;
    }
    function renderEpisodeNavigator(labels, resolverEntry, movieTitle, cached, failure) {
      var count = episodeGroups(labels, null, '').length;
      var countInSeason = episodeGroups(labels, selectedSeason, '').length;
      var nav = $('<div class="ms-episode-nav"></div>');
      nav.append(episodeNavButton('‹ Результати', renderResults, 'ms-nav-back'));
      nav.append(episodeNavButton('Серії: ' + count,
        function () { showEpisodePicker(labels, resolverEntry, movieTitle); }, 'ms-nav-count'));
      var seasonText = selectedSeason === null ? 'Усі сезони' :
        selectedSeason === 0 ? 'Спецвипуски' : 'Сезон ' + selectedSeason;
      nav.append(episodeNavButton(seasonText + ' (' + countInSeason + ')', function () {
        chooseSeason(labels, resolverEntry, movieTitle, cached, failure);
      }, 'ms-nav-season'));
      nav.append(episodeNavButton('Озвучення: ' + (selectedVoice || 'Усі'), function () {
        chooseVoice(labels, resolverEntry, movieTitle, cached, failure);
      }, 'ms-nav-voice'));
      scroll.append(nav);
    }
    // The toolbar is context-aware: on the search page it shows search actions;
    // on an episode catalog it shows voice and filter controls NEXT TO Source.
    // Lampa's native Select keeps Android TV remote / D-pad navigation.
    function showCatalogFilters() {
      if (state !== 'episodes' || !episodeContext) return;
      var ctx = episodeContext;
      var previous = 'content';
      try { previous = Lampa.Controller.enabled().name || 'content'; } catch (e) {}
      var seasonText = selectedSeason === null ? 'Усі сезони' :
        selectedSeason === 0 ? 'Спецвипуски' : 'Сезон ' + selectedSeason;
      var viewedLabels = { all: 'Усі серії', unwatched: 'Не переглянуті', watched: 'Переглянуті' };
      Lampa.Select.show({
        title: 'Фільтри • ' + ctx.movieTitle,
        items: [
          { title: 'Сезон: ' + seasonText, id: 'season' },
          { title: 'Перегляд: ' + (viewedLabels[selectedViewed] || viewedLabels.all), id: 'viewed' },
          { title: 'Якість: ' + (getQualitySetting() === 'auto' ? 'Auto' : getQualitySetting() + 'p'), id: 'quality' },
          { title: 'Скинути фільтри', id: 'reset' }
        ],
        onBack: function () { Lampa.Controller.toggle(previous); },
        onSelect: function (choice) {
          if (!choice) return;
          Lampa.Select.close();
          Lampa.Controller.toggle('content');
          if (choice.id === 'season') return chooseSeason(ctx.labels, ctx.resolverEntry, ctx.movieTitle, ctx.cached, ctx.failure);
          if (choice.id === 'viewed') return chooseViewed(ctx.labels, ctx.resolverEntry, ctx.movieTitle, ctx.cached, ctx.failure);
          if (choice.id === 'quality') return chooseQuality(function () {
            renderEpisodeCatalog(ctx.labels, ctx.resolverEntry, ctx.movieTitle, ctx.cached, ctx.failure);
          });
          if (choice.id === 'reset') {
            selectedSeason = null;
            selectedVoice = '';
            selectedViewed = 'all';
            setStorage('quality', 'auto');
            renderEpisodeCatalog(ctx.labels, ctx.resolverEntry, ctx.movieTitle, ctx.cached, ctx.failure);
          }
        }
      });
    }
    function sourceCaption() {
      toolbar.empty();
      var source = registry[currentSource];
      var button = $('<div class="ms-toolbar-button selector"></div>').text('Джерело: ' +
        (source ? source.name : currentSource) + ' ▾');
      button.on('hover:enter', chooseSource);
      toolbar.append(button);

      if (state === 'episodes' && episodeContext) {
        var ctx = episodeContext;
        var voiceButton = $('<div class="ms-toolbar-button selector ms-toolbar-filter"></div>')
          .text('ОЗВУЧЕННЯ: ' + (selectedVoice || 'Усі') + ' ▾');
        voiceButton.on('hover:enter', function () {
          chooseVoice(ctx.labels, ctx.resolverEntry, ctx.movieTitle, ctx.cached, ctx.failure);
        });
        toolbar.append(voiceButton);
        var filterButton = $('<div class="ms-toolbar-button selector ms-toolbar-filter"></div>')
          .text('ФІЛЬТРИ' + (selectedSeason === null && selectedViewed === 'all' && getQualitySetting() === 'auto' ? '' : ' •') + ' ▾');
        filterButton.on('hover:enter', showCatalogFilters);
        toolbar.append(filterButton);
      } else {
        var change = $('<div class="ms-toolbar-button selector">Змінити назву пошуку</div>');
        change.on('hover:enter', changeQuery);
        toolbar.append(change);
      }

      var setupButton = $('<div class="ms-toolbar-button selector">⚙ Налаштування</div>');
      setupButton.on('hover:enter', function () {
        var previous = 'content';
        try { previous = Lampa.Controller.enabled().name || 'content'; } catch (e) {}
        var items = [
          { title: getAdapterUrl() ? 'Сервер: налаштовано' : 'Налаштувати сервер', id: 'adapter' },
          { title: getPublicAdapterUrl() ? 'HTML-адаптер UAFix/UAKino: налаштовано' : 'HTML-адаптер UAFix/UAKino', id: 'public_adapter' },
          { title: 'Змінити назву пошуку', id: 'query' },
          { title: 'Вставити HLS/MP4 (тест)', id: 'direct' }
        ];
        if (state === 'episodes' && episodeContext) {
          items.unshift({ title: '↻ Оновити метадані TMDB', id: 'tmdb_refresh' });
          items.unshift({ title: '↻ Оновити каталог серій', id: 'refresh' });
          items.unshift({ title: '☰ Обрати серію (резервне меню)', id: 'picker' });
        }
        items.push({ title: 'Про TMDB і MultiSource', id: 'credits' });
        Lampa.Select.show({ title: 'MultiSource — налаштування',
          items: items,
          onBack: function () { Lampa.Controller.toggle(previous); },
          onSelect: function (choice) {
            if (!choice) return;
            // Preserve context before navigation or a rerender replaces the toolbar.
            var ctx = episodeContext;
            Lampa.Select.close(); Lampa.Controller.toggle('content');
            if (choice.id === 'adapter') configureAdapter();
            if (choice.id === 'public_adapter') configurePublicAdapter();
            if (choice.id === 'tmdb_refresh' && ctx) {
              tmdbSeasonCache = {};
              var store = getStorage('tmdb_episode_metadata_121', {});
              seasonNumbers(ctx.labels).forEach(function (n) { delete store[seasonMetaKey(object.movie, n)]; });
              setStorage('tmdb_episode_metadata_121', store);
              renderEpisodeCatalog(ctx.labels, ctx.resolverEntry, ctx.movieTitle, ctx.cached, ctx.failure);
            }
            if (choice.id === 'query') changeQuery();
            if (choice.id === 'direct') askDirectUrl('Перевірка потоку');
            if (choice.id === 'refresh' && ctx) playOrResolve(ctx.resolverEntry, currentStreams, ctx.movieTitle);
            if (choice.id === 'picker' && ctx) showEpisodePicker(ctx.labels, ctx.resolverEntry, ctx.movieTitle);
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
      scheduleViewport();
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
    function configurePublicAdapter() {
      if (Lampa.Input && typeof Lampa.Input.edit === 'function') {
        Lampa.Input.edit({ title: 'HTML-адаптер UAFix/UAKino (HTTPS origin)',
          value: getPublicAdapterUrl() }, function (value) {
          try {
            setPublicAdapterUrl(value);
            if (!value) return notify('HTML-адаптер відключено');
            testPublicAdapter().then(function () { notify('HTML-адаптер доступний'); find(); },
              function (err) { notify('HTML-адаптер: ' + String(err.message || err)); });
          } catch (e) { notify(String(e.message || e)); }
        });
      } else notify('LampaMultiSource.setPublicAdapterUrl("https://name.workers.dev")');
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
          currentItem = null; currentCandidates = []; currentStreams = []; episodeContext = null;
          sourceCaption(); find();
        }
      });
    }
    function find() {
      var src = registry[currentSource];
      if (!src) return showMessage('Джерело не знайдено', 'Підключіть відповідний модуль.');
      var g = ++generation;
      state = 'results'; currentItem = null; currentResult = null; episodeContext = null;
      selectedSeason = null; selectedVoice = ''; selectedViewed = 'all';
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
            title: 'Відкрити сайт джерела', click: function () {
              var source = registry[currentSource];
              if (source && source.baseUrl) openWeb(source.baseUrl);
            }
          });
          return;
        }
        // No artificial metadata matches: original title AND year must be
        // present on the source result (or enriched source detail page).
        var perfect = exactSearchMatch(currentCandidates, object.movie, object.search);
        if (perfect) { details(perfect); return; }
        if (src.id !== 'uaserials') { renderResults(); return; }
        showMessage('Уточнюємо збіг назви та року', 'Якщо точного збігу немає — відкриємо результати пошуку.');
        enrichForAutoRoute(currentCandidates, g).then(function () {
          if (!isValid(g) || state !== 'results') return;
          // Count ALL verified matches; if several match both criteria,
          // never pick one arbitrarily.
          var exact = exactSearchMatch(currentCandidates, object.movie, object.search);
          if (exact) details(exact);
          else renderResults();
        }, function () { if (isValid(g) && state === 'results') renderResults(); });
      }, function (err) {
        if (!isValid(g)) return;
        loading(false);
        var isPublic = currentSource === 'uafix' || currentSource === 'uakino';
        var details = String(err.message || err);
        showMessage('Не вдалося виконати пошук', details +
          (isPublic ? ' • Для цих джерел потрібен доступ до відкритих HTML-сторінок. '
            + 'Навіть з адаптером відеоплеєр може не видавати прямий потік.' :
            (getAdapterUrl() ? ' • Перевірте сервер UASerials.' : ' • Перевірте CORS/сервер.')),
          { title: isPublic ? 'Налаштувати HTML-адаптер' : 'Налаштувати сервер',
            click: isPublic ? configurePublicAdapter : configureAdapter });
        if (isPublic && registry[currentSource]) addRow('Відкрити сайт ' + registry[currentSource].name,
          'Переглянути доступність безпосередньо у браузері',
          function () { openWeb(registry[currentSource].baseUrl); }, 'ms-action');
      });
    }
    function renderStreamOptions(result) {
      result = result || currentResult || {};
      state = 'streams'; episodeContext = null; sourceCaption();
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
      if (!currentStreams.length && result.siteSeasons && result.siteSeasons.length) {
        addRow('Сезони на сайті ' + src.name, 'Сезони знайдено, але прямого відеопотоку немає', null, 'ms-section');
        result.siteSeasons.forEach(function (record) {
          addRow('Відкрити ' + record.title, 'Сторінка на сайті джерела', function () { openWeb(record.url); }, 'ms-action');
        });
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
    // Search card -> online content directly. The old technical menu is
    // available only as a fallback when there is no usable stream.
    // Selecting a series opens its episode catalog; a single direct movie
    // stream opens Lampa Player; multiple playable variants get a compact
    // voice/stream selector without the "paste URL / open website" detour.
    function chooseOnlineRoute(streams) {
      var list = (Array.isArray(streams) ? streams : []).filter(function (s) {
        return !!(s && s.url && /^https:\/\//i.test(String(s.url)));
      });
      var resolver = list.filter(function (s) { return !!s.resolve; })[0];
      if (resolver) return { type: 'resolver', stream: resolver, streams: list };
      if (!list.length) return { type: 'fallback', streams: [] };
      if (list.length === 1) return { type: 'single', stream: list[0], streams: list };
      return { type: 'choices', streams: list };
    }
    function renderOnlineChoices(streams, movieTitle) {
      state = 'streams'; episodeContext = null; sourceCaption();
      beginList();
      addRow('‹ До результатів', '', renderResults, 'ms-action');
      addRow('Оберіть варіант перегляду', movieTitle, null, 'ms-section');
      streams.forEach(function (s, i) {
        var subtitle = [s.voice, s.season ? 'Сезон ' + s.season : '',
          s.episode ? 'Серія ' + s.episode : ''].filter(Boolean).join(' • ');
        addRow(s.title || ('Варіант ' + (i + 1)), subtitle || 'Онлайн-відео', function () {
          playOrResolve(s, streams, movieTitle);
        });
      });
      enableController();
    }
    function openOnlineResult(result) {
      var title = currentItem && currentItem.title || 'Відео';
      var publicPages = currentStreams.filter(function (s) { return s.resolvePage && s.episode; });
      if (publicPages.length) {
        saveEpisodeLabels(title, currentSource, publicPages);
        return renderEpisodeCatalog(episodeLabels(publicPages), null, title, false);
      }
      var route = chooseOnlineRoute(currentStreams);
      if (route.type === 'resolver') return playOrResolve(route.stream, route.streams, title);
      if (route.type === 'single') return playOrResolve(route.stream, route.streams, title);
      if (route.type === 'choices') return renderOnlineChoices(route.streams, title);
      // Only missing/unusable streams lead to the legacy troubleshooting menu.
      return renderStreamOptions(result);
    }
    function details(item) {
      var src = registry[currentSource];
      var g = ++generation;
      state = 'streams'; currentItem = item; currentStreams = []; currentResult = null;
      episodeContext = null; selectedSeason = null; selectedVoice = ''; selectedViewed = 'all';
      sourceCaption();
      loading(true);
      showMessage('Завантажуємо відео', item.title);
      Promise.resolve().then(function () { return src.getStreams(item, api); }).then(function (result) {
        if (!isValid(g)) return;
        loading(false);
        currentResult = result || {};
        currentStreams = result && Array.isArray(result.streams) ? result.streams : [];
        openOnlineResult(currentResult);
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
          addRow('Відкрити на сайті ' + src.name, '', function () { openWeb(item.url); }, 'ms-action');
          enableController();
        } else {
          showMessage('Не вдалося отримати відео', String(err.message || err),
            { title: 'Відкрити сторінку на сайті', click: function () { openWeb(item.url); } });
        }
      });
    }
    function renderResults() {
      ++generation; state = 'results'; episodeContext = null; beginList(); sourceCaption();
      addRow('Результати пошуку', registry[currentSource].name, null, 'ms-section');
      var rows = [], g = generation;
      currentCandidates.forEach(function (item) {
        rows.push(addResultCard(item, registry[currentSource].name, function () { details(item); }));
      });
      scroll.append($('<div class="ms-list-end-spacer" aria-hidden="true"></div>'));
      enableController();
      enrichResultCards(currentCandidates, rows, g);
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
      var voices = Array.from(new Set(labels.filter(function (e) {
        return selectedSeason === null || Number(e.season) === Number(selectedSeason);
      }).map(function (e) { return String(e.voice || ''); }).filter(Boolean))).sort();
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
    function chooseViewed(labels, resolverEntry, movieTitle, cached, failure) {
      var previous = 'content';
      try { previous = Lampa.Controller.enabled().name || 'content'; } catch (e) {}
      Lampa.Select.show({ title: 'Показувати серії',
        items: [
          { title: 'Усі серії', id: 'all' },
          { title: 'Не переглянуті', id: 'unwatched' },
          { title: 'Переглянуті', id: 'watched' }
        ],
        onBack: function () { Lampa.Controller.toggle(previous); },
        onSelect: function (choice) {
          if (!choice || ['all', 'unwatched', 'watched'].indexOf(choice.id) < 0) return;
          selectedViewed = choice.id;
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
      var thumb = $('<div class="ms-episode-thumb"></div>');
      thumb.append($('<span class="ms-episode-thumb-index"></span>').text(group.episode));
      thumb.append($('<span class="ms-episode-thumb-play" aria-hidden="true">▶</span>'));
      var copy = $('<div class="ms-episode-copy"></div>');
      copy.append($('<div class="ms-episode-number"></div>').text('Сезон ' + group.season + '  •  Серія ' + group.episode));
      copy.append($('<div class="ms-episode-name"></div>').text('Серія ' + group.episode));
      copy.append($('<div class="ms-episode-voice"></div>').text(group.labels.map(function (e) {
        return e.voice || 'Оригінал';
      }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' / ')));
       copy.append($('<div class="ms-episode-description"></div>').hide());
       var indicator = $('<div class="ms-episode-progress"></div>');
       indicator.append($('<div class="ms-episode-progress-track"><div class="ms-episode-progress-fill"></div></div>'));
       indicator.append($('<div class="ms-episode-progress-label"></div>'));
       copy.append(indicator);
       var toggle = $('<div class="ms-watched-toggle selector" role="button" tabindex="0"></div>');
       function redrawWatched() {
         var yes = isEpisodeWatched(movie, group.season, group.episode, currentSource);
         var progress = progressFor(movie, group.season, group.episode);
         row.toggleClass('ms-episode-seen', yes);
         toggle.text(yes ? '✓ Переглянуто' : '○ Позначити');
         toggle.attr('aria-label', yes ? 'Зняти позначку переглянуто' : 'Позначити переглянутим');
         var percent = progress ? Math.min(100, Math.max(0, Number(progress.percent) || 0)) : 0;
         var show = percent > 0 && (yes || validProgress(progress));
         indicator.toggle(show);
         indicator.find('.ms-episode-progress-fill').css('width', percent + '%');
         indicator.find('.ms-episode-progress-label').text(yes && percent >= 95 ? 'Переглянуто' :
           validProgress(progress) ? 'Продовжити з ' + readableTime(progress.time) + ' • ' + percent + '%' : '');
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
        if (selectedViewed !== 'all' && episodeContext) {
          var ctx = episodeContext;
          renderEpisodeCatalog(ctx.labels, ctx.resolverEntry, ctx.movieTitle, ctx.cached, ctx.failure);
        }
      }
      toggle.on('hover:enter click', mark);
      row.on('hover:enter', function (event) {
        if (event && $(event.target).closest('.ms-watched-toggle').length) return;
        chooseEpisodeVoice(group, resolverEntry, movieTitle);
      });
      row.on('hover:focus', function (e) { last = e.currentTarget || e.target; scroll.update(row, true); });
      row.append(thumb, copy, toggle);
      scroll.append(row);
       episodeRows.push({ node: row, season: group.season, episode: group.episode, refresh: redrawWatched });
      redrawWatched();
      return row;
    }
     function refreshEpisodeProgress() {
       if (!active || state !== 'episodes') return;
       episodeRows.forEach(function (e) { if (e.refresh) e.refresh(); });
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
            var thumb = entry.node.find('.ms-episode-thumb');
            if (!thumb.find('img.ms-tmdb-still').length) {
              var photo = $('<img class="ms-tmdb-still" alt=""/>');
              // Some LG webOS engines do not honor native lazy-loading inside
              // Lampa.Scroll. Load visible episode stills eagerly.
              var triedMirror = false;
              photo.on('error', function () {
                if (!triedMirror) {
                  triedMirror = true;
                  photo.attr('src', 'https://nl.imagetmdb.com/t/p/w300' + info.still_path);
                } else photo.remove();
              });
              thumb.prepend(photo);
              photo.attr('src', image);
            }
          }
          entry.node.find('.ms-episode-air-date').remove();
          var bits = [];
          if (info.air_date) {
            var matchDate = String(info.air_date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
            bits.push(matchDate ? matchDate[3] + '.' + matchDate[2] + '.' + matchDate[1] : String(info.air_date));
          }
          if (Number(info.runtime) > 0 && Number(info.runtime) < 240) bits.push(Number(info.runtime) + ' хв');
          if (bits.length) entry.node.find('.ms-episode-voice').append(
            $('<span class="ms-episode-air-date"></span>').text('  •  ' + bits.join('  •  ')));
          var description = String(info.overview || '').trim();
          var descNode = entry.node.find('.ms-episode-description');
          if (description) descNode.text(description.slice(0, 300)).show();
          else descNode.hide();
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
      var seasons = seasonNumbers(labels);
      if (selectedSeason !== null && seasons.indexOf(selectedSeason) === -1) selectedSeason = null;
      if (selectedSeason === null && seasons.length === 1) selectedSeason = seasons[0];
      var voices = Array.from(new Set(labels.filter(function (e) {
        return selectedSeason === null || Number(e.season) === Number(selectedSeason);
      }).map(function (e) { return String(e.voice || ''); }).filter(Boolean)));
      if (selectedVoice && voices.indexOf(selectedVoice) === -1) selectedVoice = '';
      episodeContext = { labels: labels, resolverEntry: resolverEntry, movieTitle: movieTitle,
        cached: !!cached, failure: failure || '' };
      sourceCaption();
      beginList();
      renderEpisodeNavigator(labels, resolverEntry, movieTitle, cached, failure);
      if (failure) addRow('HLS не вдалося завантажити', failure, null, 'ms-warning');
      if (cached) addRow('Каталог серій збережено',
        'Відеопосилання оновлюються під час запуску', null, 'ms-warning');
      // Voice, season, viewing status and quality are in the TOP toolbar;
      // the episode list now only contains episode cards (and season headers).
      var groups = episodeGroups(labels, selectedSeason, selectedVoice).filter(function (group) {
        if (selectedViewed === 'all') return true;
        var watched = isEpisodeWatched(object.movie || {}, group.season, group.episode, currentSource);
        return selectedViewed === 'watched' ? watched : !watched;
      });
      if (!groups.length) addRow('Немає серій за вибраними фільтрами',
        'Змініть озвучення або відкрийте ФІЛЬТРИ у верхній панелі', null, 'ms-warning');
      var seasonRendered = null, seasonRequests = [];
      groups.forEach(function (group) {
        if (seasonRendered !== group.season) {
          seasonRendered = group.season;
          addRow('Сезон ' + group.season,
            groups.filter(function (g) { return g.season === group.season; }).length + ' серій', null, 'ms-section');
          seasonRequests.push(group.season);
        }
        episodeCard(group, resolverEntry, movieTitle);
      });
      scroll.append($('<div class="ms-list-end-spacer" aria-hidden="true"></div>'));
      scheduleViewport(); enableController();
      seasonRequests.forEach(attachSeasonMetadata);
    }
     function supplementEpisodeCatalog(resolverEntry, movieTitle, g, baseline) {
       if (!resolverEntry || currentSource !== 'uaserials' || !getAdapterUrl()) return;
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
      if (!resolverEntry && currentStreams.some(function (s) { return s.resolvePage; })) {
        var pageEntry = findEpisode(currentStreams, selected);
        if (!pageEntry) return notify('Для цієї серії немає сторінки відтворення');
        var requestGeneration = ++generation;
        loading(true);
        return resolvePlayerEntry(pageEntry).then(function (fresh) {
          if (!isValid(requestGeneration)) return;
          loading(false);
          var stream = fresh[0];
          if (!stream) return notify('Прямого потоку не знайдено');
          return checkHlsStream(stream.url, 10000).then(function (check) {
            if (!isValid(requestGeneration)) return;
            if (!check.ok) return notify(check.message || 'HLS недоступний');
            play(stream, [stream], movieTitle);
          });
        }, function (err) {
          if (!isValid(requestGeneration)) return;
          loading(false);
          notify('Немає прямого потоку. Відкрийте сторінку серії у браузері (через джерело).');
          console.warn(LOG, 'First-party episode page did not expose a supported direct stream:', String(err.message || err));
        });
      }
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
        addRow('‹ До результатів', '', renderResults, 'ms-action');
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
        else {
          showMessage('Не вдалося відкрити онлайн-перегляд', String(err.message || err),
            { title: '‹ До результатів пошуку', click: renderResults });
          addRow('Відкрити на сайті ' + (registry[currentSource] || {name:currentSource}).name, 'Скористатися вебплеєром',
            function () { if (currentItem && currentItem.url) openWeb(currentItem.url); }, 'ms-action');
        }
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
          var episodeTimeline = progressFor(object.movie, s.season || 0, s.episode || 0);
          return { url: s.url, title: s.title || movieTitle, season: s.season || 0,
            episode: s.episode || 0, voice_name: s.voice || '', isonline: true,
            headers: s.headers || undefined, subtitles: s.subtitles || undefined,
            card: object.movie, timeline: episodeTimeline, _msTimeline: !!episodeTimeline };
        });
      var selected = playlist.filter(function (s) {
        return s.url === stream.url && (s.episode || 0) === (stream.episode || 0);
      })[0];
      if (!selected) return notify('Відео недоступне');
       try {
         // Android's external player reads playlist from the launch object,
         // while the internal Lampa player also accepts Player.playlist().
         // Avoid a circular object: selected belongs to playlist.
         selected.playlist = playlist.map(function (p) {
           var child = {}; for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) child[k] = p[k];
           return child;
         });
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
       refreshEpisodeProgress();
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
          if (state === 'episodes') renderResults();
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
      '.ms-toolbar{display:flex;gap:.65em;flex-wrap:wrap;padding:.8em 0;align-items:center}' +
      '.ms-toolbar-button{background:rgba(255,255,255,.1);padding:.65em 1em;border-radius:.4em;white-space:nowrap;cursor:pointer}' +
      '.ms-toolbar-filter{border:1px solid rgba(255,255,255,.16)}' +
      '@media(max-width:700px){.ms-toolbar{gap:.35em;padding:.45em 0}.ms-toolbar-button{font-size:.86em;padding:.6em .65em}}' +
      '.ms-episode-nav{display:flex;align-items:stretch;gap:.4em;flex-wrap:nowrap;overflow-x:auto;max-width:100%;padding:.2em 0 .45em;scrollbar-width:thin}' +
      '.ms-episode-nav-button{flex:0 0 auto;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.13);padding:.55em .8em;border-radius:.4em;white-space:nowrap;font-size:.9em;line-height:1.15;cursor:pointer;min-height:2.5em;display:flex;align-items:center;justify-content:center}' +
      '.ms-episode-nav-button.focus,.ms-episode-nav-button:focus{background:#fff;color:#151515}' +
      '.ms-nav-back{border-left:.2em solid #65a8ef}' +
      '.ms-list{padding:.6em 0 2em;touch-action:pan-y}' +
      '.ms-list-end-spacer{height:clamp(180px,32vh,340px);min-height:180px;pointer-events:none;flex-shrink:0}' +
      '.ms-scroll-viewport{min-height:0;overscroll-behavior:contain}' +
      '.ms-row{background:rgba(255,255,255,.08);padding:1em 1.3em;margin:.45em 0;border-radius:.45em}' +
      '.ms-row-title{font-size:1.22em;font-weight:600}' +
      '.ms-row-info{font-size:.92em;opacity:.72;margin-top:.25em}' +
      '.ms-row.focus,.ms-toolbar-button.focus{background:#fff;color:#161616}' +
      '.ms-row.ms-section{background:rgba(255,255,255,.04);opacity:.85}' +
      '.ms-row.ms-action{border-left:.25em solid #65a8ef}' +
      '.ms-result-card{display:flex!important;align-items:center;gap:1em;min-height:8em;padding:.75em 1em;cursor:pointer;overflow:hidden}' +
      '.ms-result-poster{flex:0 0 5.2em;width:5.2em;aspect-ratio:2/3;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:.45em;background:#26303b}' +
      '.ms-result-poster img{display:block;width:100%;height:100%;object-fit:cover}' +
      '.ms-result-placeholder{font-size:2em;opacity:.45}' +
      '.ms-result-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:.35em}' +
      '.ms-result-ua{font-size:1.13em;font-weight:650;line-height:1.25;white-space:normal;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.ms-result-original{font-size:.89em;opacity:.76;line-height:1.3;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
      '.ms-result-meta{display:flex;gap:.85em;flex-wrap:wrap;align-items:center;font-size:.83em;opacity:.83}' +
      '.ms-result-year{font-weight:600}' +
      '.ms-result-card.focus .ms-result-original,.ms-result-card.focus .ms-result-meta{opacity:1}' +
      '@media(max-width:700px){.ms-result-card{min-height:7em;gap:.7em}.ms-result-poster{flex-basis:4.2em;width:4.2em}.ms-result-ua{font-size:1em}.ms-result-original{font-size:.78em}}' +
      '.ms-episode-card{display:flex!important;gap:1em;align-items:center;min-height:6.3em;cursor:pointer;border-left:.18em solid transparent;transition:background .12s ease,border-color .12s ease}' +
      '.ms-episode-card.focus{border-left-color:#5fa9f5}' +
      '.ms-episode-thumb{position:relative;flex:0 0 26%;max-width:16em;aspect-ratio:16/9;border-radius:.45em;background:linear-gradient(135deg,#263546,#18222c);overflow:hidden;display:flex;align-items:center;justify-content:center}' +
      '.ms-episode-thumb img{width:100%;height:100%;object-fit:cover;display:block}' +
      '.ms-episode-thumb-index{position:absolute;left:.45em;top:.35em;background:#0009;border-radius:.3em;padding:.13em .38em;font-size:.9em;color:#fff;font-weight:650;z-index:2}' +
      '.ms-episode-thumb-play{position:absolute;z-index:1;display:flex;width:2.15em;height:2.15em;border-radius:50%;align-items:center;justify-content:center;padding-left:.15em;background:#121b27b8;color:#fff;font-size:1.15em;transition:transform .12s ease}' +
      '.ms-episode-card.focus .ms-episode-thumb-play{transform:scale(1.14);background:#fff;color:#1d2834}' +
      '.ms-episode-copy{min-width:0;flex:1}' +
      '.ms-episode-number{font-size:.82em;opacity:.75}' +
      '.ms-episode-name{font-size:1.14em;font-weight:600;margin:.2em 0;overflow-wrap:anywhere}' +
      '.ms-episode-voice{font-size:.83em;opacity:.78;line-height:1.35}' +
       '.ms-episode-description{font-size:.78em;opacity:.65;line-height:1.35;margin-top:.4em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
       '.ms-episode-progress{margin-top:.45em}.ms-episode-progress-track{height:.22em;background:#ffffff25;border-radius:1em;overflow:hidden}.ms-episode-progress-fill{height:100%;width:0;background:#69aefa;border-radius:1em}.ms-episode-progress-label{font-size:.73em;opacity:.82;margin-top:.25em}' +
      '.ms-watched-toggle{align-self:center;border:1px solid currentColor;opacity:.75;border-radius:.45em;padding:.55em .65em;font-size:.8em;min-width:7.7em;text-align:center;cursor:pointer}' +
      '.ms-episode-seen{opacity:.7}' +
      '.ms-watched-toggle.focus{background:white;color:#151515;opacity:1}' +
      '@media(max-width:700px){.ms-episode-card{gap:.6em;padding:.7em}.ms-episode-thumb{flex-basis:32%}.ms-watched-toggle{min-width:0;font-size:.68em;padding:.42em}.ms-episode-name{font-size:1em}.ms-episode-description{-webkit-line-clamp:1}}' +
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
       bindPlaybackEvents();
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
