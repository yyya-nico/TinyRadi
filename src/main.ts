import './style.css';

import Hls from 'hls.js';

type Area = {
  id: string | null;
  name: string | null;
};

type Station = {
  id: string | null;
  name: string | null;
  areafree: boolean;
  timefree: boolean;
  href: string | null;
};

class API {
  private static readonly AUTH_KEY_VALUE = 'bcd151073c03b352e1ef2fd66c32209da9ca0afa';
  private appId: string;
  private device: string;

  private parseXml = (txt: string) => {
    const parser = new DOMParser();
    return parser.parseFromString(txt, 'application/xml');
  };

  private decodeXmlEntity = (value: string) => value.replaceAll('&amp;', '&');

  private buildPartialKey = (keyOffset: number, keyLength: number) => {
    const partial = API.AUTH_KEY_VALUE.slice(keyOffset, keyOffset + keyLength);
    return btoa(partial);
  };

  constructor(appId: string = 'pc_html5', device: string = 'pc') {
    this.appId = appId;
    this.device = device;
  }

  area = () =>
    fetch('https://api.radiko.jp/apparea/area', {
      credentials: 'include',
    })
    .then((res) => res.text())
    .then((txt) => {
      const [, id, name] = txt.match(/class="([^"]+)">([a-zA-Z ]+)/) ?? [, null, null];
      return { id, name };
    });

  stations = (areaId: string) =>
    fetch(`https://radiko.jp/v3/station/list/${areaId}.xml`)
    .then((res) => res.text())
    .then((txt) => {
      const doc = this.parseXml(txt);
      const area = {
        id: doc.querySelector('stations')?.getAttribute('area_id') || null,
        name: doc.querySelector('stations')?.getAttribute('area_name') || null,
      };
      const stations = Array.from(doc.querySelectorAll('station'))
        .map((el) => ({
          id: el.querySelector('id')?.textContent || null,
          name: el.querySelector('name')?.textContent || null,
          areafree: el.querySelector('areafree')?.textContent === '1',
          timefree: el.querySelector('timefree')?.textContent === '1',
          href: el.querySelector('href')?.textContent || null,
        }));
      return { area, stations } as { area: Area; stations: Station[] };
    });

  nowPrograms = (areaId: string) =>
    fetch(`https://api.radiko.jp/program/v3/now/${areaId}.xml`)
    .then((res) => res.text())
    .then((txt) => {
      const doc = this.parseXml(txt);
      const stations = Array.from(doc.querySelectorAll('station')).map((el) => {
        const station = {
          id: el.getAttribute('id'),
          name: el.querySelector('name')?.textContent || null,
        };
        const programs = Array.from(el.querySelectorAll('prog')).map((el) => {
          const program = {
            time: {
              ft: el.getAttribute('ft'),
              to: el.getAttribute('to'),
              ftl: el.getAttribute('ftl'),
              tol: el.getAttribute('tol'),
              dur: el.getAttribute('dur'),
            },
            title: el.querySelector('title')?.textContent || null,
            url: el.querySelector('url')?.textContent || null,
            desc: el.querySelector('desc')?.textContent || null,
            info: el.querySelector('info')?.textContent || null,
            pfm: el.querySelector('pfm')?.textContent || null,
            img: el.querySelector('img')?.textContent || null,
          };
          return program;
        });
        return { station, programs };
      });
      return stations;
    });

  auth1 = () =>
    fetch('https://radiko.jp/v2/api/auth1', {
      headers: {
        'X-Radiko-App': this.appId,
        'X-Radiko-App-Version': '0.0.1',
        'X-Radiko-User': 'dummy_user',
        'X-Radiko-Device': this.device,
      },
      credentials: 'include',
    });

  auth2 = (params: { authToken: string; partialKey: string; lat?: number; lng?: number }) => {
    const headers = new Headers({
      'X-Radiko-AuthToken': params.authToken,
      'X-Radiko-PartialKey': params.partialKey,
      'X-Radiko-User': 'dummy_user',
      'X-Radiko-Device': this.device,
    });

    if (params.lat !== undefined && params.lng !== undefined) {
      headers.append('X-Radiko-Location', `${params.lat},${params.lng}`);
      headers.append('X-Radiko-Connection', 'mobile');
    }

    return fetch('https://radiko.jp/v2/api/auth2', {
      headers,
      credentials: 'include',
    });
  };

  authorize = async () => {
    const auth1Res = await this.auth1();
    if (!auth1Res.ok) {
      throw new Error('auth1 failed');
    }

    const authToken = auth1Res.headers.get('X-Radiko-Authtoken');
    const keyOffset = auth1Res.headers.get('X-Radiko-Keyoffset');
    const keyLength = auth1Res.headers.get('X-Radiko-Keylength');
    if (!authToken || !keyOffset || !keyLength) {
      throw new Error('auth1 response headers are missing');
    }

    const partialKey = this.buildPartialKey(Number(keyOffset), Number(keyLength));
    const auth2Res = await this.auth2({ authToken, partialKey });
    if (!auth2Res.ok) {
      throw new Error('auth2 failed');
    }

    return authToken;
  };

  stationStreamUrl = async (stationId: string, areafree = false) => {
    const txt = await fetch(`https://radiko.jp/v3/station/stream/${this.appId}/${stationId}.xml`).then((res) => res.text());
    const doc = this.parseXml(txt);
    const areafreeAttr = areafree ? '1' : '0';
    const urls = Array.from(doc.querySelectorAll('urls > url'))
      .filter((el) => el.getAttribute('timefree') === '0')
      .filter((el) => el.getAttribute('areafree') === areafreeAttr)
      .map((el) => el.querySelector('playlist_create_url')?.textContent)
      .filter((url): url is string => Boolean(url));

    const selected = urls[1] ?? urls[0];
    if (!selected) {
      throw new Error('stream url not found');
    }

    const base = this.decodeXmlEntity(selected);
    return `${base}?station_id=${stationId}&l=15&type=c&lsid=`;
  };

}

class Player {
  private audio: HTMLAudioElement;

  private api: API;

  private authToken: string | null = null;

  private hls: Hls | null = null;

  constructor(api: API, audio: HTMLAudioElement) {
    this.api = api;
    this.audio = audio;
    this.api.authorize().then((token) => {
      this.authToken = token;
    }).catch((error) => {
      console.error('authorization failed:', error);
    });
  }

  stop = () => {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  };

  play = async (stationId: string) => {
    this.stop();

    const authToken = this.authToken ?? await this.api.authorize();
    const streamUrl = await this.api.stationStreamUrl(stationId, false);

    if (!Hls.isSupported()) {
      throw new Error('hls.js is not supported in this browser');
    }

    const hls = new Hls({
      xhrSetup: (xhr, url) => {
        if (/playlist.m3u8/.test(url)) {
          xhr.setRequestHeader('X-Radiko-AuthToken', authToken);
          xhr.withCredentials = !/(wowza|smartstream\.ne\.jp)/.test(url);
        }
      },
      maxMaxBufferLength: 30,
      defaultAudioCodec: 'mp4a.40.5',
      fragLoadingMaxRetry: 2,
      levelLoadingMaxRetry: 2,
    });
    this.hls = hls;

    hls.attachMedia(this.audio);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(streamUrl);
    });
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      void this.audio.play();
    });
  };

}

const api = new API();
const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('app root not found');
}

app.innerHTML = `
  <main>
    <h1>TinyRadi</h1>
    <p id="status">loading...</p>
    <label>
      Station<br />
      <select id="station" size="10"></select>
    </label>
    <div>
      <button id="stop" type="button">Stop</button>
    </div>
    <audio id="audio"></audio>
  </main>
`;

const statusEl = document.querySelector<HTMLParagraphElement>('#status');
const stationEl = document.querySelector<HTMLSelectElement>('#station');
const stopEl = document.querySelector<HTMLButtonElement>('#stop');
const audioEl = document.querySelector<HTMLAudioElement>('#audio');

if (!statusEl || !stationEl || !stopEl || !audioEl) {
  throw new Error('required elements not found');
}

const player = new Player(api, audioEl);

const init = async () => {
  try {
    const area = await api.area();
    if (!area.id) {
      statusEl.textContent = 'area detection failed';
      return;
    }

    const { area: stationArea, stations } = await api.stations(area.id);
    const playable = stations.filter((station) => Boolean(station.id));
    const areaName = (stationArea.name ?? area.name)?.split(' ').shift() ?? 'unknown area';

    stationEl.innerHTML = playable
      .map((station) => `<option value="${station.id}">${station.name}</option>`)
      .join('');

    statusEl.textContent = `current area: ${areaName}`;
  } catch (error) {
    statusEl.textContent = `init failed: ${String(error)}`;
  }
};

stationEl.addEventListener('change', async () => {
  const stationId = stationEl.value;
  if (!stationId) {
    statusEl.textContent = 'station is not selected';
    return;
  }

  statusEl.textContent = `starting...`;
  try {
    await player.play(stationId);
    statusEl.textContent = 'now playing';
  } catch (error) {
    statusEl.textContent = `playback failed: ${String(error)}`;
  }
});

stopEl.addEventListener('click', () => {
  player.stop();
  stationEl.value = '';
  statusEl.textContent = 'stopped';
});

void init();