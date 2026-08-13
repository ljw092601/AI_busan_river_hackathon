import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRiver } from '@/features/rivers/fixtures';
import type { GeoPosition } from '@/lib/geo';
import { RiverMap } from './RiverMap';
import { KAKAO_SDK_SCRIPT_ID, resetKakaoMapsLoader } from './loadKakaoMaps';

/**
 * RiverMap 렌더 테스트.
 *
 * jsdom에는 카카오 SDK가 없습니다. 진짜 지도를 띄우는 대신 **가짜 SDK**를 window에
 * 심어 두고(로더는 window.kakao가 이미 준비돼 있으면 스크립트를 붙이지 않습니다),
 * "무엇을 몇 개 만들었는가 / 정리했는가"만 확인합니다.
 * 타일 렌더나 실제 좌표 투영은 여기서 검증할 수 없습니다 — 브라우저에서 눈으로 봐야 합니다.
 *
 * @testing-library가 프로젝트에 없어 react-dom으로 직접 렌더합니다.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

interface FakeCircle {
  radius: number;
  attached: boolean;
  options: Record<string, unknown>;
}

interface FakeOverlay {
  content: HTMLElement;
  attached: boolean;
}

interface FakeMapInstance {
  container: HTMLElement;
  setBounds: ReturnType<typeof vi.fn>;
  setCenter: ReturnType<typeof vi.fn>;
  setLevel: ReturnType<typeof vi.fn>;
  panTo: ReturnType<typeof vi.fn>;
  relayout: ReturnType<typeof vi.fn>;
}

interface Recorder {
  maps: FakeMapInstance[];
  circles: FakeCircle[];
  overlays: FakeOverlay[];
}

let recorder: Recorder;

function installFakeSdk(): Recorder {
  const rec: Recorder = { maps: [], circles: [], overlays: [] };

  class LatLng {
    constructor(
      private lat: number,
      private lng: number,
    ) {}
    getLat() {
      return this.lat;
    }
    getLng() {
      return this.lng;
    }
  }

  class LatLngBounds {
    constructor(
      public sw?: LatLng,
      public ne?: LatLng,
    ) {}
    extend() {}
    isEmpty() {
      return false;
    }
    getSouthWest() {
      return this.sw as LatLng;
    }
    getNorthEast() {
      return this.ne as LatLng;
    }
  }

  class FakeMap {
    setBounds = vi.fn();
    setCenter = vi.fn();
    setLevel = vi.fn();
    panTo = vi.fn();
    relayout = vi.fn();
    getCenter = vi.fn();
    getLevel = vi.fn(() => 8);
    constructor(public container: HTMLElement) {
      rec.maps.push(this as unknown as FakeMapInstance);
    }
  }

  class Circle {
    record: FakeCircle;
    constructor(public options: Record<string, unknown>) {
      this.record = { radius: options.radius as number, attached: false, options };
      rec.circles.push(this.record);
    }
    setMap(map: FakeMap | null) {
      this.record.attached = map != null;
    }
    setPosition() {}
    setRadius(r: number) {
      this.record.radius = r;
    }
    setOptions() {}
  }

  class CustomOverlay {
    record: FakeOverlay;
    constructor(public options: { content: HTMLElement }) {
      this.record = { content: options.content, attached: false };
      rec.overlays.push(this.record);
    }
    setMap(map: FakeMap | null) {
      // 실제 SDK처럼 지도 DOM에 붙였다 떼었다 해야 화면 검증이 가능합니다.
      if (map) map.container.appendChild(this.options.content);
      else this.options.content.remove();
      this.record.attached = map != null;
    }
    setPosition() {}
    getPosition() {
      return null as never;
    }
    setZIndex() {}
  }

  const maps = {
    LatLng,
    LatLngBounds,
    Map: FakeMap,
    Circle,
    CustomOverlay,
    event: { addListener: vi.fn(), removeListener: vi.fn() },
    load: (cb: () => void) => cb(),
  };

  window.kakao = { maps } as unknown as Window['kakao'];
  return rec;
}

const RIVERS = [
  makeRiver({ id: 'suyeong', name: '수영강', icon: '🌊', lat: 35.1723, lng: 129.1289 }),
  makeRiver({ id: 'oncheon', name: '온천천', icon: '🦦', lat: 35.2049, lng: 129.0784 }),
  makeRiver({ id: 'daecheon', name: '대천천', icon: '🐟', lat: 35.2417, lng: 128.9932 }),
];

const NEAR_ONCHEON: GeoPosition = {
  lat: 35.2049,
  lng: 129.0784,
  accuracy: 30,
  at: Date.now(),
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  recorder = installFakeSdk();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  resetKakaoMapsLoader();
  delete window.kakao;
});

async function render(ui: React.ReactElement) {
  await act(async () => {
    root.render(ui);
  });
}

function pins(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[aria-label*="미션 열기"]'));
}

function button(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes(text),
  );
}

describe('RiverMap — 위치 없이 (첫 방문자 기본 상태)', () => {
  it('위치가 없어도 하천을 모두 그린다', async () => {
    await render(<RiverMap rivers={RIVERS} position={null} onSelectRiver={() => {}} />);

    expect(recorder.maps).toHaveLength(1);
    expect(pins()).toHaveLength(3);
    // 반경 원도 하천 수만큼 — 내 위치 오차 원은 없습니다.
    expect(recorder.circles).toHaveLength(3);
  });

  it('핀에 하천 이름과 아이콘이 들어간다', async () => {
    await render(<RiverMap rivers={RIVERS} position={null} onSelectRiver={() => {}} />);
    const names = pins().map((p) => p.textContent);
    expect(names.some((n) => n?.includes('수영강'))).toBe(true);
    expect(names.some((n) => n?.includes('🦦'))).toBe(true);
  });

  it('거리를 아직 모르므로 거리 문구를 붙이지 않는다', async () => {
    await render(<RiverMap rivers={RIVERS} position={null} onSelectRiver={() => {}} />);
    expect(container.textContent).not.toContain('약 ');
  });

  it('위치 요청 콜백이 있으면 "내 위치 켜기" 버튼을 보여준다', async () => {
    const onRequestLocation = vi.fn();
    await render(
      <RiverMap rivers={RIVERS} position={null} onRequestLocation={onRequestLocation} />,
    );

    const locate = button('내 위치 켜기');
    expect(locate).toBeDefined();
    act(() => {
      locate!.click();
    });
    expect(onRequestLocation).toHaveBeenCalledTimes(1);
  });

  it('위치도 콜백도 없으면 눌러도 소용없는 버튼을 만들지 않는다', async () => {
    await render(<RiverMap rivers={RIVERS} position={null} />);
    expect(button('내 위치')).toBeUndefined();
  });
});

describe('RiverMap — 위치가 있을 때', () => {
  it('내 위치 마커와 오차 원을 더한다', async () => {
    await render(<RiverMap rivers={RIVERS} position={NEAR_ONCHEON} onSelectRiver={() => {}} />);

    expect(recorder.circles).toHaveLength(4); // 하천 3 + 오차 1
    expect(recorder.circles.some((c) => c.radius === 30)).toBe(true);
  });

  it('반경 안 하천은 "탐험 구역 안", 밖은 대략적인 거리로 안내한다', async () => {
    await render(<RiverMap rivers={RIVERS} position={NEAR_ONCHEON} onSelectRiver={() => {}} />);

    const labels = pins().map((p) => p.getAttribute('aria-label') ?? '');
    expect(labels.some((l) => l.includes('온천천') && l.includes('탐험 구역 안'))).toBe(true);
    // 거리는 미검증 근사값이라 '약'을 붙여 단정하지 않습니다.
    expect(labels.some((l) => l.includes('수영강') && l.includes('약 '))).toBe(true);
  });

  it('"내 위치" 버튼은 지도를 내 위치로 옮긴다', async () => {
    await render(<RiverMap rivers={RIVERS} position={NEAR_ONCHEON} />);

    const locate = button('내 위치');
    expect(locate).toBeDefined();
    act(() => {
      locate!.click();
    });
    expect(recorder.maps[0].panTo).toHaveBeenCalledTimes(1);
  });

  it('GPS가 미세하게 흔들려도 마커를 다시 만들지 않는다', async () => {
    const el = <RiverMap rivers={RIVERS} position={NEAR_ONCHEON} onSelectRiver={() => {}} />;
    await render(el);
    const before = recorder.overlays.length;

    await render(
      <RiverMap
        rivers={RIVERS}
        position={{ ...NEAR_ONCHEON, lat: NEAR_ONCHEON.lat + 0.00001, at: Date.now() + 1000 }}
        onSelectRiver={() => {}}
      />,
    );

    // 다시 만들면 매 초 마커가 깜빡입니다.
    expect(recorder.overlays.length).toBe(before);
  });
});

describe('RiverMap — 상호작용', () => {
  it('핀을 누르면 onSelectRiver에 하천 id를 준다', async () => {
    const onSelectRiver = vi.fn();
    await render(<RiverMap rivers={RIVERS} position={null} onSelectRiver={onSelectRiver} />);

    act(() => {
      pins()[0].click();
    });
    expect(onSelectRiver).toHaveBeenCalledWith('suyeong');
  });

  it('선택 콜백이 없으면 핀을 버튼으로 만들지 않는다', async () => {
    await render(<RiverMap rivers={RIVERS} position={null} />);
    expect(pins()).toHaveLength(0);
    expect(container.textContent).toContain('수영강');
  });

  it('선택된 하천으로 지도를 옮긴다', async () => {
    await render(<RiverMap rivers={RIVERS} position={null} onSelectRiver={() => {}} />);
    await render(
      <RiverMap
        rivers={RIVERS}
        position={null}
        selectedRiverId="daecheon"
        onSelectRiver={() => {}}
      />,
    );
    expect(recorder.maps[0].panTo).toHaveBeenCalledTimes(1);
  });
});

describe('RiverMap — 시야 맞추기', () => {
  it('첫 렌더에 하천이 모두 들어오도록 맞춘다', async () => {
    await render(<RiverMap rivers={RIVERS} position={null} onSelectRiver={() => {}} />);
    expect(recorder.maps[0].setBounds).toHaveBeenCalledTimes(1);
  });

  it('위치가 처음 들어오면 한 번 더 맞추지만, 이후 갱신에는 화면을 뺏지 않는다', async () => {
    await render(<RiverMap rivers={RIVERS} position={null} onSelectRiver={() => {}} />);
    await render(<RiverMap rivers={RIVERS} position={NEAR_ONCHEON} onSelectRiver={() => {}} />);
    expect(recorder.maps[0].setBounds).toHaveBeenCalledTimes(2);

    await render(
      <RiverMap
        rivers={RIVERS}
        position={{ ...NEAR_ONCHEON, lat: 35.21, at: Date.now() + 5000 }}
        onSelectRiver={() => {}}
      />,
    );
    expect(recorder.maps[0].setBounds).toHaveBeenCalledTimes(2);
  });

  it('하천이 하나뿐이면 setBounds 대신 중심+레벨을 쓴다', async () => {
    await render(<RiverMap rivers={[RIVERS[0]]} position={null} onSelectRiver={() => {}} />);
    expect(recorder.maps[0].setBounds).not.toHaveBeenCalled();
    expect(recorder.maps[0].setCenter).toHaveBeenCalledTimes(1);
    expect(recorder.maps[0].setLevel).toHaveBeenCalledTimes(1);
  });
});

describe('RiverMap — 정리', () => {
  it('언마운트하면 오버레이를 모두 떼어낸다', async () => {
    await render(<RiverMap rivers={RIVERS} position={NEAR_ONCHEON} onSelectRiver={() => {}} />);
    expect(recorder.overlays.some((o) => o.attached)).toBe(true);

    await act(async () => {
      root.render(<div />);
    });

    expect(recorder.overlays.every((o) => !o.attached)).toBe(true);
    expect(recorder.circles.every((c) => !c.attached)).toBe(true);
  });
});

describe('RiverMap — SDK 실패', () => {
  it('실패해도 예외를 밖으로 던지지 않고 안내와 재시도를 보여준다', async () => {
    // 준비된 SDK를 치우면 로더가 <script>를 붙이고, jsdom에서는 응답이 없습니다.
    delete window.kakao;
    resetKakaoMapsLoader();

    await render(<RiverMap rivers={RIVERS} position={null} onSelectRiver={() => {}} />);
    // 아직 로딩 중 — 빈 사각형이 아니라 안내 문구가 보여야 합니다.
    expect(container.textContent).toContain('지도를 불러오는 중');

    const script = document.getElementById(KAKAO_SDK_SCRIPT_ID);
    expect(script).not.toBeNull();

    await act(async () => {
      script!.dispatchEvent(new Event('error'));
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    // 도메인 미등록이 1순위 원인이라 해결 방법을 그대로 적어 둡니다.
    expect(alert!.textContent).toContain('사이트 도메인');
    expect(alert!.textContent).toContain('하천 목록');
    expect(button('다시 시도')).toBeDefined();
  });

  it('"다시 시도"는 실제로 스크립트를 다시 붙인다', async () => {
    delete window.kakao;
    resetKakaoMapsLoader();

    await render(<RiverMap rivers={RIVERS} position={null} onSelectRiver={() => {}} />);
    await act(async () => {
      document.getElementById(KAKAO_SDK_SCRIPT_ID)!.dispatchEvent(new Event('error'));
    });
    expect(document.getElementById(KAKAO_SDK_SCRIPT_ID)).toBeNull();

    await act(async () => {
      button('다시 시도')!.click();
    });

    expect(document.getElementById(KAKAO_SDK_SCRIPT_ID)).not.toBeNull();
    expect(container.textContent).toContain('지도를 불러오는 중');
  });
});
