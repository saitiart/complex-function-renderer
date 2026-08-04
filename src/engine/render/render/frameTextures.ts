export interface FrameTextures {
    depthTexture: GPUTexture;
    msaaTexture: GPUTexture;
}

export function createFrameTextures(
    device: GPUDevice,
    width: number,
    height: number,
    canvasFormat: GPUTextureFormat,
    msaaCount: number
): FrameTextures {
    const depthTexture = device.createTexture({
        size: [width, height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        sampleCount: msaaCount,
    });
    const msaaTexture = device.createTexture({
        size: [width, height],
        format: canvasFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        sampleCount: msaaCount,
    });
    return { depthTexture, msaaTexture };
}

export function createUniformBuffer(device: GPUDevice, size: number): GPUBuffer {
    return device.createBuffer({
        size,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
}