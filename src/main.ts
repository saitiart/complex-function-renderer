import { mat4 } from 'gl-matrix';
import { createRenderPipeline } from './engine/render/render/createRenderPipeline.ts';
import { createComputeSurfacePipeline, createComputeIndexPipeline } from './engine/render/compute/compute-pipelines.ts';
import { createAxesPipeline } from './engine/render/axes-pipeline.ts';
import { createInteractiveCamera } from './engine/cameras/cameras.ts';
import { createComplexGuiController, functionList, resetResolutionFlag, resetTopologyFlag } from './engine/gui/complex-gui-controller.ts';
import { COMPLEX_FUNCTIONS_CONFIG } from './engine/gui/config/complex-functions-config.ts';
import { buildParamsArray } from './engine/uniforms/params-writer.ts';
import { draw } from './engine/render/render/renderer.ts';

const MSAA_COUNT = 4;

async function initDevice(): Promise<{ device: GPUDevice; context: GPUCanvasContext; canvas: HTMLCanvasElement; format: GPUTextureFormat }> {
    const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement;
    if (!navigator.gpu) throw new Error('WebGPU not supported');

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No GPUAdapter found');

    const maxSize = 1024 * 1024 * 6 * 32;
    const device = await adapter.requestDevice({
        requiredLimits: {
            maxStorageBufferBindingSize: maxSize,
            maxBufferSize: maxSize,
        },
    });

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;

    const context = canvas.getContext('webgpu')!;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });

    return { device, context, canvas, format };
}

// VRAM usage
function estimateVRAM(resolution: number, msaaCount: number, canvasWidth: number, canvasHeight: number): string {
    const numVertices = resolution * resolution;
    const numIndices = 6 * (resolution - 1) * (resolution - 1);

    // Estimate based on standard buffer sizes (adjust these to match your actual WGSL structs)
    const positionBuffer = numVertices * 16; // vec4<f32>
    const normalBuffer = numVertices * 16;   // vec4<f32>
    const colorBuffer = numVertices * 16;    // vec4<f32>
    const indexBuffer = numIndices * 4;      // u32

    // Texture estimations (RGBA8 + Depth32)
    const renderTargets = canvasWidth * canvasHeight * 4 * msaaCount;
    const depthTargets = canvasWidth * canvasHeight * 4 * msaaCount;

    const totalBytes = positionBuffer + normalBuffer + colorBuffer + indexBuffer + renderTargets + depthTargets;
    return (totalBytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function run() {
    const { device, context, canvas, format } = await initDevice();
    const gui = createComplexGuiController();

    let resolution = gui.params.resolution;
    let numTriangles = 6 * (resolution - 1) * (resolution - 1);

    let renderRes = await createRenderPipeline(device, canvas, format, MSAA_COUNT, 'triangle-list');
    let surfaceRes = await createComputeSurfacePipeline(device, resolution);
    let indexRes   = await createComputeIndexPipeline(device, resolution);
    let axesRes    = await createAxesPipeline(device, format, MSAA_COUNT, surfaceRes.paramsBuffer);

    const camera = createInteractiveCamera(canvas);
    const modelMat = mat4.create();

    // Performance Tracking State
    const startTime = performance.now();
    let lastFpsTime = startTime;
    let frameCount = 0;

    // Add custom readouts to your GUI
    const perfData = {
        fps: 0,
        vertices: resolution * resolution, // Add this line
        estimatedVRAM: estimateVRAM(resolution, MSAA_COUNT, canvas.width, canvas.height)
    };

    const perfFolder = gui.gui.addFolder('Performance Metrics');
    perfFolder.add(perfData, 'fps').name('FPS').listen();
    perfFolder.add(perfData, 'vertices').name('Vertices').listen(); // Add this line
    perfFolder.add(perfData, 'estimatedVRAM').name('Est. VRAM').listen();
    perfFolder.open();


    const frame = async () => {
      if (gui.resolutionChanged) {
            resolution = gui.params.resolution;
            numTriangles = 6 * (resolution - 1) * (resolution - 1);

            surfaceRes = await createComputeSurfacePipeline(device, resolution);
            indexRes   = await createComputeIndexPipeline(device, resolution);
            axesRes    = await createAxesPipeline(device, format, MSAA_COUNT, surfaceRes.paramsBuffer);
            resetResolutionFlag(gui);

            // Update metrics on resolution change
            perfData.vertices = resolution * resolution; // Add this line
            perfData.estimatedVRAM = estimateVRAM(resolution, MSAA_COUNT, canvas.width, canvas.height);

            requestAnimationFrame(frame);
            return;
        }

        if (gui.topologyChanged) {
            renderRes = await createRenderPipeline(device, canvas, format, MSAA_COUNT, gui.params.topology);
            resetTopologyFlag(gui);

            requestAnimationFrame(frame);
            return;
        }

        gui.stats.begin();
        camera.tick();

        const currentTime = performance.now();
        const dt = (currentTime - startTime) / 1000;

        // FPS Calculation
        frameCount++;
        if (currentTime - lastFpsTime >= 1000) {
            perfData.fps = frameCount;
            frameCount = 0;
            lastFpsTime = currentTime;
        }

        const speed = gui.params.rotateSpeed;

        // 3D model rotation
        mat4.identity(modelMat);
        mat4.rotateX(modelMat, modelMat, Math.sin(dt * speed));
        mat4.rotateY(modelMat, modelMat, Math.cos(dt * speed));
        mat4.rotateY(modelMat, modelMat, Math.PI / 1.49);

        const domain = COMPLEX_FUNCTIONS_CONFIG.functionDomains[Math.floor(gui.params.funcSelection)];
        const domainCenter: [number, number] = [
            (domain.x[0] + domain.x[1]) / 2,
            (domain.z[0] + domain.z[1]) / 2,
        ];

        const autoRot = {
            xw: dt * speed * 0.8,
            yw: dt * speed * 0.5,
            zw: dt * speed * 0.3,
        };

        const paramsData = buildParamsArray(gui.params, resolution, dt * gui.params.animateSpeed, domainCenter, autoRot);
        device.queue.writeBuffer(surfaceRes.paramsBuffer, 0, paramsData);

        // Compute pass
        const encoder = device.createCommandEncoder();
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(surfaceRes.pipeline);
        computePass.setBindGroup(0, surfaceRes.bindGroup);
        computePass.dispatchWorkgroups(Math.ceil(resolution / 8), Math.ceil(resolution / 8));
        computePass.end();
        device.queue.submit([encoder.finish()]);

        draw({
            device, context, renderRes, surfaceRes, indexRes,
            axesRes, camera, modelMat, numTriangles,
            showAxes: gui.params.showAxes,
            useQuaternion: gui.params.use_quaternion_rotation > 0.5,
            quatAxisLeft: gui.params.quat_axis_left,
            quatAxisRight: gui.params.quat_axis_right,
        });

        gui.stats.end();
        requestAnimationFrame(frame);
    };

    frame();
}

run();
