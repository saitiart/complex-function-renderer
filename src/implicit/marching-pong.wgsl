struct IndirectArgs {
    vertexCount: u32,
    instanceCount: atomic<u32>,
    firstVertex: u32,
    firstInstance: u32,
}

struct IntParams {
    resolution: u32,
    surfaceType: u32,
    current_w: u32,
}

struct FloatParams {
    isolevel: f32,
    scale: f32,
    animateTime: f32,
    rot_xw: f32,
    rot_yw: f32,
    rot_zw: f32,
    pad1: f32,
    pad2: f32,
}

struct EdgeTable {
    edgeMasks: array<u32, 65536>,
}

struct FloatArray {
    values: array<f32>,
}

const offsets = array<vec4u, 16>(
    vec4(0u,0u,0u,0u), vec4(1u,0u,0u,0u), vec4(0u,1u,0u,0u), vec4(1u,1u,0u,0u), 
    vec4(0u,0u,1u,0u), vec4(1u,0u,1u,0u), vec4(0u,1u,1u,0u), vec4(1u,1u,1u,0u), 
    vec4(0u,0u,0u,1u), vec4(1u,0u,0u,1u), vec4(0u,1u,0u,1u), vec4(1u,1u,0u,1u), 
    vec4(0u,0u,1u,1u), vec4(1u,0u,1u,1u), vec4(0u,1u,1u,1u), vec4(1u,1u,1u,1u)
);

const edgeToCorners = array<vec2u, 32>(
    vec2(0u,1u), vec2(1u,3u), vec2(2u,3u), vec2(0u,2u), vec2(4u,5u), vec2(5u,7u), vec2(6u,7u), vec2(4u,6u),
    vec2(0u,4u), vec2(1u,5u), vec2(2u,6u), vec2(3u,7u), vec2(8u,9u), vec2(9u,11u), vec2(10u,11u), vec2(8u,10u),
    vec2(12u,13u), vec2(13u,15u), vec2(14u,15u), vec2(12u,14u), vec2(8u,12u), vec2(9u,13u), vec2(10u,14u), vec2(11u,15u),
    vec2(0u,8u), vec2(1u,9u), vec2(2u,10u), vec2(3u,11u), vec2(4u,12u), vec2(5u,13u), vec2(6u,14u), vec2(7u,15u)
);

@group(0) @binding(0) var<storage, read> tables: EdgeTable;
@group(0) @binding(2) var<storage, read_write> positionsOut: FloatArray;
@group(0) @binding(3) var<storage, read_write> colorBuffer: FloatArray;
@group(0) @binding(5) var<storage, read_write> indirect: IndirectArgs;
@group(0) @binding(6) var<uniform> ips: IntParams;
@group(0) @binding(7) var<uniform> fps: FloatParams;

@group(0) @binding(8) var<storage, read> sliceBottom: array<f32>;
@group(0) @binding(9) var<storage, read> sliceTop: array<f32>;

var<workgroup> wg_vertex_total: atomic<u32>;
var<workgroup> wg_global_vertex_base: u32;

fn rotate4D(p: vec4f, rxw: f32, ryw: f32, rzw: f32) -> vec4f {
    var v = p;
    
    let cxw = cos(rxw); let sxw = sin(rxw);
    let x1 = v.x * cxw - v.w * sxw;
    v.w = v.x * sxw + v.w * cxw;
    v.x = x1;
    
    // YW Rotation
    let cyw = cos(ryw); let syw = sin(ryw);
    let y1 = v.y * cyw - v.w * syw;
    v.w = v.y * syw + v.w * cyw;
    v.y = y1;

    // ZW Rotation
    let czw = cos(rzw); let szw = sin(rzw);
    let z1 = v.z * czw - v.w * szw;
    v.w = v.z * szw + v.w * czw;
    v.z = z1;
    
    return v;
}

fn get_idx(x: u32, y: u32, z: u32, res: u32) -> u32 {
    return x + (y * res) + (z * res * res);
}

fn interpolate4D(val1: f32, val2: f32, p1: vec4f, p2: vec4f, isolevel: f32) -> vec4f {
    let diff = val2 - val1;
    if (abs(diff) < 0.00001) {
        return p1;
    }

    let t = (isolevel - val1) / diff;
    
    return mix(p1, p2, t);
}

@compute @workgroup_size(4, 4, 4)
fn cs_main(
    @builtin(global_invocation_id) global_id_3d : vec3u,
    @builtin(local_invocation_index) local_idx : u32 
) 

{
    let res = ips.resolution;
    
    let inBounds = (global_id_3d.x < res - 1u) && 
                   (global_id_3d.y < res - 1u) && 
                   (global_id_3d.z < res - 1u);

    if (local_idx == 0u) { atomicStore(&wg_vertex_total, 0u); }
    workgroupBarrier();

    var cubeIndex = 0u;
    var cubeVerts = 0u; 
    var v: array<f32, 16>;
    var positions: array<vec4f, 16>; 

    let vmin = vec4f(-1.0); 
    let vmax = vec4f(1.0);
    let vstep = (vmax - vmin) / f32(res - 1u);
    
        
    let normalized_iso = fps.isolevel * (f32(ips.resolution) / 48.0);

    

    if (inBounds) {
        let gx = global_id_3d.x; 
        let gy = global_id_3d.y; 
        let gz = global_id_3d.z;

        
        v[0] = sliceBottom[get_idx(gx,   gy,   gz,   res)];
        v[1] = sliceBottom[get_idx(gx+1u,gy,   gz,   res)];
        v[2] = sliceBottom[get_idx(gx,   gy+1u,gz,   res)];
        v[3] = sliceBottom[get_idx(gx+1u,gy+1u,gz,   res)];
        v[4] = sliceBottom[get_idx(gx,   gy,   gz+1u,res)];
        v[5] = sliceBottom[get_idx(gx+1u,gy,   gz+1u,res)];
        v[6] = sliceBottom[get_idx(gx,   gy+1u,gz+1u,res)];
        v[7] = sliceBottom[get_idx(gx+1u,gy+1u,gz+1u,res)];

        
        v[8]  = sliceTop[get_idx(gx,   gy,   gz,   res)];
        v[9]  = sliceTop[get_idx(gx+1u,gy,   gz,   res)];
        v[10] = sliceTop[get_idx(gx,   gy+1u,gz,   res)];
        v[11] = sliceTop[get_idx(gx+1u,gy+1u,gz,   res)];
        v[12] = sliceTop[get_idx(gx,   gy,   gz+1u,res)];
        v[13] = sliceTop[get_idx(gx+1u,gy,   gz+1u,res)];
        v[14] = sliceTop[get_idx(gx,   gy+1u,gz+1u,res)];
        v[15] = sliceTop[get_idx(gx+1u,gy+1u,gz+1u,res)];

        for (var i = 0u; i < 16u; i++) {
            if (v[i] < normalized_iso) { cubeIndex |= (1u << i); }
        }
                
        let edgeMask = tables.edgeMasks[cubeIndex]; 
        if (edgeMask != 0u) {
            for (var i = 0u; i < 32u; i++) {
                if ((edgeMask & (1u << i)) != 0u) {
                    let corners = edgeToCorners[i];
                    
                    let pos_x = global_id_3d;
                    
                    let p0_grid = vec4f(f32(pos_x.x + offsets[corners.x].x), f32(pos_x.y + offsets[corners.x].y), f32(pos_x.z + offsets[corners.x].z), f32(ips.current_w + offsets[corners.x].w));
                    let p1_grid = vec4f(f32(pos_x.x + offsets[corners.y].x), f32(pos_x.y + offsets[corners.y].y), f32(pos_x.z + offsets[corners.y].z), f32(ips.current_w + offsets[corners.y].w));

                    let p0 = vmin + (vstep * p0_grid);
                    let p1 = vmin + (vstep * p1_grid);
                    
                    positions[cubeVerts] = interpolate4D(v[corners.x], v[corners.y], p0, p1, normalized_iso);
                    cubeVerts++;
                }
            }
        }
    }
    
    let local_v_offset = atomicAdd(&wg_vertex_total, cubeVerts);
    workgroupBarrier(); 

    if (local_idx == 0u) {
        let total_v = atomicLoad(&wg_vertex_total);
        if (total_v > 0u) {
            wg_global_vertex_base = atomicAdd(&indirect.instanceCount, total_v);
        }
    }
    workgroupBarrier(); 

    // Output Vertices to VRAM 
    if (inBounds && cubeVerts > 0u) {
        let final_v_start = wg_global_vertex_base + local_v_offset;

        
        for (var i = 0u; i < cubeVerts; i++) {
            
            let rotatedPos = rotate4D(positions[i], fps.rot_xw, fps.rot_yw, fps.rot_zw);
            
            let worldPos = vec3f(rotatedPos.x, rotatedPos.y, rotatedPos.z); 
            let v_idx = (final_v_start + i) * 3u;
            
            var color = get_color(vec4f(worldPos, 1.0));
            
            positionsOut.values[v_idx] = worldPos.x;
            positionsOut.values[v_idx + 1u] = worldPos.y;
            positionsOut.values[v_idx + 2u] = worldPos.z;

            let c_idx = (final_v_start + i) * 4u;
            colorBuffer.values[c_idx]      = color.r;
            colorBuffer.values[c_idx + 1u] = color.g;
            colorBuffer.values[c_idx + 2u] = color.b;
            colorBuffer.values[c_idx + 3u] = 1.0;
        }
        
    }
}