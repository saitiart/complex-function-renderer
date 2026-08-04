import camera from '3d-view-controls';

export interface Camera {
    eye: number[];
    center: number[];
    up: number[];
    tick(): void;
    matrix?: Float32Array;
}

export function createInteractiveCamera(canvas: HTMLCanvasElement): Camera {
    const cam = camera(canvas, {
        eye: [0.0, 5.0, 0.0],
        center: [0, 0, 0],
        up: [0.0, 0.0, 0.0],
        zoomMax: 1000,
        zoomSpeed: 2,
    });
    return cam;
}