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
    <ul id="panel"></ul>
  </main>
`;

const areaEl = document.querySelector<HTMLParagraphElement>('#area');
const panelEl = document.querySelector<HTMLUListElement>('#panel');

if (!areaEl || !panelEl) {
  throw new Error('required elements not found');
}

(async () => {
  const info = await api.info();
  const { id: areaId = '', name: areaName = '' } = info.area ?? {};
  let stationId = info.stationId;

  const pickCurrentProgram = (programs: Program[]) => {
      const now = Date.now();

      for (let index = 0; index < programs.length; index += 1) {
          const program = programs[index];
          if (!program.time.to || now < program.time.to.getTime() + 60_000) {
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
            <h2><span class="title" title="${title ?? 'タイトルなし'}">${title ?? 'タイトルなし'}</span> <span class="station-name" title="${name ?? '不明な放送局'}">${name ?? '不明な放送局'}</span></h2>
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

  const init = async () => {
    try {
      if (!areaId) {
        alert('現在地の検出に失敗しました');
        return;
      } else if (areaId === 'OUT') {
        alert('サービス提供エリア外のためTinyRadiを利用できません');
        return;
      }
      areaEl.textContent = areaName ?? '';

      const intervalRender = () => {
        updatePrograms(areaId).then(() => {
          renderStations();
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

        const delay = Math.max(currentProgram.time.to.getTime() + 60_000 - Date.now(), 30_000);

        refreshTimer = window.setTimeout(() => {
          void intervalRender();
        }, delay);
      };

      updatePrograms(areaId).then(() => {
        renderStations(true);
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
  };

  panelEl.addEventListener('click', async (event) => {
    const button = event.target instanceof HTMLElement ? event.target.closest('button') : null;
    if (button) {
      await play(button.value);
    }
  });

  void init();
})();
