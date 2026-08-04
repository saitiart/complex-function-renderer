import { mat4 } from 'gl-matrix';
import { GUI } from 'dat.gui';
import camera from '3d-view-controls';
import Stats from 'stats.js';

import meshShader from './mesh-shader.wgsl';
import csEvaluatorShader from './evaluator-better.wgsl';
import csSimplexMarch from './hypercube-march.wgsl';
import csOccupancy from './occupancy.wgsl';
import complexFunctions from '../engine/render/compute/complex-func.wgsl';


const BLOCK = 4;

async function run() {
    const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement;
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice({
        requiredLimits: {
            maxStorageBufferBindingSize: 1024 * 1024 * 1024,
            maxBufferSize: 1024 * 1024 * 1024,
            maxComputeInvocationsPerWorkgroup: 512,
        }
    });

    const context = canvas.getContext('webgpu') as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    context.configure({ device, format, alphaMode: 'opaque' });

    
    const surfaceMap = {
        'ellipticCurve': 0, 'genus2Curve': 1, 'unitCircle': 2, 'hyperblobs': 3,
        'sqrtSurface': 4, 'hypergyroid': 5, 'tesseract': 6, 'fermatCurve': 7, 'logSurface': 8,
    };

    const params = {
        rotationSpeed: 1, animateSpeed: 0, surfaceType: 'genus2Curve',
        resolution: 48, isolevel: 0.1, rot_xw: 0, rot_yw: 0, rot_zw: 0,
    };

    const startTime = performance.now();

    
    const gui = new GUI();
    document.querySelector('#gui')?.appendChild(gui.domElement);
    gui.add(params, 'surfaceType', Object.keys(surfaceMap));
    gui.add(params, 'animateSpeed', 0, 5, 0.1);
    gui.add(params, 'rotationSpeed', 0, 5, 0.1);

    let resolutionChanged = false;
    const folder = gui.addFolder('Surface Parameters');
    folder.add(params, 'resolution', 8, 120, 2).onChange(() => resolutionChanged = true);
    folder.add(params, 'isolevel', 0, 1, 0.01);
    folder.open();

    const rot4dFolder = gui.addFolder('4D Manifold Rotations');
    rot4dFolder.add(params, 'rot_xw', 0, Math.PI * 2, 0.01).name('X-W Rotation');
    rot4dFolder.add(params, 'rot_yw', 0, Math.PI * 2, 0.01).name('Y-W Rotation');
    rot4dFolder.add(params, 'rot_zw', 0, Math.PI * 2, 0.01).name('Z-W Rotation');
    rot4dFolder.open();

    const stats = new Stats();
    stats.showPanel(0);
    document.body.appendChild(stats.dom);

    const interactiveCamera = camera(canvas, { eye: [2, 2, 5], center: [0, 0, 0], up: [0, 1, 0] });

    
    const evalBGL = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
            { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        ]
    });
    const evalPL = device.createPipelineLayout({ bindGroupLayouts: [evalBGL] });
    const evalModule = device.createShaderModule({ code: complexFunctions + csEvaluatorShader });

    const evalPipelines = new Map<number, GPUComputePipeline>();
    function getEvalPipeline(surface: number): GPUComputePipeline {
        let p = evalPipelines.get(surface);
        if (!p) {
            p = device.createComputePipeline({
                layout: evalPL,
                compute: { module: evalModule, entryPoint: 'cs_main', constants: { SURFACE: surface } }
            });
            evalPipelines.set(surface, p);
        }
        return p;
    }
    for (const s of Object.values(surfaceMap)) {
        device.createComputePipelineAsync({
            layout: evalPL,
            compute: { module: evalModule, entryPoint: 'cs_main', constants: { SURFACE: s } }
        }).then(p => { if (!evalPipelines.has(s)) evalPipelines.set(s, p); })
          .catch(e => console.error(`[eval pipeline ${s}]`, e));
    }

    
    const occModule = device.createShaderModule({ code: csOccupancy });

    const occPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: occModule, entryPoint: 'occupancy_main', constants: { BLOCK } }
    });
    const argsPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: occModule, entryPoint: 'build_args_main' }
    });

    const marchPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
            module: device.createShaderModule({ code: complexFunctions + csSimplexMarch }),
            entryPoint: 'cs_main',
            constants: { BLOCK }
        }
    });

    const meshPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: device.createShaderModule({ code: meshShader }),
            entryPoint: 'vs_main',
            buffers: [
                { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }, // pos
                { arrayStride: 16, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x4' }] }, // color
            ],
        },
        fragment: {
            module: device.createShaderModule({ code: meshShader }),
            entryPoint: 'fs_main',
            targets: [{ format }]
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: {
            format: 'depth24plus',
            depthWriteEnabled: true,
            depthCompare: 'less',
            depthBias: 1,
            depthBiasSlopeScale: 1,
        },
        multisample: { count: 4 },
    });

    
    const ipsBuffer = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const compFloatBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const mvpUniformBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const indirectBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST
    });
    const counterBuffer = device.createBuffer({
        size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });

    // Active-block count, and the dispatch args the march is launched with.
    const blockCountBuffer = device.createBuffer({
        size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    const dispatchArgsBuffer = device.createBuffer({
        size: 16, // x, y, z, activeCount
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST
    });

    const renderBG = device.createBindGroup({
        layout: meshPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: mvpUniformBuffer } }]
    });

    
    let resolution = params.resolution;
    let maxVerts = 0;
    let numBlocks = 0;
    let nb = 0;
    let fieldBuffer: GPUBuffer, posBuffer: GPUBuffer, colBuffer: GPUBuffer, blockListBuffer: GPUBuffer;
    let evalBG: GPUBindGroup, occBG: GPUBindGroup, argsBG: GPUBindGroup, marchBG: GPUBindGroup;

    function createDynamicResources() {
        device.pushErrorScope('validation');

        resolution = params.resolution;
        const cells = resolution - 1;
        maxVerts = Math.min(cells ** 4 * 24 * 2 * 3, 65_000_000);

        nb = Math.ceil(cells / BLOCK);
        numBlocks = nb ** 4;

        fieldBuffer?.destroy();
        posBuffer?.destroy();
        colBuffer?.destroy();
        blockListBuffer?.destroy();

        const fieldSize = resolution ** 4 * 4;
        if (fieldSize > device.limits.maxStorageBufferBindingSize) {
            console.warn(`Field buffer ${(fieldSize / 1024 / 1024).toFixed(0)} MB exceeds max binding size.`);
        }

        fieldBuffer = device.createBuffer({
            size: fieldSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });

        posBuffer = device.createBuffer({ size: maxVerts * 12, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX });
        colBuffer = device.createBuffer({ size: maxVerts * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX });

     
        blockListBuffer = device.createBuffer({
            size: numBlocks * 4, usage: GPUBufferUsage.STORAGE
        });

        const memMB = (fieldSize + maxVerts * 28 + numBlocks * 4) / (1024 * 1024);
        console.log(`[Memory] res=${resolution}  buffers ≈ ${memMB.toFixed(1)} MB  (maxVerts=${maxVerts.toLocaleString()}, blocks=${numBlocks.toLocaleString()})`);

        evalBG = device.createBindGroup({
            layout: evalBGL,
            entries: [
                { binding: 0, resource: { buffer: ipsBuffer } },
                { binding: 1, resource: { buffer: compFloatBuffer } },
                { binding: 2, resource: { buffer: fieldBuffer } },
            ]
        });

        occBG = device.createBindGroup({
            layout: occPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: fieldBuffer } },
                { binding: 1, resource: { buffer: blockListBuffer } },
                { binding: 2, resource: { buffer: blockCountBuffer } },
                { binding: 3, resource: { buffer: ipsBuffer } },
                { binding: 4, resource: { buffer: compFloatBuffer } },
            ]
        });

        argsBG = device.createBindGroup({
            layout: argsPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 1, resource: { buffer: blockListBuffer } },
                { binding: 2, resource: { buffer: blockCountBuffer } },
                { binding: 5, resource: { buffer: dispatchArgsBuffer } },
            ]
        });

        marchBG = device.createBindGroup({
            layout: marchPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: fieldBuffer } },
                { binding: 1, resource: { buffer: posBuffer } },
                { binding: 2, resource: { buffer: colBuffer } },
                { binding: 4, resource: { buffer: counterBuffer } },
                { binding: 5, resource: { buffer: ipsBuffer } },
                { binding: 6, resource: { buffer: compFloatBuffer } },
                { binding: 7, resource: { buffer: blockListBuffer } },
                { binding: 8, resource: { buffer: dispatchArgsBuffer } },
            ]
        });

        device.popErrorScope().then(e => { if (e) console.error('[GPU validation]', e.message); });
    }
    createDynamicResources();

    
    const msaaTexture = device.createTexture({ size: [canvas.width, canvas.height], sampleCount: 4, format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const depthTexture = device.createTexture({ size: [canvas.width, canvas.height], sampleCount: 4, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });

    
    const countStaging = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const blockStaging = device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    let countBusy = false;
    let lastCountFrame = 0;

    
    const aspect = canvas.width / canvas.height;
    const pMat = mat4.perspective(mat4.create(), Math.PI / 4, aspect, 0.1, 100);
    const mMat = mat4.create();

    const indirectInit = new Uint32Array([0, 1, 0, 0]);
    const zero = new Uint32Array([0]);
    let frameCount = 0;

    function frame() {
        if (resolutionChanged) { createDynamicResources(); resolutionChanged = false; }

        stats.begin();
        interactiveCamera.tick();
        const currentTime = (performance.now() - startTime) / 1000;

        const mvpMat = mat4.multiply(mat4.create(), pMat, interactiveCamera.matrix);
        mat4.identity(mMat);
        mat4.rotateX(mMat, mMat, Math.sin(currentTime * params.rotationSpeed));
        mat4.rotateY(mMat, mMat, Math.cos(currentTime * params.rotationSpeed));
        mat4.multiply(mvpMat, mvpMat, mMat);
        device.queue.writeBuffer(mvpUniformBuffer, 0, mvpMat as Float32Array);

        const surface = surfaceMap[params.surfaceType];

        device.queue.writeBuffer(ipsBuffer, 0, new Uint32Array([resolution, surface, 0, 0]));
        device.queue.writeBuffer(compFloatBuffer, 0, new Float32Array([
            params.isolevel, 0.01, currentTime * params.animateSpeed,
            params.rot_xw, params.rot_yw, params.rot_zw, 0, 0
        ]));

        device.queue.writeBuffer(counterBuffer, 0, zero);
        device.queue.writeBuffer(blockCountBuffer, 0, zero);
        device.queue.writeBuffer(indirectBuffer, 0, indirectInit);

        const encoder = device.createCommandEncoder();
        const cPass = encoder.beginComputePass();

        // Eval
        const wgXY_eval = Math.ceil(resolution / 4);
        const wgZ_eval = Math.ceil(resolution / 4);
        cPass.setPipeline(getEvalPipeline(surface));
        cPass.setBindGroup(0, evalBG);
        cPass.dispatchWorkgroups(wgXY_eval, wgXY_eval, wgZ_eval);

        // Cull
        cPass.setPipeline(occPipeline);
        cPass.setBindGroup(0, occBG);
        cPass.dispatchWorkgroups(nb, nb, nb * nb);

        // Active blocks
        cPass.setPipeline(argsPipeline);
        cPass.setBindGroup(0, argsBG);
        cPass.dispatchWorkgroups(1);

        // March
        cPass.setPipeline(marchPipeline);
        cPass.setBindGroup(0, marchBG);
        cPass.dispatchWorkgroupsIndirect(dispatchArgsBuffer, 0);

        cPass.end();

        encoder.copyBufferToBuffer(counterBuffer, 0, indirectBuffer, 0, 4);

        const doCount = (frameCount - lastCountFrame) >= 60 && !countBusy;
        if (doCount) {
            encoder.copyBufferToBuffer(counterBuffer, 0, countStaging, 0, 4);
            encoder.copyBufferToBuffer(blockCountBuffer, 0, blockStaging, 0, 4);
        }

        const rPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: msaaTexture.createView(),
                resolveTarget: context.getCurrentTexture().createView(),
                clearValue: { r: 1, g: 1, b: 1, a: 1 },
                loadOp: 'clear', storeOp: 'store'
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store'
            }
        });
        rPass.setPipeline(meshPipeline);
        rPass.setBindGroup(0, renderBG);
        rPass.setVertexBuffer(0, posBuffer);
        rPass.setVertexBuffer(1, colBuffer);
        rPass.drawIndirect(indirectBuffer, 0);
        rPass.end();

        device.queue.submit([encoder.finish()]);

        if (doCount) {
            countBusy = true;
            lastCountFrame = frameCount;
            Promise.all([
                countStaging.mapAsync(GPUMapMode.READ),
                blockStaging.mapAsync(GPUMapMode.READ),
            ]).then(() => {
                const verts = new Uint32Array(countStaging.getMappedRange())[0];
                const blocks = new Uint32Array(blockStaging.getMappedRange())[0];
                const pct = Math.round(verts / maxVerts * 100);
                const bpct = (blocks / numBlocks * 100).toFixed(1);
                console.log(
                    `Tris: ${(verts / 3).toLocaleString()}  Verts: ${verts.toLocaleString()} / ${maxVerts.toLocaleString()} (${pct}%)  ` +
                    `Blocks: ${blocks.toLocaleString()} / ${numBlocks.toLocaleString()} (${bpct}%)`
                );
                if (verts >= maxVerts * 0.95) console.warn('Vertex buffer near full — triangles being clipped.');
                countStaging.unmap();
                blockStaging.unmap();
                countBusy = false;
            }).catch(() => { countBusy = false; });
        }

        frameCount++;
        stats.end();
        requestAnimationFrame(frame);
    }

    frame();
}

run();