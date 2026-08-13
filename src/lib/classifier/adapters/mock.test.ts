/**
 * 목 어댑터 테스트 — 핵심 요구사항은 **결정론**입니다.
 * 랜덤이 섞이면 라우팅 테스트도, 개발 중 화면도 재현 불가능해집니다.
 */

import { createMockClassifier, MOCK_MODEL_VERSION } from './mock';
import { toClassifyCandidates } from '../candidates';
import { heunPpyam, jungdaebaengno, soebaengno } from '../fixtures';

const candidates = toClassifyCandidates([heunPpyam, soebaengno, jungdaebaengno]);

function image(): Blob {
  return new Blob(['fake-jpeg-bytes'], { type: 'image/jpeg' });
}

describe('createMockClassifier', () => {
  it('같은 후보 목록이면 항상 같은 결과를 돌려준다', async () => {
    const classifier = createMockClassifier();

    const a = await classifier.classify({ image: image(), candidates });
    const b = await classifier.classify({ image: image(), candidates });

    expect(a).toEqual(b);
  });

  it('후보 목록 중 하나를 고르고, 목록 밖 종은 절대 답하지 않는다', async () => {
    const classifier = createMockClassifier();
    const r = await classifier.classify({ image: image(), candidates });

    expect(candidates.map((c) => c.id)).toContain(r.speciesId);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(r.offTopic).toBe(false);
    expect(r.modelVersion).toBe(MOCK_MODEL_VERSION);
  });

  it('seed가 다르면 결과가 갈릴 수 있지만, seed별로는 여전히 결정론적이다', async () => {
    const a1 = await createMockClassifier({ seed: 'a' }).classify({
      image: image(),
      candidates,
    });
    const a2 = await createMockClassifier({ seed: 'a' }).classify({
      image: image(),
      candidates,
    });

    expect(a1).toEqual(a2);
  });

  it('후보가 0개면 speciesId=null·confidence=0 (라우팅에서 pending으로 처리됨)', async () => {
    const r = await createMockClassifier().classify({
      image: image(),
      candidates: [],
    });

    expect(r.speciesId).toBeNull();
    expect(r.confidence).toBe(0);
  });

  it('respondWith로 특정 분기를 재현할 수 있다', async () => {
    const classifier = createMockClassifier({
      respondWith: () => ({
        speciesId: null,
        confidence: 0.99,
        offTopic: true,
        modelVersion: 'forced',
      }),
    });

    const r = await classifier.classify({ image: image(), candidates });
    expect(r.offTopic).toBe(true);
  });

  it('배치 결과는 observationId로 되짚을 수 있다', async () => {
    const classifier = createMockClassifier();
    const batch = await classifier.classifyBatch({
      items: [
        { observationId: 'obs-1', image: image(), candidates },
        { observationId: 'obs-2', image: image(), candidates: [] },
      ],
    });

    expect(batch.items).toHaveLength(2);
    expect(batch.items.map((i) => i.observationId)).toEqual(['obs-1', 'obs-2']);
    expect(batch.items[0].result?.speciesId).not.toBeNull();
    expect(batch.items[1].result?.speciesId).toBeNull();
    expect(batch.modelVersion).toBe(MOCK_MODEL_VERSION);
  });
});
