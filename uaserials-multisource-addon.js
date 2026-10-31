/*
 * UASerials local resolver addon for Lampa MultiSource 1.3.15, v0.2.0
 * Install AFTER https://gorodinskyv-cmyk.github.io/MultiSource/lampa-multisource-v1.3.15.js
 * No changes to the Lampa app or MultiSource core; no server/worker required.
 * Uses only HTML and media URLs that the user's client can already read.
 * Does NOT intercept another tab's requests, bypass 403/CORS/DRM, or proxy streams.
 */
(function (root) {
  'use strict';
  if (root.__MS_UAS_RESOLVER_ADDON_020__) return;
  root.__MS_UAS_RESOLVER_ADDON_020__ = true;
  var KEY = 'uaserials';
  var ROOT = 'https://uaserials.com/';
  var stats = { status: 'waiting', attempts: 0, expandedMovies: 0, expandedEpisodes: 0,
    fallbackCalls: 0, lastReason: '' };
  function errText(error) { return String(error && error.message || error || '').slice(0, 180); }
  function mediaUrl(value) {
    try {
      var url = new URL(String(value || ''));
      return url.protocol === 'https:' && !url.username && !url.password &&
        /\.(?:m3u8|mp4)(?:$|[?#])/i.test(url.href) && url.href.length < 6000 ? url.href : '';
    } catch (_) { return ''; }
  }
  function safeEmbed(url) {
    try {
      var u = new URL(String(url || ''));
      return u.protocol === 'https:' && /^(tortuga\.wtf|tortuga\.tw)$/i.test(u.hostname) &&
        !u.username && !u.password && u.href.length < 6000;
    } catch (_) { return false; }
  }
  function base64Bytes(value) {
    var raw = String(value || '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]+={0,8}$/.test(raw)) throw new Error('Tortuga: це не Base64');
    raw = raw.replace(/=+$/, '');
    if (!raw || raw.length % 4 === 1) throw new Error('Tortuga: некоректна Base64 довжина');
    var bin = atob(raw + '==='.slice(0, (4 - raw.length % 4) % 4));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function utf8(bytes) { return new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
  function readable(value) {
    return /^(?:https:\/\/|\s*[\[{]|\s*#EXTM3U)/.test(value) ||
      /https:\/\/[^\s"'<>]+\.(?:m3u8|mp4)/i.test(value);
  }
  function unpackFile(value) {
    value = String(value || '').replace(/\\\//g, '/').trim();
    if (/^https:\/\//i.test(value) || /^[\[{]/.test(value)) return value;
    var bytes = base64Bytes(value);
    try { var text = utf8(bytes); if (readable(text)) return text; } catch (_) { /* binary */ }
    if (bytes.length < 2) throw new Error('Tortuga: порожній токен');
    var out = new Uint8Array(bytes.length - 1), seed = bytes[0];
    for (var i = 0; i < out.length; i++) out[i] = bytes[i+1] ^ ((seed + 13 + 7*i) & 255);
    var decoded = utf8(out);
    if (!readable(decoded)) throw new Error('Tortuga: формат file не підтримується');
    return decoded;
  }
  function numberFrom(value, fallback) {
    var found = String(value || '').match(/\d+/);
    return found ? Number(found[0]) : (fallback || 0);
  }
  function streamsFromText(text, entry) {
    var found = [], seen = {};
    function add(value, voice, season, episode, title) {
      var url = mediaUrl(value);
      if (!url) return;
      var signature = [url, season || 0, episode || 0, voice || ''].join('|');
      if (seen[signature]) return;
      seen[signature] = true;
      found.push({ url: url, title: title || entry.title || 'Відео',
        season: season || 0, episode: episode || 0,
        voice: voice || entry.voice || '', siteVoice: entry.siteVoice || '' });
    }
    function parseLine(str, season, episode, title) {
      var pattern = /\{([^}]{1,80})\}\s*(https:\/\/[^\s{}"'<>]+?\.(?:m3u8|mp4)(?:\?[^\s{}"'<>]*)?)/g;
      var match, labelled = false;
      while ((match = pattern.exec(str)) !== null) {
        add(match[2], match[1], season, episode, title); labelled = true;
      }
      if (labelled) return;
      var links = str.match(/https:\/\/[^\s,"'<>\[\]{}]+?\.(?:m3u8|mp4)(?:\?[^\s,"'<>\[\]{}]*)?/g) || [];
      links.forEach(function (value) { add(value, '', season, episode, title); });
    }
    try {
      var data = JSON.parse(String(text || ''));
      if (Array.isArray(data)) {
        data.forEach(function (season, i) {
          if (!season || typeof season !== 'object') return;
          var sn = numberFrom(season.title, season.number || i+1);
          var episodes = season.folder || season.episodes || [];
          episodes.forEach(function (episode, j) {
            var ep = numberFrom(episode.title, j+1);
            if (episode.file) parseLine(String(episode.file), sn, ep, 'Сезон ' + sn + ' • Серія ' + ep);
          });
        });
        return found;
      }
    } catch (_) { /* plain stream value */ }
    parseLine(String(text || ''), entry.season, entry.episode, entry.title);
    return found;
  }
  function parseTortugaHtml(html, entry) {
    var raw = String(html || '');
    var match = raw.match(/\bfile\s*:\s*(["'])([^"']{1,200000})\1/i);
    if (!match) throw new Error('Tortuga: поле file відсутнє');
    return streamsFromText(unpackFile(match[2]), entry);
  }
  function notForbidden(error) { return !/\b403\b|\b401\b|captcha|cloudflare|access denied/i.test(errText(error)); }
  function mergeUnique(primary, extra) {
    var seen = {}, result = [];
    (primary || []).concat(extra || []).forEach(function (s) {
      if (!s || !s.url) return;
      var key = [s.url, s.season || 0, s.episode || 0, s.voice || ''].join('|');
      if (seen[key]) return;
      seen[key] = true; result.push(s);
    });
    return result;
  }
  function install() {
    var api = root.LampaMultiSource;
    if (!api || !api._coreLoaded || typeof api.registerSource !== 'function' ||
        typeof api.listSources !== 'function') return false;
    if (!/^1\.3\.15(?:\b|-)/.test(String(api.version || ''))) {
      stats.status = 'incompatible: ' + String(api.version || 'unknown');
      return true;
    }
    var current = api.listSources().filter(function (s) { return s.id === KEY; })[0];
    if (!current || typeof current.getStreams !== 'function') {
      stats.status = 'missing uaserials source'; return true;
    }
    if (current.__uasResolverAddon020) { stats.status = 'installed'; return true; }
    var originalGetStreams = current.getStreams;
    var patched = {};
    Object.keys(current).forEach(function (key) { patched[key] = current[key]; });
    patched.__uasResolverAddon020 = true;
    patched.getStreams = function (item, callerApi) {
      var activeApi = callerApi || api;
      return Promise.resolve().then(function () { return originalGetStreams(item, activeApi); })
        .then(function (result) {
          result = result || {streams:[], pageUrl:item.url};
          var entries = result.streams || [];
          // Only auto-resolve film-level Tortuga entries. Episodes remain lazy,
          // so we do not fan out dozens of requests or cache expiring URLs.
          var filmEntries = entries.filter(function (s) {
            return s && s.resolve && !s.season && !s.episode && safeEmbed(s.url);
          }).slice(0, 2);
          if (!filmEntries.length) return result;
          return Promise.all(filmEntries.map(function (entry) {
            return activeApi.request(entry.url, 12000).then(function (html) {
              return parseTortugaHtml(html, entry);
            }).catch(function (error) { stats.lastReason = errText(error); return []; });
          })).then(function (groups) {
            var flattened = [].concat.apply([], groups);
            if (!flattened.length) return result;
            stats.expandedMovies += flattened.length;
            result.streams = mergeUnique(flattened, entries);
            result.notice = '';
            return result;
          });
        }).catch(function (error) {
          // An HTTP 403 / CAPTCHA is authoritative: no fake links, proxy or bypass.
          stats.fallbackCalls++;
          stats.lastReason = errText(error);
          if (!notForbidden(error)) throw error;
          // If another standalone UASerialsBridge module exists, it may be
          // able to parse accessible metadata without needing server access.
          var bridge = root.UASerialsBridge;
          if (!bridge || typeof bridge.playerData !== 'function') throw error;
          return bridge.playerData(item.url).then(function (tabs) {
            var result = [];
            (tabs || []).forEach(function (tab) {
              if (!tab || !/плеєр|player/i.test(String(tab.tabName || ''))) return;
              if (Array.isArray(tab.seasons)) tab.seasons.forEach(function (s, i) {
                (s.episodes || []).forEach(function (ep, j) {
                  (ep.sounds && ep.sounds.length ? ep.sounds : [ep]).forEach(function (v) {
                    var url = v.url || v.file;
                    if (typeof url !== 'string' || !/^https:\/\//.test(url)) return;
                    result.push({url:url, title:'Сезон '+numberFrom(s.title, i+1)+' • Серія '+numberFrom(ep.title,j+1),
                      season:numberFrom(s.title,i+1),episode:numberFrom(ep.title,j+1),
                      voice:v.title || '',resolve:!mediaUrl(url)});
                  });
                });
              });
              else if (typeof tab.url === 'string' && /^https:\/\//.test(tab.url)) {
                result.push({url:tab.url, title:'Дивитися онлайн',resolve:!mediaUrl(tab.url)});
              }
            });
            if (!result.length) throw error;
            stats.expandedEpisodes += result.length;
            return {streams:result,pageUrl:item.url};
          });
        });
    };
    api.registerSource(patched); // Replaces existing uaserials entry, keeping its menu position.
    stats.status = 'installed';
    return true;
  }
  root.UASerialsMultiSourceAddon = {version:'0.2.0', status:function () {return {
    version: root.LampaMultiSource && root.LampaMultiSource.version || '',
    status: stats.status, attempts:stats.attempts, expandedMovies:stats.expandedMovies,
    expandedEpisodes:stats.expandedEpisodes, fallbackCalls:stats.fallbackCalls,
    lastReason:stats.lastReason
  };}, parseTortugaHtml:parseTortugaHtml, install:install};
  if (install()) return;
  var max = 80;
  var interval = setInterval(function () {
    stats.attempts++;
    if (install() || stats.attempts >= max) {
      clearInterval(interval);
      if (stats.attempts >= max && stats.status === 'waiting') stats.status = 'timeout - load MultiSource first';
    }
  }, 250);
})(window);
