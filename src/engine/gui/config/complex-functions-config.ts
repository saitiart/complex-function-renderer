export interface Domain {
    x: [number, number];
    z: [number, number];
}

export interface Params {
    funcSelection: number;
    rotateSpeed: number;
    animateSpeed: number;
    resolution: number;
    scale: number;
    aspectRatio: number;
    rot_xw: number;
    rot_yw: number;
    rot_zw: number;
    domain_size_x: number;
    domain_size_z: number;
    domain_center_x: number;
    domain_center_z: number;
    scale_re: number;
    scale_im: number;
    amp_re: number;
    amp_im: number;
    shift_x: number;
    shift_z: number;
    use_riemann_sphere: number;
    use_hopf_projection: number;
    showAxes: boolean;
    topology: 'triangle-list' | 'line-list' | 'point-list';
    use_quaternion_rotation: number;
    quat_angle_left: number;
    quat_angle_right: number;
    quat_axis_left: [number, number, number];
    quat_axis_right: [number, number, number];
    show_fibration: number
}


export const COMPLEX_FUNCTIONS_CONFIG = {
    initialParams: {
        funcSelection: 0,
        rotateSpeed: 0,
        animateSpeed: 2,
        resolution: 512,
        scale: 1.0,
        aspectRatio: 1.0,
        rot_xw: 0,
        rot_yw: 0,
        rot_zw: 0,
        domain_size_x: 1.0,
        domain_size_z: 1.0,
        domain_center_x: 0.0,
        domain_center_z: 0.0,
        scale_re: 1.0,
        scale_im: 1.0,
        amp_re: 1.0,
        amp_im: 1.0,
        shift_x: 0.0,
        shift_z: 0.0,
        use_riemann_sphere: 0.0,
        use_hopf_projection: 0.0,
        showAxes: true,
        topology: 'triangle-list' as const,
        use_quaternion_rotation: 0.0,
        quat_angle_left: 0.0,
        quat_angle_right: 0.0,
        quat_axis_left: [1.0, 0.0, 0.0] as [number, number, number],
        quat_axis_right: [0.0, 1.0, 0.0] as [number, number, number],
        show_fibration: 0.0
    } as Params,

    functionDomains: [
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 0  - z²
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 1  - log(z)
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 2  - sin(z)
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 3  - tan(z)
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 4  - √z
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 5  - sin(1/z)
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 6  - exp(z)
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 7  - z^z
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 8  - exp(1/z)
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 9  - z + 1/z
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 10 - ζ(z)
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 11 - ξ(z)
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 12 - Γ(z)
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 13 - J₁(z)
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 14 - Airy(z)
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 15 - Julia
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 16 - Extra
        { x: [-1.0, 1.0], z: [-1.0, 1.0] },   // 17 - Hopf
    ] as Domain[],
    

    guiConfig: {
        functionRange:    { min: 0, max: 17, step: 1 },
        animateSpeed:     { min: 0, max: 10, step: 0.01 },
        rotateSpeed:      { min: 0, max: 10, step: 0.1 },
        resolution:       { min: 16, max: 2056, step: 8 },
        scale:            { min: 0.3, max: 10, step: 0.1 },
        aspectRatio:      { min: 0.1, max: 5, step: 0.1 },
        rotation:         { min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
        domainSize:       { min: 0.1, max: 50.0, step: 0.1 },
        inputScale:       { min: -10.0, max: 10.0, step: 0.1 },
        outputAmp:        { min: -10.0, max: 10.0, step: 0.1 },
        shift:            { min: -50.0, max: 50.0, step: 0.1 },
        quatAngle:        { min: -Math.PI * 2, max: Math.PI * 2, step: 0.01 },
        quatAxis:         { min: -1.0, max: 1.0, step: 0.01 },
        topologyOptions:  ['triangle-list', 'line-list', 'point-list'],
    },
};
