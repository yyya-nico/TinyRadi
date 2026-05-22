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

type Program = {
  time_raw: {
    ft: string | null;
    to: string | null;
    ftl: string | null;
    tol: string | null;
    dur: string | null;
  };
  time: {
    ft: Date | null;
    to: Date | null;
    ftl: Date | null;
    tol: Date | null;
    dur: number | null;
    formatted: string | null;
  }
  title: string | null;
  url: string | null;
  desc: string | null;
  info: string | null;
  pfm: string | null;
  img: string | null;
};

class API {
  private static readonly AUTH_KEY_VALUE = 'bcd151073c03b352e1ef2fd66c32209da9ca0afa';
  private appId: string;
  private device: string;

  private parseXml = (txt: string) => {
    const parser = new DOMParser();
    return parser.parseFromString(txt, 'application/xml');
  };
  
  private getDate = (dateString: string) => {
    const year = Number(dateString.slice(0, 4));
    const month = Number(dateString.slice(4, 6)) - 1;
    const day = Number(dateString.slice(6, 8));
    const hours = Number(dateString.slice(8, 10));
    const minutes = Number(dateString.slice(10, 12));

    return new Date(year, month, day, hours, minutes);
  };

  private formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
          const program: Program = {
            time_raw: {
              ft: el.getAttribute('ft'),
              to: el.getAttribute('to'),
              ftl: el.getAttribute('ftl'),
              tol: el.getAttribute('tol'),
              dur: el.getAttribute('dur'),
            },
            time: {
              ft: el.getAttribute('ft') ? this.getDate(el.getAttribute('ft')!) : null,
              to: el.getAttribute('to') ? this.getDate(el.getAttribute('to')!) : null,
              ftl: el.getAttribute('ftl') ? this.getDate(el.getAttribute('ftl')!) : null,
              tol: el.getAttribute('tol') ? this.getDate(el.getAttribute('tol')!) : null,
              dur: el.getAttribute('dur') ? Number(el.getAttribute('dur')) : null,
              formatted: null,
            },
            title: el.querySelector('title')?.textContent || null,
            url: el.querySelector('url')?.textContent || null,
            desc: el.querySelector('desc')?.textContent || null,
            info: el.querySelector('info')?.textContent || null,
            pfm: el.querySelector('pfm')?.textContent || null,
            img: el.querySelector('img')?.textContent || null,
          };
          if (program.time.ft && program.time.to) {
            program.time.formatted = `${this.formatTime(program.time.ft)} - ${this.formatTime(program.time.to)}`;
          }
          return program;
        });
        return { station, programs } as { station: { id: string | null; name: string | null }; programs: Program[] };
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
    const area = await auth2Res.text().then((txt) => {
      const [id, name, nameEn] = txt.trim().split(',');
      return { id, name, nameEn };
    });

    return { authToken, area };
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

  private authToken: string;

  private hls: Hls | null = null;

  private updateToken = async () => {
    this.authToken = await this.api.authorize().then((result) => result.authToken);
  }

  constructor(api: API, audio: HTMLAudioElement, authToken = '') {
    this.api = api;
    this.audio = audio;
    this.authToken = authToken;
    setInterval(this.updateToken, 70 * 60_000);
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

    const streamUrl = await this.api.stationStreamUrl(stationId, false);

    if (!Hls.isSupported()) {
      throw new Error('hls.js is not supported in this browser');
    }

    const hls = new Hls({
      xhrSetup: (xhr, url) => {
        if (/playlist.m3u8/.test(url)) {
          xhr.setRequestHeader('X-Radiko-AuthToken', this.authToken);
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
    <p id="area"></p>
    <p id="status">読み込み中...</p>
    <ul id="panel"></ul>
    <audio id="audio"></audio>
    </footer>
  </main>
  <footer>
    <p>radiko.jpへのリンク:</p>
    <ul class="links">
      <li><a href="https://radiko.jp/#!/timeshift" target="radiko">タイムフリー</a></li>
      <li><a href="https://radiko.jp/#!/areafree" target="radiko">エリアフリー</a></li>
      <li><a href="https://radiko.jp/#!/timetable" target="radiko">番組表</a></li>
    </ul>
  </footer>
`;

const statusEl = document.querySelector<HTMLParagraphElement>('#status');
const areaEl = document.querySelector<HTMLParagraphElement>('#area');
const panelEl = document.querySelector<HTMLUListElement>('#panel');
const audioEl = document.querySelector<HTMLAudioElement>('#audio');

if (!statusEl || !areaEl || !panelEl || !audioEl) {
  throw new Error('required elements not found');
}

const { authToken, area } = await api.authorize();
const player = new Player(api, audioEl, authToken);

const pickCurrentProgram = (programs: Program[]) => {
    const now = Date.now();

    for (let index = 0; index < programs.length; index += 1) {
        const program = programs[index];
        if (!program.time.to || now < program.time.to.getTime()) {
            return program;
        }
    }

    return programs.length > 0 ? programs[programs.length - 1] : null;
};

const renderStations = async (areaId: string) => {
  const nowPrograms = await api.nowPrograms(areaId);

  panelEl.innerHTML = nowPrograms
    .map((data: { station: { id: string | null; name: string | null }; programs: Program[] }) => {
      const nowProgram = pickCurrentProgram(data.programs);
      const isPlaying = currentStationId === data.station.id;
      const title = nowProgram?.title ?? 'no title';
      const stationName = data.station.name ?? 'unknown station';
      const pfm = nowProgram?.pfm ?? '';
      const time = nowProgram?.time?.formatted ?? 'unknown time';
      return `
        <li>
          <button value="${data.station.id}" data-station-name="${stationName}" class="${isPlaying ? 'playing' : ''}">
            <h2>
              <div class="title" title="${title}">
                <span>${title}</span>
              </div>
              <div class="station-name" title="${stationName}">
                <span>${stationName}</span>
              </div>
            </h2>
            <p><span title="${pfm}">${pfm}</span></p>
            <p class="time"><span title="${time}">${time}</span></p>
          </button>
        </li>`;
    })
    .concat([
      `<li><button value="" id="stop"><h2>停止</h2></button></li>`,
    ])
    .join('');
  document.querySelector<HTMLButtonElement>('.playing')?.focus();
};

const init = async () => {
  try {
    if (!area.id) {
      statusEl.textContent = '現在地の検出に失敗しました';
      return;
    } else if (area.id === 'OUT') {
      statusEl.textContent = 'サービス提供エリア外のためTinyRadiを利用できません';
      return;
    }
    const areaName = area.name ?? '不明な現在地';
    areaEl.textContent = areaName;

    statusEl.textContent = '局を選択してください';

    await renderStations(area.id);
    const nextMinuteDelay = 60_000 - (Date.now() % 60_000);
    setTimeout(() => {
      setInterval(() => {
        void renderStations(area.id);
      }, 60_000);
      void renderStations(area.id);
    }, nextMinuteDelay);

  } catch (error) {
    statusEl.textContent = `初期化に失敗しました: ${String(error)}`;
  }
};

let currentStationId: string | null = null;
panelEl.addEventListener('click', async (event) => {
  const target = (event.target as HTMLElement).closest('button');
  if (!target) {
    return;
  } 
  const stationId = target?.value;
  if (stationId === currentStationId) {
    return;
  }
  if (stationId === '') {
    player.stop();
    statusEl.textContent = '停止';
    const button = panelEl.querySelector('button.playing');
    if (button) {
      button.classList.remove('playing');
    }
    currentStationId = null;
    return;
  } else if (!stationId) {
    statusEl.textContent = '局が選択されていません';
    return;
  }

  statusEl.textContent = `開始しています...`;
  try {
    await player.play(stationId);
    statusEl.textContent = `再生中: ${target.dataset.stationName}`;
    const buttons = panelEl.querySelectorAll('button');
    buttons.forEach((button) => {
      button.classList.toggle('playing', button === target);
    });
    currentStationId = stationId;
  } catch (error) {
    statusEl.textContent = `再生に失敗しました: ${String(error)}`;
  }
});

document.addEventListener('keydown', (event) => {
  const move = (moveDirection: string, to: number) => {
    if (event.repeat) {
      return;
    }
    const buttons = Array.from(panelEl.querySelectorAll('button'));
    const currentIndex = buttons.findIndex((button) => document.activeElement === button);
    const nextIndex = (() => {
      if (moveDirection === 'vertical') {
        const panelStyles = getComputedStyle(panelEl);
        const gridRaw = {
          rows: panelStyles.getPropertyValue("grid-template-rows"),
          columns: panelStyles.getPropertyValue("grid-template-columns")
        };
        const grid = {
          rows: gridRaw.rows.split(' ').length,
          columns: gridRaw.columns.split(' ').length
        };
        const gridCells = grid.rows * grid.columns;
        let nextIndex = (currentIndex + to * grid.columns + gridCells) % gridCells;
        while (nextIndex > buttons.length - 1) {
          nextIndex = (nextIndex + to * grid.columns + gridCells) % gridCells;
        }
        return nextIndex;
      } else if (moveDirection === 'horizontal') {
        const nextIndex = (currentIndex + to + buttons.length) % buttons.length;
        return nextIndex;
      }
      return currentIndex;
    })();
    buttons[nextIndex].click();
    buttons[nextIndex].focus();
  }
  switch (event.key) {
    case 'ArrowUp': {
      move('vertical', -1);
      break;
    }
    case 'ArrowDown': {
      move('vertical', 1);
      break;
    }
    case 'ArrowLeft': {
      move('horizontal', -1);
      break;
    }
    case 'ArrowRight': {
      move('horizontal', 1);
      break;
    }
  }
});

void init();
