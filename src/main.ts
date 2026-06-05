import './style.css';

import Hls from 'hls.js';

type Area = {
  id: string | null;
  name: string | null;
  nameEn?: string | null;
};

type StationInfo = {
  areafree: boolean;
  timefree: boolean;
  href: string | null;
};

type Station = {
  id: string | null;
  name: string | null;
};

type Program = {
  id: string | null;
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
      return { id, name } as Area;
    });

  stations = (areaId: string) =>
    fetch(`https://radiko.jp/v3/station/list/${areaId}.xml`)
    .then((res) => res.text())
    .then((txt) => {
      const doc = this.parseXml(txt);
      const area: Area = {
        id: doc.querySelector('stations')?.getAttribute('area_id') || null,
        name: doc.querySelector('stations')?.getAttribute('area_name') || null,
      };
      const stations: (Station & StationInfo)[] = Array.from(doc.querySelectorAll('station'))
        .map((el) => ({
          id: el.querySelector('id')?.textContent || null,
          name: el.querySelector('name')?.textContent || null,
          areafree: el.querySelector('areafree')?.textContent === '1',
          timefree: el.querySelector('timefree')?.textContent === '1',
          href: el.querySelector('href')?.textContent || null,
        }));
      return { area, stations };
    });

  nowPrograms = (areaId: string) =>
    fetch(`https://api.radiko.jp/program/v3/now/${areaId}.xml`)
    .then((res) => res.text())
    .then((txt) => {
      const doc = this.parseXml(txt);
      const stations = Array.from(doc.querySelectorAll('station')).map((el) => {
        const station: Station = {
          id: el.getAttribute('id'),
          name: el.querySelector('name')?.textContent || null,
        };
        const programs = Array.from(el.querySelectorAll('prog')).map((el) => {
          const program: Program = {
            id: el.getAttribute('id'),
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
        return { ...station, programs };
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
    const area: Area = await auth2Res.text().then((txt) => {
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

  stationId: string | null = null;

  constructor(api: API, audio: HTMLAudioElement, authToken = '') {
    this.api = api;
    this.audio = audio;
    this.authToken = authToken;
    setInterval(this.updateToken, 70 * 60_000);
  }

  private updateToken = async () => {
    this.authToken = await this.api.authorize().then((result) => result.authToken);
  }

  private destroyHls = () => {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  };

  listenEvent = (event: string, handler: () => void) => {
    this.audio.addEventListener(event, handler);
  };

  get paused() {
    return this.audio.paused;
  }

  stop = () => {
    this.destroyHls();
    this.stationId = null;
    this.audio.dispatchEvent(new Event('stop'));
  };

  pause = () => {
    this.audio.pause();
  };

  play = async (stationId?: string) => {
    const isResume = !stationId;
    if (isResume) {
      this.audio.play();
      return;
    }
    this.destroyHls();
    this.stationId = stationId;

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
  };

  togglePlay = () => {
    if (this.audio.paused) {
      this.audio.play();
    } else {
      this.audio.pause();
    }
  };

}

const api = new API();
const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('app root not found');
}

app.innerHTML = `
  <main>
    <header>
      <h1>TinyRadi</h1>
      <p id="area"></p>
    </header>
    <ul id="panel"></ul>
    <div id="now-playing" hidden>
      <p><img id="media-image" width="480" height="300" alt="No Image"></p>
      <div>
        <h2 id="media-title"></h2>
        <p id="media-station"></p>
        <p id="media-pfm"></p>
        <p id="media-time"></p>
        <p class="media-controls">
          <button id="prev">前へ</button>
          <button id="play-pause" disabled>再生</button>
          <button id="next">次へ</button>
          <button id="open-details">番組詳細</button>
          <button id="hide-now-playing">非表示</button>
        </p>
      </div>
    </div>
    <dialog id="dialog">
      <div id="details"></div>
      <button id="close-details">閉じる</button>
    </dialog>
    <audio id="audio" autoplay></audio>
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

const areaEl = document.querySelector<HTMLParagraphElement>('#area');
const panelEl = document.querySelector<HTMLUListElement>('#panel');
const nowPlayingEl = document.querySelector<HTMLDivElement>('#now-playing');
const mediaImageEl = document.querySelector<HTMLImageElement>('#media-image');
const mediaTitleEl = document.querySelector<HTMLHeadingElement>('#media-title');
const mediaStationEl = document.querySelector<HTMLParagraphElement>('#media-station');
const mediaPfmEl = document.querySelector<HTMLParagraphElement>('#media-pfm');
const mediaTimeEl = document.querySelector<HTMLParagraphElement>('#media-time');
const prevEl = document.querySelector<HTMLButtonElement>('#prev');
const playPauseEl = document.querySelector<HTMLButtonElement>('#play-pause');
const nextEl = document.querySelector<HTMLButtonElement>('#next');
const openDetailsEl = document.querySelector<HTMLButtonElement>('#open-details');
const hideNowPlayingEl = document.querySelector<HTMLButtonElement>('#hide-now-playing');
const dialogEl = document.querySelector<HTMLDialogElement>('#dialog');
const detailsEl = document.querySelector<HTMLDivElement>('#details');
const closeDetailsEl = document.querySelector<HTMLButtonElement>('#close-details');
const audioEl = document.querySelector<HTMLAudioElement>('#audio');

if (!areaEl || !panelEl || !nowPlayingEl || !mediaImageEl || !mediaTitleEl || !mediaStationEl || !mediaPfmEl || !mediaTimeEl || !prevEl
  || !playPauseEl || !nextEl || !openDetailsEl || !hideNowPlayingEl || !dialogEl || !detailsEl || !closeDetailsEl || !audioEl) {
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

let programsByStation: (Station & { programs: Program[] })[] = [];

const updatePrograms = async (areaId: string) => {
  programsByStation = await api.nowPrograms(areaId);
};

const renderStations = (init = false) => {
  const buildButton = (station: Station & { programs: Program[] }) => {
    const { id, name } = station;
    const program = pickCurrentProgram(station.programs);
    const { id: programId, title, pfm, time: { formatted: time } = {} } = program || {};
    const isPlaying = player.stationId === id && !player.paused;
    return `
        <button value="${id ?? ''}" data-program-id="${programId ?? ''}" ${isPlaying ? 'class="playing"' : ''}>
          <h2>
            <div class="title" title="${title ?? 'タイトルなし'}">
              <span>${title ?? 'タイトルなし'}</span>
            </div>
            <div class="station-name" title="${name ?? '不明な放送局'}">
              <span>${name ?? '不明な放送局'}</span>
            </div>
          </h2>
          <p><span title="${pfm ?? ''}">${pfm ?? ''}</span></p>
          <p class="time"><span title="${time ?? ''}">${time ?? ''}</span></p>
        </button>`;
  };

  if (init) {
    panelEl.innerHTML = programsByStation
      .map((station) => {
        return `
      <li>
        ${buildButton(station)}
      </li>`;
      })
      .concat([
        `<li><button value="" id="stop"><h2>停止</h2></button></li>`,
      ])
      .join('');
  } else {
    programsByStation.forEach((station) => {
      const stationId = station.id;
      const button = panelEl.querySelector<HTMLButtonElement>(`button[value="${stationId}"]`);
      if (!button) {
        return;
      }
      const nowProgram = pickCurrentProgram(station.programs);
      
      if (button.dataset.programId !== nowProgram?.id) {
        button.outerHTML = buildButton(station);
      }
    });
  }
};

let lastProgramId: string | null = null;

const prepareMetadata = () => {
  const stationId = player.stationId;
  const station = stationId ? programsByStation.find((station) => station.id === stationId) || null : null;
  const program = station ? pickCurrentProgram(station.programs) : null;
  if (!stationId || !station || !program) {
    const changed = lastProgramId !== null;
    lastProgramId = null;
    return { station, program, changed, isEmpty: true };
  }

  const changed = lastProgramId !== program.id;

  lastProgramId = program.id;

  return { station, program, changed, isEmpty: false };
};

const renderMetadata = ({ station, program, changed, isEmpty }: { station: Station | null; program: Program | null; changed: boolean; isEmpty: boolean }) => {
  if (!("mediaSession" in navigator) || !changed) {
    return;
  }

  if (isEmpty || !station || !program) {
    navigator.mediaSession.metadata = null;
    return;
  }

  const { name } = station;
  const { title, img } = program;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: title ?? '',
    artist: name ?? '',
    artwork: [
      { src: img ?? '', sizes: '480x300' },
    ],
  });
};

const renderNowPlaying = ({ station, program, changed, isEmpty }: { station: Station | null; program: Program | null; changed: boolean; isEmpty: boolean }) => {
  if (!changed) {
    return;
  }

  if (isEmpty || !station || !program) {
    mediaImageEl.src = '';
    mediaImageEl.alt = 'No Image';
    mediaTitleEl.textContent = '';
    mediaStationEl.textContent = '';
    mediaPfmEl.textContent = '';
    mediaTimeEl.textContent = '';
    return;
  }
  
  mediaImageEl.src = program.img ?? '';
  mediaImageEl.alt = program.title ?? 'No Image';
  mediaTitleEl.textContent = program.title ?? '';
  mediaStationEl.textContent = station.name ?? '';
  mediaPfmEl.textContent = program.pfm ?? '';
  mediaTimeEl.textContent = program.time.formatted ?? '';
};

const renderProgramDetails = ({ station, program, changed, isEmpty }: { station: Station | null; program: Program | null; changed: boolean; isEmpty: boolean }, isOpen: boolean = false) => {
  if (!dialogEl.open || dialogEl.open && !isOpen && !changed) {
    return;
  }

  if (isEmpty || !station || !program) {
    detailsEl.innerHTML = '';
    return;
  }

  const buildDetails = (name: string | null, program: Program) => {
    const { title, time: { formatted: time } = {}, desc, info, pfm, url, img } = program;
    return `
      <p><img src="${img}" alt="${title ?? 'タイトルなし'}"></p> 
      <h2>${title ?? 'タイトルなし'}</h2>
      <p>${name ?? '不明な放送局'}</p>
      <p>${time ?? '放送時間不明'}</p>
      ${desc || info ? `<p>${desc ?? ''}${info ?? ''}</p>` : ''}
      ${pfm ? `<p>${pfm}</p>` : ''}
      ${url ? `<p>番組Webサイト: <a href="${url}" target="_blank">${url}</a></p>` : ''}
    `;
  };
  
  detailsEl.innerHTML = buildDetails(station.name, program);
  detailsEl.querySelectorAll('a').forEach((a) => {
    a.target = '_blank';
  });
  lastProgramId = program.id;
};

const init = async () => {
  try {
    const areaId = area.id;
    if (!areaId) {
      alert('現在地の検出に失敗しました');
      return;
    } else if (areaId === 'OUT') {
      alert('サービス提供エリア外のためTinyRadiを利用できません');
      return;
    }
    const areaName = area.name ?? '不明な現在地';
    areaEl.textContent = areaName;

    updatePrograms(areaId).then(() => {
      renderStations(true);
    });
    const nextMinuteDelay = 60_000 - (Date.now() % 60_000);
    const intervalRender = () => {
      updatePrograms(areaId).then(() => {
        renderStations();
        const metadata = prepareMetadata();
        renderMetadata(metadata);
        renderNowPlaying(metadata);
        renderProgramDetails(metadata);
      });
    };
    setTimeout(() => {
      setInterval(intervalRender, 60_000);
      intervalRender();
    }, nextMinuteDelay);

    player.listenEvent('loadstart', () => {
      const playingButton = panelEl.querySelector<HTMLButtonElement>('button.playing');
      if (playingButton) {
        playingButton.classList.remove('playing');
      }
      const button = panelEl.querySelector<HTMLButtonElement>(`button[value="${player.stationId}"]`);
      if (button) {
        button.classList.add('playing');
      }
      const metadata = prepareMetadata();
      renderMetadata(metadata);
      renderNowPlaying(metadata);
      renderProgramDetails(metadata);
      nowPlayingEl.hidden = false;
      playPauseEl.disabled = true;
      playPauseEl.textContent = '一時停止';
    });
    player.listenEvent('play', () => {
      const stationId = player.stationId;
      const buttons = panelEl.querySelectorAll('button');
      const targetButton = Array.from(buttons).find((button) => button.value === stationId);
      buttons.forEach((button) => {
        button.classList.toggle('playing', button === targetButton);
      });
      nowPlayingEl.hidden = false;
      playPauseEl.disabled = false;
      playPauseEl.textContent = '一時停止';
    });
    player.listenEvent('pause', () => {
      const button = panelEl.querySelector<HTMLButtonElement>('button.playing');
      if (button) {
        button.classList.remove('playing');
      }
      playPauseEl.textContent = '再生';
    });
    player.listenEvent('stop', () => {
      const button = panelEl.querySelector<HTMLButtonElement>('button.playing');
      if (button) {
        button.classList.remove('playing');
      }
      nowPlayingEl.hidden = true;
      playPauseEl.disabled = true;
      playPauseEl.textContent = '再生';
      const metadata = prepareMetadata();
      renderMetadata(metadata);
      renderNowPlaying(metadata);
      renderProgramDetails(metadata);
    });

  } catch (error) {
    alert(`初期化に失敗しました: ${String(error)}`);
  }
};

const play = async (stationId: string) => {
  const alreadyPlaying = player.stationId === stationId;
  if (alreadyPlaying) {
    player.togglePlay();
    return;
  }

  const isStopButton = stationId === '';
  if (isStopButton) {
    player.stop();
    return;
  }

  try {
    await player.play(stationId);
  } catch (error) {
    alert(`再生に失敗しました: ${String(error)}`);
  }
};

panelEl.addEventListener('click', async (event) => {
  const target = (event.target as HTMLElement).closest('button');
  if (!target) {
    return;
  } 
  const stationId = target.value;
  await play(stationId);
});

playPauseEl.addEventListener('click', () => {
  const stationId = player.stationId;
  if (stationId) {
    player.togglePlay();
  }
});

const trackBy = (offset: number) => {
  const currentIndex = programsByStation.findIndex((station) => station.id === player.stationId);
  const nextIndex = (currentIndex + offset + programsByStation.length) % programsByStation.length;
  const stationId = programsByStation[nextIndex].id ?? '';
  play(stationId);
};

prevEl.addEventListener('click', () => {
  trackBy(-1);
});

nextEl.addEventListener('click', () => {
  trackBy(1);
});

openDetailsEl.addEventListener('click', () => {
  dialogEl.showModal();
  const metadata = prepareMetadata();
  renderProgramDetails(metadata, true);
});

hideNowPlayingEl.addEventListener('click', () => {
  nowPlayingEl.hidden = true;
});

closeDetailsEl.addEventListener('click', () => {
  dialogEl.close();
});

dialogEl.addEventListener('close', () => {
  detailsEl.innerHTML = '';
});

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('nexttrack', () => {
    trackBy(1);
  });
  navigator.mediaSession.setActionHandler('previoustrack', () => {
    trackBy(-1);
  });
}

document.addEventListener('keydown', (event) => {
  const move = (moveDirection: string, to: number) => {
    if (event.repeat) {
      return;
    }
    const buttons = Array.from(panelEl.querySelectorAll('button'));
    const currentIndex = buttons.findIndex((button) => button.value === player.stationId || button.value === '');
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
    const nextButton = buttons[nextIndex];
    nextButton.focus();
    play(nextButton.value);
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
    case 'Enter': {
      if (event.repeat) {
        event.preventDefault();
      }
      break;
    }
  }
});

void init();
