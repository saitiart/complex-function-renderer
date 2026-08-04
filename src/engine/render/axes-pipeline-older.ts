
// axes-pipeline.ts

import { createUniformBuffer } from "./render/frameTextures";

export interface AxesResources {
    pipeline: GPURenderPipeline;
    vertexBuffer: GPUBuffer;
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
}

const AXES_SHADER = `
  struct ComplexParams {
      resolution: f32,              // 0
      funcSelection: f32,           // 1
      colormapSelection: f32,       // 2
      animationTime: f32,           // 3
      scale: f32,                   // 4
      aspectRatio: f32,             // 5
      domain_center_x: f32,         // 6
      domain_center_z: f32,         // 7
      domain_size_x: f32,           // 8
      domain_size_z: f32,           // 9
      rot_xw: f32,                  // 10
      rot_yw: f32,                  // 11
      rot_zw: f32,                  // 12
      scale_re: f32,                // 13
      scale_im: f32,                // 14
      amp_re: f32,                  // 15
      amp_im: f32,                  // 16
      shift_x: f32,                 // 17
      shift_z: f32,                 // 18
      use_riemann_sphere: f32,      // 19
      use_hopf_projection: f32,     // 20
      use_quaternion_rotation: f32, // 21
      quat_angle_left: f32,         // 22
      quat_angle_right: f32,        // 23
  
      quat_axis_left: vec3f,        // 24-26 (+27 implicit pad)
      quat_axis_right: vec3f,       // 28-30 (+31 implicit pad)
  };

    struct Uniforms { mvp: mat4x4<f32>, }

    @group(0) @binding(0) var<uniform> uniforms: Uniforms;
    @group(0) @binding(1) var<uniform> cp: ComplexParams;

    struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) color: vec3<f32>,
    }

    fn apply_euler_rotations(p: vec4f) -> vec4f {
        var out = p;
        let c_xw = cos(cp.rot_xw); let s_xw = sin(cp.rot_xw);
        let res_xw = mat2x2<f32>(c_xw, s_xw, -s_xw, c_xw) * vec2f(out.x, out.w);
        out.x = res_xw.x; out.w = res_xw.y;

        let c_yw = cos(cp.rot_yw); let s_yw = sin(cp.rot_yw);
        let res_yw = mat2x2<f32>(c_yw, s_yw, -s_yw, c_yw) * vec2f(out.y, out.w);
        out.y = res_yw.x; out.w = res_yw.y;

        let c_zw = cos(cp.rot_zw); let s_zw = sin(cp.rot_zw);
        let res_zw = mat2x2<f32>(c_zw, s_zw, -s_zw, c_zw) * vec2f(out.z, out.w);
        out.z = res_zw.x; out.w = res_zw.y;
        return out;
    }

    fn quat_mul(a: vec4f, b: vec4f) -> vec4f {
        return vec4f(
            a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
            a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
            a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
            a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
        );
    }

    fn apply_quaternion_rotation(p: vec4f) -> vec4f {
        let lh = cp.quat_angle_left * 0.5;
        let left = vec4f(cp.quat_axis_left * sin(lh), cos(lh));

        let rh = cp.quat_angle_right * 0.5;
        let right = vec4f(cp.quat_axis_right * sin(rh), cos(rh));

        return quat_mul(quat_mul(left, p), right);
    }

    @vertex
    fn vs_main(@location(0) pos4d: vec4<f32>, @location(1) color: vec3<f32>) -> VertexOutput {
        var rotated: vec4f;
        if (cp.use_quaternion_rotation > 0.5) {
            rotated = apply_quaternion_rotation(pos4d);
        } else {
            rotated = apply_euler_rotations(pos4d);
        }

        var output: VertexOutput;
        output.position = uniforms.mvp * vec4<f32>(rotated.xyz, 1.0);
        output.color = color;
        return output;
    }

    @fragment
    fn fs_main(@location(0) color: vec3<f32>) -> @location(0) vec4<f32> {
        return vec4<f32>(color, 1.0);
    }
`;

const AXES_LENGTH = 200.0;

const QUAT_AXIS_LENGTH = 150.0;

export function createBaseAxesVertexData(): Float32Array {
    const L = AXES_LENGTH;
    return new Float32Array([
        -L, 0, 0, 0,   1, 0, 0,
         L, 0, 0, 0,   1, 0, 0,
        0, -L, 0, 0,   0, 1, 0,
        0,  L, 0, 0,   0, 1, 0,
        0, 0, -L, 0,   0, 0, 1,
        0, 0,  L, 0,   0, 0, 1,
        0, 0, 0, -L,   1, 1, 1,
        0, 0, 0,  L,   1, 1, 1,
    ]);
}

export function createQuatAxesVertexData(
    axisLeft: [number, number, number],
    axisRight: [number, number, number]
): Float32Array {
    const Q = QUAT_AXIS_LENGTH;

    const lLen = Math.hypot(axisLeft[0], axisLeft[1], axisLeft[2]) || 1;
    const lx = axisLeft[0] / lLen * Q;
    const ly = axisLeft[1] / lLen * Q;
    const lz = axisLeft[2] / lLen * Q;

    const rLen = Math.hypot(axisRight[0], axisRight[1], axisRight[2]) || 1;
    const rx = axisRight[0] / rLen * Q;
    const ry = axisRight[1] / rLen * Q;
    const rz = axisRight[2] / rLen * Q;

    return new Float32Array([
        // Left quaternion axis (cyan)
        -lx, -ly, -lz, 0,   0, 1, 1,
         lx,  ly,  lz, 0,   0, 1, 1,
        // Right quaternion axis (yellow)
        -rx, -ry, -rz, 0,   1, 1, 0,
         rx,  ry,  rz, 0,   1, 1, 0,
    ]);
}

export const AXES_VERTEX_COUNT_BASE = 8;       // 4 standard axes
export const AXES_VERTEX_COUNT_WITH_QUAT = 12; // 4 standard + 2 quaternion axes

export async function createAxesPipeline(
    device: GPUDevice,
    canvasFormat: GPUTextureFormat,
    msaaCount: number,
    complexParamsBuffer: GPUBuffer
): Promise<AxesResources> {
    const shaderModule = device.createShaderModule({ code: AXES_SHADER });

    const pipeline = await device.createRenderPipelineAsync({
        layout: 'auto',
        vertex: {
            module: shaderModule,
            entryPoint: 'vs_main',
            buffers: [{
                arrayStride: 7 * 4,
                attributes: [
                    { shaderLocation: 0, offset: 0,  format: 'float32x4' },
                    { shaderLocation: 1, offset: 16, format: 'float32x3' },
                ],
            }],
        },
        fragment: {
            module: shaderModule,
            entryPoint: 'fs_main',
            targets: [{ format: canvasFormat }],
        },
        primitive: { topology: 'line-list' },
        depthStencil: {
            format: 'depth24plus',
            depthWriteEnabled: true,
            depthCompare: 'less',
        },
        multisample: { count: msaaCount },
    });

    const maxVertexData = createBaseAxesVertexData();
    const vertexBuffer = device.createBuffer({
        size: 12 * 7 * 4, // 12 vertices × 7 floats × 4 bytes
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, maxVertexData);

    const uniformBuffer = createUniformBuffer(device, 64);

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: { buffer: complexParamsBuffer } },
        ],
    });

    return { pipeline, vertexBuffer, uniformBuffer, bindGroup };
}