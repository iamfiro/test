// 원본: lib/feature/study/room3d/domain/study_room_daylight.dart (PocketTime f574f242)

import { colorFrom, colorFromArgb, colorLerp, type StudyRoomColor } from '../model/color';
import { StudyRoomLook } from '../model/scene';
import { at, dartClamp, dartMod } from './dartMath';

interface Key {
  readonly hour: number;
  readonly brightness: number;
  readonly tint: StudyRoomColor;
  readonly fog: StudyRoomColor;
  readonly fogAmount: number;
  readonly saturation: number;
  readonly skyTop: StudyRoomColor;
  readonly skyBottom: StudyRoomColor;
  readonly stars: number;
}

function key(
  hour: number,
  brightness: number,
  tint: number,
  fog: number,
  fogAmount: number,
  saturation: number,
  skyTop: number,
  skyBottom: number,
  stars: number,
): Key {
  return {
    hour,
    brightness,
    tint: colorFromArgb(tint),
    fog: colorFromArgb(fog),
    fogAmount,
    saturation,
    skyTop: colorFromArgb(skyTop),
    skyBottom: colorFromArgb(skyBottom),
    stars,
  };
}

// 시각, 밝기, 빛 색, 안개 색, 안개 양, 채도, 하늘 위, 하늘 아래, 별.
const keys: readonly Key[] = [
  key(0, 0.76, 0xffffe6cf, 0xff2b2d4f, 0.26, 0.9, 0xff0d1330, 0xff29305e, 1),
  key(4.5, 0.74, 0xfff2dcd6, 0xff3a3762, 0.26, 0.88, 0xff1b2050, 0xff4a3f72, 0.8),
  key(5.8, 0.78, 0xffdcc8ec, 0xff8e7398, 0.3, 0.88, 0xff3b3f86, 0xffe6a2a6, 0.3),
  key(7, 0.9, 0xffffe2d6, 0xfff0c6b4, 0.28, 0.9, 0xff86aedb, 0xffffcdaa, 0),
  key(9.5, 0.97, 0xfffff5ee, 0xffe6e2de, 0.22, 0.92, 0xff8ec4ee, 0xffdceef7, 0),
  // 웹: 가장 밝은 때를 원본 13시에서 12시로 당겼다(사용자 결정 2026-11-23). 최고 밝기는 합성 단계에서 낮춘다.
  key(12, 1.0, 0xffffffff, 0xffe8e5e2, 0.18, 0.92, 0xff79b6ea, 0xffd2eaf6, 0),
  key(16.5, 0.95, 0xffffedf0, 0xffefd9d6, 0.3, 0.9, 0xff9cc2e6, 0xfff3e1dc, 0),
  key(18.4, 0.86, 0xffffcdb6, 0xffe8a08c, 0.34, 0.92, 0xff6e70b2, 0xffffa27e, 0),
  key(19.6, 0.8, 0xffffd9c6, 0xff5e4670, 0.28, 0.9, 0xff34336e, 0xffb3708a, 0.35),
  key(21, 0.78, 0xffffe4cc, 0xff2f3156, 0.26, 0.9, 0xff151a40, 0xff353766, 0.85),
  key(24, 0.76, 0xffffe6cf, 0xff2b2d4f, 0.26, 0.9, 0xff0d1330, 0xff29305e, 1),
];

// 그래픽 실험 20가지를 같은 장면에서 비교해 고른 색 보정. 구운 방 텍스처가 주황·분홍으로 기울어
// 있어 빛을 아주 조금 차갑게 하고, 대비·채도를 올려 사람·소품이 또렷하게 보이게 한다.
// 안개는 옅게 멀리서 시작해 가까운 장면은 흐리지 않는다.
const contrast = 1.14;
const saturationBoost = 1.12;
const fogScale = 0.6;

/** 한밤 창밖에 곱하는 빛(달빛 남색). */
const nightOutdoor = colorFromArgb(0xff39437a);
const white = colorFromArgb(0xffffffff);

/** 빛 색에 차가운 보정(주황 기운 덜기)을 곱한다(Color.from: 자르지 않는다). */
function grade(tint: StudyRoomColor): StudyRoomColor {
  return colorFrom({ alpha: 1, red: tint.r * 0.955, green: tint.g * 0.965, blue: tint.b });
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Dart `double.tryParse`처럼 앞뒤 공백을 무시하고, 숫자가 아니면 null.
 * (원본의 `String.fromEnvironment` 기본값 ''은 null이 된다.)
 */
function tryParseDouble(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) && trimmed !== 'NaN' ? null : parsed;
}

/**
 * 하루 중 한 시각의 방 분위기와 창밖 하늘. 기기 시각으로 고른다(StudyRoomDaylight.at).
 *
 * 조명은 텍스처에 구워져 있어 시간대는 질감 셰이더 값(빛 색·밝기·안개·채도)으로 낸다: 새벽은
 * 보랏빛, 아침·낮은 맑고 밝게, 오후는 살구빛, 노을은 주황·분홍, 밤은 창밖이 남색이고 안은 스탠드
 * 불빛처럼 따뜻하게 어둡다.
 */
export class StudyRoomDaylight {
  /** 0–24 시각(분 포함). */
  readonly hour: number;
  readonly look: StudyRoomLook;
  /** 창밖 하늘 위·아래 색. */
  readonly skyTop: StudyRoomColor;
  readonly skyBottom: StudyRoomColor;
  /** 별이 보이는 정도(0–1). */
  readonly stars: number;

  constructor({
    hour,
    look,
    skyTop,
    skyBottom,
    stars,
  }: {
    hour: number;
    look: StudyRoomLook;
    skyTop: StudyRoomColor;
    skyBottom: StudyRoomColor;
    stars: number;
  }) {
    this.hour = hour;
    this.look = look;
    this.skyTop = skyTop;
    this.skyBottom = skyBottom;
    this.stars = stars;
  }

  /** 해가 떠 있는지(6–19시). */
  get sunUp(): boolean {
    return this.hour >= 6 && this.hour < 19;
  }

  /** 하늘에서 해의 높이(0 지평선 – 1 한낮). */
  get sunHeight(): number {
    return this.sunUp ? dartClamp(Math.sin(((this.hour - 6) / 13) * Math.PI), 0.0, 1.0) : 0;
  }

  /** 해·달이 하늘을 가로지르는 정도(0 동쪽 – 1 서쪽). */
  get arc(): number {
    if (this.sunUp) return (this.hour - 6) / 13;
    const night = this.hour >= 19 ? this.hour - 19 : this.hour + 5;
    return night / 11;
  }

  /**
   * 지금 기기 시각의 분위기. 개발 서버(import.meta.env.DEV)에서는 `VITE_STUDY_DEV_HOUR=21.5`로
   * 시각을 고정해 볼 수 있다(원본: 디버그 빌드 `--dart-define=STUDY_DEV_HOUR`).
   */
  static now(): StudyRoomDaylight {
    // 개발 빌드: 주소 `?hour=15`가 환경 변수보다 먼저다(서버를 다시 켜지 않고 시간대별 룩을 본다).
    const fromUrl = import.meta.env.DEV && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('hour') : null;
    const fixed: unknown = import.meta.env.DEV ? fromUrl ?? import.meta.env['VITE_STUDY_DEV_HOUR'] : undefined;
    const hour = typeof fixed === 'string' ? tryParseDouble(fixed) : null;
    return hour !== null ? StudyRoomDaylight.atHour(hour) : StudyRoomDaylight.at(new Date());
  }

  /** 로컬 시각(Date의 로컬 시·분·초)으로 고른다. */
  static at(local: Date): StudyRoomDaylight {
    return StudyRoomDaylight.atHour(local.getHours() + local.getMinutes() / 60 + local.getSeconds() / 3600);
  }

  static atHour(hour: number): StudyRoomDaylight {
    // Dart `%`는 늘 0 이상(-1 → 23). JS `%`는 음수가 나오므로 dartMod.
    const h = dartMod(hour, 24);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = at(keys, i);
      const b = at(keys, i + 1);
      if (h >= a.hour && h <= b.hour) {
        const t = b.hour === a.hour ? 0.0 : (h - a.hour) / (b.hour - a.hour);
        const e = t * t * (3 - 2 * t);
        return new StudyRoomDaylight({
          hour: h,
          look: new StudyRoomLook({
            brightness: mix(a.brightness, b.brightness, e),
            tint: grade(colorLerp(a.tint, b.tint, e)),
            fogColor: colorLerp(a.fog, b.fog, e),
            fogAmount: mix(a.fogAmount, b.fogAmount, e) * fogScale,
            fogStart: 2.0,
            fogEnd: 12.0,
            saturation: mix(a.saturation, b.saturation, e) * saturationBoost,
            contrast,
            // 별이 뜰수록 창밖만 어두운 남색으로(방 안은 램프 빛).
            outdoorLight: colorLerp(white, nightOutdoor, mix(a.stars, b.stars, e)),
          }),
          skyTop: colorLerp(a.skyTop, b.skyTop, e),
          skyBottom: colorLerp(a.skyBottom, b.skyBottom, e),
          stars: mix(a.stars, b.stars, e),
        });
      }
    }
    return StudyRoomDaylight.atHour(0);
  }
}
