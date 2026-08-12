import './style.css';

type Info = {
  area: {
    id: string | null;
    name: string | null;
    nameEn: string | null;
  };
  stationId: string | null;
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

  info = () =>
    fetch('/api/info')
    .then((res) => res.json())
    .then((json) => {
      return json.info as Info;
    });

  play = (stationId: string) =>
    fetch(`/api/play`, { 
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        station: stationId,
      }),
    })
    .then((res) => res.json()) as Promise<{ ok: boolean; stationId: string | null }>;

  stop = () =>
    fetch(`/api/stop`, { 
      method: 'POST',
    })
    .then((res) => res.json()) as Promise<{ ok: boolean; }>;

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
    <div id="now-playing">
      <p><img id="media-image" width="480" height="300" alt="画像なし"></p>
      <div>
        <h2 id="media-title">再生停止中</h2>
        <p id="media-station"></p>
        <p id="media-pfm"></p>
        <p id="media-time"></p>
      </div>
    </div>
    <ul id="panel"></ul>
    <button id="open-details">番組詳細</button>
    <dialog id="details-dialog">
      <div id="details"></div>
      <button id="close-details">閉じる</button>
    </dialog>
  </main>
`;

const areaEl = document.querySelector<HTMLParagraphElement>('#area');
const mediaImageEl = document.querySelector<HTMLImageElement>('#media-image');
const mediaTitleEl = document.querySelector<HTMLHeadingElement>('#media-title');
const mediaStationEl = document.querySelector<HTMLParagraphElement>('#media-station');
const mediaPfmEl = document.querySelector<HTMLParagraphElement>('#media-pfm');
const mediaTimeEl = document.querySelector<HTMLParagraphElement>('#media-time');
const panelEl = document.querySelector<HTMLUListElement>('#panel');
const openDetailsEl = document.querySelector<HTMLButtonElement>('#open-details');
const detailsDialogEl = document.querySelector<HTMLDialogElement>('#details-dialog');
const detailsEl = document.querySelector<HTMLDivElement>('#details');
const closeDetailsEl = document.querySelector<HTMLButtonElement>('#close-details');

if (!areaEl || !mediaImageEl || !mediaTitleEl || !mediaStationEl || !mediaPfmEl || !mediaTimeEl
  || !panelEl || !openDetailsEl || !detailsDialogEl || !detailsEl || !closeDetailsEl) {
  throw new Error('required elements not found');
}

const info = await api.info();
const areaId = info.area?.id ?? '';
let stationId = info.stationId;

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
    const isCurrent = stationId === id;
    return `
        <button value="${id ?? ''}" data-program-id="${programId ?? ''}" ${isCurrent ? 'class="playing"' : ''}>
          <h2>
            <div class="title" title="${title ?? 'タイトルなし'}">
              <span>${title ?? 'タイトルなし'}</span>
            </div>
            <div class="station-name" title="${name ?? '不明な放送局'}">
              <span>${name ?? '不明な放送局'}</span>
            </div>
          </h2>
          <p class="pfm"><span title="${pfm ?? ''}">${pfm ?? ''}</span></p>
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
    mediaImageEl.alt = '画像なし';
    mediaTitleEl.textContent = '再生停止中';
    mediaStationEl.textContent = '';
    mediaPfmEl.textContent = '';
    mediaTimeEl.textContent = '';
    return;
  }
  
  mediaImageEl.src = program.img ?? '';
  mediaImageEl.alt = program.title ?? '画像なし';
  mediaTitleEl.textContent = program.title ?? '';
  mediaStationEl.textContent = station.name ?? '';
  mediaPfmEl.textContent = program.pfm ?? '';
  mediaTimeEl.textContent = program.time.formatted ?? '';
};

const renderProgramDetails = ({ station, program, changed, isEmpty }: { station: Station | null; program: Program | null; changed: boolean; isEmpty: boolean }, isOpen: boolean = false) => {
  if (!detailsDialogEl.open || detailsDialogEl.open && !isOpen && !changed) {
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
    if (!areaId) {
      alert('現在地の検出に失敗しました');
      return;
    } else if (areaId === 'OUT') {
      alert('サービス提供エリア外のためTinyRadiを利用できません');
      return;
    }
    areaEl.textContent = areaId;

    const intervalRender = () => {
      updatePrograms(areaId).then(() => {
        renderStations();
        const metadata = prepareMetadata();
        renderMetadata(metadata);
        renderNowPlaying(metadata);
        renderProgramDetails(metadata);
        scheduleNextRefresh();
      });
    };

    let refreshTimer: number | null = null;
    
    const scheduleNextRefresh = () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      const currentProgram = programsByStation
        .map((station) => pickCurrentProgram(station.programs))
        .filter((program): program is Program => program !== null)
        .reduce<Program | null>((soonest, program) => {
          if (soonest === null || (program.time.to && soonest.time.to && program.time.to.getTime() < soonest.time.to.getTime())) {
            return program;
          }
          return soonest;
        }, null);

      if (currentProgram === null || currentProgram.time.to === null) {
        return;
      }

      const delay = Math.max(currentProgram.time.to.getTime() - Date.now(), 30_000);

      refreshTimer = window.setTimeout(() => {
        void intervalRender();
      }, delay);
    };

    updatePrograms(areaId).then(() => {
      renderStations(true);
      const metadata = prepareMetadata();
      renderMetadata(metadata);
      renderNowPlaying(metadata);
      renderProgramDetails(metadata);
      scheduleNextRefresh();
    });
  } catch (error) {
    alert(`初期化に失敗しました: ${String(error)}`);
  }
};

const play = async (id: string) => {
  stationId = id;
  if (stationId) {
    await api.play(stationId);
  } else {
    await api.stop();
  }
  panelEl.querySelectorAll('button').forEach((btn) => {
    const isPlaying = stationId !== '' && btn.value === stationId;
    btn.classList.toggle('playing', isPlaying);
    const statusEl = btn.querySelector('.status');
    if (statusEl) {
      statusEl.textContent = isPlaying ? '再生中' : '';
    }
  });
  const metadata = prepareMetadata();
  renderMetadata(metadata);
  renderNowPlaying(metadata);
  renderProgramDetails(metadata);
};

panelEl.addEventListener('click', async (event) => {
  const button = event.target instanceof HTMLElement ? event.target.closest('button') : null;
  if (button) {
    await play(button.value);
  }
});

const trackBy = (offset: number) => {
  const currentIndex = programsByStation.findIndex((station) => station.id === info.stationId);
  const nextIndex = (currentIndex + offset + programsByStation.length) % programsByStation.length;
  const stationId = programsByStation[nextIndex].id ?? '';
  play(stationId);
};

openDetailsEl.addEventListener('click', () => {
  detailsDialogEl.showModal();
  const metadata = prepareMetadata();
  renderProgramDetails(metadata, true);
});

closeDetailsEl.addEventListener('click', () => {
  detailsDialogEl.close();
});

detailsDialogEl.addEventListener('close', () => {
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
    const currentIndex = buttons.findIndex((button) => button.value === info.stationId || button.value === '');
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
