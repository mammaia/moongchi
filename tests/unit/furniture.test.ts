import { describe, expect, it } from 'vitest';
import { furnitureFrame, phaseMs, planFurniture } from '../../src/features/character/furniture';
import { depthForFloorY, point } from '../../src/features/room/perspective';

const rng = () => 0.5;

describe('가구 쓰기 동작', () => {
  it('침대 위에서는 바닥보다 높이 떠 있고, 내려오면 다시 바닥이다', () => {
    const plan = planFurniture('climb', rng);
    expect(plan.spotLift).toBeGreaterThan(10);
    const onBed = furnitureFrame(plan, 'stay', 100);
    expect(onBed.lift).toBeGreaterThanOrEqual(plan.spotLift);
    const landed = furnitureFrame(plan, 'exit', phaseMs(plan, 'exit'));
    expect(landed.lift).toBe(0);
    expect(landed.pos).toEqual(plan.approach);
  });

  it('침대로 뛰어오를 때 공중에서 가장 높다', () => {
    const plan = planFurniture('climb', rng);
    const mid = furnitureFrame(plan, 'enter', phaseMs(plan, 'enter') * 0.55);
    expect(mid.lift).toBeGreaterThan(plan.spotLift);
    expect(mid.face).toBe('open');
  });

  it('책상 뒤에 숨으면 책상 앞면보다 안쪽이라 책상에 가려진다', () => {
    const plan = planFurniture('hide', rng);
    const deskFrontY = point(0.6, 0.16).y; // RoomView가 책상 층을 그리는 기준
    const hidden = furnitureFrame(plan, 'stay', 100);
    expect(depthForFloorY(hidden.pos.y)).toBeLessThan(depthForFloorY(deskFrontY));
    // 책상 앞에 나와 있을 때는 책상보다 앞에 보인다
    expect(depthForFloorY(plan.approach.y)).toBeGreaterThan(depthForFloorY(deskFrontY));
  });

  it('숨어 있다가 가끔 빼꼼 내다본다', () => {
    const plan = planFurniture('hide', rng);
    const xs = new Set<number>();
    for (let ms = 0; ms < plan.stayMs; ms += 50) xs.add(Math.round(furnitureFrame(plan, 'stay', ms).pos.x));
    expect(Math.min(...xs)).toBeLessThan(plan.spot.x - 5);
  });
});
