import type { RoomId } from './types';

/**
 * Hotspots are percentages of the art's width and height, measured on the empty floor of
 * each room where avatars go, so they survive any resolution. Tune by eye; this is config,
 * not code — swapping the art means editing this file and nothing else.
 */
export const shipMap = {
  image: '/ship-map.png',
  /** The art's aspect ratio, used to letterbox the map area without distorting it. */
  aspect: 1659 / 947,
  rooms: {
    reactor: { x: 12.5, y: 10.5, w: 22, h: 38 },
    cargo: { x: 37.5, y: 12, w: 30, h: 38 },
    steering: { x: 70.5, y: 18, w: 19, h: 33 },
    oxygen: { x: 13.5, y: 52, w: 23, h: 37 },
    medbay: { x: 43, y: 53, w: 34, h: 37 },
  } satisfies Record<RoomId, { x: number; y: number; w: number; h: number }>,
  /**
   * The cross pipe is already drawn in the art (it runs diagonally from the Reactor down
   * into the Med bay), so the app does not draw it. Kept here for a future art swap that
   * lacks it — set `draw: true` to overlay it.
   */
  crossPipe: { draw: false, from: { x: 34, y: 48 }, to: { x: 44, y: 58 } },
};

export const ROOM_ORDER: RoomId[] = ['reactor', 'cargo', 'steering', 'oxygen', 'medbay'];

export const ROOM_NAMES: Record<RoomId, string> = {
  reactor: 'Reactor',
  cargo: 'Cargo bay',
  steering: 'Steering',
  oxygen: 'Oxygen',
  medbay: 'Med bay',
};

/** Purely descriptive, for the TV card subtitles. Never used to decide anything. */
export const ROOM_BLURBS: Record<RoomId, string> = {
  reactor: 'power cells',
  cargo: 'scrap',
  steering: 'the helm',
  oxygen: 'life support',
  medbay: 'the X-ray',
};
