import type { RoomId } from './types';

/**
 * Hotspots are percentages of the art's width and height, measured on the empty floor of
 * each room where avatars go, so they survive any resolution. Tune by eye; this is config,
 * not code — swapping the art means editing this file and nothing else.
 */
export const shipMap = {
  image: '/ship-map.png',
  /** The art's aspect ratio, used to letterbox the map area without distorting it. */
  aspect: 1672 / 941,
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
  /**
   * Engine flames, drawn behind the art so each comes out from under one of its nozzles.
   * Per nozzle, `x` is its exit (left end), `y` its centre and `h` its height, all % of the
   * art. The frames are cut from `Spaceship thrusters.png` by tools/ship_sprites.py.
   */
  thrusters: {
    image: '/thruster-flame.png',
    frames: 6,
    fps: 12,
    /** One frame's width / height, and its height / one nozzle's height; set by the tool. */
    frameAspect: 282 / 142,
    span: 1.3,
    /**
     * Squashes the flames along their length; 1 keeps the sheet's proportions. Longer flames
     * need more room left of the ship, and the map shrinks to make it.
     */
    stretch: 0.6,
    /** How far (% of the art's width) each flame tucks in under its nozzle. */
    tuck: 0.8,
    nozzles: [
      { x: 0.66, y: 25.1, h: 15.6 },
      { x: 0.6, y: 42.9, h: 15.2 },
      { x: 0.6, y: 61.1, h: 15.6 },
      { x: 2.33, y: 75.7, h: 10 },
    ],
  },
  /**
   * The Reactor's pulsing core, drawn over the glass of the core in the art. `glass` is that
   * glass as % of the art (left, top, width, height). The frames are cut from
   * `Spaceship reactor.png` by tools/ship_sprites.py, which also prints `glass`.
   */
  reactor: {
    image: '/reactor-core.png',
    frames: 18,
    /** 18 frames at 7.5 a second: one slow pulse every 2.4 s. */
    fps: 7.5,
    glass: { x: 19.74, y: 20.62, w: 5.02, h: 11.26 },
  },
};

export const ROOM_ORDER: RoomId[] = ['reactor', 'cargo', 'steering', 'oxygen', 'medbay'];

export const ROOM_NAMES: Record<RoomId, string> = {
  reactor: 'Reactor',
  cargo: 'Cargo bay',
  steering: 'Steering',
  oxygen: 'Oxygen',
  medbay: 'Med bay',
};

/** Purely descriptive, for the monitor's card subtitles. Never used to decide anything. */
export const ROOM_BLURBS: Record<RoomId, string> = {
  reactor: 'power cells',
  cargo: 'scrap',
  steering: 'the helm',
  oxygen: 'life support',
  medbay: 'the X-ray',
};
