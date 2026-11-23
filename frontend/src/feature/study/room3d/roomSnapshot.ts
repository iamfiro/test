// 3D 방에서 내 자리를 찍은 사진 한 장(공부 요약 카드의 사진 칸). 방 화면이 떠 있는 동안만 찍을 수 있고,
// 방이 없거나 아직 그릴 수 없으면 null이다(카드는 사진 칸 없이 그린다).
type Shoot = (width: number, height: number) => HTMLCanvasElement | null

let shoot: Shoot | null = null

/** 방 화면이 찍는 함수를 건다. 돌려준 함수로 뗀다. */
export function registerRoomSnapshot(fn: Shoot): () => void {
  shoot = fn
  return () => { if (shoot === fn) shoot = null }
}

/** 내 자리를 width×height(CSS px) 화면으로 찍는다. */
export function takeRoomSnapshot(width: number, height: number): HTMLCanvasElement | null {
  return shoot ? shoot(width, height) : null
}
