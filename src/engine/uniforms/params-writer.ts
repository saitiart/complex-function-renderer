import { Params } from "../gui/config/complex-functions-config";

export const PARAMS_BUFFER_SIZE = 32 * 4; 

export function buildParamsArray(
    params: Params,
    resolution: number,
    animationTime: number,
    domainCenter: [number, number],
    autoRotations: { xw: number; yw: number; zw: number }
): Float32Array {
    return Float32Array.of(
        resolution,                               // 0
        params.funcSelection,                     // 1
        0,                                        // 2  unused
        animationTime,                            // 3
        params.scale,                             // 4
        params.aspectRatio,                       // 5
        domainCenter[0],                          // 6
        domainCenter[1],                          // 7
        params.domain_size_x,                     // 8
        params.domain_size_z,                     // 9
        params.rot_xw + autoRotations.xw,         // 10
        params.rot_yw + autoRotations.yw,         // 11
        params.rot_zw + autoRotations.zw,         // 12
        params.scale_re,                          // 13
        params.scale_im,                          // 14
        params.amp_re,                            // 15
        params.amp_im,                            // 16
        params.shift_x,                           // 17
        params.shift_z,                           // 18
        params.use_riemann_sphere,                // 19
        params.use_hopf_projection,               // 20
        params.use_quaternion_rotation,           // 21
        params.quat_angle_left,                   // 22
        params.quat_angle_right,                  // 23
        params.quat_axis_left[0],                 // 24
        params.quat_axis_left[1],                 // 25
        params.quat_axis_left[2],                 // 26
        0,                                        // 27  vec3 pad
        params.quat_axis_right[0],                // 28
        params.quat_axis_right[1],                // 29
        params.quat_axis_right[2],                // 30
        params.show_fibration                     // 31  was vec3 pad, now show_fibration
    );
}