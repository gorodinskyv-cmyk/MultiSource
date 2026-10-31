/*
 * UASerials Bridge for Lampa (experimental) v0.1.0
 * Standalone script; does not modify Lampa or MultiSource.
 * Android Lampa is the primary target (Lampa.Reguest.native).
 * Source parser research: https://github.com/eclipse7723/movian-plugin-uaserials
 * License: this original integration code is provided as-is for testing.
 * Supports direct HLS and the player-control / Tortuga layouts observed in 2026.
 */
(function () {
  'use strict';
  if (window.__uas_bridge_v01) return;
  window.__uas_bridge_v01 = true;

  var BASE = 'https://uaserials.com';
  var PASSWORD = '297796CCB81D255125'; // As assembled by current site player JS
  var PREFIX = 'UASerials Bridge: ';

  function fail(message) { throw new Error(message); }
  function notify(message, error) {
    if (window.Lampa && Lampa.Noty && Lampa.Noty.show)
      Lampa.Noty.show(PREFIX + message, error ? { style: 'error', time: 6500 } : { time: 3500 });
    else console.log(PREFIX + message);
  }
  function showError(error) {
    var text = error && error.message ? error.message : String(error);
    console.error(PREFIX, error);
    notify(text, true);
  }
  function parsedUrl(url, base) {
    try { return new URL(String(url), base || BASE); } catch (_) { return fail('Некоректна URL-адреса'); }
  }
  function isUas(url) { return parsedUrl(url).hostname.toLowerCase() === 'uaserials.com'; }
  function isTortuga(url) { return /^(tortuga\.wtf|tortuga\.tw)$/.test(parsedUrl(url).hostname.toLowerCase()); }
  function isStream(url) {
    return /^https?:$/.test(parsedUrl(url).protocol) && /\.m3u8(?:$|\?)/i.test(parsedUrl(url).href);
  }
  function validLink(url, base) {
    var u = parsedUrl(url, base || BASE);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') fail('Дозволені лише HTTP(S)-адреси');
    return u.href;
  }
  function doc(html) { return new DOMParser().parseFromString(String(html), 'text/html'); }
  function text(node) { return node ? (node.textContent || '').trim() : ''; }
  function fromHex(input) {
    if (typeof input !== 'string' || input.length % 2 || !/^[0-9a-f]+$/i.test(input)) fail('Помилка hex-даних');
    return new Uint8Array(input.match(/../g).map(function (part) { return parseInt(part, 16); }));
  }
  function fromBase64(input) {
    var str = atob(String(input).replace(/\s+/g, ''));
    return Uint8Array.from(str, function (letter) { return letter.charCodeAt(0); });
  }
  function decodeText(input) { return new TextDecoder('utf-8', { fatal: true }).decode(input); }
  function jsonLoose(input) {
    if (typeof input !== 'string') return input;
    var val;
    try { val = JSON.parse(input); }
    catch (_) { val = JSON.parse(input.replace(/\\/g, '')); }
    return typeof val === 'string' ? JSON.parse(val) : val;
  }

  // CryptoJS is only loaded on old WebViews without secure-context WebCrypto.
  function ensureCryptoJS() {
    if (window.CryptoJS) return Promise.resolve(window.CryptoJS);
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js';
      script.onload = function () { window.CryptoJS ? resolve(window.CryptoJS) : reject(new Error('CryptoJS недоступний')); };
      script.onerror = function () { reject(new Error('Не завантажено бібліотеку CryptoJS (CDN)')); };
      document.head.appendChild(script);
    });
  }
  async function decryptPlayer(cipher) {
    if (!cipher || !cipher.ciphertext || !cipher.salt || !cipher.iv) fail('Неповні дані шифрування плеєра');
    var salt = fromHex(cipher.salt);
    var iv = fromHex(cipher.iv);
    var ciphertext = fromBase64(cipher.ciphertext);
    if (window.crypto && crypto.subtle && window.TextEncoder && window.TextDecoder) {
      var material = await crypto.subtle.importKey('raw', new TextEncoder().encode(PASSWORD), 'PBKDF2', false, ['deriveKey']);
      var key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 999, hash: 'SHA-512' },
        material, { name: 'AES-CBC', length: 256 }, false, ['decrypt']
      );
      return decodeText(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: iv }, key, ciphertext));
    }
    var C = await ensureCryptoJS();
    var derived = C.PBKDF2(PASSWORD, C.enc.Hex.parse(cipher.salt), {
      hasher: C.algo.SHA512, keySize: 8, iterations: 999
    });
    var plaintext = C.AES.decrypt(
      { ciphertext: C.enc.Base64.parse(cipher.ciphertext) }, derived,
      { iv: C.enc.Hex.parse(cipher.iv), mode: C.mode.CBC, padding: C.pad.Pkcs7 }
    );
    return plaintext.toString(C.enc.Utf8);
  }

  function fetchHtml(url, referer) {
    if (!window.Lampa || !Lampa.Reguest) return Promise.reject(new Error('Потрібна Lampa з мережевим API'));
    return new Promise(function (resolve, reject) {
      var net = new Lampa.Reguest();
      net.native(validLink(url), function (result) {
        if (typeof result !== 'string') {
          reject(new Error('Сервер повернув не HTML. Можливе блокування або CAPTCHA'));
          return;
        }
        resolve(result);
      }, function (error) {
        reject(new Error('Помилка HTTP-запиту: ' + (error && (error.status || error.message || error.decode_error) || 'мережа/CORS')));
      }, null, {
        dataType: 'text', timeout: 25000,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
          'Referer': referer || BASE + '/'
        }
      });
    });
  }

  async function searchUas(query) {
    var url = BASE + '/search/' + encodeURIComponent(String(query).trim()) + '/page/1/';
    var html = await fetchHtml(url);
    var d = doc(html);
    var links = d.querySelectorAll('.uas-card[href], .short-cols a[href]');
    var results = [];
    var seen = Object.create(null);
    Array.prototype.forEach.call(links, function (link) {
      var href;
      try { href = validLink(link.getAttribute('href'), BASE); } catch (_) { return; }
      if (!isUas(href) || seen[href]) return;
      var title = text(link.querySelector('.uas-card__title, .th-title')) || text(link.querySelector('img[alt]'));
      if (!title) title = link.getAttribute('title') || '';
      if (!title) return;
      seen[href] = true;
      results.push({ title: title, url: href,
        subtitle: text(link.querySelector('.uas-card__orig, .th-title-oname')) || text(link.querySelector('.uas-card__year')) });
    });
    return results;
  }

  async function playerData(pageUrl) {
    if (!isUas(pageUrl)) fail('Очікується посилання на сторінку uaserials.com');
    var d = doc(await fetchHtml(pageUrl));
    var player = d.querySelector('player-control[data-tag1]');
    if (!player) fail('Елемент player-control не знайдено (можлива зміна сайту або CAPTCHA)');
    var cipher = jsonLoose(player.getAttribute('data-tag1'));
    var result = jsonLoose(await decryptPlayer(cipher));
    if (!Array.isArray(result)) fail('Невідомий формат даних плеєра');
    return result.filter(function (tab) { return tab && tab.tabName === 'Плеєр'; });
  }

  function decodeTortugaToken(token) {
    var input = fromBase64(token);
    if (input.length < 2) fail('Порожній токен Tortuga');
    var seed = input[0];
    var output = new Uint8Array(input.length - 1);
    for (var i = 1; i < input.length; i++) {
      output[i - 1] = input[i] ^ ((seed + 13 + 7 * (i - 1)) & 255);
    }
    return decodeText(output);
  }
  function extractSubtitles(value) {
    var subtitles = [];
    var regex = /\[([^\]]+)\](https?:\/\/[^\s\[\])"']+\.vtt(?:\?[^\s\[\])"']*)?)/g;
    var match;
    while ((match = regex.exec(String(value || '')))) {
      subtitles.push({ title: match[1], url: match[2], language: /укра/i.test(match[1]) ? 'uk' : /англ/i.test(match[1]) ? 'en' : '' });
    }
    return subtitles;
  }
  function extractStreams(value) {
    var str = String(value || '');
    var streams = [];
    var pattern = /\{([^}]+)\}\s*(https?:\/\/.*?)(?=\{[^}]+\}|$)/g;
    var matched;
    while ((matched = pattern.exec(str))) {
      var m = matched[2].match(/https?:\/\/[^\s,)"']+\.m3u8(?:\?[^\s,\[\],)"']*)?/);
      if (m) streams.push({ url: m[0], voice: matched[1], subtitles: extractSubtitles(matched[2]) });
    }
    if (streams.length) return streams;
    var plain = str.match(/https?:\/\/[^\s,)"']+\.m3u8(?:\?[^\s,\[\],)"']*)?/);
    return plain ? [{ url: plain[0], voice: '', subtitles: extractSubtitles(str) }] : [];
  }
  async function resolveEmbed(embedUrl) {
    if (isStream(embedUrl)) return { type: 'streams', streams: extractStreams(embedUrl) };
    if (!isTortuga(embedUrl)) fail('Непідтримуваний плеєр. Очікується Tortuga або прямий HLS');
    var html = await fetchHtml(embedUrl, BASE + '/');
    var match = html.match(/\bfile\s*:\s*["']([^"']+)["']/);
    if (!match) fail('Поле file у плеєрі Tortuga не знайдено');
    var value = /^https?:\/\//.test(match[1]) ? match[1] : decodeTortugaToken(match[1]);
    var trimmed = value.trim();
    if (trimmed.charAt(0) === '[') {
      var playlist = JSON.parse(trimmed);
      if (Array.isArray(playlist)) return { type: 'seasons', seasons: playlist };
    }
    var streams = extractStreams(value);
    if (!streams.length) fail('Посилань HLS у Tortuga не знайдено');
    return { type: 'streams', streams: streams };
  }

  // Programmatic API for use by other Lampa plugins, if they choose to integrate.
  var api = {
    version: '0.1.0',
    search: searchUas,
    playerData: playerData,
    resolveEmbed: resolveEmbed,
    extractStreams: extractStreams,
    decodeTortugaToken: decodeTortugaToken
  };
  window.UASerialsBridge = api;

  function choose(title, choices, handler) {
    if (!choices.length) fail('Немає доступних варіантів');
    if (choices.length === 1) return handler(choices[0]);
    Lampa.Select.show({
      title: title,
      items: choices.map(function (item, idx) {
        return { title: item.title || 'Варіант ' + (idx + 1), subtitle: item.subtitle || '', __choice: item };
      }),
      onSelect: function (selected) {
        Lampa.Select.close();
        Promise.resolve().then(function () { return handler(selected.__choice); }).catch(showError);
      },
      onBack: function () { Lampa.Controller.toggle('content'); }
    });
  }
  function playStream(stream, title, card) {
    if (!isStream(stream.url)) fail('Посилання не є HLS (.m3u8)');
    var movie = { url: stream.url, title: title, source: 'UASerials', movie: card || {} };
    if (stream.subtitles && stream.subtitles.length) movie.subtitles = stream.subtitles;
    Lampa.Player.play(movie);
    if (Lampa.Player.playlist) Lampa.Player.playlist([movie]);
  }
  async function selectStreams(value, title, card) {
    var streams = extractStreams(value);
    if (!streams.length) fail('Для цього епізоду немає HLS-потоків');
    return choose('Оберіть озвучення', streams.map(function (stream, i) {
      return { title: stream.voice || 'Озвучення ' + (i + 1), stream: stream };
    }), function (item) { playStream(item.stream, title, card); });
  }
  async function selectFromUrl(url, title, card) {
    if (isStream(url)) return selectStreams(url, title, card);
    var decoded = await resolveEmbed(url);
    if (decoded.type === 'streams') {
      return choose('Озвучення', decoded.streams.map(function (stream, i) {
        return { title: stream.voice || 'Озвучення ' + (i + 1), stream: stream };
      }), function (item) { playStream(item.stream, title, card); });
    } else if (decoded.type === 'seasons') {
      selectSeasons(decoded.seasons, title, card);
    }
  }
  function selectSeasons(seasons, title, card) {
    var items = seasons.map(function (season, i) {
      return { title: season.title || 'Сезон ' + (season.number || i + 1), season: season };
    });
    return choose('Виберіть сезон', items, function (picked) {
      var season = picked.season;
      var episodes = season.episodes || season.folder || [];
      return choose('Виберіть серію', episodes.map(function (ep, i) {
        return { title: ep.title || 'Серія ' + (i + 1), episode: ep };
      }), async function (selection) {
        var ep = selection.episode;
        var caption = title + ' — ' + picked.title + ' — ' + selection.title;
        if (Array.isArray(ep.sounds)) {
          return choose('Виберіть озвучення', ep.sounds.map(function (sound) {
            return { title: sound.title || 'Озвучення', href: sound.url };
          }), function (sound) { return selectFromUrl(sound.href, caption, card); });
        } else if (ep.file || ep.url) {
          // Tortuga playlist episode.file may contain a labelled set of HLS streams.
          if (ep.file && extractStreams(ep.file).length) return selectStreams(ep.file, caption, card);
          return selectFromUrl(ep.file || ep.url, caption, card);
        } else fail('Посилання для серії не знайдено');
      });
    });
  }
  async function openUas(pageUrl, title, card) {
    notify('Отримання відеопосилань…');
    var tabs = await playerData(pageUrl);
    if (!tabs.length) fail('На сторінці немає вкладки «Плеєр»');
    var candidates = tabs.filter(function (tab) { return tab.url || (tab.seasons && tab.seasons.length); });
    return choose('UASerials: доступні плеєри', candidates.map(function (tab, i) {
      return { title: tab.title || 'Плеєр ' + (i + 1), tab: tab };
    }), function (selected) {
      if (selected.tab.seasons) return selectSeasons(selected.tab.seasons, title, card);
      return selectFromUrl(selected.tab.url, title, card);
    });
  }
  async function openCard(card) {
    var title = card.title || card.name || card.original_title || card.original_name;
    if (!title) fail('У картці немає назви для пошуку');
    notify('Шукаю: ' + title);
    var found = await searchUas(title);
    if (!found.length && (card.original_title || card.original_name))
      found = await searchUas(card.original_title || card.original_name);
    if (!found.length) fail('Збігів на UASerials не знайдено');
    return choose('UASerials: вибір фільму/серіалу', found, function (picked) {
      return openUas(picked.url, picked.title, card);
    });
  }

  function install() {
    if (!window.Lampa || !Lampa.Manifest || !Lampa.Reguest || !Lampa.Select || !Lampa.Player) return false;
    if (window.__uas_bridge_installed) return true;
    window.__uas_bridge_installed = true;
    Lampa.Manifest.plugins = {
      type: 'video',
      version: '0.1.0',
      name: 'UASerials Bridge',
      description: 'Окремий обробник потоків UASerials без власного сервера',
      onContextMenu: function () { return { name: 'UASerials — відкрити', description: 'Пошук і запуск HLS' }; },
      onContextLauch: function (card) { return Promise.resolve().then(function () { return openCard(card); }).catch(showError); }
    };
    console.log(PREFIX + 'registered');
    return true;
  }
  if (!install() && window.Lampa && Lampa.Listener && Lampa.Listener.follow) {
    Lampa.Listener.follow('app', function (event) { if (event.type === 'ready') install(); });
  }
})();
