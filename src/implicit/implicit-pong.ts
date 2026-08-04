import { mat4 } from 'gl-matrix';
import { GUI } from 'dat.gui';
import camera from '3d-view-controls';
import Stats from 'stats.js';
import csColormapShader from './implicit-color.wgsl';
import csMarchingShader from './marching-pong.wgsl';
import csEvaluatorShader from './evaluator-pong.wgsl';
import unlitShader from './shader-implicit.wgsl';
import complexFunctions from '../engine/render/compute/complex-func.wgsl';

async function run() {
    const canvas = document.getElementById('canvas-webgpu') as HTMLCanvasElement;
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice({
        requiredLimits: {
            maxStorageBufferBindingSize: 1024 * 1024 * 1024,
            maxBufferSize: 1024 * 1024 * 1024,
            maxComputeInvocationsPerWorkgroup: 512
        }
    });

    const context = canvas.getContext('webgpu') as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    context.configure({ device, format, alphaMode: 'opaque' });

    const MODE: 'pingpong' | 'direct' = 'pingpong';

    const surfaceMap = {
        'ellipticCurve': 0, 'genus2Curve': 1, 'unitCircle': 2, 'hyperblobs': 3,
        'sqrtSurface': 4, 'hypergyroid': 5, 'tesseract': 6, 'fermatCurve': 7, 'logSurface': 8,
    };

    const params = {
        rotationSpeed: 1, animateSpeed: 1, surfaceType: 'ellipticCurve',
        resolution: 48, isolevel: 0.1, rot_xw: 0, rot_yw: 0, rot_zw: 0,
    };

    let resolution = params.resolution;
    let surfaceType = 0;
    let maxVertices = 0;
    let resolutionChanged = false;
    let frameCount = 0;

    let totalGPUMemoryMB = 0;
    let lastFPSCheckTime = performance.now();
    let framesSinceLastCheck = 0;
    let currentFPS = 60; // Fallback

    
    const gui = new GUI();
    document.querySelector('#gui')?.appendChild(gui.domElement);
    gui.add(params, 'surfaceType', Object.keys(surfaceMap)).onChange(() => {
        surfaceType = surfaceMap[params.surfaceType];
    });
    gui.add(params, 'animateSpeed', 0, 5, 0.1);
    gui.add(params, 'rotationSpeed', 0, 5, 0.1);

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

    // Edge Mask Table
    const edgeMaskTable = new Uint32Array(65536);
    const edges = [
        [0,1], [1,3], [2,3], [0,2], [4,5], [5,7], [6,7], [4,6],
        [0,4], [1,5], [2,6], [3,7], [8,9], [9,11], [10,11], [8,10],
        [12,13], [13,15], [14,15], [12,14], [8,12], [9,13], [10,14], [11,15],
        [0,8], [1,9], [2,10], [3,11], [4,12], [5,13], [6,14], [7,15]
    ];
    for (let state = 0; state < 65536; state++) {
        let mask = 0;
        for (let e = 0; e < 32; e++) {
            const inside1 = (state & (1 << edges[e][0])) !== 0;
            const inside2 = (state & (1 << edges[e][1])) !== 0;
            if (inside1 !== inside2) mask |= (1 << e);
        }
        edgeMaskTable[state] = mask;
    }

    // Pipelines 
    const renderPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: device.createShaderModule({ code: unlitShader }),
            entryPoint: 'vs_main',
            buffers: [
                { arrayStride: 8, stepMode: 'vertex', attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] },
                { arrayStride: 12, stepMode: 'instance', attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }] },
                { arrayStride: 16, stepMode: 'instance', attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x4' }] },
            ],
        },
        fragment: {
            module: device.createShaderModule({ code: unlitShader }),
            entryPoint: 'fs_main',
            targets: [{
                format,
                blend: {
                    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                }
            }],
        },
        primitive: { topology: 'triangle-strip', cullMode: 'none' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
        multisample: { count: 4 }
    });

    const evalPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: device.createShaderModule({ code: complexFunctions + csEvaluatorShader }), entryPoint: 'cs_main' }
    });

    const marchingPipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: device.createShaderModule({ code: csColormapShader + complexFunctions + csMarchingShader }), entryPoint: 'cs_main' }
    });

    // Static Buffers 
    const tableBuffer = device.createBuffer({ size: edgeMaskTable.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(tableBuffer, 0, edgeMaskTable);

    const mvpUniformBuffer = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const compFloatBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const indirectBuffer = device.createBuffer({
        size: 24,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_SRC
    });

    const quadVertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const quadBuffer = device.createBuffer({ size: quadVertices.byteLength, usage: GPUBufferUsage.VERTEX, mappedAtCreation: true });
    new Float32Array(quadBuffer.getMappedRange()).set(quadVertices);
    quadBuffer.unmap();

    // Dynamic Resources 
    let posBuffer: GPUBuffer, colBuffer: GPUBuffer, sliceBufferA: GPUBuffer, sliceBufferB: GPUBuffer;
    let fieldBuffer: GPUBuffer;
    let ipsBuffers: GPUBuffer[] = [];
    let evalBGs_A: GPUBindGroup[] = [], evalBGs_B: GPUBindGroup[] = [];
    let marchBGs_A: GPUBindGroup[] = [], marchBGs_B: GPUBindGroup[] = [];
    let evalBGs_D: GPUBindGroup[] = [], marchBGs_D: GPUBindGroup[] = [];
    let renderBG: GPUBindGroup;

    
  
    const createDynamicResources = () => {
        resolution = params.resolution;
        maxVertices = Math.min(resolution ** 3 * (resolution - 1) * 2, 10_500_000);
    
        if (posBuffer) {
            [posBuffer, colBuffer, sliceBufferA, sliceBufferB,
             fieldBuffer, ...ipsBuffers].forEach(b => b?.destroy());
            ipsBuffers = [];
            evalBGs_A = []; evalBGs_B = []; marchBGs_A = []; marchBGs_B = [];
            evalBGs_D = []; marchBGs_D = [];
        }
    
        posBuffer = device.createBuffer({ size: maxVertices * 12, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX });
        colBuffer = device.createBuffer({ size: maxVertices * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX });
    
        const sliceSize = resolution * resolution * resolution * 4;
        const sliceStride = Math.ceil(sliceSize / 256) * 256;
    
        let sliceMem: number;
        if (MODE === 'pingpong') {
            sliceBufferA = device.createBuffer({ size: sliceSize, usage: GPUBufferUsage.STORAGE });
            sliceBufferB = device.createBuffer({ size: sliceSize, usage: GPUBufferUsage.STORAGE });
            sliceMem = sliceSize * 2;
        } else {
            
            fieldBuffer = device.createBuffer({ size: sliceStride * resolution, usage: GPUBufferUsage.STORAGE });
            sliceMem = sliceStride * resolution;
        }
    
        const staticBufferMem = 256 * 1024;
        const dynamicBufferMem = (maxVertices * 12) + (maxVertices * 16) + sliceMem + (resolution * 32);
        totalGPUMemoryMB = (staticBufferMem + dynamicBufferMem) / (1024 * 1024);
        console.log(`[Memory Estimate] mode=${MODE} Allocated Buffers: ${totalGPUMemoryMB.toFixed(2)} MB`);
    
        renderBG = device.createBindGroup({
            layout: renderPipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer: mvpUniformBuffer } }]
        });
    
        for (let w = 0; w < resolution; w++) {
            ipsBuffers.push(device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
        }
    
        
        const layer = (w: number): GPUBufferBinding =>
            MODE === 'pingpong'
                ? { buffer: (w % 2 === 0) ? sliceBufferA : sliceBufferB }
                : { buffer: fieldBuffer, offset: w * sliceStride, size: sliceSize };
    
        for (let w = 0; w < resolution; w++) {
            const buffer = ipsBuffers[w];
    
            const evalEntries = (slice: GPUBufferBinding) => [
                { binding: 0, resource: { buffer } },
                { binding: 1, resource: { buffer: compFloatBuffer } },
                { binding: 2, resource: slice }
            ];
    
            const marchEntries = (bottom: GPUBufferBinding, top: GPUBufferBinding) => [
                { binding: 0, resource: { buffer: tableBuffer } },
                { binding: 2, resource: { buffer: posBuffer } },
                { binding: 3, resource: { buffer: colBuffer } },
                { binding: 5, resource: { buffer: indirectBuffer } },
                { binding: 6, resource: { buffer } },
                { binding: 7, resource: { buffer: compFloatBuffer } },
                { binding: 8, resource: bottom },
                { binding: 9, resource: top }
            ];
    
            if (MODE === 'pingpong') {
                evalBGs_A.push(device.createBindGroup({ layout: evalPipeline.getBindGroupLayout(0), entries: evalEntries({ buffer: sliceBufferA }) }));
                evalBGs_B.push(device.createBindGroup({ layout: evalPipeline.getBindGroupLayout(0), entries: evalEntries({ buffer: sliceBufferB }) }));
                marchBGs_A.push(device.createBindGroup({ layout: marchingPipeline.getBindGroupLayout(0), entries: marchEntries({ buffer: sliceBufferA }, { buffer: sliceBufferB }) }));
                marchBGs_B.push(device.createBindGroup({ layout: marchingPipeline.getBindGroupLayout(0), entries: marchEntries({ buffer: sliceBufferB }, { buffer: sliceBufferA }) }));
            } else {
                evalBGs_D.push(device.createBindGroup({
                    layout: evalPipeline.getBindGroupLayout(0),
                    entries: evalEntries(layer(w))
                }));
                marchBGs_D.push(device.createBindGroup({
                    layout: marchingPipeline.getBindGroupLayout(0),
                    entries: marchEntries(layer(w), layer(Math.min(w + 1, resolution - 1)))
                }));
            }
        }
    };

    createDynamicResources();

    
    const msaaTexture = device.createTexture({ size: [canvas.width, canvas.height], sampleCount: 4, format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const depthTexture = device.createTexture({ size: [canvas.width, canvas.height], sampleCount: 4, format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });

    
    const stagingBuffers = [
        device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
        device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
    ];
    const stagingBusy = [false, false];

    const startTime = performance.now();
    const aspect = canvas.width / canvas.height;
    const pMat = mat4.perspective(mat4.create(), Math.PI / 4, aspect, 0.1, 100);
    const mMat = mat4.create();

    
    function frame() {
        if (resolutionChanged) {
            createDynamicResources();
            resolutionChanged = false;
        }

        stats.begin();
        interactiveCamera.tick();

        // Perf
        framesSinceLastCheck++;
        const now = performance.now();
        const elapsedSec = (now - lastFPSCheckTime) / 1000;
        
        if (elapsedSec >= 1.0) {
            currentFPS = framesSinceLastCheck / elapsedSec;
            framesSinceLastCheck = 0;
            lastFPSCheckTime = now;
        }

        const currentTime = (performance.now() - startTime) / 1000;

        const mvpMat = mat4.multiply(mat4.create(), pMat, interactiveCamera.matrix);
        mat4.identity(mMat);
        mat4.rotateX(mMat, mMat, Math.sin(currentTime * params.rotationSpeed));
        mat4.rotateY(mMat, mMat, Math.cos(currentTime * params.rotationSpeed));
        mat4.multiply(mvpMat, mvpMat, mMat);

        device.queue.writeBuffer(mvpUniformBuffer, 0, mvpMat as Float32Array);
        device.queue.writeBuffer(compFloatBuffer, 0, new Float32Array([
            params.isolevel, 1.0, currentTime * params.animateSpeed,
            params.rot_xw, params.rot_yw, params.rot_zw, 0, 0
        ]));
        device.queue.writeBuffer(indirectBuffer, 0, new Uint32Array([6, 0, 0, 0]));

        for (let w = 0; w < resolution; w++) {
            device.queue.writeBuffer(ipsBuffers[w], 0, new Uint32Array([resolution, surfaceType, w, 0]));
        }

        const encoder = device.createCommandEncoder();
        const workgroups = Math.ceil(resolution / 4);

        const cPass = encoder.beginComputePass();
        
        if (MODE === 'direct') {
            
            for (let w = 0; w < resolution; w++) {
                cPass.setPipeline(evalPipeline);
                cPass.setBindGroup(0, evalBGs_D[w]);
                cPass.dispatchWorkgroups(workgroups, workgroups, workgroups);
            }
            for (let w = 0; w < resolution - 1; w++) {
                cPass.setPipeline(marchingPipeline);
                cPass.setBindGroup(0, marchBGs_D[w]);
                cPass.dispatchWorkgroups(workgroups, workgroups, workgroups);
            }
        } else {
            cPass.setPipeline(evalPipeline);
            cPass.setBindGroup(0, evalBGs_A[0]);
            cPass.dispatchWorkgroups(workgroups, workgroups, workgroups);
        
            for (let w = 0; w < resolution - 1; w++) {
                const isEven = w % 2 === 0;
        
                cPass.setPipeline(evalPipeline);
                cPass.setBindGroup(0, isEven ? evalBGs_B[w + 1] : evalBGs_A[w + 1]);
                cPass.dispatchWorkgroups(workgroups, workgroups, workgroups);
        
                cPass.setPipeline(marchingPipeline);
                cPass.setBindGroup(0, isEven ? marchBGs_A[w] : marchBGs_B[w]);
                cPass.dispatchWorkgroups(workgroups, workgroups, workgroups);
            }
        }
        
        cPass.end();

        
        const rPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: msaaTexture.createView(),
                resolveTarget: context.getCurrentTexture().createView(),
                clearValue: { r: 1, g: 1, b: 1, a: 1 },
                loadOp: 'clear', storeOp: 'store'
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear', depthStoreOp: 'store'
            }
        });

        rPass.setPipeline(renderPipeline);
        rPass.setBindGroup(0, renderBG);
        rPass.setVertexBuffer(0, quadBuffer);
        rPass.setVertexBuffer(1, posBuffer);
        rPass.setVertexBuffer(2, colBuffer);
        rPass.drawIndirect(indirectBuffer, 0);
        rPass.end();

        device.queue.submit([encoder.finish()]);

        // Logging
        if (frameCount % 60 === 0) {
            const slot = (frameCount / 60) % 2;
            if (!stagingBusy[slot]) {
                stagingBusy[slot] = true;
                const staging = stagingBuffers[slot];
                const readEncoder = device.createCommandEncoder();
                readEncoder.copyBufferToBuffer(indirectBuffer, 0, staging, 0, 16);
                device.queue.submit([readEncoder.finish()]);
                
                staging.mapAsync(GPUMapMode.READ).then(() => {
                    const count = new Uint32Array(staging.getMappedRange())[1]
                    
                    if (count > 0) {
                        const fpsPerMillionVerts = currentFPS / (count / 1_000_000);
                        const vertsPerSecond = currentFPS * count;

                        console.log(
                            `--- Perf Report ---\n` +
                            `Vertices: ${count.toLocaleString()} / ${maxVertices.toLocaleString()} (${Math.round(count / maxVertices * 100)}%)\n` +
                            `VRAM Usage: ${totalGPUMemoryMB.toFixed(2)} MB\n` +
                            `Current FPS: ${currentFPS.toFixed(1)}\n` +
                            `FPS per 1M Vertices: ${fpsPerMillionVerts.toFixed(2)}\n` +
                            `Throughput: ${(vertsPerSecond / 1_000_000).toFixed(2)} Million Verts/Sec\n` +
                            `-------------------`
                        );
                    } else {
                        console.log(`Vertices: 0. VRAM: ${totalGPUMemoryMB.toFixed(2)} MB`);
                    }

                    if (count >= maxVertices * 0.9) console.warn('Buffer near full — geometry is being clipped!');
                    
                    staging.unmap();
                    stagingBusy[slot] = false;
                });
            }
        }

        frameCount++;
        requestAnimationFrame(frame);
        stats.end();
    }

    frame();
}

run();