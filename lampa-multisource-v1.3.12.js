/*
 * Lampa MultiSource 1.3.12 — streamlined stream routing and TV-friendly fallback
 * If direct access is allowed, the embedded page is fetched from the same
 * client as HLS. Otherwise previous worker fallback remains unchanged.
 * Copyright (c) 2026. MIT License.
 * UASerials adapter: HTML discovery, browser-available player metadata and HLS.
 * Optional HTML-only Cloudflare Worker; no streaming, authentication or DRM bypass.
 * UASerials 403: offer publisher embed/page as a fallback, never proxy signed media.
 */
(function () {
  'use strict';
  var VERSION = '1.3.12';
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
          { langs: language }, function (data) { finish(data && data.episodes); },
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
    var older = ['uaserials', 'uafix', 'uakino', 'kinoukr', 'uamovie', 'uaserialsmy', 'lavakino', 'uaserialsvip', 'uaserialtv'];
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
  // Current movie card refreshes after the native player closes.
  // A single callback prevents listener leaks across activity instances.
  var activeMovieProgressRefresh = null;
  var playbackEventsBound = false;
  function bindPlaybackEvents() {
    if (playbackEventsBound || !Lampa.PlayerVideo || !Lampa.PlayerVideo.listener ||
        typeof Lampa.PlayerVideo.listener.follow !== 'function') return;
    playbackEventsBound = true;
    Lampa.PlayerVideo.listener.follow('timeupdate', function () { saveVideoProgress(false, false); });
    Lampa.PlayerVideo.listener.follow('pause', function () { saveVideoProgress(true, false); });
    Lampa.PlayerVideo.listener.follow('ended', function () { saveVideoProgress(true, true); });
    if (Lampa.Player && Lampa.Player.listener && Lampa.Player.listener.follow)
      Lampa.Player.listener.follow('close', function () {
        saveVideoProgress(true, false);
        setTimeout(function () { if (activeMovieProgressRefresh) activeMovieProgressRefresh(); }, 250);
      });
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
        var bandwidth = /(?:^|[:,])BANDWIDTH=(\d+)/i.exec(info);
        var codecs = /(?:^|[:,])CODECS="([^"]{1,120})"/i.exec(info);
        var height = resolution ? Number(resolution[1]) : 0;
        var url = '';
        try { url = new URL(line, baseUrl).href; } catch (e) {}
        if (/^https:\/\//i.test(url) && /\.m3u8(?:[?#]|$)/i.test(url))
          result.push({ height: height, url: url,
            bandwidth: bandwidth ? Number(bandwidth[1]) : 0,
            codecs: codecs ? codecs[1] : '' });
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
  // jQuery jqXHR.statusCode is a FUNCTION. Treat only numeric values as HTTP codes.
  // Avoid showing source code of a callback in user-visible errors.
  function networkErrorText(err, textStatus, errorThrown) {
    var code = err && (typeof err.status === 'number' || /^\d{3}$/.test(String(err.status || '')))
      ? Number(err.status) : 0;
    if (!code && err && typeof err.statusCode === 'number') code = err.statusCode;
    if (code > 0) return 'HTTP ' + code + (code === 403 ? ' (доступ заборонено джерелом)' :
      code === 404 ? ' (сторінку не знайдено)' : code === 502 ? ' (помилка Worker або сайту)' : '');
    var detail = [textStatus, errorThrown, err && err.message, typeof err === 'string' ? err : '']
      .filter(function (s) { return typeof s === 'string' && s.length && s.length < 160; })[0];
    if (detail === 'error' || detail === 'abort' || detail === 'undefined') detail = '';
    return detail ? 'мережа/CORS: ' + detail : 'мережа/CORS (запит заблоковано або немає зв’язку)';
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
        }, function (err, textStatus, errorThrown) {
          var status = networkErrorText(err, textStatus, errorThrown);
          fetchDiagnostics.lastStatus = status;
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

  // Separate optional HTML-only Worker for the new public alternative sources. The
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
  function identifyAdapter(url) {
    var origin = String(url || '').trim().replace(/\/+$/, '');
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin))
      return Promise.reject(new Error('Потрібна HTTPS-адреса Worker без шляху'));
    return rawRequest(origin + '/health', 10000).then(function (body) {
      var info;
      try { info = JSON.parse(body); } catch (e) { throw new Error('Worker повернув не JSON /health'); }
      if (!info || info.ok !== true) throw new Error('Worker /health не підтвердив готовність');
      if (info.service === 'lampa-multisource-uaserials') return {type:'uaserials', url:origin, info:info};
      if (info.service === 'lampa-multisource-public-html') return {type:'public', url:origin, info:info};
      throw new Error('Невідомий тип Worker: ' + String(info.service || 'без назви').slice(0,80));
    });
  }
  // A v1.2.1 user could accidentally paste the UAFix/UAKino Worker into
  // the legacy UASerials field. Migrate only when /health proves its type.
  function repairMisplacedAdapter() {
    var old = getAdapterUrl();
    if (!old) return Promise.resolve({changed:false});
    return identifyAdapter(old).then(function (result) {
      if (result.type !== 'public') return {changed:false};
      if (!getPublicAdapterUrl()) setPublicAdapterUrl(old);
      setAdapterUrl('');
      notify('HTML Worker перенесено у налаштування альтернативних джерел. Для UASerials потрібен окремий сервер.');
      return {changed:true, publicAdapter:getPublicAdapterUrl()};
    }, function () { return {changed:false}; });
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
  // Diagnostics contain only host and transport status, never HTML, cookies,
  // media URLs, authentication headers or tokens. A 403 is an origin decision:
  // retrying it through another server cannot guarantee access.
  var publicHosts = { 'ua.movie': 'uamovie',
    'uaserials.my': 'uaserialsmy', 'lavakino.cc': 'lavakino',
    'lavakino.net': 'lavakino', 'uaserial.tv': 'uaserialtv',
    'hdvbua.pro': 'hdvbua' };
  var publicAccess = {};
  Object.keys(publicHosts).forEach(function (domain) {
    publicAccess[publicHosts[domain]] = {direct:'not_tried', worker:'not_tried', selected:'none'};
  });
  function publicAccessStatus() {
    var result = {};
    Object.keys(publicAccess).forEach(function (key) {
      var rec = publicAccess[key];
      result[key] = {direct:rec.direct, worker:rec.worker, selected:rec.selected};
    });
    return result;
  }
  function publicHtmlDocument(html) {
    var beginning = String(html || '').trim().slice(0, 2000);
    // On some builds native requests can return an empty payload or JSON
    // containing a transport error while invoking the success callback.
    return /<!doctype\s+html|<html(?:\s|>)|<(?:head|body|article|main|div|section|a)(?:\s|>)/i.test(beginning);
  }
  function publicHtmlRequest(url, timeout) {
    var domain = host(url);
    var id = publicHosts[domain] || '';
    if (!id) return Promise.reject(new Error('Домен публічного джерела не підтримується'));
    var rec = publicAccess[id], server = getPublicAdapterUrl();
    rec.direct = 'checking';
    rec.worker = server ? 'not_tried' : 'not_configured';
    rec.selected = 'none';
    // Read the public page from the user's client first, even if a Worker is
    // configured. This can work in an eligible native Lampa environment. It
    // does not modify request headers or override the website's access rules.
    return rawRequest(url, timeout).then(function (html) {
      if (!publicHtmlDocument(html)) throw new Error('Не отримано HTML-документ');
      rec.direct = 'ok';
      rec.selected = 'direct';
      fetchDiagnostics.transport = 'public-direct';
      fetchDiagnostics.lastError = '';
      return html;
    }).catch(function (directError) {
      rec.direct = /HTTP\s*403\b/i.test(String(directError.message || directError)) ? 'http_403' : 'unavailable';
      if (!server) {
        throw new Error('Пряме отримання HTML із ' + domain + ' недоступне (' + rec.direct +
          '). HTML-адаптер не налаштовано.');
      }
      rec.worker = 'checking';
      // Worker is an HTML-only fallback; media URLs never go through it.
      return rawRequest(server + '/fetch?url=' + encodeURIComponent(url), timeout).then(function (html) {
        var preview = String(html || '').trim();
        if (preview.charAt(0) === '{' && preview.length < 1500) {
          var parsed;
          try { parsed = JSON.parse(preview); } catch (e) { parsed = null; }
          if (parsed && parsed.ok === false) throw new Error('Worker: ' +
            String(parsed.error || 'upstream_error').slice(0, 90) +
            (typeof parsed.status === 'number' ? ' / HTTP ' + parsed.status : ''));
        }
        if (!publicHtmlDocument(html)) throw new Error('Worker повернув не HTML-документ');
        rec.worker = 'ok';
        rec.selected = 'worker';
        fetchDiagnostics.transport = 'public-worker';
        fetchDiagnostics.lastError = '';
        return html;
      }).catch(function (workerError) {
        var workerStatus = /HTTP\s*403\b/i.test(String(workerError.message || workerError));
        rec.worker = workerStatus ? 'http_403' : 'unavailable';
        rec.selected = 'none';
        fetchDiagnostics.transport = 'public-unavailable';
        // Do not instruct a user to reconfigure a healthy Worker that simply
        // received an upstream 403 Forbidden from the source website.
        if (workerStatus) {
          var denied = new Error('Джерело ' + domain + ' повернуло HTTP 403 для HTML-адаптера; '
            + 'прямий доступ із Lampa також недоступний. Це обмеження доступу сайту, '
            + 'а не помилка налаштувань Worker.');
          denied.code = 'SOURCE_ACCESS_DENIED';
          throw denied;
        }
        throw new Error('Не вдалося прочитати ' + domain + ' напряму (' + rec.direct +
          ') або через HTML-адаптер: ' + String(workerError.message || workerError));
      });
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
      // Retain public translation metadata across the Tortuga HTML resolver.
      s.siteVoice = entry.siteVoice || '';
      if (s.title === 'Відео') s.title = entry.title;
      return s;
    });
  }
  function resolvePlayerEntry(entry) {
    if (entry && entry.hdvb && hdvbEmbedUrl(entry.url))
      return hdvbHtmlStreams(entry.url);
    if (mediaUrl(entry.url, entry.url)) return Promise.resolve([entry]);
    if (entry.resolvePage) {
      var sourceId = publicHosts[host(entry.url)];
      var cfg = sourceId && registry[sourceId] || null;
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

  // UASerials detail pages publish the dubbing/translation next to "Переклад:".
  // This is page-level metadata, not a guarantee of a particular audio track.
  // Inspect the already fetched document: no extra network request is needed.
  function parseUASTranslation(html) {
    var doc = fromHtml(html);
    if (!doc || !doc.querySelectorAll) return '';
    var candidates = doc.querySelectorAll('li,dd,dt,tr,p,div,span');
    var best = '';
    for (var i = 0; i < candidates.length; i++) {
      var line = String(candidates[i].textContent || '').replace(/\s+/g, ' ').trim();
      if (line.length > 240 || !/^Переклад\s*[:：]/i.test(line)) continue;
      var found = line.replace(/^Переклад\s*[:：]\s*/i, '')
        .split(/\s+(?:Тривалість|Режисер|Актори|Країна|Жанр|Рік|Списки|Гасло)\s*[:：]/i)[0]
        .replace(/\s+/g, ' ').trim();
      if (!found || found.length > 120) continue;
      if (!best || found.length < best.length) best = found;
    }
    return best;
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
        var sourceTranslation = parseUASTranslation(html);
        return decodeUASPlayer(html).then(function (meta) {
          var found = direct.streams.concat(playerMediaItems(meta));
          found.forEach(function (s) { if (sourceTranslation) s.siteVoice = sourceTranslation; });
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
  // Public sites commonly include season numbers and "watch online" suffixes
  // in their titles. Normalize those display-only labels, but DO NOT remove
  // arbitrary words: "Міфіка. Залізна корона" and "Корона на Різдво" are NOT
  // The Crown. A shared word or the same year is insufficient evidence.
  function publicTitleKey(value) {
    var result = String(value || '').replace(/\s+/g, ' ').trim();
    result = result.replace(/^\s*(?:серіал|телесеріал|фільм)\s+[«"“]?/i, '');
    result = result.replace(/\s*\(\s*(?:\d+\s*[-–]\s*)?\d+\s*(?:сезон(?:ів|и)?|season(?:s)?)\s*\)/gi, ' ');
    result = result.replace(/\s+\d+(?:\s*[-–]\s*\d+)?\s*(?:сезон(?:ів|и)?|season(?:s)?)(?:\s+\d+\s*(?:серія|серії|серій|episode|episodes))?\s*$/gi, ' ');
    result = result.replace(/\s+(?:дивитися|смотреть|watch)\s+(?:онлайн|online).*$/i, '');
    result = result.replace(/\s*\(\s*(?:серіал|телесеріал|serial|tv\s*series|фільм|фильм|film|movie)\s*[,;:]\s*(?:19|20)\d{2}\s*\)\s*$/i, '');
    result = result.replace(/\s*\(\s*(?:19|20)\d{2}\s*\)\s*$/i, '');
    result = result.replace(/\s+(?:19|20)\d{2}\s*$/i, '');
    result = result.replace(/^[«"“]+|[»"”]+$/g, '').trim();
    return normal(result);
  }
  // A limited title equivalence for the verified TMDB series Crystal Lake
  // (2026). Never apply fuzzy substring matching or general word translation:
  // another film with "Lake" or a different year must not be promoted.
  function publicTitleForMovie(value, movie) {
    var key = publicTitleKey(value);
    var original = normal(movie && (movie.original_name || movie.original_title) || '');
    var year = validReleaseYear(movie &&
      (movie.first_air_date || movie.release_date || movie.year));
    if (original === 'crystal lake' && year === '2026' &&
        ['crystal lake', 'кришталеве озеро', 'крістал лейк', 'кристал лейк'].indexOf(key) >= 0)
      return 'crystal lake';
    // The source may mark Fallout season 2 by appending "2" to its title,
    // while the TMDB TV series is Fallout (2024). This equivalence is limited
    // to that exact TV identity; never apply it to arbitrary titles or films.
    var mediaType = String(movie && (movie.media_type || movie.type) || '').toLowerCase();
    var tvIdentity = !/^(?:movie|film|films)$/.test(mediaType) &&
      !!(movie && (movie.first_air_date || movie.original_name ||
        /^(?:tv|series|serial|show|tvshow)$/.test(mediaType)));
    if (tvIdentity && year === '2024' &&
        ['fallout', 'фолаут', 'фоллаут'].indexOf(original) >= 0 &&
        ['fallout', 'fallout 2', 'фолаут', 'фоллаут', 'фолаут 2', 'фоллаут 2'].indexOf(key) >= 0)
      return 'fallout';
    // The fourth Spider-Man film is also listed as "Людина павук 4" on public
    // movie pages. Accept only these COMPLETE aliases for the specific 2026
    // movie identity; do not weaken matching for unrelated Spider-Man films.
    var movieIdentity = /^(?:movie|film|films)$/.test(mediaType) ||
      (!tvIdentity && !!(movie && (movie.release_date || movie.original_title)));
    if (movieIdentity && year === '2026' && original === 'spider man brand new day' &&
        ['spider man brand new day', 'людина павук абсолютно новий день',
         'людина павук 4', 'spider man 4'].indexOf(key) >= 0)
      return 'spider man brand new day';
    return key;
  }
  // A source may list Ukrainian, transliterated, and original names separated
  // with " / ". Match complete variants only, not arbitrary words inside one.
  function publicTitleVariants(value) {
    var text = String(value || '').trim();
    if (!text) return [];
    return text.split(/\s+\/\s+/).slice(0, 4).map(function (x) {
      return x.trim();
    }).filter(Boolean);
  }
  // A few movie catalogs use a different production/copyright year from
  // the theatrical release year in TMDB. Never relax year matching based on
  // the URL or a translated name alone. Require TWO independently published,
  // COMPLETE names on the source detail page (localized + original) and an
  // exactly one-year difference. This rule is deliberately movie-only.
  function publicVerifiedAdjacentMovieYear(item, movie) {
    item = item || {}; movie = movie || {};
    var mediaType = String(movie.media_type || movie.type || '').toLowerCase();
    var isMovie = /^(?:movie|film|films)$/.test(mediaType) ||
      (!mediaType && !!(movie.release_date || movie.original_title) &&
       !movie.first_air_date && !movie.original_name && !Number(movie.number_of_seasons));
    if (!isMovie || movie.first_air_date || movie.original_name) return false;
    var sourceYear = validReleaseYear(item.year);
    var tmdbYear = validReleaseYear(movie.release_date || movie.year);
    if (!sourceYear || !tmdbYear || Math.abs(Number(sourceYear) - Number(tmdbYear)) !== 1) return false;
    var sourceLocal = publicTitleKey(item.title);
    var sourceOriginal = publicTitleKey(item.originalTitle);
    var expectedLocal = publicTitleKey(movie.title || movie.name);
    var expectedOriginal = publicTitleKey(movie.original_title);
    // English-only titles, single-name cards and invented originals must not
    // qualify for this exception. These fields must come from source HTML.
    return !!sourceLocal && !!sourceOriginal && !!expectedLocal && !!expectedOriginal &&
      sourceLocal !== sourceOriginal && expectedLocal !== expectedOriginal &&
      sourceLocal === expectedLocal && sourceOriginal === expectedOriginal;
  }
  function publicDetailOriginalTitle(doc) {
    if (!doc) return '';
    var label = getNamedText(doc,
      '.original-title,.orig-title,.origin-title,.orig-name,.full-original,.full-title-eng,.original-name');
    label = label.replace(/^(?:Оригінальна назва|Оригинальное название|Original title)\s*[:：]\s*/i, '').trim();
    if (label && label.length <= 120) return label;
    var body = doc.body && String(doc.body.textContent || '') || '';
    // Explicit source label, bounded at the next metadata label; do not use
    // TMDB data to fill in an absent original title.
    var match = body.match(/(?:Оригінальна\s+назва|Оригинальное\s+название|Original\s+title)\s*[:：]\s*([\s\S]{1,120}?)(?=\s*(?:Якість|Країна|Рік(?:\s+виходу)?|Жанр|Режисер|Актори|Озвучення|Quality|Year|Genre|Director)\s*[:：]|[\r\n]|$)/i);
    return match ? String(match[1]).replace(/\s+/g,' ').trim().slice(0,120) : '';
  }
  function publicMatchScore(item, movie) {
    movie = movie || {};
    var expected = [movie.title, movie.name, movie.original_title, movie.original_name]
      .filter(Boolean).map(function (s) { return publicTitleForMovie(s,movie); }).filter(Boolean);
    var names = [item.title, item.originalTitle].filter(Boolean)
      .reduce(function (acc, value) { return acc.concat(publicTitleVariants(value)); }, [])
      .map(function (s) { return publicTitleForMovie(s,movie); }).filter(Boolean);
    if (!expected.length || !names.some(function (name) { return expected.indexOf(name) >= 0; })) return 0;
    var targetYear = validReleaseYear(movie.release_date || movie.first_air_date || movie.year);
    var foundYear = validReleaseYear(item.year);
    if (targetYear && foundYear && targetYear !== foundYear)
      return publicVerifiedAdjacentMovieYear(item, movie) ? 111 : 0;
    return 100 + (targetYear && foundYear ? 12 : 0);
  }
  // Only auto-open a UNIQUE independently confirmed title + original release
  // year. An identical title with no year (or an ambiguous duplicate) must
  // remain selectable manually rather than silently opening a wrong release.
  function exactPublicSearchMatch(items, movie, query) {
    movie = movie || {};
    var wantedYear = validReleaseYear(movie.first_air_date || movie.release_date || movie.year);
    if (!wantedYear || !Array.isArray(items) || !items.length) return null;
    var titles = [movie.title, movie.name, movie.original_title, movie.original_name]
      .filter(Boolean).map(function (name) { return publicTitleForMovie(name, movie); });
    // Do not auto-route if the user explicitly changed the search to another
    // title. The normal result list still allows manually selecting it.
    if (query && titles.indexOf(publicTitleForMovie(query, movie)) < 0) return null;
    var possible = items.filter(function (item) {
      return item && item.url && !item.unverifiedYear &&
        (validReleaseYear(item.year) === wantedYear ||
         publicVerifiedAdjacentMovieYear(item, movie)) &&
        publicMatchScore(item, movie) >= 111;
    });
    if (possible.length !== 1) return null;
    // An unknown-year duplicate with the same name could be another release.
    var ambiguous = items.some(function (item) {
      return item && item.url !== possible[0].url &&
        publicMatchScore(item, movie) > 0 &&
        !validReleaseYear(item.year);
    });
    return ambiguous ? null : possible[0];
  }
  // A user's manually chosen PUBLIC detail-page URL can be remembered for the
  // same TMDB movie/series. Signed media URLs, credentials and player tokens are
  // never stored. Validate the page title against TMDB before linking it.
  function publicLinkKey(movie, sourceId) {
    movie = movie || {};
    var id = movie.tmdb_id || movie.id;
    var type = movie.media_type || movie.type || (movie.first_air_date ? 'tv' : 'movie');
    var identity = (/^\d{1,10}$/.test(String(id || ''))) ? 'tmdb:' + id :
      'name:' + publicTitleKey(movie.title || movie.name || movie.original_title || movie.original_name) +
      ':' + validReleaseYear(movie.release_date || movie.first_air_date || movie.year);
    return String(sourceId || '') + ':' + type + ':' + identity;
  }
  function savedPublicPage(movie, sourceId, cfg) {
    var links = getStorage('public_detail_links', {});
    var item = links && links[publicLinkKey(movie, sourceId)];
    if (!item || !cfg || !item.time || Date.now() - item.time > 180 * 86400000) return null;
    if (!publicPageUrl(item.url, cfg.baseUrl) || !cfg.isDetail(item.url)) return null;
    return item;
  }
  function forgetPublicPage(movie, sourceId) {
    var all = getStorage('public_detail_links', {});
    if (!all || typeof all !== 'object' || Array.isArray(all)) return;
    delete all[publicLinkKey(movie, sourceId)];
    setStorage('public_detail_links', all);
  }
  function savePublicPage(movie, sourceId, item, cfg) {
    if (!cfg || !item || !publicPageUrl(item.url, cfg.baseUrl) || !cfg.isDetail(item.url))
      throw new Error('Неприпустима адреса сторінки для цього джерела');
    var all = getStorage('public_detail_links', {});
    if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
    all[publicLinkKey(movie, sourceId)] = { url: item.url, title: item.title,
      year: item.year || '', time: Date.now() };
    var keys = Object.keys(all);
    if (keys.length > 80) {
      keys.sort(function (a,b) { return (all[a].time || 0) - (all[b].time || 0); });
      keys.slice(0, keys.length - 80).forEach(function (key) { delete all[key]; });
    }
    setStorage('public_detail_links', all);
    return item;
  }
  function publicDetailIdentity(html, url, cfg, movie) {
    var doc = fromHtml(html);
    if (!doc) return null;
    function meta(selector) { var node = doc.querySelector(selector);
      return node && node.getAttribute('content') || ''; }
    var names = [getNamedText(doc, 'h1'),
      getNamedText(doc, '.full-title,.full__title,.entry-title,.movie-title,.page-title,.story-title'),
      meta('meta[property="og:title"]'), meta('meta[name="twitter:title"]'),
      doc.title || ''];
    var body = doc.body && doc.body.textContent || '';
    var independentlyPublishedOriginal = publicDetailOriginalTitle(doc);
    // Site listings often have unrelated `.year` elements in the sidebar.
    // Trust an explicit release-year label on this detail page before such
    // broad selectors. Never synthesize source metadata from the Lampa card.
    var yearLine = body.match(/(?:Рік\s*(?:виходу|выпуска)?|Year|Дата\s*(?:виходу|релізу))\s*[:：\-]?\s*(?:(?:\d{1,2}\s+[А-Яа-яІЇЄҐіїєґ]+\s+))?((?:19|20)\d{2})/i);
    var year = validReleaseYear((yearLine && yearLine[1]) ||
      getNamedText(doc, '.full-year,.movie-year,[itemprop="datePublished"],.year') ||
      meta('meta[itemprop="datePublished"]') || '');
    for (var i = 0; i < names.length; i++) {
      var title = String(names[i] || '').replace(/\s+/g, ' ').trim();
      if (!title || title.length > 240) continue;
      // Some detail pages display "Керрі / Carrie"; evaluate the two
      // explicitly printed names separately, never invent a translation.
      var variants = publicTitleVariants(title);
      // Release year in a detail-page heading is independently published
      // metadata, unlike dates shown in unrelated search/sidebar cards.
      var titleYearMatch = /(?:^|[\s(])((?:19|20)\d{2})(?:[)\s]|$)/.exec(title);
      var verifiedYear = year || validReleaseYear(titleYearMatch && titleYearMatch[1]);
      if (!verifiedYear) {
        // Source descriptions sometimes publish "Crystal Lake (серіал, 2026)"
        // without a separate release-year element. Require the *same* title
        // in the meta description so a suggested title cannot supply its year.
        var description = meta('meta[property="og:description"]') || meta('meta[name="description"]');
        var identified = publicTitleVariants(title).some(function (v) {
          return !!publicMatchScore({title:v},movie);
        });
        var descYear = description.match(/(?:серіал|serial|series|телесеріал)[^\d]{0,8}((?:19|20)\d{2})/i);
        if (identified && descYear && description.length < 1500 &&
            publicTitleVariants(title).some(function (v) { return description.toLowerCase().indexOf(v.toLowerCase()) >= 0; }))
          verifiedYear = validReleaseYear(descYear[1]);
      }
      for (var v = 0; v < variants.length; v++) {
        var candidate = {url:url, title:variants[v], year:verifiedYear,
          originalTitle:independentlyPublishedOriginal,
          poster:posterUrl(meta('meta[property="og:image"]'), url)};
        candidate.score = publicMatchScore(candidate, movie);
        if (candidate.score) return candidate;
      }
    }
    return null;
  }
  function rememberPublicPage(sourceId, movie, rawUrl) {
    var src = registry[sourceId];
    if (!src || !src.isDetail || !src.baseUrl)
      return Promise.reject(new Error('Джерело не підтримує відкриття публічної сторінки'));
    var url = publicPageUrl(rawUrl, src.baseUrl);
    if (!url || !src.isDetail(url))
      return Promise.reject(new Error('Потрібна HTTPS-адреса сторінки на ' + host(src.baseUrl)));
    return publicHtmlRequest(url, 15000).then(function (html) {
      var matched = publicDetailIdentity(html, url, src, movie);
      var year = validReleaseYear(movie.first_air_date || movie.release_date || movie.year);
      if (!matched || !year ||
          (matched.year !== year && !publicVerifiedAdjacentMovieYear(matched, movie)))
        throw new Error('Назва або рік сторінки не підтверджені. Посилання не збережено.');
      return savePublicPage(movie, sourceId, matched, src);
    });
  }
  function searchSavedPublicPage(movie, cfg) {
    var sourceId = publicHosts[host(cfg.baseUrl)], saved = savedPublicPage(movie, sourceId, cfg);
    if (!saved) return Promise.resolve(null);
    return publicHtmlRequest(saved.url, 12000).then(function (html) {
      var entry = publicDetailIdentity(html, saved.url, cfg, movie);
      if (!entry) { forgetPublicPage(movie, sourceId); return null; }
      return entry;
    }, function () { return null; });
  }
  function publicSearchCards(html, cfg, movie) {
    var doc = fromHtml(html), byUrl = {}, order = [];
    if (!doc) return [];
    var links = doc.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i], url = publicPageUrl(a.getAttribute('href'), cfg.baseUrl);
      if (!url || !cfg.isDetail(url)) continue;
      var card = a.closest ? a.closest('article,.shortstory,.short-item,.short,.th-item,.movie-item,.item,.card,.poster,.movie,.story,.sres-wrap,.movie-card,.film-item,.poster-item') : null;
      var heading = getNamedText(card, '.short-title,.th-title,.movie-title,.card-title,.title,.poster__title,.sres-title,.poster-title,.shortstory__title,.th-title a,h2,h3');
      var image = a.querySelector('img') || (card && card.querySelector('img'));
      var titleCandidates = [heading, a.getAttribute('title'),
        image && image.getAttribute('alt'), a.textContent];
      var year = validReleaseYear(getNamedText(card, '.year,.short-year,.th-year,.movie-year,time,.date') ||
        (card && card.textContent) || '');
      var item = null;
      for (var n = 0; n < titleCandidates.length; n++) {
        var rawTitle = String(titleCandidates[n] || '').replace(/\s+/g, ' ').trim();
        if (!rawTitle || rawTitle.length > 170) continue;
        var names = publicTitleVariants(rawTitle);
        var title = names[0] || rawTitle;
        title = title.replace(/\s*\(\s*\d+\s*(?:сезон(?:ів|и)?|season(?:s)?)\s*\)/gi, ' ')
          .replace(/\s+\d+(?:\s*[-–]\s*\d+)?\s*(?:сезон(?:ів|и)?|season(?:s)?)\s*$/gi, ' ')
          .replace(/\s+(?:дивитися|смотреть|watch)\s+(?:онлайн|online).*$/i, '').trim();
        var original = names.slice(1).join(' / ') || getNamedText(card, '.original-title,.orig-title,.origin-title,.orig-name');
        var candidate = {title:title.slice(0,160),originalTitle:original.slice(0,160),year:year,
          poster:getPosterFromElement(card || a, url) || getPosterFromElement(a, url),url:url};
        candidate.score = publicMatchScore(candidate, movie);
        if (candidate.score && (!item || candidate.score > item.score)) item = candidate;
      }
      if (!item) continue;
      if (!byUrl[url]) { byUrl[url] = item; order.push(url); }
      else if (item.score > byUrl[url].score) byUrl[url] = item;
    }
    return order.map(function (url) { return byUrl[url]; })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, 30);
  }
  // Explicit public catalog reference provided by the user. This is only
  // a discovery hint for exact movie/series identities, never a replacement
  // for independent source verification. No video links or authentication data are bundled.
  var publicCatalogHints = [{
    source: 'uamovie', title: 'корона', original: 'the crown', year: '2016',
    type: 'tv', url: 'https://ua.movie/series/313-korona.html'
  }, {
    source: 'uaserialsmy', title: 'корона', original: 'the crown', year: '2016',
    type: 'tv', url: 'https://uaserials.my/836-korona-sezon-1.html'
  }, {
    source: 'uaserialtv', title: 'корона', original: 'the crown', year: '2016',
    type: 'tv', url: 'https://uaserial.tv/the-crown/season-1'
  }, {
    // User-provided live catalog URL; verify title AND year every time.
    source: 'lavakino', title: 'керрі', original: 'carrie', year: '2026',
    type: 'tv', url: 'https://lavakino.cc/88775-kerri.html'
  }, {
    source: 'lavakino', title: 'кристал лейк', original: 'crystal lake', year: '2026',
    type: 'tv', url: 'https://lavakino.cc/88852-kristal-leik.html'
  }, {
    source: 'uaserialtv', title: 'кришталеве озеро', original: 'crystal lake', year: '2026',
    type: 'tv', url: 'https://uaserial.tv/kryshtaleve-ozero-kristal-leik1/season-1'
  }, {
    // A source URL may refer to season 2 / year 2025, while the actual
    // Fallout television series premiered in 2024. Only its independently
    // published release year (not the URL suffix) can confirm this hint.
    source: 'uamovie', title: 'фолаут', original: 'fallout', year: '2024',
    type: 'tv', url: 'https://ua.movie/series/7780-folaut-2.html'
  }, {
    source: 'uaserialsmy', title: 'фолаут', original: 'fallout', year: '2024',
    type: 'tv', url: 'https://uaserials.my/8614-folaut-2025.html'
  }, {
    source: 'lavakino', title: 'фолаут', original: 'fallout', year: '2024',
    type: 'tv', url: 'https://lavakino.cc/76341-folaut-2-sezon.html'
  }, {
    // Published movie detail pages supplied by the user for Spider-Man:
    // Brand New Day (2026). Each page must independently confirm title/year.
    // These URLs are discovery hints, never pre-approved playable streams.
    source: 'uamovie', title: 'людина-павук: абсолютно новий день',
    original: 'spider-man: brand new day', year: '2026', type: 'movie',
    url: 'https://ua.movie/films/12126-ljudina-pavuk-absoljutno-novij-den-ljudina-pavuk-4.html'
  }, {
    source: 'uaserialsmy', title: 'людина-павук: абсолютно новий день',
    original: 'spider-man: brand new day', year: '2026', type: 'movie',
    url: 'https://uaserials.my/13043-ludyna-pavuk-absolutno-novyi-den-ludyna-pavuk-4-2026-b.html'
  }, {
    source: 'lavakino', title: 'людина-павук: абсолютно новий день',
    original: 'spider-man: brand new day', year: '2026', type: 'movie',
    url: 'https://lavakino.cc/85713-filmsasysys-ludyna-pavuk-absolutno-novyi-den.html'
  }, {
    source: 'uaserialtv', title: 'людина-павук: абсолютно новий день',
    original: 'spider-man: brand new day', year: '2026', type: 'movie',
    url: 'https://uaserial.tv/movie-ludyna-pavuk-absolutno-novyi-den-ludyna-pavuk-4'
  }, {
    // LavaKino labels this 1991 release as 1990. An adjacent-year match is
    // admitted ONLY when its HTML itself publishes both complete titles.
    source: 'lavakino', title: 'мовчання ягнят',
    original: 'the silence of the lambs', year: '1991', type: 'movie',
    url: 'https://lavakino.cc/31465-movchannia-iagniat.html'
  }];
  function publicKnownCandidate(movie, cfg) {
    if (!movie || !cfg) return null;
    var sourceId = publicHosts[host(cfg.baseUrl)];
    var year = validReleaseYear(movie.release_date || movie.first_air_date || movie.year);
    var rawType = String(movie.media_type || movie.type || '').toLowerCase();
    // Type-safe hints for both films and series. An explicit TMDB media_type
    // takes priority over incidental metadata fields, while ambiguous cards
    // without a reliable movie/TV signal must use ordinary search instead.
    var isFilm = /^(?:movie|film|films)$/.test(rawType);
    var isTv = /^(?:tv|series|serial|show|tvshow)$/.test(rawType);
    if (!isFilm && !isTv && !rawType) {
      isFilm = !!(movie.release_date || movie.original_title) &&
        !movie.first_air_date && !movie.original_name &&
        !Number(movie.number_of_seasons);
      isTv = !isFilm && !!(movie.first_air_date || movie.original_name ||
        Number(movie.number_of_seasons));
    }
    var wantedType = isFilm ? 'movie' : isTv ? 'tv' : '';
    if (!wantedType) return null;
    var titles = [movie.title, movie.name, movie.original_title, movie.original_name]
      .filter(Boolean).map(function (s) { return publicTitleForMovie(s, movie); });
    for (var i = 0; i < publicCatalogHints.length; i++) {
      var hint = publicCatalogHints[i];
      if (hint.source === sourceId && hint.year === year && hint.type === wantedType &&
          (titles.indexOf(publicTitleForMovie(hint.title, movie)) >= 0 ||
           titles.indexOf(publicTitleForMovie(hint.original, movie)) >= 0) &&
          publicPageUrl(hint.url, cfg.baseUrl) && cfg.isDetail(hint.url)) return hint.url;
    }
    return null;
  }
  var publicKnownDiagnostics = { status: 'not_tried', reason: '', year: '', source: '' };
  function searchPublicKnown(movie, cfg) {
    var url = publicKnownCandidate(movie, cfg);
    publicKnownDiagnostics = { source: publicHosts[host(cfg.baseUrl)] || '',
      status: url ? 'checking' : 'not_applicable', reason: '', year: '' };
    if (!url) return Promise.resolve(null);
    return publicHtmlRequest(url, 12000).then(function (html) {
      var matched = publicDetailIdentity(html, url, cfg, movie);
      var expected = validReleaseYear(movie.release_date || movie.first_air_date || movie.year);
      if (!matched) {
        publicKnownDiagnostics.status = 'identity_mismatch';
        publicKnownDiagnostics.reason = 'Source title or publication year not confirmed';
        return null;
      }
      if (!expected || (matched.year && matched.year !== expected &&
          !publicVerifiedAdjacentMovieYear(matched, movie))) {
        publicKnownDiagnostics.status = 'year_mismatch';
        publicKnownDiagnostics.year = matched.year || '';
        return null;
      }
      if (!matched.year) {
        // Live detail title matched, but no trustworthy published year in the
        // response. Offer manual selection only; never save or auto-route.
        publicKnownDiagnostics.status = 'title_only';
        publicKnownDiagnostics.reason = 'Рік на сторінці не підтверджено; оберіть вручну';
        matched.unverifiedYear = true;
        return matched;
      }
      // Independently verified source title and release year.
      savePublicPage(movie, publicHosts[host(cfg.baseUrl)], matched, cfg);
      publicKnownDiagnostics.status = publicVerifiedAdjacentMovieYear(matched, movie) ?
        'verified_adjacent_year' : 'verified';
      publicKnownDiagnostics.year = matched.year;
      return matched;
    }, function (err) {
      publicKnownDiagnostics.status = 'request_failed';
      publicKnownDiagnostics.reason = /403/.test(String(err && err.message || err)) ? 'http_403' : 'network_or_html';
      return null;
    });
  }
  function publicSearch(movie, api, cfg) {
    return searchSavedPublicPage(movie, cfg).then(function (saved) {
      if (saved) {
        publicKnownDiagnostics = { source: publicHosts[host(cfg.baseUrl)] || '',
          status: 'reused_saved', reason: '', year: saved.year || '' };
        return [saved];
      }
      return searchPublicKnown(movie, cfg).then(function (verified) {
        return verified ? [verified] : publicSearchWithoutSaved(movie, api, cfg);
      });
    });
  }
  function publicSearchWithoutSaved(movie, api, cfg) {
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
          // Continue when only lookalikes are present. Previously the search
          // ended on a 60-point substring match before trying later routes.
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
    if (!cfg.seasonLinks) return [];
    var doc = fromHtml(html), list = [];
    var links = doc ? doc.querySelectorAll('a[href]') : [];
    for (var i = 0; i < links.length; i++) {
      var u = publicPageUrl(links[i].getAttribute('href'), cfg.baseUrl);
      var label = String(links[i].textContent || '').replace(/\s+/g, ' ').trim();
      var seasonMatch = label.match(/^(?:\d{1,3}\s*сері(?:ї|й)\s+)?(\d{1,2})\s*сезон$/i);
      if (!u || !cfg.isDetail(u) || !seasonMatch) continue;
      list.push({url:u, title:'Сезон ' + seasonMatch[1]});
    }
    return dedup(list, function (item) { return item.url; }).slice(0, 15);
  }
  // Public HDVB PlayerJS data are an ordinary JavaScript string containing
  // a JSON folder tree. Never execute remote JavaScript, eval(), or fetch media
  // through Worker. Accept only the observed /embed/<numeric-id> document.
  function hdvbEmbedUrl(raw) {
    try {
      var value = new URL(String(raw || ''));
      return value.protocol === 'https:' && value.hostname === 'hdvbua.pro' &&
        !value.port && !value.username && !value.password &&
        /^\/embed\/\d{1,9}\/?$/.test(value.pathname) && !value.search && !value.hash &&
        value.href.length < 250 ? value.href : '';
    } catch (e) { return ''; }
  }
  function playerJsLiteral(body) {
    var single = /\bfile\s*:\s*'((?:\\.|[^'\\]){1,500000})'/m.exec(body);
    var double = single ? null : /\bfile\s*:\s*"((?:\\.|[^"\\]){1,500000})"/m.exec(body);
    var found = single || double;
    if (!found) return '';
    // A plain single-quoted JS literal may escape apostrophes and backslashes.
    // Do not interpret arbitrary executable JS expressions as a data source.
    return found[1].replace(/\\(['"\\])/g, '$1')
      .replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
  }
  function parseHdvbPlayerHtml(html, url) {
    if (!hdvbEmbedUrl(url)) throw new Error('Неочікувана адреса HTML-плеєра');
    var literal = playerJsLiteral(String(html || ''));
    if (!literal) throw new Error('HDVB: не знайдено конфігурації PlayerJS file');
    var folders;
    try { folders = JSON.parse(literal); }
    catch (err) {
      // A single film may be supplied directly as file: 'https://...m3u8'.
      if (/^https:\/\/[^\s]+\.m3u8(?:[?#]|$)/i.test(literal)) folders = [{file:literal,title:'Фільм'}];
      else throw new Error('HDVB: недійсний JSON каталогу серій');
    }
    if (!Array.isArray(folders)) {
      // Single film entry can be an object or URL, unlike a serial folder tree.
      if (folders && typeof folders === 'object') folders = [folders];
      else throw new Error('HDVB: невідомий формат каталогу');
    }
    var result = [];
    function walk(nodes, season, voice, depth) {
      if (!Array.isArray(nodes) || depth > 6 || result.length >= 250) return;
      nodes.forEach(function (node) {
        if (!node || typeof node !== 'object' || result.length >= 250) return;
        var title = String(node.title || '').slice(0, 110);
        var seasonLabel = /^(\d{1,2})\s*сезон(?:\s|$)/i.exec(title);
        var episodeLabel = /^(\d{1,3})\s*сер(?:ія|ии|ії|ий)(?:\s|$)/i.exec(title);
        var se = seasonLabel ? Number(seasonLabel[1]) : season;
        var ep = episodeLabel ? Number(episodeLabel[1]) : Number(node.episode || 0);
        var audio = voice;
        if (Array.isArray(node.folder)) {
          if (!seasonLabel && !episodeLabel && title) audio = title;
          walk(node.folder, se, audio, depth + 1);
          return;
        }
        if (typeof node.file !== 'string') return;
        var media = mediaUrl(node.file, node.file);
        if (!media || !/\.m3u8(?:[?#]|$)/i.test(media) || !/\.hdvbua\.pro$/.test(host(media))) return;
        if (se > 99 || ep > 999 || se < 0 || ep < 0) return;
        var sub = String(node.subtitle || '');
        var subtitleUrl = /https:\/\/[^\]\s]+?\.vtt(?:\?[^\]\s]*)?/i.exec(sub);
        result.push({
          url: media, title: ep ? 'Серія ' + ep : title || 'Фільм',
          season: se, episode: ep, voice: audio || '',
          poster: posterUrl(node.poster || '', url),
          subtitles: subtitleUrl ? [{url: subtitleUrl[0], label:'Українські', language:'uk'}] : undefined,
          hdvb: true
        });
      });
    }
    walk(folders, 0, '', 0);
    return dedup(result, function (entry) {
      return [entry.season, entry.episode, entry.voice, entry.url].join(':');
    });
  }
  function hdvbHtmlStreams(embedUrl) {
    var safe = hdvbEmbedUrl(embedUrl);
    if (!safe) return Promise.reject(new Error('Неприпустима адреса HDVB iframe'));
    // HTML: client first, then opt-in HTML-only Worker. The old Worker must be
    // updated to v1.3.6 before it can fetch hdvbua.pro/embed/<id>.
    return publicHtmlRequest(safe, 14000).then(function (html) {
      var streams = parseHdvbPlayerHtml(html, safe);
      if (!streams.length) throw new Error('HDVB: плеєр не надав HLS-потоків');
      return streams;
    });
  }
  function enrichHdvbCatalog(base, html) {
    var embeds = (base.embeds || []).map(hdvbEmbedUrl).filter(Boolean);
    // Some sources place the iframe URL in a JS data attribute rather than
    // an iframe[src]. Only exact observed HTTPS /embed/<id> URLs qualify.
    var marker = /https:\/\/hdvbua\.pro\/embed\/\d{1,9}/g;
    var text = String(html || '').replace(/\\\//g, '/');
    var match;
    while ((match = marker.exec(text)) && embeds.length < 5) {
      var candidate = hdvbEmbedUrl(match[0]);
      if (candidate && embeds.indexOf(candidate) < 0) embeds.push(candidate);
    }
    if (!embeds.length) return Promise.resolve(base);
    // Limit to the first clearly recognized player, not arbitrary third-party
    // iframes; a different host can still be opened manually if HDVB fails.
    var embed = embeds[0];
    return hdvbHtmlStreams(embed).then(function (streams) {
      base.streams = dedup(streams.concat(base.streams || []), function (e) {
        return [e.url, e.season, e.episode, e.voice].join(':');
      });
      base.playerResolver = {url:embed, resolve:true, hdvb:true};
      base.notice = 'HDVB: прямі HLS отримано з відкритої конфігурації PlayerJS.';
      return base;
    }, function (error) {
      base.hdvbStatus = /403/.test(String(error.message || error)) ? 'http_403' : 'html_unavailable';
      base.notice = 'HDVB: каталог HLS не вдалося прочитати (' + base.hdvbStatus + '). ' +
        'Залишається вебплеєр. Перевірте HTML Worker v1.3.6 і доступність /embed сторінки.';
      return base;
    });
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
      if (!cfg.seasonLinks) return enrichHdvbCatalog(base, html);
      var doc = fromHtml(html), seasonUrls = [], links = doc ? doc.querySelectorAll('a[href]') : [];
      for (var i = 0; i < links.length; i++) {
        var url = publicPageUrl(links[i].getAttribute('href'), cfg.baseUrl);
        if (url && cfg.seasonLinks(url)) seasonUrls.push(url);
      }
      seasonUrls = dedup(seasonUrls, function (u) { return u; }).filter(function (u) { return u !== item.url; }).slice(0, 8);
      if (!seasonUrls.length) return enrichHdvbCatalog(base, html);
      return Promise.all(seasonUrls.map(function (url) {
        return publicHtmlRequest(url, 10000, api).then(function (page) { return publicEpisodes(page, url, cfg); }, function () { return []; });
      })).then(function (lists) {
        base.streams = dedup(base.streams.concat([].concat.apply([], lists)),
          function (e) { return e.url + ':' + e.season + ':' + e.episode; });
        return enrichHdvbCatalog(base, html);
      });
    });
  }
  // UASerials.my uses numeric DLE detail URLs; it is NOT the original
  // UASerials.com source. No video endpoints are assumed to be interchangeable.
  var uaserialsmyCfg = {
    baseUrl: 'https://uaserials.my',
    isDetail: function (url) { return /^https:\/\/uaserials\.my\/(?:\d{1,9}-[^\/?#]+\.html)(?:[?#]|$)/i.test(url); },
    searchUrls: function (q) { var e=encodeURIComponent(q); return [
      'https://uaserials.my/index.php?do=search&subaction=search&story='+e,
      'https://uaserials.my/?s='+e,
      'https://uaserials.my/search/'+e+'/']; }
  };
  // v1.3.6: live user-supplied result is on lavakino.cc, not .net.
  // Only public HTML is requested; all results still require exact title/year checks.
  var lavakinoCfg = {
    baseUrl: 'https://lavakino.cc',
    isDetail: function (url) {
      return /^https:\/\/lavakino\.cc\/(?:[a-z0-9_-]+\/){0,4}[a-z0-9][a-z0-9_-]*\.html(?:[?#]|$)/i.test(url) ||
        /^https:\/\/lavakino\.cc\/(?:films?|serials?|movies?|series)\/[a-z0-9][a-z0-9_\/-]+\/?(?:[?#]|$)/i.test(url);
    },
    searchUrls: function (q) { var e=encodeURIComponent(q); return [
      'https://lavakino.cc/index.php?do=search&subaction=search&story='+e,
      'https://lavakino.cc/?s='+e,
      'https://lavakino.cc/search/'+e+'/']; }
  };
  var uaserialsvipCfg = {
    baseUrl: 'https://uaserials.vip',
    isDetail: function (url) { return /^https:\/\/uaserials\.vip\/\d{1,9}-[^\/?#]+\.html(?:[?#]|$)/i.test(url); },
    searchUrls: function (q) { var e=encodeURIComponent(q); return [
      'https://uaserials.vip/index.php?do=search&subaction=search&story='+e,
      'https://uaserials.vip/?s='+e,
      'https://uaserials.vip/search/'+e+'/']; }
  };
  // uaserial.tv uses season URLs rather than DLE numeric *.html pages.
  var uaserialtvCfg = {
    baseUrl: 'https://uaserial.tv',
    isDetail: function (url) {
      return /^https:\/\/uaserial\.tv\/[a-z0-9][a-z0-9-]+(?:\/season-\d{1,2}(?:\/episode-\d{1,3})?)?\/?(?:[?#]|$)/i.test(url) &&
        !/^https:\/\/uaserial\.tv\/(?:search|selection|serial|films?|movies?|login|category|register|user|auth)(?:\/|[?#]|$)/i.test(url);
    },
    searchUrls: function (q) { var e=encodeURIComponent(q); return [
      'https://uaserial.tv/search?q='+e,
      'https://uaserial.tv/search?query='+e,
      'https://uaserial.tv/?s='+e]; },
    seasonLinks: function (url) { return /^https:\/\/uaserial\.tv\/[a-z0-9][a-z0-9-]+\/season-\d{1,2}\/?(?:[?#]|$)/i.test(url); },
    episodeNumbers: function (url) {
      var m=/\/season-(\d+)\/episode-(\d+)(?:\/?[?#]|\/?$)/i.exec(url);
      return m ? {season:Number(m[1]),episode:Number(m[2])} : null;
    }
  };
  var uamovieCfg = {
    baseUrl: 'https://ua.movie',
    isDetail: function (url) {
      return /^https:\/\/ua\.movie\/(?:series|films|movies|multfilms|cartoons|anime|doramas|dorama|shows|multserials)\/\d{1,9}-[^\/?#]+\.html(?:[?#]|$)/i.test(url);
    },
    searchUrls: function (q) { var e = encodeURIComponent(q); return [
      'https://ua.movie/index.php?do=search&subaction=search&story=' + e,
      'https://ua.movie/?s=' + e,
      'https://ua.movie/search/' + e + '/']; }
  };
  [ {id:'uamovie', name:'UA.Movie', cfg:uamovieCfg},
    {id:'uaserialsmy', name:'UASerials.my', cfg:uaserialsmyCfg},
    {id:'lavakino', name:'LavaKino', cfg:lavakinoCfg},
    // Temporarily disabled after LG/PC testing; retain cfg for possible future reactivation.
    // {id:'uaserialsvip', name:'UASerials.vip', cfg:uaserialsvipCfg},
    {id:'uaserialtv', name:'UASerial.tv', cfg:uaserialtvCfg} ].forEach(function (record) {
    var cfg = record.cfg;
    registerSource({id: record.id, name: record.name, baseUrl: cfg.baseUrl,
      isDetail: cfg.isDetail,
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
    publicAccessStatus: publicAccessStatus,
    inspectHdvbHtml: function (html, embedUrl) {
      var found = parseHdvbPlayerHtml(html, embedUrl || 'https://hdvbua.pro/embed/836');
      return { total: found.length, episodes: episodeLabels(found).length,
        seasons: dedup(found.map(function (s) { return s.season; }), function (s) { return s; }).length,
        voices: dedup(found.map(function (s) { return s.voice; }), function (s) { return s; }) };
    },
    probeHdvbEmbed: function (embedUrl) {
      return hdvbHtmlStreams(embedUrl).then(function (streams) {
        return {ok:true, total:streams.length, uniqueEpisodes:dedup(streams.filter(function (s) {return s.episode; }),
          function(s) {return s.season+':'+s.episode;}).length,
          source:publicAccess.hdvbua && publicAccess.hdvbua.selected || 'none'};
      }, function (err) {return {ok:false, reason:String(err && err.message || err).slice(0,180)};});
    },
    knownPageStatus: function () { return {
      source: publicKnownDiagnostics.source, status: publicKnownDiagnostics.status,
      reason: publicKnownDiagnostics.reason, year: publicKnownDiagnostics.year
    }; },
    // Safe homepage connectivity probe: only status/count; never output HTML.
    probePublicAccess: function (id) {
      if (!Object.prototype.hasOwnProperty.call(publicAccess, id) || !registry[id])
        return Promise.reject(new Error('Невідоме або вимкнене джерело: оберіть активне зі списку'));
      var url = registry[id].baseUrl + '/';
      return publicHtmlRequest(url, 10000).then(function (html) {
        return {source:id, readable:true, transport:publicAccess[id].selected,
          htmlSize:html.length, status:publicAccessStatus()[id]};
      }, function (err) {
        return {source:id, readable:false, reason:String(err.message || err),
          status:publicAccessStatus()[id]};
      });
    },
    rememberPublicPage: rememberPublicPage,
    savedPublicPage: function (id, movie) { return savedPublicPage(movie, id, registry[id]); },
    forgetPublicPage: function (id, movie) { forgetPublicPage(movie, id); },
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
    identifyAdapter: identifyAdapter,
    repairMisplacedAdapter: repairMisplacedAdapter,
    checkAdapterSettings: function () {
      return {uaserialsConfigured: !!getAdapterUrl(), publicConfigured: !!getPublicAdapterUrl(),
        uaserialsUrl: getAdapterUrl(), publicUrl: getPublicAdapterUrl()};
    },
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
      exactSearchMatch: exactSearchMatch, exactPublicSearchMatch: exactPublicSearchMatch,
      parseUASTranslation: parseUASTranslation,
      tmdbSeriesId: tmdbSeriesId, episodeImagePath: episodeImagePath,
       extractHlsVariants: extractHlsVariants, networkErrorText: networkErrorText,
       timelineKey: timelineKey, progressFor: progressFor,
       publicSearchCards: publicSearchCards, publicEpisodes: publicEpisodes,
      publicTitleKey: publicTitleKey, publicTitleVariants: publicTitleVariants,
      publicTitleForMovie: publicTitleForMovie, publicMatchScore: publicMatchScore,
      publicVerifiedAdjacentMovieYear: publicVerifiedAdjacentMovieYear,
      publicDetailIdentity: publicDetailIdentity, publicLinkKey: publicLinkKey },
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
        adapterUrl: getAdapterUrl(), publicAccess: publicAccessStatus(), network: { transport: fetchDiagnostics.transport,
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
    var movieCardContext = null; // return to exact movie card after source web player
    var tmdbSeasonCache = {};
    var episodeRows = [];
    var lastEpisodeCatalog = null;
    var state = 'results';
    var generation = 0;
    var started = false;
    var viewportTimer = null;
    var viewportBound = false;
    var wheelAccumulator = 0;
    var closingSelect = false;
    var activeWebFrame = null;
    var webPlayerReturn = null;
    function releaseWebFrame() {
      if (!activeWebFrame) return;
      try { activeWebFrame.attr('src', 'about:blank'); } catch (e) {}
      activeWebFrame = null;
    }
    function hasView() {
      var viewport = scroll && scroll.render && scroll.render();
      return !!(active && started && viewport && viewport[0] &&
        document.documentElement && document.documentElement.contains &&
        document.documentElement.contains(viewport[0]));
    }
    function restoreContent() {
      // Select.close() can fire its onBack before Lampa reattaches the scroll
      // viewport. Never force content collectionSet on a detached element.
      setTimeout(function () {
        if (!hasView()) return;
        try {
          var enabled = Lampa.Controller.enabled();
          if (enabled && enabled.name === 'select') return; // another modal is open
          Lampa.Controller.toggle('content');
        } catch (e) { console.warn(LOG, 'restore controller', String(e.message || e)); }
      }, 30);
    }
    function restorePrevious(previous) {
      if (closingSelect || !active) return;
      if (!previous || previous === 'content') return restoreContent();
      setTimeout(function () {
        if (!hasView()) return;
        try {
          var enabled = Lampa.Controller.enabled();
          if (enabled && enabled.name === 'select') return;
          Lampa.Controller.toggle(previous);
        } catch (e) { console.warn(LOG, 'restore previous', String(e.message || e)); }
      }, 30);
    }
    function closeSelectSafe() {
      closingSelect = true;
      try { Lampa.Select.close(); }
      finally { setTimeout(function () { closingSelect = false; }, 60); }
    }
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
        onBack: function () { restorePrevious(previous); },
        onSelect: function (choice) {
          var i = Number(choice && choice.id);
          if (!isFinite(i) || i < 0 || i >= labels.length) return;
          closeSelectSafe();
          restoreContent();
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
      releaseWebFrame();
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
        onBack: function () { restorePrevious(previous); },
        onSelect: function (choice) {
          if (!choice) return;
          closeSelectSafe();
          restoreContent();
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
          { title: getAdapterUrl() ? 'UASerials Worker: налаштовано' : 'UASerials Worker (окремий)', id: 'adapter' },
          { title: getPublicAdapterUrl() ? 'HTML-адаптер (6 доменів): налаштовано' : 'HTML-адаптер (6 доменів)', id: 'public_adapter' },
          { title: 'Відкрити сторінку джерела за URL', id: 'source_page' },
          { title: 'Змінити назву пошуку', id: 'query' },
          { title: 'Розширені інструменти', id: 'advanced' }
        ];
        if (state === 'episodes' && episodeContext) {
          items.unshift({ title: 'TMDB: ' + tmdbDiagnostics.status + ' • записів: ' + tmdbDiagnostics.records, id: 'tmdb_status' });
          items.unshift({ title: '↻ Оновити метадані TMDB', id: 'tmdb_refresh' });
          items.unshift({ title: '↻ Оновити каталог серій', id: 'refresh' });
          items.unshift({ title: '☰ Обрати серію (резервне меню)', id: 'picker' });
        }
        var selected = registry[currentSource];
        if (selected && selected.isDetail && savedPublicPage(object.movie, currentSource, selected)) {
          items.push({ title: 'Забути збережену сторінку ' + selected.name, id: 'forget_page' });
        }
        items.push({ title: 'Про TMDB і MultiSource', id: 'credits' });
        Lampa.Select.show({ title: 'MultiSource — налаштування',
          items: items,
          onBack: function () { restorePrevious(previous); },
          onSelect: function (choice) {
            if (!choice) return;
            // Preserve context before navigation or a rerender replaces the toolbar.
            var ctx = episodeContext;
            closeSelectSafe(); restoreContent();
            if (choice.id === 'adapter') configureAdapter();
            if (choice.id === 'public_adapter') configurePublicAdapter();
            if (choice.id === 'tmdb_refresh' && ctx) {
              tmdbSeasonCache = {};
              var store = getStorage('tmdb_episode_metadata_121', {});
              seasonNumbers(ctx.labels).forEach(function (n) { delete store[seasonMetaKey(object.movie, n)]; });
              setStorage('tmdb_episode_metadata_121', store);
              renderEpisodeCatalog(ctx.labels, ctx.resolverEntry, ctx.movieTitle, ctx.cached, ctx.failure);
            }
            if (choice.id === 'tmdb_status') {
              notify('TMDB: ' + tmdbDiagnostics.status + ' • сезон ' + tmdbDiagnostics.lastSeason +
                ' • серій із метаданими: ' + tmdbDiagnostics.records);
            }
            if (choice.id === 'query') changeQuery();
            if (choice.id === 'source_page') openSourcePage();
            if (choice.id === 'forget_page') {
              forgetPublicPage(object.movie, currentSource);
              notify('Збережену сторінку джерела видалено'); find();
            }
            if (choice.id === 'advanced') showAdvancedTools();
            if (choice.id === 'refresh' && ctx) playOrResolve(ctx.resolverEntry, currentStreams, ctx.movieTitle);
            if (choice.id === 'picker' && ctx) showEpisodePicker(ctx.labels, ctx.resolverEntry, ctx.movieTitle);
            if (choice.id === 'credits') {
              Lampa.Select.show({ title: 'Про MultiSource',
                items: [{ title: 'This product uses the TMDB API but is not endorsed or certified by TMDB.', id: 'notice' },
                  { title: 'TMDB — www.themoviedb.org', id: 'tmdb' }],
                onBack: function () { restoreContent(); },
                onSelect: function (c) { closeSelectSafe(); restoreContent();
                  if (c.id === 'tmdb') openWeb('https://www.themoviedb.org/'); }
              });
            }
          }
        });
      });
      toolbar.append(setupButton);
      scheduleViewport();
    }
    function showAdvancedTools() {
      var previous = 'content';
      try { previous = Lampa.Controller.enabled().name || 'content'; } catch (e) {}
      Lampa.Select.show({ title: 'MultiSource — розширені інструменти',
        items: [
          { title: 'Вставити пряме HLS/MP4-посилання (тест)', id: 'direct' },
          { title: 'Перевірити стан підключень', id: 'status' }
        ],
        onBack: function () { restorePrevious(previous); },
        onSelect: function (choice) {
          if (!choice) return;
          closeSelectSafe(); restoreContent();
          if (choice.id === 'direct') askDirectUrl('Перевірка потоку');
          if (choice.id === 'status') {
            notify('UASerials Worker: ' + (getAdapterUrl() ? 'налаштований' : 'немає') +
              ' • HTML Worker: ' + (getPublicAdapterUrl() ? 'налаштований' : 'немає'));
          }
        }
      });
    }
    function configureAdapter() {
      if (Lampa.Input && typeof Lampa.Input.edit === 'function') {
        Lampa.Input.edit({ title: 'Worker ЛИШЕ для UASerials (HTTPS origin)', value: getAdapterUrl() }, function (value) {
          value = String(value || '').trim();
          if (!value) { setAdapterUrl(''); sourceCaption(); notify('UASerials Worker відключено'); return find(); }
          identifyAdapter(value).then(function (identified) {
            if (!active) return;
            if (identified.type === 'public') {
              // The value was pasted in the wrong field. Route it without
              // accidentally breaking the original UASerials connection.
              setPublicAdapterUrl(identified.url);
              if (getAdapterUrl() === identified.url) setAdapterUrl('');
              notify('Це Worker для альтернативних джерел. Перенесено до правильного поля.');
            } else {
              setAdapterUrl(identified.url);
              notify('UASerials Worker підключено');
            }
            sourceCaption(); find();
          }, function (err) { notify('Worker НЕ збережено: ' + String(err.message || err)); });
        });
      } else notify('LampaMultiSource.setAdapterUrl("https://uaserials-worker.workers.dev")');
    }
    function configurePublicAdapter() {
      if (Lampa.Input && typeof Lampa.Input.edit === 'function') {
        Lampa.Input.edit({ title: 'HTML Worker для 5 альтернатив (HTTPS origin)',
          value: getPublicAdapterUrl() }, function (value) {
          value = String(value || '').trim();
          if (!value) { setPublicAdapterUrl(''); notify('HTML-адаптер відключено'); return find(); }
          identifyAdapter(value).then(function (identified) {
            if (!active) return;
            if (identified.type === 'uaserials') {
              setAdapterUrl(identified.url);
              notify('Це Worker для UASerials. Перенесено до правильного поля.');
            } else {
              setPublicAdapterUrl(identified.url);
              notify('HTML-адаптер підключено (перевірте список доменів у /health)');
            }
            sourceCaption(); find();
          }, function (err) { notify('Worker НЕ збережено: ' + String(err.message || err)); });
        });
      } else notify('LampaMultiSource.setPublicAdapterUrl("https://name.workers.dev")');
    }
    // Optional manual entry of an already known PUBLIC detail page.
    // This allows testing a verified result when a site's public search route
    // is unavailable. It never manufactures video URLs or bypasses access rules.
    function openSourcePage() {
      var src = registry[currentSource];
      if (!src || !src.isDetail || !src.baseUrl) {
        notify('Для UASerials використайте звичайний пошук'); return;
      }
      if (!Lampa.Input || typeof Lampa.Input.edit !== 'function') {
        notify('Введення адреси недоступне на цьому пристрої'); return;
      }
      Lampa.Input.edit({ title: 'HTTPS-адреса сторінки ' + src.name, value: '' }, function (value) {
        var url = publicPageUrl(String(value || '').trim(), src.baseUrl);
        if (!url || !src.isDetail(url)) {
          notify('Потрібна публічна сторінка фільму/серіалу на ' + host(src.baseUrl));
          return;
        }
        notify('Перевіряємо назву та рік сторінки…');
        var selectedSource = currentSource;
        rememberPublicPage(selectedSource, object.movie || {}, url).then(function (matched) {
          if (!active || selectedSource !== currentSource) return;
          notify('Сторінку перевірено й збережено для цього фільму/серіалу');
          details(matched);
        }, function (err) { if (active) notify(String(err.message || err)); });
      });
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
        onBack: function () { restorePrevious(enabled); },
        onSelect: function (choice) {
          if (!choice || !registry[choice.id]) return;
          closeSelectSafe();
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
          var publicSource = !!(src.isDetail && src.baseUrl);
          showMessage(publicSource ? 'Точного збігу не знайдено' : 'Нічого не знайдено',
            publicSource ? (src.id === 'uamovie' ? 'Пошук українською та оригінальною назвою не підтвердив збіг у UA.Movie. Контент може бути відсутнім на сайті. Спробуйте інше джерело або вкажіть відому сторінку за URL.' : 'Схожі назви відхилено. Вставте HTTPS-адресу потрібної сторінки один раз: після перевірки назви та року MultiSource запам’ятає її для наступних запусків.')
              : 'Перевірте назву або спробуйте інше джерело.', {
            title: publicSource ? 'Відкрити сторінку за URL' : 'Відкрити сайт джерела',
            click: function () {
              if (publicSource) openSourcePage();
              else if (src.baseUrl) openWeb(src.baseUrl);
            }
          });
          // Explicit recovery path for the user-supplied catalog page. This
          // is NOT a fabricated search result: clicking re-fetches the page
          // and independently verifies title + year before opening details.
          var knownUrl = publicSource ? publicKnownCandidate(object.movie, src) : null;
          if (knownUrl) addRow('Перевірити знайдену сторінку «' + (object.movie.title || object.movie.name || 'контенту') + '»',
            src.name + ' • перевірка назви та року на сторінці', function () {
              rememberPublicPage(currentSource, object.movie, knownUrl).then(function (matched) {
                if (active) { currentCandidates = [matched]; details(matched); }
              }, function (err) { if (active) notify('Сторінку не підтверджено: ' + String(err.message || err)); });
            }, 'ms-action');
          return;
        }
        // No artificial metadata matches: original title AND year must be
        // present on the source result (or enriched source detail page).
        var verifiedLink = src.isDetail && savedPublicPage(object.movie, currentSource, src);
        if (verifiedLink && currentCandidates.length === 1 &&
            !currentCandidates[0].unverifiedYear && currentCandidates[0].url === verifiedLink.url &&
            exactPublicSearchMatch(currentCandidates, object.movie, object.search)) {
          details(currentCandidates[0]); return;
        }
        var perfect = src.id === 'uaserials' ?
          exactSearchMatch(currentCandidates, object.movie, object.search) :
          exactPublicSearchMatch(currentCandidates, object.movie, object.search);
        if (perfect) { details(perfect); return; }
        if (src.id !== 'uaserials') {
          // Many public search cards omit their publication year. When there
          // is just one exact TITLE candidate, inspect its own detail page to
          // verify the year before auto-opening. Never auto-open title-only.
          var unconfirmed = currentCandidates.length === 1 &&
            currentCandidates[0] && currentCandidates[0].url &&
            publicMatchScore(currentCandidates[0], object.movie) === 100 &&
            !currentCandidates[0].unverifiedYear && src.isDetail &&
            (!object.search || [object.movie.title, object.movie.name,
              object.movie.original_title, object.movie.original_name]
              .filter(Boolean).some(function (name) {
                return publicTitleForMovie(name, object.movie) ===
                  publicTitleForMovie(object.search, object.movie);
              }));
          if (!unconfirmed) { renderResults(); return; }
          showMessage('Перевіряємо рік випуску', 'Уточнюємо єдиний результат на сайті ' + src.name + '…');
          publicHtmlRequest(currentCandidates[0].url, 12000).then(function (html) {
            if (!isValid(g) || state !== 'results') return;
            var checked = publicDetailIdentity(html, currentCandidates[0].url, src, object.movie);
            var year = validReleaseYear(object.movie.first_air_date ||
              object.movie.release_date || object.movie.year);
            if (checked &&
                (checked.year === year || publicVerifiedAdjacentMovieYear(checked, object.movie)) &&
                publicMatchScore(checked, object.movie) >= 111) {
              currentCandidates[0] = checked;
              details(checked);
            } else renderResults();
          }, function () { if (isValid(g) && state === 'results') renderResults(); });
          return;
        }
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
        var isPublic = Object.prototype.hasOwnProperty.call(publicAccess, currentSource);
        var details = String(err.message || err);
        var denied = isPublic && (err.code === 'SOURCE_ACCESS_DENIED' || /HTTP\s*403\b/.test(details));
        var message = denied ? 'Сайт не дозволив отримати HTML через налаштований Worker, '
          + 'а прямий запит із Lampa теж не спрацював. Налаштування Worker можна залишити без змін. '
          + 'Для перегляду перевірте доступність сайту у звичайному браузері.' : details +
          (isPublic ? ' • Для цих джерел потрібен доступ до відкритих HTML-сторінок. '
            + 'Навіть з адаптером відеоплеєр може не видавати прямий потік.' :
            (getAdapterUrl() ? ' • Перевірте сервер UASerials.' : ' • Перевірте CORS/сервер.'));
        showMessage(denied ? 'Доступ до ' + registry[currentSource].name + ' обмежено' :
          'Не вдалося виконати пошук', message,
          { title: denied ? '↻ Повторити пошук' :
              isPublic ? 'Налаштувати HTML-адаптер' : 'Налаштувати сервер',
            click: denied ? find : isPublic ? configurePublicAdapter : configureAdapter });
        if (isPublic && registry[currentSource]) addRow('Відкрити сайт ' + registry[currentSource].name,
          'Переглянути доступність безпосередньо у браузері',
          function () { openWeb(registry[currentSource].baseUrl); }, 'ms-action');
      });
    }
    // A third-party webpage cannot be passed as a media URL to Lampa.Player.
    // Offer an optional cross-origin iframe inside this Lampa view instead of
    // always opening a separate browser tab. The origin's frame policy still
    // applies; a blocked/black frame must fall back to the website.
    // An iframe is not necessarily a video player: many source sites use
    // same-origin frames for their entire page. Restrict direct player actions
    // to explicitly observed third-party video hosts per source. This is NOT
    // an origin/CORS bypass and it does not extract private media endpoints.
    var embeddedPlayerHosts = {
      uamovie: ['hdvbua.pro', 'franko.uacdn.online'],
      uaserialsmy: ['hdvbua.pro'],
      lavakino: ['hdvbua.pro', 'asdhi.vip'],
      uaserialsvip: ['asdhi.vip'],
      uaserialtv: ['hdvbua.pro']
    };
    function safeWebPlayerUrl(input) {
      try {
        var url = new URL(String(input || ''));
        var domain = url.hostname.toLowerCase();
        if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 4096 ||
            !registry[currentSource] || url.hash) return '';
        // UASerials fallback: only the exact, site-provided public Tortuga
        // embed endpoint, never arbitrary pages, streams or hostnames.
        // This is an ordinary iframe, NOT a media-token or CORS workaround.
        if (currentSource === 'uaserials') {
          return /^(?:tortuga\.tw|tortuga\.wtf)$/.test(domain) &&
            /^\/embed\/\d{1,9}\/?$/.test(url.pathname) && !url.search ? url.href : '';
        }
        if (!publicAccess[currentSource]) return '';
        // Preserve original UA.Movie support for subdomains of its confirmed
        // hdvbua.pro host. All other hosts require an exact hostname match.
        var permitted = embeddedPlayerHosts[currentSource] || [];
        if (permitted.indexOf(domain) >= 0 ||
            (permitted.indexOf('hdvbua.pro') >= 0 && /^(?:[a-z0-9-]+\.)+hdvbua\.pro$/.test(domain)))
          return url.href;
      } catch (err) {}
      return '';
    }
    function uaserialsEmbed() {
      if (currentSource !== 'uaserials') return '';
      var candidates = (currentStreams || []).map(function (s) { return s && s.url; })
        .concat(currentResult && currentResult.embeds || []);
      for (var i = 0; i < candidates.length; i++) {
        var url = safeWebPlayerUrl(candidates[i]);
        if (url) return url;
      }
      return '';
    }
    // A genuine HTTP 403 from Tortuga's media server is not a CORS parsing
    // problem; retrying a Worker-issued signed URL in the same Lampa origin
    // does not make it playable. Prefer the original, site-provided embed.
    // This embeds the provider's own player; it does NOT proxy media or change
    // Origin, Referer, credentials, signatures or access controls.
    function useTortugaPlayerOn403(result, embed) {
      if (currentSource !== 'uaserials' || !result || result.status !== 403 ||
          result.reason !== 'http') return false;
      var safe = safeWebPlayerUrl(embed);
      if (!safe) return false;
      notify('HLS повернув 403. Відкриваємо оригінальний вебплеєр Tortuga; прогрес окремий.');
      showWebPlayerInLampa(safe);
      return true;
    }
    function returnFromWebPlayer() {
      var action = webPlayerReturn;
      webPlayerReturn = null;
      releaseWebFrame();
      if (action) action();
      else renderStreamOptions(currentResult);
    }
    function showWebPlayerInLampa(input) {
      var safe = safeWebPlayerUrl(input);
      if (!safe || !(publicAccess[currentSource] || currentSource === 'uaserials')) {
        notify('Вбудовування цього вебплеєра не підтримується'); return;
      }
      // Return to the actual episode catalogue after exiting the fallback,
      // including the selected season/voice filters; do not lose progress UI.
      var previous = state === 'episodes' && episodeContext ? episodeContext : null;
      var previousMovie = state === 'movie' ? movieCardContext : null;
      webPlayerReturn = previous ? function () {
        renderEpisodeCatalog(previous.labels, previous.resolverEntry, previous.movieTitle,
          previous.cached, previous.failure);
      } : previousMovie ? function () {
        renderMovieStreamCard(previousMovie.stream, previousMovie.streams, previousMovie.movieTitle);
      } : null;
      ++generation;
      state = 'webplayer'; episodeContext = null; sourceCaption();
      beginList();
      addRow('‹ Назад до варіантів перегляду', 'Повернення до каталогу або списку джерел',
        returnFromWebPlayer, 'ms-action');
      var shell = $('<div class="ms-webframe-shell"></div>');
      shell.append($('<div class="ms-webframe-label"></div>').text(
        'Вебплеєр ' + host(safe) + ' • експериментальне вбудовування'));
      var frame = $('<iframe class="ms-webframe" title="Вебплеєр MultiSource" loading="eager"></iframe>');
      frame.attr({
        src: safe,
        allow: 'autoplay; fullscreen; picture-in-picture',
        allowfullscreen: 'allowfullscreen',
        referrerpolicy: 'strict-origin-when-cross-origin',
        sandbox: 'allow-scripts allow-same-origin allow-forms allow-presentation'
      });
      shell.append(frame);
      activeWebFrame = frame;
      shell.append($('<div class="ms-webframe-note"></div>').text(
        'Це сторонній вебплеєр, не Lampa Player. Наявність зображення не гарантує відтворення. ' +
        'Для керування пультом LG оберіть «Керувати вебплеєром». ' +
        'Якщо фокус не повертається — використайте системну кнопку Назад або відкрийте плеєр у браузері. ' +
        'Прогрес вебплеєра не синхронізується з Lampa. Якщо сервер забороняє iframe, відкрийте сторінку джерела.'));
      scroll.append(shell);
      addRow('🎮 Керувати вебплеєром', 'Передати фокус у відео (залежить від webOS / iframe)',
        function () { try { frame[0].focus(); } catch (e) { notify('Керування недоступне на цьому пристрої'); } }, 'ms-action');
      addRow('Відкрити цей плеєр у браузері', host(safe), function () { openWeb(safe); }, 'ms-action');
      enableController(); scheduleViewport();
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
        addRow('Сезони на сайті ' + src.name,
          'Можна відкрити сезон у MultiSource; окремі посилання на серії не підтверджені',
          null, 'ms-section');
        result.siteSeasons.forEach(function (record) {
          addRow(record.title, 'Відкрити сторінку сезону у MultiSource', function () {
            details({title:item.title, year:item.year, url:record.url, poster:item.poster});
          }, 'ms-action');
        });
      }
      if (!currentStreams.length) {
        addRow('Пряме відеопосилання не знайдено',
          result.notice || 'Плеєр може підвантажувати відео окремим запитом', null, 'ms-warning');
        // Exact URL deduplication only: two different players on the same
        // host can offer distinct dubbing/seasons and must not be discarded.
        var webPlayers = dedup((result.embeds || []).filter(function (url) {
          return !!host(url) && /^https:\/\//i.test(String(url));
        }), function (url) { return String(url); }).slice(0, 8);
        if (webPlayers.length) addRow('Вебплеєри: ' + webPlayers.length,
          'Сторонні плеєри • прогрес не синхронізується з Lampa', null, 'ms-section');
        webPlayers.forEach(function (url, i) {
          var embedded = !!safeWebPlayerUrl(url);
          addRow('▶ Плеєр ' + (i + 1) + ' • ' + host(url),
            embedded ? 'Відкрити у Lampa • зовнішній перегляд доступний всередині' :
              'Відкрити у браузері • вбудовування недоступне',
            function () { if (embedded) showWebPlayerInLampa(url); else openWeb(url); }, 'ms-action');
        });
        // A full source page is NOT a player; it remains accessible through
        // the single public-page action below, not in an iframe masquerading
        // as a playable video.
      }
      var fallbackEmbed = uaserialsEmbed();
      if (currentStreams.length && fallbackEmbed) addRow('▶ Вебплеєр джерела Tortuga (резерв)',
        'Використати сторінку плеєра, якщо прямий HLS повертає 403',
        function () { showWebPlayerInLampa(fallbackEmbed); }, 'ms-action');
      var pageUrl = result.pageUrl || item.url;
      if (pageUrl) addRow('Відкрити сторінку на сайті ' + src.name,
        'Зовнішній перегляд • лише коли відео недоступне у Lampa', function () { openWeb(pageUrl); }, 'ms-action');
      enableController();
    }
    // Search card -> online content directly. The old technical menu is
    // available only as a fallback when there is no usable stream.
    // Selecting a series opens its episode catalog; a single direct movie
    // stream opens Lampa Player; multiple playable variants get a compact
    // voice/stream selector without the "paste URL / open website" detour.
    function chooseOnlineRoute(streams) {
      var list = (Array.isArray(streams) ? streams : []).filter(function (s) {
        return !!(s && s.url && (mediaUrl(s.url, s.url) || s.resolve));
      });
      var resolver = list.filter(function (s) { return !!s.resolve; })[0];
      if (resolver) return { type: 'resolver', stream: resolver, streams: list };
      if (!list.length) return { type: 'fallback', streams: [] };
      if (list.length === 1) return { type: 'single', stream: list[0], streams: list };
      return { type: 'choices', streams: list };
    }
    // Movie-only pre-play screen: the entire preview is the primary play
    // action. Keep a separate restart action; native Timeline handles seeking.
    function renderMovieStreamCard(stream, streams, movieTitle) {
      if (!stream || !mediaUrl(stream.url, stream.url)) return notify('Прямого відеопотоку немає');
      ++generation;
      movieCardContext = {stream: stream, streams: streams, movieTitle: movieTitle};
      state = 'movie'; episodeContext = null; sourceCaption(); beginList();
      var movie = object.movie || {};
      var progress = progressFor(movie, 0, 0);
      var hasProgress = validProgress(progress) && progress.time >= 10 && progress.percent < 95;
      var label = String(movieTitle || movie.title || movie.name || 'Фільм');
      var src = registry[currentSource] || { name: currentSource };
      addRow('‹ До результатів', src.name, renderResults, 'ms-action');
      var container = $('<div class="ms-movie-panel ms-movie-clickable selector" role="button" tabindex="0"></div>');
      var art = $('<div class="ms-movie-art"></div>');
      var artPath = movie.backdrop_path ? 'https://image.tmdb.org/t/p/w500' + movie.backdrop_path :
        (currentItem && currentItem.poster) || (movie.poster_path ? 'https://image.tmdb.org/t/p/w300' + movie.poster_path : '');
      if (artPath && /^https:\/\//.test(artPath)) {
        var img = $('<img alt="" loading="lazy" />').attr('src', artPath);
        img.on('error', function () { img.remove(); });
        art.append(img);
      }
      var main = $('<div class="ms-movie-main"></div>');
      main.append($('<div class="ms-movie-heading"></div>').text(label));
      main.append($('<div class="ms-movie-subheading"></div>').text('Джерело: ' + src.name));
      var props = $('<div class="ms-movie-properties"></div>');
      function property(name, value) {
        if (!value) return;
        var row = $('<div class="ms-movie-property"></div>');
        row.append($('<span></span>').text(name));
        row.append($('<strong></strong>').text(value));
        props.append(row);
      }
      // Source page "Переклад" is preferred where a stream has no voice name.
      // It describes available site dubbing rather than asserting the actual track.
      property('Озвучення', stream.voice || stream.siteVoice || 'Не вказано');
      var duration = validProgress(progress) ? readableTime(progress.duration) :
        Number(movie.runtime) > 0 ? Number(movie.runtime) + ' хв' : '';
      property('Тривалість', duration);
      main.append(props);
      var timeline = $('<div class="ms-movie-progress"></div>');
      timeline.append($('<div class="ms-movie-progress-header"></div>').text('Прогрес перегляду'));
      var bar = $('<div class="ms-movie-progress-track"><div class="ms-movie-progress-fill"></div></div>');
      bar.find('.ms-movie-progress-fill').css('width', hasProgress ?
        Math.max(0, Math.min(100, progress.time / progress.duration * 100)) + '%' : '0%');
      timeline.append(bar);
      var progressText = hasProgress ? 'Продовжити з ' + readableTime(progress.time) +
        ' із ' + readableTime(progress.duration) + ' • ' + Math.round(progress.time / progress.duration * 100) + '%' :
        'Перегляд ще не розпочато';
      timeline.append($('<div class="ms-movie-progress-caption"></div>').text(progressText));
      main.append(timeline);
      main.append($('<div class="ms-movie-cta"></div>').text(hasProgress ?
        '▶ Продовжити перегляд' : '▶ Дивитися фільм'));
      container.attr('aria-label', (hasProgress ? 'Продовжити перегляд: ' : 'Дивитися: ') + label);
      container.append(art, main);
      scroll.append(container);

      function refreshMovieProgress() {
        if (!active || state !== 'movie' || !container[0] ||
            !document.documentElement.contains(container[0])) return;
        var latest = progressFor(movie, 0, 0);
        var ready = validProgress(latest) && latest.time >= 10 && latest.percent < 95;
        var pct = ready ? Math.max(0, Math.min(100, latest.time / latest.duration * 100)) : 0;
        container.find('.ms-movie-progress-fill').css('width', pct + '%');
        container.find('.ms-movie-progress-caption').text(ready ?
          'Продовжити з ' + readableTime(latest.time) + ' із ' +
          readableTime(latest.duration) + ' • ' + Math.round(pct) + '%' :
          'Перегляд ще не розпочато');
        container.find('.ms-movie-cta').text(ready ? '▶ Продовжити перегляд' : '▶ Дивитися фільм');
        container.attr('aria-label', (ready ? 'Продовжити перегляд: ' : 'Дивитися: ') + label);
        // A restart row is always available; it is useful after the first successful play.
      }
      activeMovieProgressRefresh = refreshMovieProgress;
      var lastLaunch = 0;
      function launch(fromBeginning) {
        var g = generation;
        if (!/\.m3u8(?:[?#]|$)/i.test(stream.url)) {
          play(stream, streams, movieTitle, { restart: !!fromBeginning }); return;
        }
        // Reject explicit HTTP 403/404 and invalid manifests BEFORE opening hls.js.
        // For legacy webOS/CORS/network test failures, try the native player
        // rather than blocking a potentially playable video.
        checkHlsStream(stream.url, 10000).then(function (check) {
          if (!active || state !== 'movie' || g !== generation) return;
          if (!check.ok && (check.reason === 'http' || check.reason === 'not_hls' ||
              check.reason === 'invalid_url')) {
            // Direct signed URL may be refused after obtaining HTML via Worker.
            // The supported first-party iframe is a separate playback context.
            if (useTortugaPlayerOn403(check, uaserialsEmbed())) return;
            var message = check.message || 'Відеопотік недоступний';
            if (currentSource === 'uaserials' && check.status === 403 && uaserialsEmbed())
              message += ' • Спробуйте резервний вебплеєр Tortuga у списку нижче';
            notify(message); return;
          }
          if (!check.ok) notify('Не вдалося перевірити HLS; пробуємо плеєр Lampa');
          play(stream, streams, movieTitle, { restart: !!fromBeginning });
        }, function () {
          if (active && state === 'movie' && g === generation)
            play(stream, streams, movieTitle, { restart: !!fromBeginning });
        });
      }
      function activate(event) {
        if (event && event.type === 'click') { event.preventDefault(); event.stopPropagation(); }
        if (Date.now() - lastLaunch < 350) return;
        lastLaunch = Date.now();
        launch(false);
      }
      container.on('hover:enter click', activate);
      container.on('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault(); event.stopPropagation(); activate(event);
        }
      });
      container.on('hover:focus focus', function (event) {
        last = event.currentTarget || event.target;
        refreshMovieProgress();
        scroll.update(container, true);
      });
      addRow('↺ Дивитися спочатку', 'Запустити з 00:00',
        function () { launch(true); }, 'ms-action');
      if ((streams || []).filter(function (e) { return mediaUrl(e.url, e.url) && !e.episode && !e.season; }).length > 1)
        addRow('Обрати інший потік', 'Доступні варіанти озвучення та якості',
          function () { renderOnlineChoices(streams, movieTitle); }, 'ms-action');
      var fallbackEmbed = uaserialsEmbed();
      if (fallbackEmbed) addRow('▶ Вебплеєр джерела Tortuga (резерв)',
        'Коли нативний HLS повертає 403 • iframe, окремий прогрес, залежить від політики сайту',
        function () { showWebPlayerInLampa(fallbackEmbed); }, 'ms-action');
      if (currentItem && currentItem.url)
        addRow('Сторінка на сайті ' + src.name, 'Відкрити публічну сторінку',
          function () { openWeb(currentItem.url); }, 'ms-action');
      scroll.append($('<div class="ms-list-end-spacer" aria-hidden="true"></div>'));
      enableController();
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
      // Direct HDVB episodes must be navigable as season/voice/episode cards,
      // not as a flat list of dozens of video files. Refresh PlayerJS on play.
      if (result && result.playerResolver && currentStreams.some(function (s) { return s.hdvb && s.episode; })) {
        var directEpisodes = currentStreams.filter(function (s) { return s.hdvb && s.episode; });
        var labels = saveEpisodeLabels(title, currentSource, directEpisodes);
        return renderEpisodeCatalog(labels, result.playerResolver, title, false);
      }
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
        onBack: function () { restorePrevious(previous); },
        onSelect: function (choice) {
          selectedSeason = choice.id === 'all' ? null : Number(choice.id);
          closeSelectSafe(); restoreContent();
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
        onBack: function () { restorePrevious(previous); },
        onSelect: function (choice) {
          selectedVoice = choice.id === '__all__' ? '' : (voices[Number(choice.id)] || '');
          closeSelectSafe(); restoreContent();
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
        onBack: function () { restorePrevious(previous); },
        onSelect: function (choice) {
          if (!choice || ['all', 'unwatched', 'watched'].indexOf(choice.id) < 0) return;
          selectedViewed = choice.id;
          closeSelectSafe(); restoreContent();
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
        onBack: function () { restorePrevious(previous); },
        onSelect: function (choice) {
          var label = group.labels[Number(choice.id)];
          closeSelectSafe(); restoreContent();
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
      // The source itself publishes a still for each episode. Show it even
      // when TMDB is unavailable on an LG webOS build.
      var sourceImage = currentStreams.filter(function (entry) {
        return entry.hdvb && entry.season === group.season && entry.episode === group.episode && entry.poster;
      })[0];
      if (sourceImage) {
        var sourcePhoto = $('<img class="ms-tmdb-still ms-source-still" alt=""/>');
        sourcePhoto.on('error', function () { sourcePhoto.remove(); });
        thumb.prepend(sourcePhoto);
        sourcePhoto.attr('src', sourceImage.poster);
      }
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
            if (!thumb.find('img.ms-tmdb-still:not(.ms-source-still)').length) {
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
              // Keep the source still if the TMDB request fails on webOS.
              photo.on('load', function () { thumb.find('img.ms-source-still').remove(); });
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
        onBack: function () { restorePrevious(previous); },
        onSelect: function (choice) {
          setStorage('quality', choice.id); closeSelectSafe(); restoreContent();
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
      var episodeEmbed = resolverEntry && safeWebPlayerUrl(resolverEntry.url);
      if (currentSource === 'uaserials' && episodeEmbed) {
        addRow('▶ Вебплеєр джерела Tortuga (резерв)',
          'Коли HLS повертає 403 • оберіть епізод у вебплеєрі; прогрес окремий',
          function () { showWebPlayerInLampa(episodeEmbed); }, 'ms-action');
        if (currentItem && currentItem.url) addRow('Відкрити на UASerials.com',
          'Якщо iframe не запускається або блокується сайтом',
          function () { openWeb(currentItem.url); }, 'ms-action');
      }
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
            if (useTortugaPlayerOn403(result, resolverEntry && resolverEntry.url)) return;
            renderEpisodeCatalog(readEpisodeLabels(movieTitle, currentSource), resolverEntry,
              movieTitle, false, (result.message || 'HLS недоступний') +
              (fetchDiagnostics.tortugaFallback ? ' • HTML отримано через Worker, тому можливе обмеження прив’язки потоку до сеансу' : ''));
            notify(currentSource === 'uaserials' && result.status === 403 &&
              safeWebPlayerUrl(resolverEntry && resolverEntry.url) ?
              'HLS сервер відмовив у доступі (403). Спробуйте вебплеєр Tortuga у каталозі серій.' :
              'HLS недоступний. Можна вставити робоче посилання вручну.');
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
      if (!stream.resolve) return (stream.season || stream.episode) ?
        play(stream, streams, movieTitle) : renderMovieStreamCard(stream, streams, movieTitle);
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
        if (resolved.length === 1) return (resolved[0].season || resolved[0].episode) ?
          play(resolved[0], resolved, movieTitle) : renderMovieStreamCard(resolved[0], resolved, movieTitle);
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
    function play(stream, streams, movieTitle, options) {
      options = options || {};
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
          if (options.restart && episodeTimeline && !(s.season || s.episode)) {
            // Pass a per-launch clone rather than overwriting saved progress
            // before playback actually starts. Lampa's next timeupdate writes it.
            var start = {};
            for (var field in episodeTimeline) if (Object.prototype.hasOwnProperty.call(episodeTimeline, field))
              start[field] = episodeTimeline[field];
            start.time = 0; start.percent = 0; start.continued = false;
            episodeTimeline = start;
          }
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
      try { Lampa.Controller.enable('content'); } catch (e) { return; }
      restoreContent();
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
          if (!hasView()) return;
          try {
            Lampa.Controller.collectionSet(scroll.render(), explorer.render());
            Lampa.Controller.collectionFocus(last || false, scroll.render());
          } catch (err) { console.warn(LOG, 'content collection', String(err.message || err)); }
        },
        up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else Lampa.Controller.toggle('head'); },
        down: function () { Navigator.move('down'); },
        left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
        right: function () { Navigator.move('right'); },
        back: function () {
          if (state === 'movie') renderResults();
          else if (state === 'episodes') renderResults();
          else if (state === 'webplayer') returnFromWebPlayer();
          else if (state === 'streams') renderResults();
          else Lampa.Activity.backward();
        }
      });
      restoreContent();
      if (!currentCandidates.length && !currentItem) find();
    };
    this.stop = function () { releaseWebFrame(); };
    this.pause = function () {};
    this.destroy = function () {
      active = false; ++generation;
      releaseWebFrame();
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
      '.ms-webframe-shell{background:#111;padding:.8em;border-radius:.5em;margin:.5em 0;max-width:100%}' +
      '.ms-webframe-label{font-weight:650;margin-bottom:.6em}' +
      '.ms-webframe{width:100%;height:min(58vh,650px);min-height:240px;border:0;background:#000;display:block}' +
      '.ms-webframe-note{opacity:.73;font-size:.82em;line-height:1.4;margin-top:.6em}' +
      '@media(max-width:700px){.ms-webframe{height:47vh;min-height:200px}}' +
      '.ms-movie-panel{display:flex;align-items:flex-start;gap:1.4em;background:rgba(255,255,255,.07);padding:1.2em;border-radius:.55em;margin:.5em 0}' +
      '.ms-movie-clickable{cursor:pointer;border-left:.2em solid transparent;transition:background .12s ease,border-color .12s ease}' +
      '.ms-movie-clickable.focus,.ms-movie-clickable:focus{background:rgba(255,255,255,.16);border-left-color:#6aaef3;outline:none}' +
      '.ms-movie-cta{margin-top:.85em;font-weight:650;color:#a6cff9}' +
      '.ms-movie-clickable.focus .ms-movie-cta,.ms-movie-clickable:focus .ms-movie-cta{color:#fff}' +
      '.ms-movie-art{flex:0 0 28%;max-width:17em;aspect-ratio:16/10;background:#253343;border-radius:.45em;overflow:hidden}' +
      '.ms-movie-art img{width:100%;height:100%;object-fit:cover;display:block}' +
      '.ms-movie-main{flex:1;min-width:0}' +
      '.ms-movie-heading{font-size:1.45em;font-weight:700;line-height:1.25}' +
      '.ms-movie-subheading{font-size:.92em;opacity:.72;margin:.35em 0 1em}' +
      '.ms-movie-properties{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65em 1.2em}' +
      '.ms-movie-property{display:flex;flex-direction:column;gap:.15em;min-width:0;overflow-wrap:anywhere}' +
      '.ms-movie-property span{font-size:.8em;opacity:.65}' +
      '.ms-movie-property strong{font-size:.96em;font-weight:600}' +
      '.ms-movie-progress{margin:1.1em 0 .1em}' +
      '.ms-movie-progress-header{font-weight:600;margin-bottom:.45em}' +
      '.ms-movie-progress-track{width:100%;height:.4em;border-radius:5em;background:#80808066;overflow:hidden}' +
      '.ms-movie-progress-fill{height:100%;background:#6aaef3;border-radius:5em}' +
      '.ms-movie-progress-caption{opacity:.8;font-size:.85em;margin-top:.4em}' +
      '@media(max-width:700px){.ms-movie-panel{gap:.8em;padding:.75em}.ms-movie-art{flex-basis:24%;}.ms-movie-heading{font-size:1.1em}.ms-movie-properties{grid-template-columns:minmax(0,1fr)}.ms-movie-property{font-size:.84em}}' +
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
      setTimeout(function () { repairMisplacedAdapter().catch(function () {}); }, 1100);
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
