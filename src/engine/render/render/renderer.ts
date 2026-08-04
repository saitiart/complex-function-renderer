import { mat4 } from 'gl-matrix';
import { RenderPipelineResources } from './createRenderPipeline.ts';
import { ComputeSurfaceResources, ComputeIndexResources } from '../compute/compute-pipelines.ts';
import { AxesResources,
        AXES_VERTEX_COUNT_BASE,
        AXES_VERTEX_COUNT_WITH_QUAT,
        createBaseAxesVertexData,
        createQuatAxesVertexData
        
} from '../axes-pipeline.ts';
import { Camera } from '../../../cameras/cameras.ts';

export function getViewMatrix(cam: Camera): mat4 {
    if (cam.matrix) return cam.matrix as unknown as mat4;
    return mat4.lookAt(mat4.create(), cam.eye, cam.center, cam.up);
}

export interface DrawParams {
    device: GPUDevice;
    context: GPUCanvasContext;
    renderRes: RenderPipelineResources;
    surfaceRes: ComputeSurfaceResources;
    indexRes: ComputeIndexResources;
    axesRes: AxesResources;
    camera: Camera;
    modelMat: mat4;
    numTriangles: number;
    showAxes: boolean;
    useQuaternion: boolean;
    quatAxisLeft: [number, number, number];
    quatAxisRight: [number, number, number];
}

export function draw(p: DrawParams) {
    const canvas = p.context.canvas as HTMLCanvasElement;
    const aspect = canvas.width / canvas.height;
    const projection = mat4.perspective(mat4.create(), Math.PI / 4, aspect, 0.1, 1000.0);
    const view = getViewMatrix(p.camera);
    const vp = mat4.multiply(mat4.create(), projection, view);

    const mvp = mat4.multiply(mat4.create(), vp, p.modelMat);
    p.device.queue.writeBuffer(p.renderRes.mvpUniformBuffer, 0, mvp as Float32Array);

    const encoder = p.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: p.renderRes.textures.msaaTexture.createView(),
            resolveTarget: p.context.getCurrentTexture().createView(),
            clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
        }],
        depthStencilAttachment: {
            view: p.renderRes.textures.depthTexture.createView(),
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'discard',
        },
    });

    // Axes
    if (p.showAxes) {
            p.device.queue.writeBuffer(p.axesRes.uniformBuffer, 0, vp as Float32Array);
    
            if (p.useQuaternion) {
                // Only quaternion axes (cyan + yellow) — skip the first 8 base vertices
                const quatOnlyData = createQuatAxesVertexData(p.quatAxisLeft, p.quatAxisRight);
                p.device.queue.writeBuffer(p.axesRes.vertexBuffer, 0, quatOnlyData);
                pass.setPipeline(p.axesRes.pipeline);
                pass.setBindGroup(0, p.axesRes.bindGroup);
                pass.setVertexBuffer(0, p.axesRes.vertexBuffer);
                pass.draw(4); // 2 axes × 2 vertices
            } else {
                // Only standard XYZW axes
                const baseData = createBaseAxesVertexData();
                p.device.queue.writeBuffer(p.axesRes.vertexBuffer, 0, baseData);
                pass.setPipeline(p.axesRes.pipeline);
                pass.setBindGroup(0, p.axesRes.bindGroup);
                pass.setVertexBuffer(0, p.axesRes.vertexBuffer);
                pass.draw(8); // 4 axes × 2 vertices
            }
        }

    // Surface
    pass.setPipeline(p.renderRes.pipeline);
    pass.setBindGroup(0, p.renderRes.uniformBindGroup);
    pass.setVertexBuffer(0, p.surfaceRes.vertexBuffer);
    pass.setIndexBuffer(p.indexRes.indexBuffer, 'uint32');
    pass.drawIndexed(p.numTriangles);

    pass.end();
    p.device.queue.submit([encoder.finish()]);
}