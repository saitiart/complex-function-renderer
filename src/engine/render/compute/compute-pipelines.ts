import csFunc from "./complex-func.wgsl";
import csSurface from "./complex4d.wgsl";
import csIndices from "./indices-comp.wgsl";
import csFunctions from "./complex-functions.wgsl";
import csColormap from "./coloring/colormap.wgsl";
import csParams from "../../uniforms/uniforms.wgsl";

export interface ComputeSurfaceResources {
  pipeline: GPUComputePipeline;
  vertexBuffer: GPUBuffer;
  paramsBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
}

export interface ComputeIndexResources {
  pipeline: GPUComputePipeline;
  indexBuffer: GPUBuffer;
}

const VERTEX_STRIDE = 32;

export async function createComputeSurfacePipeline(
  device: GPUDevice,
  resolution: number,
): Promise<ComputeSurfaceResources> {
  const code = [csParams, csColormap, csFunc, csSurface, csFunctions].join(
    "\n",
  );
  const module = device.createShaderModule({ code });

  const pipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });

  const numVertices = resolution * resolution;

  const vertexBuffer = device.createBuffer({
    size: numVertices * VERTEX_STRIDE,
    usage:
      GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  const paramsBuffer = device.createBuffer({
    size: 32 * 6,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: vertexBuffer } },
      { binding: 1, resource: { buffer: paramsBuffer } },
    ],
  });

  return { pipeline, vertexBuffer, paramsBuffer, bindGroup };
}

export async function createComputeIndexPipeline(
  device: GPUDevice,
  resolution: number,
): Promise<ComputeIndexResources> {
  const module = device.createShaderModule({ code: csIndices });

  const pipeline = await device.createComputePipelineAsync({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });

  const numTriangles = 6 * (resolution - 1) * (resolution - 1);

  const indexBuffer = device.createBuffer({
    size: numTriangles * 4,
    usage:
      GPUBufferUsage.STORAGE | GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });

  const resolutionBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(resolutionBuffer, 0, Uint32Array.of(resolution));

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: indexBuffer } },
      { binding: 1, resource: { buffer: resolutionBuffer } },
    ],
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(resolution / 8), Math.ceil(resolution / 8));
  pass.end();
  device.queue.submit([encoder.finish()]);

  return { pipeline, indexBuffer };
}
