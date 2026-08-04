import shader from './shader-basic.wgsl';
import { createFrameTextures, createUniformBuffer, FrameTextures } from './frameTextures.ts';

export type Topology = 'triangle-list' | 'line-list' | 'point-list';

export interface RenderPipelineResources {
    pipeline: GPURenderPipeline;
    mvpUniformBuffer: GPUBuffer;
    uniformBindGroup: GPUBindGroup;
    textures: FrameTextures;
    topology: Topology;
}

const POSITION_OFFSET = 0;
const COLOR_OFFSET = 16;  // vec3f + 4 bytes padding
const VERTEX_STRIDE = 32; // vec3f(12) + pad(4) + vec4f(16)

export async function createRenderPipeline(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    canvasFormat: GPUTextureFormat,
    msaaCount: number,
    topology: Topology = 'point-list'
): Promise<RenderPipelineResources> {
    const shaderModule = device.createShaderModule({ code: shader });

    const pipeline = await device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: {
            module: shaderModule,
            entryPoint: 'vs_main',
            buffers: [{
                arrayStride: VERTEX_STRIDE,
                attributes: [
                    { shaderLocation: 0, offset: POSITION_OFFSET, format: 'float32x3' },
                    { shaderLocation: 1, offset: COLOR_OFFSET,    format: 'float32x4' },
                ],
            }],
        },
        fragment: {
            module: shaderModule,
            entryPoint: 'fs_main',
            targets: [{
                format: canvasFormat,
                blend: {
                    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                },
            }],
        },
        primitive: {
            topology,
            cullMode: 'none',
        },
        depthStencil: {
            format: 'depth24plus',
            depthWriteEnabled: true,
            depthCompare: 'less',
        },
        multisample: { count: msaaCount },
    });

    const mvpUniformBuffer = createUniformBuffer(device, 64);

    const uniformBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: mvpUniformBuffer } }],
    });

    const textures = createFrameTextures(device, canvas.width, canvas.height, canvasFormat, msaaCount);

    return { pipeline, mvpUniformBuffer, uniformBindGroup, textures, topology };
}