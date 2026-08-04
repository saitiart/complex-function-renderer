import { GUI } from "dat.gui";
import { COMPLEX_FUNCTIONS_CONFIG, Params } from './config/complex-functions-config.ts';
import Stats from 'stats.js';

export interface GuiController {
  params: Params;
  resolutionChanged: boolean;
  topologyChanged: boolean;
  gui: GUI;
  stats: Stats;
}

export const functionList = {
    'z²':           { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'log(z)':       { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'sin(z)':       { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'tan(z)':       { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    '√z':           { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'sin(1/z)':     { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'exp(z)':       { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'z^z':          { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'exp(1/z)':     { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'z + 1/z':      { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'ζ(z)':         { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'ξ(z)':         { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'Γ(z)':         { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'J₁(z)':        { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'Airy(z)':      { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'Julia':        { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'Extra':        { x: [-1.0, 1.0], z: [-1.0, 1.0] },
    'Hopf':         { x: [-1.0, 1.0], z: [-1.0, 1.0] },
};

export const functionNames = Object.keys(functionList);

const functionMenu = {
    'z²': 0, 'log(z)': 1, 'sin(z)': 2, 'tan(z)': 3, '√z': 4,
    'sin(1/z)': 5, 'exp(z)': 6, 'z^z': 7, 'exp(1/z)': 8, 'z + 1/z': 9,
    'ζ(z)': 10, 'ξ(z)': 11, 'Γ(z)': 12, 'J₁(z)': 13, 'Airy(z)': 14,
    'Julia': 15, 'Extra': 16, 'Hopf': 17,
};

export function createComplexGuiController(containerSelector: string = '#gui'): GuiController {
  const gui = new GUI({autoPlace: false});
  document.querySelector(containerSelector)?.appendChild(gui.domElement);

    const params = { ...COMPLEX_FUNCTIONS_CONFIG.initialParams } as Params;
    
    const stats = new Stats();
    stats.showPanel(0);
    document.body.appendChild(stats.dom);

    const controller: GuiController = {
        params,
        resolutionChanged: false,
        topologyChanged: false,
        gui,
        stats,
    };

    const cfg = COMPLEX_FUNCTIONS_CONFIG.guiConfig;

    const main = gui.addFolder('Parameters');
    main.open();
  
    
    const resetAction = {
        reset: () => {
            const defaults = { ...COMPLEX_FUNCTIONS_CONFIG.initialParams };
            Object.assign(params, defaults);
            
            modeState.useQuaternion = false;
            projState.standardRiemannSphere = false;
            projState.hopfFibration = false;
            projState.dualRiemannSphere = false;
            
            quat.close();
            rot.open();
            controller.resolutionChanged = true;
            controller.topologyChanged = true;
            gui.updateDisplay();
        }
    };
    main.add(resetAction, 'reset').name('⟲ Reset All');
    

    params.funcSelection = 0;
    
    main.add(params, 'funcSelection', functionMenu)
        .name('Function')
        .onChange((index: number) => {
            const preset = Object.values(functionList)[index];
            if (preset) {
                params.domain_size_x = (preset.x[1] - preset.x[0]) / 2.0;
                params.domain_size_z = (preset.z[1] - preset.z[0]) / 2.0;
                params.shift_x = (preset.x[0] + preset.x[1]) / 2.0;
                params.shift_z = (preset.z[0] + preset.z[1]) / 2.0;
                gui.updateDisplay();
            }
        });

    main.add(params, 'animateSpeed', cfg.animateSpeed.min, cfg.animateSpeed.max, cfg.animateSpeed.step);
    main.add(params, 'rotateSpeed', cfg.rotateSpeed.min, cfg.rotateSpeed.max, cfg.rotateSpeed.step);
    main.add(params, 'resolution', cfg.resolution.min, cfg.resolution.max, cfg.resolution.step)
        .onChange(() => { controller.resolutionChanged = true; });

  
    const rot = gui.addFolder('4D Rotation (Euler)');
    rot.open();
    rot.add(params, 'rot_xw', cfg.rotation.min, cfg.rotation.max, cfg.rotation.step).name('X-W');
    rot.add(params, 'rot_yw', cfg.rotation.min, cfg.rotation.max, cfg.rotation.step).name('Y-W');
    rot.add(params, 'rot_zw', cfg.rotation.min, cfg.rotation.max, cfg.rotation.step).name('Z-W');
    

    const quat = gui.addFolder('4D Rotation (Quaternion)');

    const qa = cfg.quatAngle;
    const qx = cfg.quatAxis;

    quat.add(params, 'quat_angle_left', qa.min, qa.max, qa.step).name('Left Angle');

    const leftAxis = quat.addFolder('Left Axis');
    leftAxis.add(params.quat_axis_left, '0', qx.min, qx.max, qx.step).name('X');
    leftAxis.add(params.quat_axis_left, '1', qx.min, qx.max, qx.step).name('Y');
    leftAxis.add(params.quat_axis_left, '2', qx.min, qx.max, qx.step).name('Z');

    quat.add(params, 'quat_angle_right', qa.min, qa.max, qa.step).name('Right Angle');

    const rightAxis = quat.addFolder('Right Axis');
    rightAxis.add(params.quat_axis_right, '0', qx.min, qx.max, qx.step).name('X');
    rightAxis.add(params.quat_axis_right, '1', qx.min, qx.max, qx.step).name('Y');
    rightAxis.add(params.quat_axis_right, '2', qx.min, qx.max, qx.step).name('Z');

    // Toggle: show/hide the correct folder
    const rotMode = gui.addFolder('Rotation Mode');
    rotMode.open();
    const modeState = { useQuaternion: false };
    rotMode.add(modeState, 'useQuaternion').name('Use Quaternion Rotation')
        .onChange((v: boolean) => {
            params.use_quaternion_rotation = v ? 1.0 : 0.0;
            if (v) {
                rot.close();
                quat.open();
            } else {
                quat.close();
                rot.open();
            }
        });
  
    
    const input = gui.addFolder('Input Scale (Z)');
    input.add(params, 'scale_re', cfg.inputScale.min, cfg.inputScale.max, cfg.inputScale.step).name('Scale Real');
    input.add(params, 'scale_im', cfg.inputScale.min, cfg.inputScale.max, cfg.inputScale.step).name('Scale Imag');

    
    const output = gui.addFolder('Output Scale (F(z))');
    output.add(params, 'amp_re', cfg.outputAmp.min, cfg.outputAmp.max, cfg.outputAmp.step).name('Amp Real');
    output.add(params, 'amp_im', cfg.outputAmp.min, cfg.outputAmp.max, cfg.outputAmp.step).name('Amp Imag');

    
    const shift = gui.addFolder('Domain Shift');
    shift.add(params, 'shift_x', cfg.shift.min, cfg.shift.max, cfg.shift.step).name('Real Shift');
    shift.add(params, 'shift_z', cfg.shift.min, cfg.shift.max, cfg.shift.step).name('Imag Shift');

    
    const size = gui.addFolder('Domain Size');
    size.open();
    size.add(params, 'domain_size_x', cfg.domainSize.min, cfg.domainSize.max, cfg.domainSize.step).name('Size Re');
    size.add(params, 'domain_size_z', cfg.domainSize.min, cfg.domainSize.max, cfg.domainSize.step).name('Size Im');

    const proj = gui.addFolder('Projection Type');
    proj.open();

    const projState = { standardRiemannSphere: false, hopfFibration: false, dualRiemannSphere: false };

    proj.add(projState, 'standardRiemannSphere').name('Riemann')
        .onChange((v: boolean) => { params.use_riemann_sphere = v ? 1.0 : 0.0; });

    proj.add(projState, 'hopfFibration').name('Hopf Fibration (S³ → S²)')
        .onChange((v: boolean) => {
            params.use_hopf_projection = v ? 1.0 : 0.0;
            gui.updateDisplay();
        });
    
    proj.add(projState, 'dualRiemannSphere').name('(S²×S²)')
        .onChange((v: boolean) => {
            params.show_fibration = v ? 1.0 : 0.0;
        });
  
    const display = gui.addFolder('Display');
    display.open();

    display.add(params, 'showAxes').name('Show Axes');

    display.add(params, 'topology', COMPLEX_FUNCTIONS_CONFIG.guiConfig.topologyOptions)
        .name('Topology')
        .onChange(() => { controller.topologyChanged = true; });

  return controller;
}

export function getDomainForFunction(functionIndex: number): Domain | undefined {
    return COMPLEX_FUNCTIONS_CONFIG.functionDomains[Math.floor(functionIndex)];
}

export function resetTopologyFlag(controller: GuiController) {
    controller.topologyChanged = false;
}

export function resetResolutionFlag(controller: GuiController) {
    controller.resolutionChanged = false;
}