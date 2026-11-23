// 원본: lib/feature/study/room3d/infrastructure/shared_prefs_study_room_quality_store.dart (PocketTime f574f242)

import type { StudyRoomQualityStore } from '../domain/qualityController';
import { StudyRoomQuality } from '../domain/quality';
import { StudyRoomQualityState } from '../domain/qualityGovernor';

const storageKey = 'study_room_3d_quality_v1';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 기기에 남기는 3D 공부방 품질 상태(계정과 무관한 기기 성능 정보, 사용자 데이터 아님).
 * 원본 SharedPreferences 대신 localStorage를 쓰고, 사생활 보호 창·저장 차단처럼 localStorage에
 * 접근하지 못하면 읽기는 null(처음 여는 기기와 같다), 쓰기는 남기지 않고 넘어간다.
 */
export class LocalStorageStudyRoomQualityStore implements StudyRoomQualityStore {
  read(): Promise<StudyRoomQualityState | null> {
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      return Promise.resolve(null);
    }
    if (raw === null) return Promise.resolve(null);
    return Promise.resolve(parse(raw));
  }

  write(state: StudyRoomQualityState): Promise<void> {
    const strikes: Record<string, number> = {};
    for (const [key, value] of state.strikes) {
      strikes[key.name] = value;
    }
    const raw = JSON.stringify({ quality: state.quality.name, strikes });
    try {
      window.localStorage.setItem(storageKey, raw);
    } catch {
      // 저장소를 쓸 수 없으면(용량·차단) 이번 실행의 단계만 쓴다.
    }
    return Promise.resolve();
  }
}

/**
 * 원본 파싱과 같은 규칙: JSON이 아니거나(FormatException) 모양이 다르면(TypeError) null.
 * quality는 문자열(또는 없음)이어야 하고 모르는 값이면 null, strikes는 객체(또는 없음)여야 한다.
 * strikes 안에서는 아는 단계이고 값이 양의 정수인 것만 남긴다.
 */
function parse(raw: string): StudyRoomQualityState | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(json)) return null;
  const qualityName = json['quality'];
  if (qualityName !== undefined && qualityName !== null && typeof qualityName !== 'string') return null;
  const quality = StudyRoomQuality.byName(qualityName);
  if (quality === null) return null;
  const rawStrikes = json['strikes'];
  if (rawStrikes !== undefined && rawStrikes !== null && !isPlainObject(rawStrikes)) return null;
  const strikes = new Map<StudyRoomQuality, number>();
  for (const [key, value] of Object.entries(rawStrikes ?? {})) {
    const tier = StudyRoomQuality.byName(key);
    if (tier !== null && typeof value === 'number' && Number.isInteger(value) && value > 0) {
      strikes.set(tier, value);
    }
  }
  return new StudyRoomQualityState({ quality, strikes });
}
